import { cookies } from "next/headers";
import {
  addLineItem,
  createCart,
  createEmptyCart,
  isMedusaEnabled,
  MOCK_CART_ID,
  retrieveCart,
} from "@/lib/commerce/cart";
import { getProductBySlug } from "@/lib/commerce/products";
import type { Cart } from "@/types/cart";

export const CART_COOKIE_NAME = "cart_id";
export const MOCK_CART_COOKIE_NAME = "mock_cart_json";

type MockAddItemInput = {
  productSlug: string;
  variantId: string;
  quantity: number;
};

function parseMockCart(raw: string | undefined): Cart {
  if (!raw) return createEmptyCart();
  try {
    return JSON.parse(raw) as Cart;
  } catch {
    return createEmptyCart();
  }
}

export async function getCurrentCart(): Promise<Cart> {
  const cookieStore = await cookies();

  if (!isMedusaEnabled()) {
    return parseMockCart(cookieStore.get(MOCK_CART_COOKIE_NAME)?.value);
  }

  const cartId = cookieStore.get(CART_COOKIE_NAME)?.value;
  if (!cartId) return createEmptyCart();

  const cart = await retrieveCart(cartId);
  return cart ?? createEmptyCart();
}

export async function getOrCreateCurrentCart(): Promise<Cart> {
  const cookieStore = await cookies();

  if (!isMedusaEnabled()) {
    const current = parseMockCart(cookieStore.get(MOCK_CART_COOKIE_NAME)?.value);
    cookieStore.set(MOCK_CART_COOKIE_NAME, JSON.stringify(current), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return current;
  }

  const existingId = cookieStore.get(CART_COOKIE_NAME)?.value;
  if (existingId) {
    const existing = await retrieveCart(existingId);
    if (existing) return existing;
  }

  const cart = await createCart({
    regionId: process.env.NEXT_PUBLIC_MEDUSA_REGION_ID,
    countryCode: process.env.NEXT_PUBLIC_MEDUSA_COUNTRY_CODE,
  });

  cookieStore.set(CART_COOKIE_NAME, cart.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return cart;
}

export async function addItemToMockCart(input: MockAddItemInput): Promise<Cart> {
  const cookieStore = await cookies();
  const current = parseMockCart(cookieStore.get(MOCK_CART_COOKIE_NAME)?.value);
  const product = await getProductBySlug(input.productSlug);
  if (!product) return current;

  const next = structuredClone(current);
  const existing = next.items.find((item) => item.variantId === input.variantId);

  if (existing) {
    existing.quantity += input.quantity;
    existing.total = existing.quantity * existing.unitPrice;
  } else {
    next.items.push({
      id: `${product.id}-${input.variantId}`,
      productId: product.id,
      variantId: input.variantId,
      title: product.name,
      productHandle: product.slug,
      thumbnail: product.thumbnail,
      quantity: input.quantity,
      unitPrice: product.price,
      total: product.price * input.quantity,
    });
  }

  next.subtotal = next.items.reduce((sum, item) => sum + item.total, 0);
  next.total = next.subtotal + next.shippingTotal + next.taxTotal - next.discountTotal;
  next.currency = product.currency;

  cookieStore.set(MOCK_CART_COOKIE_NAME, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return next;
}

export async function addItemToCurrentCart(input: {
  productSlug: string;
  variantId: string;
  quantity?: number;
}): Promise<Cart> {
  if (!isMedusaEnabled()) {
    return addItemToMockCart({
      productSlug: input.productSlug,
      variantId: input.variantId,
      quantity: input.quantity ?? 1,
    });
  }

  const cart = await getOrCreateCurrentCart();
  return addLineItem(cart.id, {
    variantId: input.variantId,
    quantity: input.quantity ?? 1,
  });
}

