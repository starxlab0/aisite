import type { Order } from "@/types/order";

export function normalizeMedusaPaymentStatus(paymentStatus: string) {
  const status = String(paymentStatus || "pending").toLowerCase();
  if (status === "captured" || status === "paid") {
    return { paymentStatus: "paid" as const, paymentDetail: status };
  }
  if (status === "authorized") {
    return { paymentStatus: "authorized" as const, paymentDetail: status };
  }
  if (status === "canceled" || status === "failed") {
    return { paymentStatus: "failed" as const, paymentDetail: status };
  }
  return { paymentStatus: "pending" as const, paymentDetail: status };
}

type OrderOverlay = {
  paymentStatus?: Order["paymentStatus"];
  paymentDetail?: string;
  paymentIssueReason?: string | null;
  statusSource?: string;
  statusNote?: string | null;
  updatedAt?: string;
};

export function applyOrderStatusOverlay(order: Order, overlay: OrderOverlay): Order {
  return {
    ...order,
    paymentStatus: overlay.paymentStatus ?? order.paymentStatus,
    paymentDetail: overlay.paymentDetail ?? order.paymentDetail,
    paymentIssueReason: overlay.paymentIssueReason ?? order.paymentIssueReason,
    statusSource: overlay.statusSource ?? order.statusSource,
    statusNote: overlay.statusNote ?? order.statusNote,
    updatedAt: overlay.updatedAt ?? order.updatedAt,
  };
}

export async function getOrderById(id: string): Promise<Order | null> {
  return null;
}
