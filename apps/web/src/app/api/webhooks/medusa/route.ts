import { NextResponse } from "next/server";
import { getStoredOrderSnapshotById, upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import {
  applyOrderStatusOverlay,
  derivePaymentSignalFromEventName,
  getOrderById,
  normalizeFulfillmentStatus,
  normalizePaymentDetail,
  normalizePaymentStatus,
} from "@/lib/commerce/orders";
import { ingestFulfillmentResultSignals, ingestPaymentResultSignals, ingestPurchaseSignals, ingestRefundResultSignals } from "@/lib/signals/purchase";

import type { Order } from "@/types/order";

type WebhookOrder = {
  id?: string | null;
  email?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  total?: number | null;
  currency_code?: string | null;
  created_at?: string | null;
  items?: Array<{
    product_id?: string | null;
    title?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    thumbnail?: string | null;
    variant?: { product?: { handle?: string | null } | null } | null;
    product?: { handle?: string | null } | null;
  }> | null;
};

function normalizeOrderFromWebhook(order: WebhookOrder): Order | null {
  if (!order?.id) return null;
  return {
    id: order.id,
    email: order.email ?? "",
    items: Array.isArray(order.items)
      ? order.items
          .filter((item) => item?.product_id)
          .map((item) => ({
            productId: String(item?.product_id),
            title: item?.title ?? "Product",
            quantity: Number(item?.quantity ?? 0) || 0,
            unitPrice: Number(item?.unit_price ?? 0) || 0,
            thumbnail: item?.thumbnail ?? undefined,
            productHandle: item?.product?.handle ?? item?.variant?.product?.handle ?? undefined,
          }))
      : [],
    paymentStatus: normalizePaymentStatus(order.payment_status),
    paymentDetail: normalizePaymentDetail(order.payment_status),
    fulfillmentStatus: normalizeFulfillmentStatus(order.fulfillment_status),
    total: Number(order.total ?? 0) || 0,
    currency: String(order.currency_code ?? "USD").toUpperCase(),
    amountUnit: "minor",
    createdAt: order.created_at ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusSource: "medusa_webhook",
    statusNote: null,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const eventName = String(body?.type || body?.event || body?.event_name || "").toLowerCase();
  const rawOrder = body?.data?.order ?? body?.order ?? body?.data ?? null;
  const orderId = rawOrder?.id ?? body?.data?.id ?? body?.order_id ?? null;

  if (!eventName.includes("order") && !eventName.includes("payment")) {
    return NextResponse.json({ ok: true, ignored: true, reason: "unsupported_event" });
  }

  const webhookOrder = normalizeOrderFromWebhook(rawOrder);
  const liveOrder = webhookOrder ?? (orderId ? await getOrderById(String(orderId)) : null);
  const storedOrder = liveOrder ? null : orderId ? await getStoredOrderSnapshotById(String(orderId)) : null;
  const order = liveOrder ?? storedOrder;
  if (!order) {
    return NextResponse.json({ ok: true, ignored: true, reason: "order_not_resolved" });
  }

  const signal = derivePaymentSignalFromEventName(eventName);
  const nextOrder = applyOrderStatusOverlay(order, {
    paymentStatus: signal?.paymentStatus,
    paymentDetail: signal?.paymentDetail,
    paymentIssueReason: signal?.paymentIssueReason,
    statusNote:
      signal?.statusNote ??
      (eventName.includes("payment") ? "支付状态已通过 Medusa webhook 同步。" : "订单状态已通过 Medusa webhook 同步。"),
    statusSource: "medusa_webhook",
    updatedAt: new Date().toISOString(),
  });

  await upsertOrderSnapshot(nextOrder);
  const paymentResult = await ingestPaymentResultSignals({
    order: nextOrder,
    source: "medusa_webhook",
    dedupeKeyPrefix: `order:${nextOrder.id}`,
  });
  const fulfillmentResult = await ingestFulfillmentResultSignals({
    order: nextOrder,
    source: "medusa_webhook",
    dedupeKeyPrefix: `order:${nextOrder.id}`,
  });
  const refundResult = await ingestRefundResultSignals({
    order: nextOrder,
    eventName,
    source: "medusa_webhook",
    dedupeKeyPrefix: `order:${nextOrder.id}`,
  });

  const purchaseResult = await ingestPurchaseSignals({
    order: nextOrder,
    source: "medusa_webhook",
    dedupeKeyPrefix: `order:${nextOrder.id}`,
  });

  return NextResponse.json({
    ok: true,
    orderId: nextOrder.id,
    sent: {
      payment: paymentResult.sent,
      fulfillment: fulfillmentResult.sent,
      refund: refundResult.sent,
      purchase: purchaseResult.sent,
    },
    ignored: {
      payment: !paymentResult.ok,
      fulfillment: !fulfillmentResult.ok,
      refund: !refundResult.ok,
      purchase: !purchaseResult.ok,
    },
    reason: {
      payment: paymentResult.reason,
      fulfillment: fulfillmentResult.reason,
      refund: refundResult.reason,
      purchase: purchaseResult.reason,
    },
  });
}
