import type { Order } from "@/types/order";

/**
 * MVP 版本只提供类型与函数签名。
 * 真实实现中通常流程：
 * 1) 基于 cart 创建/更新 shipping address
 * 2) 选择 shipping method
 * 3) 创建 payment session
 * 4) 完成支付后确认订单
 */
export async function placeOrder(): Promise<Order> {
  return {
    id: "mock",
    email: "",
    items: [],
    paymentStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    total: 0,
    currency: "USD",
    createdAt: new Date().toISOString(),
  };
}

