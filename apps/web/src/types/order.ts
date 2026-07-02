export type OrderItem = {
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  email: string;
  items: OrderItem[];
  paymentStatus: "pending" | "authorized" | "paid" | "failed";
  fulfillmentStatus: "unfulfilled" | "processing" | "shipped" | "delivered";
  total: number;
  currency: string;
  createdAt: string;
};

