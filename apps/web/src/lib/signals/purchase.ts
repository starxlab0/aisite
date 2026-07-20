import { envServer } from "@/lib/env/server";
import type { Order } from "@/types/order";

export type PurchaseTarget = {
  targetType: "product" | "collection";
  targetId: string;
  contentRef?: string | null;
};

type OrderResultEventType =
  | "purchase"
  | "payment_paid"
  | "payment_authorized"
  | "payment_failed"
  | "payment_canceled"
  | "payment_requires_action"
  | "fulfillment_processing"
  | "fulfillment_shipped"
  | "fulfillment_delivered"
  | "refund_requested"
  | "refund_refunded";

export function isSuccessfulOrderPayment(order: Order | null | undefined) {
  return !!order && ["authorized", "paid"].includes(order.paymentStatus);
}

export function buildPurchaseTargetsFromOrder(order: Order | null | undefined): PurchaseTarget[] {
  if (!order) return [];
  return order.items
    .filter((item, index, list) => {
      if (!item?.productId) return false;
      return list.findIndex((entry) => entry.productId === item.productId) === index;
    })
    .map((item) => ({
      targetType: "product" as const,
      targetId: item.productId,
      contentRef: item.productHandle ?? null,
    }));
}

function resolveOrderResultEventType(order: Order): Exclude<OrderResultEventType, "purchase"> | null {
  if (order.paymentDetail === "canceled") return "payment_canceled";
  if (order.paymentDetail === "requires_action") return "payment_requires_action";
  if (order.paymentStatus === "failed") return "payment_failed";
  if (order.paymentStatus === "paid") return "payment_paid";
  if (order.paymentStatus === "authorized") return "payment_authorized";
  return null;
}

function resolveFulfillmentResultEventType(order: Order): Extract<
  OrderResultEventType,
  "fulfillment_processing" | "fulfillment_shipped" | "fulfillment_delivered"
> | null {
  if (order.fulfillmentStatus === "delivered") return "fulfillment_delivered";
  if (order.fulfillmentStatus === "shipped") return "fulfillment_shipped";
  if (order.fulfillmentStatus === "processing") return "fulfillment_processing";
  return null;
}

function resolveRefundResultEventType(eventName: string): Extract<OrderResultEventType, "refund_requested" | "refund_refunded"> | null {
  const name = String(eventName || "").toLowerCase();
  if (!name) return null;
  if (name.includes("refund") && (name.includes("request") || name.includes("pending"))) return "refund_requested";
  if (name.includes("refund") && (name.includes("complete") || name.includes("captur") || name.includes("success") || name.includes("ed"))) {
    return "refund_refunded";
  }
  return null;
}

async function sendOrderResultSignals(input: {
  order: Order;
  eventType: OrderResultEventType;
  source?: string;
  dedupeKeyPrefix?: string;
}) {
  if (!envServer.controlPlaneUrl || !envServer.signalsIngestToken) {
    return { ok: false, sent: 0, reason: "signals_ingest_not_configured" as const };
  }

  const targets = buildPurchaseTargetsFromOrder(input.order);
  if (!targets.length) {
    return { ok: false, sent: 0, reason: "no_targets" as const };
  }

  let sent = 0;
  for (const item of targets) {
    const res = await fetch(`${envServer.controlPlaneUrl.replace(/\/$/, "")}/signals/track`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signals-token": envServer.signalsIngestToken,
      },
      body: JSON.stringify({
        targetType: item.targetType,
        targetId: item.targetId,
        contentRef: item.contentRef ?? null,
        eventType: input.eventType,
        source: input.source ?? "server",
        dedupeKey: `${input.dedupeKeyPrefix ?? `order:${input.order.id}`}:${input.eventType}:${item.targetType}:${item.targetId}`,
        metadata: {
          orderId: input.order.id,
          email: input.order.email ?? null,
          paymentStatus: input.order.paymentStatus,
          paymentDetail: input.order.paymentDetail ?? null,
          paymentIssueReason: input.order.paymentIssueReason ?? null,
          fulfillmentStatus: input.order.fulfillmentStatus,
          statusSource: input.order.statusSource ?? null,
        },
      }),
      cache: "no-store",
    }).catch(() => null);

    if (res?.ok) sent += 1;
  }

  return { ok: sent > 0, sent, reason: sent > 0 ? null : ("signals_ingest_failed" as const) };
}

export async function ingestPurchaseSignals(input: {
  order: Order;
  source?: string;
  dedupeKeyPrefix?: string;
}) {
  if (!envServer.controlPlaneUrl || !envServer.signalsIngestToken) {
    return { ok: false, sent: 0, reason: "signals_ingest_not_configured" as const };
  }

  if (!isSuccessfulOrderPayment(input.order)) {
    return { ok: false, sent: 0, reason: "payment_not_successful" as const };
  }

  return sendOrderResultSignals({
    order: input.order,
    eventType: "purchase",
    source: input.source,
    dedupeKeyPrefix: input.dedupeKeyPrefix,
  });
}

export async function ingestPaymentResultSignals(input: {
  order: Order;
  source?: string;
  dedupeKeyPrefix?: string;
}) {
  const eventType = resolveOrderResultEventType(input.order);
  if (!eventType) {
    return { ok: false, sent: 0, reason: "payment_status_not_trackable" as const };
  }
  return sendOrderResultSignals({
    order: input.order,
    eventType,
    source: input.source,
    dedupeKeyPrefix: input.dedupeKeyPrefix,
  });
}

export async function ingestFulfillmentResultSignals(input: {
  order: Order;
  source?: string;
  dedupeKeyPrefix?: string;
}) {
  const eventType = resolveFulfillmentResultEventType(input.order);
  if (!eventType) {
    return { ok: false, sent: 0, reason: "fulfillment_status_not_trackable" as const };
  }
  return sendOrderResultSignals({
    order: input.order,
    eventType,
    source: input.source,
    dedupeKeyPrefix: input.dedupeKeyPrefix,
  });
}

export async function ingestRefundResultSignals(input: {
  order: Order;
  eventName: string;
  source?: string;
  dedupeKeyPrefix?: string;
}) {
  const eventType = resolveRefundResultEventType(input.eventName);
  if (!eventType) {
    return { ok: false, sent: 0, reason: "refund_status_not_trackable" as const };
  }
  return sendOrderResultSignals({
    order: input.order,
    eventType,
    source: input.source,
    dedupeKeyPrefix: input.dedupeKeyPrefix,
  });
}
