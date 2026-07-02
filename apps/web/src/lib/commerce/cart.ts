import { getMedusaBaseUrl, medusaFetch } from "@/lib/commerce/http";
import type { Cart } from "@/types/cart";

type MedusaCartResponse = {
  cart: {
    id: string;
    currency_code?: string;
    subtotal?: number;
    discount_total?: number;
    shipping_total?: number;
    tax_total?: number;
    total?: number;
    items?: Array<{
      id: string;
      title?: string;
      product_id?: string;
      variant_id?: string;
      product_handle?: string;
      thumbnail?: string;
      quantity: number;
      unit_price?: number;
      total?: number;
    }>;
  };
};

export const MOCK_CART_ID = "mock-cart";

export type CreateCartInput = {
  regionId?: string;
  countryCode?: string;
};

export type AddLineItemInput = {
  variantId: string;
  quantity?: number;
};

function toCart(response: MedusaCartResponse): Cart {
  const cart = response.cart;
  return {
    id: cart.id,
    items: (cart.items ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id ?? "",
      variantId: item.variant_id ?? "",
      title: item.title,
      productHandle: item.product_handle,
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price ?? 0),
      total: Number(item.total ?? 0),
    })),
    subtotal: Number(cart.subtotal ?? 0),
    discountTotal: Number(cart.discount_total ?? 0),
    shippingTotal: Number(cart.shipping_total ?? 0),
    taxTotal: Number(cart.tax_total ?? 0),
    total: Number(cart.total ?? 0),
    currency: String(cart.currency_code ?? "USD").toUpperCase(),
  };
}

export function createEmptyCart(currency = "CNY"): Cart {
  return {
    id: MOCK_CART_ID,
    items: [],
    subtotal: 0,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    total: 0,
    currency,
  };
}

export function isMedusaEnabled() {
  return Boolean(getMedusaBaseUrl());
}

export async function createCart(input: CreateCartInput = {}): Promise<Cart> {
  if (!isMedusaEnabled()) {
    return createEmptyCart();
  }

  const payload: Record<string, string> = {};
  if (input.regionId) payload.region_id = input.regionId;
  if (input.countryCode) payload.country_code = input.countryCode;

  const response = await medusaFetch<MedusaCartResponse>("/store/carts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return toCart(response);
}

export async function retrieveCart(cartId: string): Promise<Cart | null> {
  if (!isMedusaEnabled()) {
    return createEmptyCart();
  }

  try {
    const response = await medusaFetch<MedusaCartResponse>(`/store/carts/${cartId}`);
    return toCart(response);
  } catch {
    return null;
  }
}

export async function addLineItem(
  cartId: string,
  input: AddLineItemInput,
): Promise<Cart> {
  const response = await medusaFetch<MedusaCartResponse>(
    `/store/carts/${cartId}/line-items`,
    {
      method: "POST",
      body: JSON.stringify({
        variant_id: input.variantId,
        quantity: input.quantity ?? 1,
      }),
    },
  );
  return toCart(response);
}
