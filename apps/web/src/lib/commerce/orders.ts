import { getMedusaBaseUrl, medusaFetch } from "@/lib/commerce/http";
import type { Order } from "@/types/order";

type MedusaStoreOrderItem = {
  id?: string | null;
  product_id?: string | null;
  title?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  thumbnail?: string | null;
  product_handle?: string | null;
  variant?: {
    product?: {
      id?: string | null;
      handle?: string | null;
    } | null;
  } | null;
  product?: {
    id?: string | null;
    handle?: string | null;
  } | null;
};

type MedusaStoreOrder = {
  id: string;
  status?: string | null;
  email?: string | null;
  summary?: {
    paid_total?: number | null;
    transaction_total?: number | null;
    pending_difference?: number | null;
  } | null;
  total?: number | null;
  currency_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items?: MedusaStoreOrderItem[] | null;
};

type MedusaStoreOrderResponse = {
  order?: MedusaStoreOrder | null;
};

export function normalizePaymentStatus(value: string | null | undefined): Order["paymentStatus"] {
  if (value === "paid") return "paid";
  if (value === "authorized") return "authorized";
  if (value === "failed" || value === "canceled") return "failed";
  return "pending";
}

export function normalizePaymentDetail(
  value: string | null | undefined,
): NonNullable<Order["paymentDetail"]> {
  if (value === "paid") return "paid";
  if (value === "authorized") return "authorized";
  if (value === "canceled") return "canceled";
  if (value === "failed") return "failed";
  if (value === "requires_action" || value === "requires_more") return "requires_action";
  return "pending";
}

export function normalizeFulfillmentStatus(value: string | null | undefined): Order["fulfillmentStatus"] {
  if (value === "delivered") return "delivered";
  if (value === "shipped") return "shipped";
  if (value === "fulfilled" || value === "processing" || value === "partially_shipped") return "processing";
  return "unfulfilled";
}

export function derivePaymentIssueReason(input: {
  paymentStatus?: Order["paymentStatus"];
  paymentDetail?: Order["paymentDetail"];
  eventName?: string | null;
}): NonNullable<Order["paymentIssueReason"]> {
  const name = String(input.eventName || "").toLowerCase();
  if (name.includes("declin") || name.includes("insufficient") || name.includes("refus")) return "declined";
  if (name.includes("timeout") || name.includes("expire")) return "timeout";
  if (name.includes("abandon") || name.includes("cancel")) return "customer_abandon";
  if (name.includes("3ds") || (name.includes("require") && name.includes("action")) || name.includes("authent")) return "action_required";
  if (name.includes("authorize") || name.includes("requires_capture") || name.includes("captur")) return "capture_pending";
  if (name.includes("paid") || name.includes("success") || name.includes("succeed") || name.includes("completed")) return "completed";

  const paymentStatus = input.paymentStatus ?? "pending";
  const paymentDetail = input.paymentDetail ?? paymentStatus;
  if (paymentStatus === "paid") return "completed";
  if (paymentStatus === "authorized") return "capture_pending";
  if (paymentDetail === "requires_action") return "action_required";
  if (paymentDetail === "canceled") return "customer_abandon";
  if (paymentStatus === "failed") return "provider_error";
  return "pending_sync";
}

export function derivePaymentRecoveryPlan(input: {
  paymentStatus?: Order["paymentStatus"];
  paymentDetail?: Order["paymentDetail"];
  paymentIssueReason?: Order["paymentIssueReason"];
}) {
  const paymentStatus = input.paymentStatus ?? "pending";
  const paymentDetail = input.paymentDetail ?? paymentStatus;
  const paymentIssueReason = input.paymentIssueReason ?? derivePaymentIssueReason({ paymentStatus, paymentDetail });

  if (paymentStatus === "paid") {
    return {
      recoveryLane: "fulfillment_ready" as const,
      recoveryOwner: "system" as const,
      recoveryActions: ["开始履约并继续跟踪发货状态。"],
    };
  }
  if (paymentStatus === "authorized") {
    return {
      recoveryLane: "awaiting_result" as const,
      recoveryOwner: "ops" as const,
      recoveryActions: [
        paymentIssueReason === "capture_pending" ? "确认授权订单是否还需要 capture，并检查 capture 是否被 provider 卡住。" : "确认授权订单是否还需要 capture，并检查支付状态是否会继续推进。",
      ],
    };
  }
  if (paymentDetail === "canceled") {
    return {
      recoveryLane: "customer_retry" as const,
      recoveryOwner: "customer" as const,
      recoveryActions:
        paymentIssueReason === "timeout"
          ? ["提示用户重新发起支付。", "检查支付会话是否过快超时，或 provider 返回链路是否过慢。"]
          : ["提示用户重新发起支付。", "检查支付跳转和返回链路是否让用户中途流失。"],
    };
  }
  if (paymentDetail === "requires_action") {
    return {
      recoveryLane: "customer_action" as const,
      recoveryOwner: "customer" as const,
      recoveryActions: ["提示用户完成额外支付确认，例如 3DS 或钱包授权。", "在支付前说明可能出现的额外确认步骤。"],
    };
  }
  if (paymentStatus === "failed") {
    return {
      recoveryLane: "provider_review" as const,
      recoveryOwner: "ops" as const,
      recoveryActions:
        paymentIssueReason === "declined"
          ? ["排查 decline 原因，并确认是否允许安全重试或切换支付方式。", "在最终支付步骤提示用户更换支付方式或稍后重试。"]
          : ["排查 provider/decline 原因，并确认是否允许安全重试。", "检查最终支付步骤的提示、信任信号和回退路径。"],
    };
  }
  return {
    recoveryLane: "awaiting_result" as const,
    recoveryOwner: "system" as const,
    recoveryActions: ["等待支付 webhook 或实时订单状态同步。"],
  };
}

export function derivePaymentSignalFromEventName(eventName: string) {
  const name = String(eventName || "").toLowerCase();
  if (!name) return null;
  if (name.includes("cancel") || name.includes("expire") || name.includes("timeout")) {
    return {
      paymentStatus: "failed" as const,
      paymentDetail: "canceled" as const,
      paymentIssueReason: name.includes("timeout") || name.includes("expire") ? ("timeout" as const) : ("customer_abandon" as const),
      statusNote: "支付会话已取消、过期或超时，订单仍保留但需要重新完成支付。",
    };
  }
  if (name.includes("fail") || name.includes("declin") || name.includes("refund_required")) {
    return {
      paymentStatus: "failed" as const,
      paymentDetail: "failed" as const,
      paymentIssueReason: name.includes("declin") ? ("declined" as const) : ("provider_error" as const),
      statusNote: "支付未成功完成，请检查支付方式后重试。",
    };
  }
  if (name.includes("authorize") || name.includes("requires_capture")) {
    return {
      paymentStatus: "authorized" as const,
      paymentDetail: "authorized" as const,
      paymentIssueReason: "capture_pending" as const,
      statusNote: "支付已授权，等待后续捕获或订单最终确认。",
    };
  }
  if (name.includes("require") && name.includes("action")) {
    return {
      paymentStatus: "pending" as const,
      paymentDetail: "requires_action" as const,
      paymentIssueReason: "action_required" as const,
      statusNote: "支付仍需额外动作确认，订单尚未进入最终支付成功状态。",
    };
  }
  if (
    name.includes("captur") ||
    name.includes("paid") ||
    name.includes("success") ||
    name.includes("succeed") ||
    name.includes("completed")
  ) {
    return {
      paymentStatus: "paid" as const,
      paymentDetail: "paid" as const,
      paymentIssueReason: "completed" as const,
      statusNote: "支付已完成，订单可进入后续履约流程。",
    };
  }
  return null;
}

export function applyOrderStatusOverlay(
  order: Order,
  input: {
    paymentStatus?: Order["paymentStatus"];
    paymentDetail?: Order["paymentDetail"];
    paymentIssueReason?: Order["paymentIssueReason"];
    statusSource?: Order["statusSource"];
    statusNote?: string | null;
    updatedAt?: string;
  },
): Order {
  const nextPaymentStatus = input.paymentStatus ?? order.paymentStatus;
  const nextPaymentDetail = input.paymentDetail ?? order.paymentDetail;
  const nextPaymentIssueReason =
    input.paymentIssueReason ?? order.paymentIssueReason ?? derivePaymentIssueReason({ paymentStatus: nextPaymentStatus, paymentDetail: nextPaymentDetail });
  const recovery = derivePaymentRecoveryPlan({
    paymentStatus: nextPaymentStatus,
    paymentDetail: nextPaymentDetail,
    paymentIssueReason: nextPaymentIssueReason,
  });
  return {
    ...order,
    paymentStatus: nextPaymentStatus,
    paymentDetail: nextPaymentDetail,
    paymentIssueReason: nextPaymentIssueReason,
    statusSource: input.statusSource ?? order.statusSource,
    statusNote: input.statusNote ?? order.statusNote ?? null,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    recoveryLane: recovery.recoveryLane,
    recoveryOwner: recovery.recoveryOwner,
    recoveryActions: recovery.recoveryActions,
  };
}

function mapMedusaOrder(order: MedusaStoreOrder): Order {
  const paidTotal = Number(order.summary?.paid_total ?? 0) || 0;
  const transactionTotal = Number(order.summary?.transaction_total ?? 0) || 0;
  const pendingDifference = Number(order.summary?.pending_difference ?? 0) || 0;
  const isPaid = paidTotal > 0 || (Number(order.total ?? 0) > 0 && pendingDifference <= 0);
  const isAuthorized = !isPaid && transactionTotal > 0;
  const rawPaymentStatus = isPaid ? "paid" : isAuthorized ? "authorized" : order.status;
  const paymentStatus = normalizePaymentStatus(rawPaymentStatus);
  const paymentDetail = normalizePaymentDetail(rawPaymentStatus);
  const paymentIssueReason = derivePaymentIssueReason({ paymentStatus, paymentDetail });
  const recovery = derivePaymentRecoveryPlan({ paymentStatus, paymentDetail, paymentIssueReason });
  return {
    id: order.id,
    email: order.email ?? "",
    items: Array.isArray(order.items)
      ? order.items
          .map((item) => ({
            productId: String(item.product_id ?? item.product?.id ?? item.variant?.product?.id ?? item.id ?? "unknown"),
            title: item.title ?? "Product",
            quantity: Number(item.quantity ?? 0) || 0,
            unitPrice: Number(item.unit_price ?? 0) || 0,
            thumbnail: item.thumbnail ?? undefined,
            productHandle: item.product_handle ?? item.product?.handle ?? item.variant?.product?.handle ?? undefined,
          }))
      : [],
    paymentStatus,
    paymentDetail,
    paymentIssueReason,
    fulfillmentStatus: "unfulfilled",
    total: Number(order.total ?? 0) || 0,
    currency: String(order.currency_code ?? "USD").toUpperCase(),
    amountUnit: "minor",
    createdAt: order.created_at ?? new Date().toISOString(),
    updatedAt: order.updated_at ?? new Date().toISOString(),
    statusSource: "medusa_store",
    statusNote: null,
    recoveryLane: recovery.recoveryLane,
    recoveryOwner: recovery.recoveryOwner,
    recoveryActions: recovery.recoveryActions,
  };
}

export async function getOrderById(id: string): Promise<Order | null> {
  const baseUrl = getMedusaBaseUrl();
  if (!baseUrl || !process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) return null;

  try {
    const json = await medusaFetch<MedusaStoreOrderResponse>(`/store/orders/${encodeURIComponent(id)}`);
    if (!json?.order?.id) return null;
    return mapMedusaOrder(json.order);
  } catch {
    return null;
  }
}
