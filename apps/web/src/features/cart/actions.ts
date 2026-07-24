"use server";

import { redirect } from "next/navigation";
import {
  addItemToCurrentCart,
  removeItemFromCurrentCart,
  updateItemInCurrentCart,
} from "@/features/cart/server";

export async function addToCartAction(formData: FormData) {
  const productSlug = String(formData.get("productSlug") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const quantityValue = Number(formData.get("quantity") ?? "1");

  if (!productSlug || !variantId) {
    throw new Error("Missing productSlug or variantId");
  }

  await addItemToCurrentCart({
    productSlug,
    variantId,
    quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1,
  });

  redirect("/cart");
}

export async function updateCartLineItemAction(formData: FormData) {
  const lineItemId = String(formData.get("lineItemId") ?? "");
  const quantityValue = Number(formData.get("quantity") ?? "1");

  if (!lineItemId) {
    throw new Error("Missing lineItemId");
  }

  await updateItemInCurrentCart({
    lineItemId,
    quantity: Number.isFinite(quantityValue) ? Math.max(0, quantityValue) : 1,
  });

  redirect("/cart");
}

export async function removeCartLineItemAction(formData: FormData) {
  const lineItemId = String(formData.get("lineItemId") ?? "");

  if (!lineItemId) {
    throw new Error("Missing lineItemId");
  }

  await removeItemFromCurrentCart(lineItemId);
  redirect("/cart");
}
