const fs = require("node:fs/promises");
const path = require("node:path");
const { getSanityClient } = require("../cms-adapters/sanity-client");

const ALLOWED_SITE_KEYS = new Set(["cn-store", "us-store", "jp-store"]);

function parseArgs(argv) {
  const args = {
    file: null,
    dryRun: true,
    concurrency: 4,
  };

  argv.forEach((arg, index) => {
    if (arg === "--file") args.file = argv[index + 1] ?? null;
    if (arg === "--apply") args.dryRun = false;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg === "--concurrency") args.concurrency = Number(argv[index + 1] ?? 4);
  });

  return args;
}

function validateSiteKeys(siteKeys) {
  if (!Array.isArray(siteKeys)) return ["siteKeys must be an array"];
  const errors = [];
  const normalized = siteKeys.map((x) => String(x).trim()).filter(Boolean);
  if (!normalized.length) return [];
  normalized.forEach((key) => {
    if (!ALLOWED_SITE_KEYS.has(key)) errors.push(`invalid siteKey: ${key}`);
  });
  return errors;
}

async function runQueue(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: Math.max(1, concurrency) }).map(async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      results.push(await worker(item));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath =
    args.file ||
    path.resolve(__dirname, "./backfill-site-keys.sample.json");

  const json = JSON.parse(await fs.readFile(filePath, "utf8"));
  const items = Array.isArray(json?.items) ? json.items : [];

  if (!items.length) {
    console.error(`No items found in ${filePath}. Expected: { "items": [...] }`);
    process.exit(1);
  }

  const invalid = items.flatMap((item) => {
    const siteKeyErrors = validateSiteKeys(item.siteKeys);
    const id = item?.id ?? "unknown";
    const type = item?.type ?? "unknown";
    const errors = [];
    if (!item?.id) errors.push("missing id");
    if (!item?.type) errors.push("missing type");
    if (siteKeyErrors.length) errors.push(...siteKeyErrors);
    return errors.length ? [{ id, type, errors }] : [];
  });

  if (invalid.length) {
    console.error("Invalid items:");
    invalid.slice(0, 20).forEach((row) => console.error(row));
    process.exit(1);
  }

  console.log(
    `Backfill siteKeys: ${items.length} documents; mode=${args.dryRun ? "dry-run" : "apply"}; concurrency=${args.concurrency}`,
  );

  if (args.dryRun) {
    items.slice(0, 20).forEach((item) => {
      console.log(`[dry-run] ${item.type} ${item.id} -> siteKeys=${JSON.stringify(item.siteKeys ?? [])}`);
    });
    if (items.length > 20) console.log(`[dry-run] ... (${items.length - 20} more)`);
    return;
  }

  const client = getSanityClient("backfillSiteKeys");
  const results = await runQueue(items, args.concurrency, async (item) => {
    const patch = client.patch(item.id).set({ siteKeys: item.siteKeys ?? [] });
    await patch.commit({ autoGenerateArrayKeys: true });
    return { id: item.id, type: item.type, ok: true };
  });

  const okCount = results.filter((r) => r.ok).length;
  console.log(`Done. ok=${okCount}/${results.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

