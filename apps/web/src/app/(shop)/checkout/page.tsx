import { CheckoutSignalTracker } from "@/components/signals/checkout-signal-tracker";
import { getCurrentCart } from "@/features/cart/server";
import { placeOrderAction } from "@/features/checkout/actions";
import { formatMoney } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await getCurrentCart();
  const checkoutTargets = cart.items.map((item) => ({
    targetType: "product" as const,
    targetId: item.productId,
    contentRef: item.productHandle ? `product:${item.productHandle}` : null,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      {checkoutTargets.length ? <CheckoutSignalTracker targets={checkoutTargets} dedupeKey={cart.id} eventType="checkout_start" /> : null}
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
            本阶段先提供一个最小下单入口（本地开发用）。后续会扩展为完整地址/配送/支付会话。
          </p>
          <form action={placeOrderAction} className="mt-6 grid gap-3">
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Email</span>
              <input
                name="email"
                type="email"
                required
                className="h-10 rounded-xl border border-zinc-200 px-3 text-zinc-900"
                placeholder="you@example.com"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>First name</span>
                <input name="firstName" className="h-10 rounded-xl border border-zinc-200 px-3 text-zinc-900" placeholder="Guest" />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Last name</span>
                <input name="lastName" className="h-10 rounded-xl border border-zinc-200 px-3 text-zinc-900" placeholder="Customer" />
              </label>
            </div>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Phone</span>
              <input name="phone" className="h-10 rounded-xl border border-zinc-200 px-3 text-zinc-900" placeholder="optional" />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Address</span>
              <input name="address1" className="h-10 rounded-xl border border-zinc-200 px-3 text-zinc-900" placeholder="Local test address" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>City</span>
                <input name="city" className="h-10 rounded-xl border border-zinc-200 px-3 text-zinc-900" placeholder="Shanghai" />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Postal code</span>
                <input name="postalCode" className="h-10 rounded-xl border border-zinc-200 px-3 text-zinc-900" placeholder="200000" />
              </label>
            </div>
            <button
              type="submit"
              disabled={!cart.items.length}
              className="mt-2 h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:bg-zinc-300"
            >
              Place test order
            </button>
            {!cart.items.length ? <p className="text-xs text-zinc-500">购物车为空时无法下单。</p> : null}
          </form>
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
