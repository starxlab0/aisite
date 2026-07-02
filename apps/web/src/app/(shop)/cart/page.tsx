import Link from "next/link";
import { getCurrentCart } from "@/features/cart/server";
import { formatMoney } from "@/lib/utils/money";

export default async function CartPage() {
  const cart = await getCurrentCart();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Cart
          </h1>
          <p className="mt-3 text-zinc-600">
            购物车骨架：后续使用 Medusa cart API + Server Actions 实现增删改查。
          </p>
        </div>
        <Link className="text-sm underline underline-offset-4" href="/checkout">
          Go to checkout
        </Link>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          {cart.items.length ? (
            <ul className="space-y-4">
              {cart.items.map((item) => (
                <li
                  key={item.id ?? `${item.variantId}-${item.productId}`}
                  className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      {item.title ?? item.productHandle ?? item.productId}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-medium text-zinc-900">
                    {formatMoney(item.total, cart.currency)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-600">购物车还是空的，可以先去商品页加入测试商品。</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Summary</p>
          <dl className="mt-4 space-y-3 text-sm text-zinc-700">
            <div className="flex items-center justify-between">
              <dt>Subtotal</dt>
              <dd>{formatMoney(cart.subtotal, cart.currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Shipping</dt>
              <dd>{formatMoney(cart.shippingTotal, cart.currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Tax</dt>
              <dd>{formatMoney(cart.taxTotal, cart.currency)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 pt-3 font-medium text-zinc-900">
              <dt>Total</dt>
              <dd>{formatMoney(cart.total, cart.currency)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
