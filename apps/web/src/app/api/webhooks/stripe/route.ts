import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getStoredOrderSnapshotById, upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import { applyOrderStatusOverlay, derivePaymentSignalFromEventName } from "@/lib/commerce/orders";
import { getOrderById } from "@/lib/commerce/orders";
import { ingestPaymentResultSignals } from "@/lib/signals/purchase";
import { envServer } from "@/lib/env/server";
import { getStripeClient } from "@/lib/payments/stripe";

export const runtime = "nodejs";

function jsonOk(data: unknown) {
  return NextResponse.json({ status: "ok", data });
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function POST(req: Request) {
  if (!envServer.stripeWebhookSecret) {
    return jsonError(500, "STRIPE_WEBHOOK_SECRET is not configured");
  }

  const signature = req.headers.get("stripe-signature") || "";
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(payload, signature, envServer.stripeWebhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_signature";
    return jsonError(400, message);
  }

  const type = event.type;
  const dataObject = event.data?.object as any;
  const orderId =
    String(dataObject?.metadata?.order_id || dataObject?.client_reference_id || "").trim() || null;

  if (!orderId) {
    return jsonOk({ received: true, type, skipped: "missing_order_id" });
  }

  const signal = derivePaymentSignalFromEventName(type);
  if (!signal) {
    return jsonOk({ received: true, type, skipped: "unsupported_event_type", orderId });
  }
  const liveOrder = await getOrderById(orderId);
  const storedOrder = liveOrder ? null : await getStoredOrderSnapshotById(orderId);
  const baseOrder =
    liveOrder ??
    storedOrder ?? {
      id: orderId,
      email: "",
      items: [],
      paymentStatus: "pending" as const,
      paymentDetail: "pending" as const,
      fulfillmentStatus: "unfulfilled" as const,
      total: Number(dataObject?.amount_total ?? 0) || 0,
      currency: String(dataObject?.currency || "usd").toUpperCase(),
      amountUnit: "minor" as const,
      createdAt: new Date().toISOString(),
      paymentProvider: "stripe" as const,
      paymentSessionId: dataObject?.id ? String(dataObject.id) : null,
    };
  const overlay = applyOrderStatusOverlay(baseOrder, {
    ...signal,
    statusSource: "payment_webhook",
    statusNote: `stripe_webhook:${type}`,
    updatedAt: new Date().toISOString(),
  });

  await upsertOrderSnapshot({
    ...overlay,
    paymentProvider: "stripe",
    paymentSessionId: dataObject?.id ? String(dataObject.id) : baseOrder.paymentSessionId ?? null,
    currency: baseOrder.currency,
    total: baseOrder.total,
    amountUnit: baseOrder.amountUnit ?? "major",
  });

  try {
    await ingestPaymentResultSignals({
      order: {
        ...overlay,
        paymentStatus: overlay.paymentStatus,
        paymentDetail: overlay.paymentDetail,
        updatedAt: new Date().toISOString(),
        statusSource: "payment_webhook",
        statusNote: `stripe_webhook:${type}`,
        paymentProvider: "stripe",
        paymentSessionId: dataObject?.id ? String(dataObject.id) : baseOrder.paymentSessionId ?? null,
      } as any,
      source: `stripe:${type}`,
      dedupeKeyPrefix: `stripe:${String(event.id)}`,
    });
  } catch {
  }

  return jsonOk({ received: true, type, orderId });
}
