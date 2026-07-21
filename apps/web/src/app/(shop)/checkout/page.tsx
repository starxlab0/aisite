import { CheckoutSignalTracker } from "@/components/signals/checkout-signal-tracker";
import { getCurrentCart } from "@/features/cart/server";
import { placeOrderAction, startStripeCheckoutAction } from "@/features/checkout/actions";
import { envServer } from "@/lib/env/server";
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
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      {checkoutTargets.length ? <CheckoutSignalTracker targets={checkoutTargets} dedupeKey={cart.id} eventType="checkout_start" /> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">结账</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">Checkout</h1>
          <p className="mt-3 max-w-2xl text-zinc-600">
            现在已经是正式结账结构：收货信息、订单摘要、支付说明都会在这里确认。支付链路会继续按 `Medusa + Stripe` 补全。
          </p>
        </div>
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">收货与联系信息</p>
          <p className="mt-2 text-sm text-zinc-600">
            请填写真实收货信息。当前阶段下单成功后会先进入订单详情页，支付与状态同步继续由后端链路承接。
          </p>
          <form
            action={envServer.stripeSecretKey ? startStripeCheckoutAction : placeOrderAction}
            className="mt-6 grid gap-4"
          >
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Email</span>
              <input
                name="email"
                type="email"
                required
                className="h-11 rounded-2xl border border-zinc-200 px-4 text-zinc-900"
                placeholder="you@example.com"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>First name</span>
                <input name="firstName" className="h-11 rounded-2xl border border-zinc-200 px-4 text-zinc-900" placeholder="Guest" />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Last name</span>
                <input name="lastName" className="h-11 rounded-2xl border border-zinc-200 px-4 text-zinc-900" placeholder="Customer" />
              </label>
            </div>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Phone</span>
              <input name="phone" className="h-11 rounded-2xl border border-zinc-200 px-4 text-zinc-900" placeholder="选填，便于配送联系" />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span>Address</span>
              <input name="address1" className="h-11 rounded-2xl border border-zinc-200 px-4 text-zinc-900" placeholder="详细街道、门牌号" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>City</span>
                <input name="city" className="h-11 rounded-2xl border border-zinc-200 px-4 text-zinc-900" placeholder="Shanghai" />
              </label>
              <label className="grid gap-1 text-sm text-zinc-700">
                <span>Postal code</span>
                <input name="postalCode" className="h-11 rounded-2xl border border-zinc-200 px-4 text-zinc-900" placeholder="200000" />
              </label>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              <p className="font-medium text-zinc-900">支付说明</p>
              <p className="mt-2">
                当前阶段会先创建订单并进入订单页，后续继续补齐 Stripe 正式支付会话、支付状态同步与失败恢复。
              </p>
            </div>
            <button
              type="submit"
              disabled={!cart.items.length}
              className="mt-2 h-12 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white disabled:bg-zinc-300"
            >
              提交订单
            </button>
            {!cart.items.length ? <p className="text-xs text-zinc-500">购物车为空时无法下单。</p> : null}
          </form>
        </div>
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-900">Order summary</p>
            <ul className="mt-4 space-y-4 text-sm text-zinc-700">
              {cart.items.length ? (
                cart.items.map((item) => (
                  <li
                    key={item.id ?? `${item.variantId}-${item.productId}`}
                    className="flex items-start justify-between gap-4"
                  >
                    <div>
                      <p>{item.title ?? item.productHandle ?? item.productId}</p>
                      <p className="mt-1 text-zinc-500">× {item.quantity}</p>
                    </div>
                    <span>{formatMoney(item.total, cart.currency)}</span>
                  </li>
                ))
              ) : (
                <li className="text-zinc-600">当前购物车为空。</li>
              )}
            </ul>
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <div className="flex items-center justify-between text-sm text-zinc-700">
                <span>Subtotal</span>
                <span>{formatMoney(cart.subtotal, cart.currency)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-zinc-700">
                <span>Shipping</span>
                <span>{formatMoney(cart.shippingTotal, cart.currency)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-zinc-700">
                <span>Tax</span>
                <span>{formatMoney(cart.taxTotal, cart.currency)}</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-base font-medium text-zinc-900">
                <span>Total</span>
                <span>{formatMoney(cart.total, cart.currency)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-900">购买保障</p>
            <ul className="mt-4 space-y-3 text-sm text-zinc-600">
              <li>隐私包装与低调账单描述</li>
              <li>常规现货 48 小时内发货</li>
              <li>订单提交后可在订单页继续查看状态</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
