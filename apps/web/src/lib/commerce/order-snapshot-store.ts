import { mkdir, readFile, writeFile } from "fs/promises";
import type { Order } from "@/types/order";

const SNAPSHOT_DIR = process.env.ORDER_SNAPSHOT_STORE_DIR || process.env.TMPDIR || "/tmp";
const SNAPSHOT_FILE = `${SNAPSHOT_DIR.replace(/\/$/, "")}/web-order-snapshots.json`;
const MAX_ORDERS = 100;

type OrderSnapshotMap = Record<string, Order>;

function fulfillmentRank(status: Order["fulfillmentStatus"]) {
  if (status === "delivered") return 4;
  if (status === "shipped") return 3;
  if (status === "processing") return 2;
  return 1;
}

function mergePaymentStatus(existing: Order | undefined, incoming: Order) {
  if (!existing) return { paymentStatus: incoming.paymentStatus, paymentDetail: incoming.paymentDetail };
  if (incoming.paymentStatus === "pending" && existing.paymentStatus !== "pending") {
    return { paymentStatus: existing.paymentStatus, paymentDetail: existing.paymentDetail ?? incoming.paymentDetail };
  }
  return {
    paymentStatus: incoming.paymentStatus,
    paymentDetail: incoming.paymentDetail ?? existing.paymentDetail,
  };
}

function mergeOrderSnapshot(existing: Order | undefined, incoming: Order): Order {
  const payment = mergePaymentStatus(existing, incoming);
  const fulfillmentStatus =
    existing && fulfillmentRank(existing.fulfillmentStatus) > fulfillmentRank(incoming.fulfillmentStatus)
      ? existing.fulfillmentStatus
      : incoming.fulfillmentStatus;

  return {
    ...(existing ?? incoming),
    ...incoming,
    items: incoming.items.length ? incoming.items : existing?.items ?? [],
    total: incoming.total ?? existing?.total ?? 0,
    currency: incoming.currency ?? existing?.currency ?? "USD",
    createdAt: existing?.createdAt ?? incoming.createdAt,
    fulfillmentStatus,
    ...payment,
    updatedAt: incoming.updatedAt ?? new Date().toISOString(),
    statusSource: incoming.statusSource ?? existing?.statusSource,
    statusNote: incoming.statusNote ?? existing?.statusNote ?? null,
  };
}

async function ensureParentDir() {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
}

async function readStore(): Promise<OrderSnapshotMap> {
  try {
    const raw = await readFile(SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(raw) as OrderSnapshotMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(next: OrderSnapshotMap) {
  await ensureParentDir();
  const limited = Object.fromEntries(
    Object.entries(next)
      .sort((a, b) => String(b[1]?.createdAt || "").localeCompare(String(a[1]?.createdAt || "")))
      .slice(0, MAX_ORDERS),
  );
  await writeFile(SNAPSHOT_FILE, JSON.stringify(limited, null, 2), "utf8");
}

export async function upsertOrderSnapshot(order: Order) {
  try {
    const current = await readStore();
    current[order.id] = mergeOrderSnapshot(current[order.id], order);
    await writeStore(current);
  } catch (error) {
    console.error("Failed to persist order snapshot", error);
  }
}

export async function getStoredOrderSnapshotById(id: string): Promise<Order | null> {
  try {
    const current = await readStore();
    return current[id] ?? null;
  } catch (error) {
    console.error("Failed to read stored order snapshot", error);
    return null;
  }
}
