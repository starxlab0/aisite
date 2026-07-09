"use server";

import { redirect } from "next/navigation";
import { getOrCreateCurrentCart } from "@/features/cart/server";
import { persistOrderSnapshot } from "@/features/checkout/session";
import { derivePaymentIssueReason, derivePaymentRecoveryPlan } from "@/lib/commerce/orders";
import { upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import { placeOrder } from "@/lib/commerce/checkout";

export async function placeOrderAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address1 = String(formData.get("address1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();

  const cart = await getOrCreateCurrentCart();
  if (!cart.items.length) {
    redirect("/cart");
  }

  const order = await placeOrder({
    cartId: cart.id,
    email,
    firstName: firstName || "Guest",
    lastName: lastName || "Customer",
    phone,
    address1: address1 || "Local test address",
    city: city || "Shanghai",
    postalCode: postalCode || "200000",
  });

  await persistOrderSnapshot({
    orderId: order.id,
    email,
    cart,
  });
  const paymentIssueReason = derivePaymentIssueReason({
    paymentStatus: order.paymentStatus,
    paymentDetail: order.paymentDetail ?? "pending",
  });
  const recovery = derivePaymentRecoveryPlan({
    paymentStatus: order.paymentStatus,
    paymentDetail: order.paymentDetail ?? "pending",
    paymentIssueReason,
  });
  await upsertOrderSnapshot({
    ...order,
    items: cart.items.map((item) => ({
      productId: item.productId,
      title: item.title ?? "Product",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      thumbnail: item.thumbnail,
      productHandle: item.productHandle,
    })),
    total: cart.total,
    currency: cart.currency,
    paymentDetail: order.paymentDetail ?? "pending",
    paymentIssueReason,
    updatedAt: new Date().toISOString(),
    statusSource: "checkout",
    statusNote: "订单已创建，正在等待支付结果同步。",
    recoveryLane: recovery.recoveryLane,
    recoveryOwner: recovery.recoveryOwner,
    recoveryActions: recovery.recoveryActions,
  });

  redirect(`/order/${encodeURIComponent(order.id)}`);
}
