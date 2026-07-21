"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { clearCurrentCart, getOrCreateCurrentCart } from "@/features/cart/server";
import { persistOrderSnapshot } from "@/features/checkout/session";
import { derivePaymentIssueReason, derivePaymentRecoveryPlan } from "@/lib/commerce/orders";
import { upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import { placeOrder } from "@/lib/commerce/checkout";
import { envServer } from "@/lib/env/server";
import { getStripeClient, resolveBaseUrl } from "@/lib/payments/stripe";

export async function placeOrderAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address1 = String(formData.get("address1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();

  const cart = await getOrCreateCurrentCart();
  if (!cart.items.length) {
    redirect("/cart");
  }

  const order = await placeOrder({
    cartId: cart.id,
    email,
    firstName: firstName || "Guest",
    lastName: lastName || "Customer",
    phone,
    address1: address1 || "Local test address",
    city: city || "Shanghai",
    postalCode: postalCode || "200000",
  });

  await persistOrderSnapshot({
    orderId: order.id,
    email,
    cart,
  });
  const paymentIssueReason = derivePaymentIssueReason({
    paymentStatus: order.paymentStatus,
    paymentDetail: order.paymentDetail ?? "pending",
  });
  const recovery = derivePaymentRecoveryPlan({
    paymentStatus: order.paymentStatus,
    paymentDetail: order.paymentDetail ?? "pending",
    paymentIssueReason,
  });
  await upsertOrderSnapshot({
    ...order,
    items: cart.items.map((item) => ({
      productId: item.productId,
      title: item.title ?? "Product",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      thumbnail: item.thumbnail,
      productHandle: item.productHandle,
    })),
    total: cart.total,
    currency: cart.currency,
    paymentDetail: order.paymentDetail ?? "pending",
    paymentIssueReason,
    updatedAt: new Date().toISOString(),
    statusSource: "checkout",
    statusNote: "订单已创建，正在等待支付结果同步。",
    recoveryLane: recovery.recoveryLane,
    recoveryOwner: recovery.recoveryOwner,
    recoveryActions: recovery.recoveryActions,
  });

  await clearCurrentCart();
  redirect(`/order/${encodeURIComponent(order.id)}`);
}

function normalizeCurrency(code: string) {
  return String(code || "usd").toLowerCase();
}

export async function startStripeCheckoutAction(formData: FormData) {
  if (!envServer.stripeSecretKey) {
    throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY)");
  }

  const email = String(formData.get("email") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address1 = String(formData.get("address1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();

  const cart = await getOrCreateCurrentCart();
  if (!cart.items.length) {
    redirect("/cart");
  }

  if (!email) {
    throw new Error("Email is required");
  }

  const orderId = `ord_${crypto.randomBytes(10).toString("hex")}`;
  const now = new Date().toISOString();
  const currency = normalizeCurrency(cart.currency);

  await persistOrderSnapshot({
    orderId,
    email,
    cart,
  });

  const pendingOrder = {
    id: orderId,
    email,
    items: cart.items.map((item) => ({
      productId: item.productId,
      title: item.title ?? "Product",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      thumbnail: item.thumbnail,
      productHandle: item.productHandle,
    })),
    paymentStatus: "pending" as const,
    paymentDetail: "pending" as const,
    fulfillmentStatus: "unfulfilled" as const,
    total: cart.total,
    currency: cart.currency,
    createdAt: now,
    updatedAt: now,
    statusSource: "checkout" as const,
    statusNote: "已创建 Stripe 支付会话，等待用户完成支付。",
    paymentProvider: "stripe" as const,
    paymentIssueReason: undefined,
    recoveryLane: "awaiting_result" as const,
    recoveryOwner: "customer" as const,
    recoveryActions: ["complete_payment", "retry_payment"],
  };

  await upsertOrderSnapshot(pendingOrder);

  const stripe = getStripeClient();
  const baseUrl = resolveBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    client_reference_id: orderId,
    metadata: { order_id: orderId, source: "aisite" },
    success_url: `${baseUrl}/order/${encodeURIComponent(orderId)}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/order/${encodeURIComponent(orderId)}?stripe=cancel`,
    line_items: cart.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency,
        unit_amount: Math.max(0, Math.round(item.unitPrice)),
        product_data: {
          name: item.title ?? item.productHandle ?? item.productId ?? "Item",
          metadata: {
            product_handle: item.productHandle ?? "",
            variant_id: item.variantId ?? "",
          },
        },
      },
    })),
  });

  await upsertOrderSnapshot({
    ...pendingOrder,
    paymentSessionId: session.id,
    paymentUrl: session.url ?? null,
    updatedAt: new Date().toISOString(),
  });

  if (!session.url) {
    throw new Error("Stripe checkout session has no url");
  }

  redirect(session.url);
}

export async function resumeStripeCheckoutAction(formData: FormData) {
  if (!envServer.stripeSecretKey) {
    throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY)");
  }

  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) throw new Error("Missing orderId");

  const cart = await getOrCreateCurrentCart();
  if (!cart.items.length) {
    redirect("/shop");
  }

  const stripe = getStripeClient();
  const baseUrl = resolveBaseUrl();
  const currency = normalizeCurrency(cart.currency);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: orderId,
    metadata: { order_id: orderId, source: "aisite", retry: "1" },
    success_url: `${baseUrl}/order/${encodeURIComponent(orderId)}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/order/${encodeURIComponent(orderId)}?stripe=cancel`,
    line_items: cart.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency,
        unit_amount: Math.max(0, Math.round(item.unitPrice)),
        product_data: {
          name: item.title ?? item.productHandle ?? item.productId ?? "Item",
        },
      },
    })),
  });

  if (!session.url) throw new Error("Stripe checkout session has no url");

  await upsertOrderSnapshot({
    id: orderId,
    email: "",
    items: [],
    paymentStatus: "pending",
    paymentDetail: "pending",
    fulfillmentStatus: "unfulfilled",
    total: cart.total,
    currency: cart.currency,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusSource: "checkout",
    statusNote: "用户重新发起支付会话。",
    paymentProvider: "stripe",
    paymentSessionId: session.id,
    paymentUrl: session.url,
  });

  redirect(session.url);
}
