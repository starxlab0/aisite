"use server";

import { cookies } from "next/headers";
import { derivePaymentIssueReason, derivePaymentRecoveryPlan } from "@/lib/commerce/orders";
import type { Cart } from "@/types/cart";
import type { Order } from "@/types/order";

const ORDER_SNAPSHOT_COOKIE = "order_snapshots";
const MAX_SNAPSHOTS = 6;

type OrderSnapshot = Pick<
  Order,
  | "id"
  | "email"
  | "items"
  | "paymentStatus"
  | "paymentDetail"
  | "fulfillmentStatus"
  | "total"
  | "currency"
  | "createdAt"
  | "updatedAt"
  | "statusSource"
  | "statusNote"
  | "paymentIssueReason"
  | "recoveryLane"
  | "recoveryOwner"
  | "recoveryActions"
>;

async function readSnapshots(): Promise<OrderSnapshot[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ORDER_SNAPSHOT_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OrderSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function persistOrderSnapshot(input: {
  orderId: string;
  email: string;
  cart: Cart;
}) {
  const cookieStore = await cookies();
  const current = await readSnapshots();
  const paymentIssueReason = derivePaymentIssueReason({ paymentStatus: "pending", paymentDetail: "pending" });
  const recovery = derivePaymentRecoveryPlan({ paymentStatus: "pending", paymentDetail: "pending", paymentIssueReason });
  const nextSnapshot: OrderSnapshot = {
    id: input.orderId,
    email: input.email,
    items: input.cart.items.map((item) => ({
      productId: item.productId,
      title: item.title ?? "Product",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      thumbnail: item.thumbnail,
      productHandle: item.productHandle,
    })),
    paymentStatus: "pending",
    paymentDetail: "pending",
    fulfillmentStatus: "unfulfilled",
    total: input.cart.total,
    currency: input.cart.currency,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusSource: "checkout",
    statusNote: "订单已创建，正在等待支付结果同步。",
    paymentIssueReason,
    recoveryLane: recovery.recoveryLane,
    recoveryOwner: recovery.recoveryOwner,
    recoveryActions: recovery.recoveryActions,
  };
  const merged = [nextSnapshot, ...current.filter((item) => item.id !== nextSnapshot.id)].slice(0, MAX_SNAPSHOTS);
  cookieStore.set(ORDER_SNAPSHOT_COOKIE, JSON.stringify(merged), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function getOrderSnapshotById(id: string): Promise<Order | null> {
  const snapshots = await readSnapshots();
  const found = snapshots.find((item) => item.id === id);
  return found ?? null;
}
