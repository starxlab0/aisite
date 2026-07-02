import { getCurrentCart } from "@/features/cart/server";
import { formatMoney } from "@/lib/utils/money";

export default async function CheckoutPage() {
  const cart = await getCurrentCart();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Checkout
      </h1>
      <p className="mt-3 text-zinc-600">
        结账骨架：后续由 Medusa 提供 cart、shipping、payment 会话与订单创建。
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Checkout form</p>
          <p className="mt-2 text-sm text-zinc-600">
            下一阶段会在这里接地址、配送方式和支付会话。当前先读取真实 cart 总价与条目。
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Order summary</p>
          <ul className="mt-4 space-y-3 text-sm text-zinc-700">
            {cart.items.length ? (
              cart.items.map((item) => (
                <li
                  key={item.id ?? `${item.variantId}-${item.productId}`}
                  className="flex items-start justify-between gap-4"
                >
                  <span>
                    {item.title ?? item.productHandle ?? item.productId} × {item.quantity}
                  </span>
                  <span>{formatMoney(item.total, cart.currency)}</span>
                </li>
              ))
            ) : (
              <li className="text-zinc-600">当前购物车为空。</li>
            )}
          </ul>
          <div className="mt-4 border-t border-zinc-100 pt-4 text-sm font-medium text-zinc-900">
            Total: {formatMoney(cart.total, cart.currency)}
          </div>
        </div>
      </div>
    </div>
  );
}
