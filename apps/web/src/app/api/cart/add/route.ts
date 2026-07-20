import { NextResponse } from "next/server";
import { addItemToCurrentCart } from "@/features/cart/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const productSlug = typeof body?.productSlug === "string" ? body.productSlug : "";
  const variantId = typeof body?.variantId === "string" ? body.variantId : "";
  const quantity = Number(body?.quantity ?? 1);

  if (!productSlug || !variantId) {
    return NextResponse.json({ ok: false, error: "missing_productSlug_or_variantId" }, { status: 400 });
  }

  const cart = await addItemToCurrentCart({
    productSlug,
    variantId,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  });

  return NextResponse.json({
    ok: true,
    cart: {
      id: cart.id,
      itemsCount: cart.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0),
      total: cart.total,
      currency: cart.currency,
    },
  });
}

