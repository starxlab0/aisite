const { loadState, saveState } = require("./persistence");

const SNAPSHOT_LIMIT = 500;

function now() {
  return new Date().toISOString();
}

function loadSnapshots() {
  const persisted = loadState();
  return Array.isArray(persisted.orderSnapshots) ? persisted.orderSnapshots : [];
}

function saveSnapshots(next) {
  const persisted = loadState();
  saveState({
    ...persisted,
    orderSnapshots: next
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .slice(0, SNAPSHOT_LIMIT),
  });
}

function fulfillmentRank(status) {
  if (status === "delivered") return 4;
  if (status === "shipped") return 3;
  if (status === "processing") return 2;
  return 1;
}

function mergePaymentStatus(existing, incoming) {
  if (!existing) return { paymentStatus: incoming.paymentStatus, paymentDetail: incoming.paymentDetail };
  if (incoming.paymentStatus === "pending" && existing.paymentStatus !== "pending") {
    return {
      paymentStatus: existing.paymentStatus,
      paymentDetail: existing.paymentDetail || incoming.paymentDetail,
    };
  }
  return {
    paymentStatus: incoming.paymentStatus,
    paymentDetail: incoming.paymentDetail || existing.paymentDetail,
  };
}

function mergeOrderSnapshot(existing, incoming) {
  const payment = mergePaymentStatus(existing, incoming);
  const fulfillmentStatus =
    existing && fulfillmentRank(existing.fulfillmentStatus) > fulfillmentRank(incoming.fulfillmentStatus)
      ? existing.fulfillmentStatus
      : incoming.fulfillmentStatus;

  return {
    ...(existing || incoming),
    ...incoming,
    id: String(incoming.id),
    items: Array.isArray(incoming.items) && incoming.items.length ? incoming.items : existing?.items || [],
    total: incoming.total ?? existing?.total ?? 0,
    currency: incoming.currency ?? existing?.currency ?? "USD",
    amountUnit: incoming.amountUnit ?? existing?.amountUnit ?? "major",
    createdAt: existing?.createdAt || incoming.createdAt,
    fulfillmentStatus,
    ...payment,
    updatedAt: incoming.updatedAt || now(),
    statusSource: incoming.statusSource ?? existing?.statusSource,
    statusNote: incoming.statusNote ?? existing?.statusNote ?? null,
  };
}

function getOrderSnapshot(id) {
  const normalized = String(id || "").trim();
  if (!normalized) return null;
  return loadSnapshots().find((item) => item.id === normalized) || null;
}

function upsertOrderSnapshot({ order } = {}) {
  if (!order?.id) return null;
  const snapshots = loadSnapshots();
  const index = snapshots.findIndex((item) => item.id === String(order.id));
  const existing = index >= 0 ? snapshots[index] : null;
  const snapshot = mergeOrderSnapshot(existing, order);
  if (index >= 0) snapshots[index] = snapshot;
  else snapshots.push(snapshot);
  saveSnapshots(snapshots);
  return snapshot;
}

module.exports = {
  getOrderSnapshot,
  upsertOrderSnapshot,
};
