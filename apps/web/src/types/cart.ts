export type CartItem = {
  id?: string;
  productId: string;
  variantId: string;
  title?: string;
  productHandle?: string;
  thumbnail?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Cart = {
  id: string;
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  currency: string;
};
