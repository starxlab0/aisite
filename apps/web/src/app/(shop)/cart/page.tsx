import Link from "next/link";
import {
  removeCartLineItemAction,
  updateCartLineItemAction,
} from "@/features/cart/actions";
import { getCurrentCart } from "@/features/cart/server";
import { getDisplayLineTotal } from "@/lib/commerce/cart-logic";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { formatMoney } from "@/lib/utils/money";

export default async function CartPage() {
  const localeKey = await getRequestLocaleKey();
  const cart = await getCurrentCart();
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">购物车</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">确认购物车</h1>
          <p className="mt-3 text-zinc-600">
            这里已经支持数量调整和删除商品。确认无误后，直接进入结账页完成支付。
          </p>
        </div>
        <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
          继续选购
        </Link>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
          {cart.items.length ? (
            <ul className="space-y-4">
              {cart.items.map((item) => (
                <li
                  key={item.id ?? `${item.variantId}-${item.productId}`}
                  className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 md:flex-row md:items-start md:justify-between"
                >
                  <div className="flex gap-4">
                    <div className="flex h-24 w-24 items-end rounded-2xl bg-gradient-to-br from-zinc-100 via-white to-zinc-200 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        {item.title?.slice(0, 10) || "Item"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-zinc-900">
                        {item.title ?? item.productHandle ?? item.productId}
                      </p>
                      {item.productHandle ? (
                        <Link
                          href={buildLocalePath(`/product/${item.productHandle}`, localeKey)}
                          className="mt-1 inline-block text-sm text-zinc-600 underline underline-offset-4"
                        >
                          返回商品页
                        </Link>
                      ) : null}
                      <p className="mt-3 text-sm text-zinc-500">
                        单价 {formatMoney(item.unitPrice, cart.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full flex-col items-start gap-3 md:w-auto md:items-end">
                    <form action={updateCartLineItemAction} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                      <input type="hidden" name="lineItemId" value={item.id} />
                      <label className="flex items-center justify-between gap-3 text-sm text-zinc-600 sm:block">
                        数量
                        <input
                          type="number"
                          name="quantity"
                          min={0}
                          defaultValue={item.quantity}
                          className="w-20 rounded-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 sm:ml-2"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white sm:min-w-[88px]"
                      >
                        更新
                      </button>
                    </form>
                    <div className="flex w-full items-center justify-between gap-4 md:w-auto md:justify-end">
                      <p className="text-sm font-medium text-zinc-900">
                        {formatMoney(
                          getDisplayLineTotal(item.unitPrice, item.quantity, item.total, cart.subtotal),
                          cart.currency,
                        )}
                      </p>
                      <form action={removeCartLineItemAction}>
                        <input type="hidden" name="lineItemId" value={item.id} />
                        <button
                          type="submit"
                          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-900"
                        >
                          删除
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <p className="text-lg font-medium text-zinc-900">购物车还是空的</p>
              <p className="mt-2 text-sm text-zinc-600">先去商店挑一件更合适的商品，再回来结账。</p>
              <Link
                href={buildLocalePath("/shop", localeKey)}
                className="mt-5 inline-flex rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                去选购
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 lg:sticky lg:top-28">
            <p className="text-sm font-medium text-zinc-900">订单摘要</p>
            <p className="mt-2 text-sm text-zinc-600">{itemCount} 件商品，确认后进入正式结账。</p>
          <dl className="mt-4 space-y-3 text-sm text-zinc-700">
            <div className="flex items-center justify-between">
              <dt>商品小计</dt>
              <dd>{formatMoney(cart.subtotal, cart.currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>配送费用</dt>
              <dd>{formatMoney(cart.shippingTotal, cart.currency)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>税费</dt>
              <dd>{formatMoney(cart.taxTotal, cart.currency)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 pt-3 font-medium text-zinc-900">
              <dt>订单总计</dt>
              <dd>{formatMoney(cart.total, cart.currency)}</dd>
            </div>
          </dl>
            <Link
              href={buildLocalePath(cart.items.length ? "/checkout" : "/shop", localeKey)}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {cart.items.length ? "去结账" : "去选购"}
            </Link>
          </div>

          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-900">购买保障</p>
            <ul className="mt-4 space-y-3 text-sm text-zinc-600">
              <li>低调隐私包装</li>
              <li>常规现货 48 小时内发货</li>
              <li>下单前后都可联系客服</li>
            </ul>
            <div className="mt-5 grid gap-2 text-sm">
              <Link className="underline underline-offset-4" href={buildLocalePath("/shipping", localeKey)}>
                配送说明
              </Link>
              <Link className="underline underline-offset-4" href={buildLocalePath("/returns", localeKey)}>
                退换政策
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
