export type OrderItem = {
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  thumbnail?: string;
  productHandle?: string;
};

export type Order = {
  id: string;
  email: string;
  items: OrderItem[];
  paymentStatus: "pending" | "authorized" | "paid" | "failed";
  paymentDetail?: "pending" | "authorized" | "paid" | "failed" | "canceled" | "requires_action";
  fulfillmentStatus: "unfulfilled" | "processing" | "shipped" | "delivered";
  total: number;
  currency: string;
  createdAt: string;
  updatedAt?: string;
  statusSource?: "checkout" | "medusa_admin" | "medusa_webhook" | "payment_webhook" | "server_snapshot" | "browser_snapshot";
  statusNote?: string | null;
  paymentIssueReason?: "declined" | "timeout" | "customer_abandon" | "action_required" | "capture_pending" | "completed" | "pending_sync" | "provider_error";
  recoveryLane?: "awaiting_result" | "customer_retry" | "customer_action" | "provider_review" | "fulfillment_ready";
  recoveryOwner?: "system" | "customer" | "ops";
  recoveryActions?: string[];
  paymentProvider?: "stripe" | "medusa" | "system_default" | null;
  paymentSessionId?: string | null;
  paymentUrl?: string | null;
};
