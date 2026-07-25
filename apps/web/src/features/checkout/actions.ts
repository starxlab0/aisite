"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentCart } from "@/features/cart/server";
import { normalizeLineItems } from "@/lib/commerce/checkout";
import { upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import { envServer } from "@/lib/env/server";
import { getStripeClient } from "@/lib/payments/stripe";
import type { Order } from "@/types/order";

const LAST_ORDER_COOKIE = "last_order_id";

type CheckoutFormPayload = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  address1: string;
  city: string;
  postalCode: string;
};

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function buildCheckoutPayload(formData: FormData): CheckoutFormPayload {
  return {
    email: readString(formData, "email"),
    firstName: readString(formData, "firstName"),
    lastName: readString(formData, "lastName"),
    phone: readString(formData, "phone"),
    address1: readString(formData, "address1"),
    city: readString(formData, "city"),
    postalCode: readString(formData, "postalCode"),
  };
}

async function baseUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

async function saveOrderSnapshot(order: Order) {
  await upsertOrderSnapshot(order);
  const jar = await cookies();
  jar.set(LAST_ORDER_COOKIE, order.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: envServer.nodeEnv === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

function buildOrderFromCart(cart: Awaited<ReturnType<typeof getCurrentCart>>, form: CheckoutFormPayload): Order {
  const createdAt = new Date().toISOString();
  return {
    id: `order_${Math.random().toString(36).slice(2, 14)}`,
    email: form.email || null,
    total: cart.total,
    currency: cart.currency,
    amountUnit: "major",
    paymentStatus: "pending",
    paymentDetail: "pending",
    fulfillmentStatus: "unfulfilled",
    createdAt,
    updatedAt: createdAt,
    items: normalizeLineItems(cart.items),
    shippingAddress: {
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      address1: form.address1,
      city: form.city,
      postalCode: form.postalCode,
    },
    paymentProvider: envServer.stripeSecretKey ? "stripe" : "manual",
  };
}

export async function placeOrderAction(formData: FormData) {
  const cart = await getCurrentCart();
  if (!cart.items.length) {
    redirect("/cart");
  }

  const form = buildCheckoutPayload(formData);
  const order = buildOrderFromCart(cart, form);
  await saveOrderSnapshot(order);
  redirect(`/order/${order.id}`);
}

export async function startStripeCheckoutAction(formData: FormData) {
  const cart = await getCurrentCart();
  if (!cart.items.length) {
    redirect("/cart");
  }

  const form = buildCheckoutPayload(formData);
  const order = buildOrderFromCart(cart, form);
  const origin = await baseUrl();
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: form.email || undefined,
    client_reference_id: order.id,
    metadata: {
      order_id: order.id,
      source: "checkout",
    },
    success_url: `${origin}/order/${order.id}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/order/${order.id}?stripe=cancel`,
    line_items: cart.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: cart.currency.toLowerCase(),
        unit_amount: Math.round(item.unitPrice * 100),
        product_data: {
          name: item.title || item.productHandle || item.productId,
        },
      },
    })),
  });

  const withStripe: Order = {
    ...order,
    paymentProvider: "stripe",
    paymentSessionId: session.id,
    paymentUrl: session.url || undefined,
  };
  await saveOrderSnapshot(withStripe);
  redirect(session.url || `/order/${order.id}`);
}

export async function resumeStripeCheckoutAction(formData: FormData) {
  const orderId = readString(formData, "orderId");
  if (!orderId) {
    redirect("/cart");
  }

  const cart = await getCurrentCart();
  const origin = await baseUrl();
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: orderId,
    metadata: {
      order_id: orderId,
      source: "resume_payment",
    },
    success_url: `${origin}/order/${orderId}?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/order/${orderId}?stripe=cancel`,
    line_items: cart.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: cart.currency.toLowerCase(),
        unit_amount: Math.round(item.unitPrice * 100),
        product_data: {
          name: item.title || item.productHandle || item.productId,
        },
      },
    })),
  });
  redirect(session.url || `/order/${orderId}`);
}
