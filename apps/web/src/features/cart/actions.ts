"use server";

import { redirect } from "next/navigation";
import { addItemToCurrentCart } from "@/features/cart/server";

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

