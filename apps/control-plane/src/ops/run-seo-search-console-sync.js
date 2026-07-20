const { syncSeoMetricsFromSearchConsole } = require("./seo-search-console-sync");

async function main() {
  const actor = process.env.SEARCH_CONSOLE_SYNC_ACTOR || "system:search_console_sync";
  const result = await syncSeoMetricsFromSearchConsole({ actor });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        actor,
        result,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
});
