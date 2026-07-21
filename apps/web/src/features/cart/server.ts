import { cookies } from "next/headers";
import {
  addLineItem,
  createCart,
  createEmptyCart,
  isMedusaEnabled,
  MOCK_CART_ID,
  removeLineItem,
  retrieveCart,
  updateLineItem,
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

type MockUpdateItemInput = {
  lineItemId: string;
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

async function persistMockCart(cart: Cart) {
  const cookieStore = await cookies();
  cookieStore.set(MOCK_CART_COOKIE_NAME, JSON.stringify(cart), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return cart;
}

function recalculateMockCart(cart: Cart) {
  cart.subtotal = cart.items.reduce((sum, item) => sum + item.total, 0);
  cart.total = cart.subtotal + cart.shippingTotal + cart.taxTotal - cart.discountTotal;
  return cart;
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

  recalculateMockCart(next);
  next.currency = product.currency;

  return persistMockCart(next);
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

export async function updateItemInMockCart(input: MockUpdateItemInput): Promise<Cart> {
  const cookieStore = await cookies();
  const current = parseMockCart(cookieStore.get(MOCK_CART_COOKIE_NAME)?.value);
  const next = structuredClone(current);
  next.items = next.items
    .map((item) =>
      item.id === input.lineItemId
        ? {
            ...item,
            quantity: input.quantity,
            total: item.unitPrice * input.quantity,
          }
        : item,
    )
    .filter((item) => item.quantity > 0);
  recalculateMockCart(next);
  return persistMockCart(next);
}

export async function removeItemFromMockCart(lineItemId: string): Promise<Cart> {
  const cookieStore = await cookies();
  const current = parseMockCart(cookieStore.get(MOCK_CART_COOKIE_NAME)?.value);
  const next = structuredClone(current);
  next.items = next.items.filter((item) => item.id !== lineItemId);
  recalculateMockCart(next);
  return persistMockCart(next);
}

export async function updateItemInCurrentCart(input: {
  lineItemId: string;
  quantity: number;
}): Promise<Cart> {
  if (!isMedusaEnabled()) {
    return updateItemInMockCart(input);
  }

  const cart = await getOrCreateCurrentCart();
  if (input.quantity <= 0) {
    return removeLineItem(cart.id, input.lineItemId);
  }
  return updateLineItem(cart.id, {
    lineItemId: input.lineItemId,
    quantity: input.quantity,
  });
}

export async function removeItemFromCurrentCart(lineItemId: string): Promise<Cart> {
  if (!isMedusaEnabled()) {
    return removeItemFromMockCart(lineItemId);
  }

  const cart = await getOrCreateCurrentCart();
  return removeLineItem(cart.id, lineItemId);
}

export async function clearCurrentCart() {
  const cookieStore = await cookies();
  if (!isMedusaEnabled()) {
    cookieStore.set(MOCK_CART_COOKIE_NAME, JSON.stringify(createEmptyCart()), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return;
  }
  cookieStore.delete(CART_COOKIE_NAME);
}
