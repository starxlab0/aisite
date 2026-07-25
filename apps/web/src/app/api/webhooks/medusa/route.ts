import { NextResponse } from "next/server";
import { upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import { applyOrderStatusOverlay, normalizeMedusaPaymentStatus } from "@/lib/commerce/orders";
import { envServer } from "@/lib/env/server";
import type { Order } from "@/types/order";

type MedusaWebhookPayload = {
  event?: string;
  data?: {
    id?: string;
    email?: string | null;
    total?: number | null;
    currency_code?: string | null;
    display_id?: number | string | null;
    created_at?: string | null;
    updated_at?: string | null;
    payment_status?: string | null;
    fulfillment_status?: string | null;
    metadata?: Record<string, unknown> | null;
    items?: Array<{
      title?: string | null;
      product_id?: string | null;
      quantity?: number | null;
      unit_price?: number | null;
      variant?: {
        product?: {
          handle?: string | null;
        } | null;
      } | null;
    }> | null;
  };
};

function isAllowed(req: Request) {
  const secret = req.headers.get("x-medusa-webhook-secret") || req.headers.get("x-webhook-secret");
  if (!envServer.medusaWebhookSecret) return true;
  return secret === envServer.medusaWebhookSecret;
}

function toOrder(payload: MedusaWebhookPayload): Order | null {
  const data = payload.data;
  if (!data?.id) return null;
  const payment = normalizeMedusaPaymentStatus(data.payment_status || "pending");
  const base: Order = {
    id: String(data.id),
    displayId: data.display_id ? String(data.display_id) : undefined,
    email: data.email ?? null,
    total: Number(data.total ?? 0) / 100,
    currency: String(data.currency_code || "USD").toUpperCase(),
    amountUnit: "major",
    paymentStatus: payment.paymentStatus,
    paymentDetail: payment.paymentDetail,
    fulfillmentStatus: String(data.fulfillment_status || "unfulfilled"),
    createdAt: String(data.created_at || new Date().toISOString()),
    updatedAt: String(data.updated_at || data.created_at || new Date().toISOString()),
    items: Array.isArray(data.items)
      ? data.items.map((item) => ({
          title: String(item.title || "Product"),
          productId: String(item.product_id || ""),
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unit_price || 0) / 100,
          productHandle: item.variant?.product?.handle ? String(item.variant.product.handle) : undefined,
        }))
      : [],
    paymentProvider: String((data.metadata?.payment_provider as string) || "medusa"),
  };

  if (payload.event === "order.paid") {
    return applyOrderStatusOverlay(base, {
      paymentStatus: "paid",
      paymentDetail: "paid",
      paymentIssueReason: "completed",
      statusSource: "payment_webhook",
      statusNote: "medusa:webhook:order.paid",
      updatedAt: base.updatedAt,
    });
  }

  if (payload.event === "order.payment_captured") {
    return applyOrderStatusOverlay(base, {
      paymentStatus: "paid",
      paymentDetail: "captured",
      paymentIssueReason: "completed",
      statusSource: "payment_webhook",
      statusNote: "medusa:webhook:order.payment_captured",
      updatedAt: base.updatedAt,
    });
  }

  return base;
}

export async function POST(req: Request) {
  if (!isAllowed(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as MedusaWebhookPayload | null;
  if (!body?.event || !body?.data?.id) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const order = toOrder(body);
  if (!order) {
    return NextResponse.json({ ok: false, error: "invalid_order" }, { status: 400 });
  }

  await upsertOrderSnapshot(order);
  return NextResponse.json({ ok: true, event: body.event, orderId: order.id });
}
