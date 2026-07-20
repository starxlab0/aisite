import { NextResponse } from "next/server";
import { getStoredOrderSnapshotById } from "@/lib/commerce/order-snapshot-store";
import { getOrderById } from "@/lib/commerce/orders";
import { upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import { applyOrderStatusOverlay, derivePaymentSignalFromEventName } from "@/lib/commerce/orders";
import { ingestPaymentResultSignals } from "@/lib/signals/purchase";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const eventName = String(body?.type || body?.event || body?.event_name || body?.name || "").toLowerCase();
  const orderId = body?.data?.order_id ?? body?.order_id ?? body?.order?.id ?? body?.data?.id ?? null;

  if (!orderId) {
    return NextResponse.json({ ok: true, ignored: true, reason: "missing_order_id" });
  }

  const liveOrder = await getOrderById(String(orderId));
  const storedOrder = liveOrder ? null : await getStoredOrderSnapshotById(String(orderId));
  const order = liveOrder ?? storedOrder;
  if (!order) {
    return NextResponse.json({ ok: true, ignored: true, reason: "order_not_resolved" });
  }

  const signal = derivePaymentSignalFromEventName(eventName);
  const nextOrder = applyOrderStatusOverlay(order, {
    paymentStatus: signal?.paymentStatus,
    paymentDetail: signal?.paymentDetail,
    paymentIssueReason: signal?.paymentIssueReason,
    statusNote: signal?.statusNote ?? "支付状态已通过 payment webhook 同步。",
    statusSource: "payment_webhook",
    updatedAt: new Date().toISOString(),
  });

  await upsertOrderSnapshot(nextOrder);
  const result = await ingestPaymentResultSignals({
    order: nextOrder,
    source: "payment_webhook",
    dedupeKeyPrefix: `order:${nextOrder.id}`,
  });
  return NextResponse.json({
    ok: true,
    orderId: nextOrder.id,
    synced: true,
    paymentStatus: nextOrder.paymentStatus,
    paymentDetail: nextOrder.paymentDetail ?? null,
    paymentIssueReason: nextOrder.paymentIssueReason ?? null,
    sent: result.sent,
    ignored: !result.ok,
    reason: result.reason,
  });
}
