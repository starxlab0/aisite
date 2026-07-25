import { randomUUID } from "crypto";
import type { CartItem } from "@/types/cart";
import type { Order, OrderItem } from "@/types/order";

export function normalizeLineItems(items: CartItem[]): OrderItem[] {
  return items.map((item) => ({
    title: item.title || item.productHandle || item.productId,
    productId: item.productId,
    productHandle: item.productHandle,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

export type PlaceOrderInput = {
  cartId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1?: string;
  city?: string;
  postalCode?: string;
};

export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const now = new Date().toISOString();
  const orderId = `ord_${randomUUID().replace(/-/g, "")}`;

  return {
    id: orderId,
    email: input.email,
    items: [],
    paymentStatus: "pending",
    paymentDetail: "pending",
    fulfillmentStatus: "unfulfilled",
    total: 0,
    currency: "USD",
    amountUnit: "major",
    createdAt: now,
    updatedAt: now,
    statusSource: "checkout",
    statusNote: `checkout_started:${input.cartId}`,
  };
}
