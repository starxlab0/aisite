import type { CartLineItem } from "@/types/cart";
import type { OrderItem } from "@/types/order";

export function normalizeLineItems(items: CartLineItem[]): OrderItem[] {
  return items.map((item) => ({
    title: item.title || item.productHandle || item.productId,
    productId: item.productId,
    productHandle: item.productHandle,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}
