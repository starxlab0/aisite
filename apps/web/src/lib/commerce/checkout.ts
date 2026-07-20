import type { Order } from "@/types/order";
import { getCommerceMode, getMedusaBaseUrl, medusaFetch } from "@/lib/commerce/http";

/**
 * MVP 版本只提供类型与函数签名。
 * 真实实现中通常流程：
 * 1) 基于 cart 创建/更新 shipping address
 * 2) 选择 shipping method
 * 3) 创建 payment session
 * 4) 完成支付后确认订单
 */
type PlaceOrderInput = {
  cartId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  countryCode?: string;
};

type MedusaCompleteCartResponse =
  | {
      order?: { id?: string } | null;
    }
  | {
      type?: string;
      data?: { id?: string } | null;
    };

async function ensureMedusaEnabled() {
  if (getCommerceMode() === "mock") return;
  const baseUrl = getMedusaBaseUrl();
  if (!baseUrl) throw new Error("Medusa commerce is enabled but NEXT_PUBLIC_MEDUSA_URL is not set");
}

export async function placeOrder(input?: Partial<PlaceOrderInput>): Promise<Order> {
  if (getCommerceMode() === "mock") {
    return {
      id: `mock_${Date.now()}`,
      email: input?.email ?? "",
      items: [],
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      total: 0,
      currency: "USD",
      createdAt: new Date().toISOString(),
    };
  }

  await ensureMedusaEnabled();
  const cartId = String(input?.cartId ?? "");
  if (!cartId) throw new Error("Missing cartId");

  const email = String(input?.email ?? "").trim();
  if (!email) throw new Error("Missing email");

  const countryCode = String(input?.countryCode ?? process.env.NEXT_PUBLIC_MEDUSA_COUNTRY_CODE ?? "cn").toLowerCase();
  const shippingAddress = {
    first_name: input?.firstName ?? "Guest",
    last_name: input?.lastName ?? "Customer",
    phone: input?.phone ?? "",
    address_1: input?.address1 ?? "Local test address",
    city: input?.city ?? "Shanghai",
    province: input?.province ?? "",
    postal_code: input?.postalCode ?? "200000",
    country_code: countryCode,
  };

  // 1) attach email & address
  await medusaFetch(`/store/carts/${encodeURIComponent(cartId)}`, {
    method: "POST",
    body: JSON.stringify({
      email,
      shipping_address: shippingAddress,
      billing_address: shippingAddress,
    }),
  });

  // 2) choose shipping option (pick first enabled option)
  try {
    const shippingOptions = (await medusaFetch<{ shipping_options?: Array<{ id: string }> }>(
      `/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`,
    )) as { shipping_options?: Array<{ id: string }> };
    const optionId = shippingOptions.shipping_options?.[0]?.id;
    if (optionId) {
      await medusaFetch(`/store/carts/${encodeURIComponent(cartId)}/shipping-methods`, {
        method: "POST",
        body: JSON.stringify({ option_id: optionId }),
      });
    }
  } catch {
    // non-blocking (some setups allow cart completion without explicit shipping method)
  }

  // 3) create payment sessions (system default provider is seeded)
  try {
    await medusaFetch(`/store/carts/${encodeURIComponent(cartId)}/payment-sessions`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // non-blocking (some setups create payment sessions implicitly)
  }

  // 4) complete cart -> order
  const completed = (await medusaFetch<MedusaCompleteCartResponse>(
    `/store/carts/${encodeURIComponent(cartId)}/complete`,
    { method: "POST", body: JSON.stringify({}) },
  )) as MedusaCompleteCartResponse;

  const orderId =
    (typeof (completed as any)?.order?.id === "string" && (completed as any).order.id) ||
    (typeof (completed as any)?.data?.id === "string" && (completed as any).data.id) ||
    null;

  if (!orderId) {
    throw new Error("Failed to parse order id from Medusa cart completion");
  }

  return {
    id: orderId,
    email,
    items: [],
    paymentStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    total: 0,
    currency: "USD",
    createdAt: new Date().toISOString(),
  };
}
