import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { AiConciergeEntry } from "@/components/ai/ai-concierge-entry";
import { listProducts } from "@/lib/commerce/products";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const products = await listProducts();
  const availableProducts = products.filter(
    (product) => product.allowBackorder || (product.inventoryQuantity ?? 0) > 0,
  );
  const wearableCount = products.filter((product) => product.wearable).length;
  const appControlCount = products.filter((product) => product.appControl).length;
  const beginnerFriendlyCount = products.filter((product) => product.beginnerLevel >= 4).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <section className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">正式选购区</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">全部商品</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
              这里已经按正式卖货站的思路组织：先看是否适合新手、是否支持 App、是否可穿戴，再进入商品详情页完成加购与结账。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              href="/quiz"
            >
              先做选购问答
            </Link>
            <Link
              className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              href="/shipping"
            >
              查看配送说明
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">可下单商品</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{availableProducts.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">可穿戴</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{wearableCount}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">支持 App</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{appControlCount}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">新手友好</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{beginnerFriendlyCount}</p>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <AiConciergeEntry placement="shop" />
      </div>

      <section className="mt-8 flex flex-wrap gap-3">
        {[
          { label: "适合第一次选", href: "/collection/first-time" },
          { label: "支持 App 控制", href: "/collection/app-control" },
          { label: "可穿戴", href: "/collection/wearable" },
          { label: "双重刺激", href: "/collection/dual-stimulation" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
          >
            {item.label}
          </Link>
        ))}
      </section>

      <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>

      <section className="mt-12 rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">怎么挑</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              新手先看友好度和静音度，进阶用户再看刺激类型、是否可穿戴和 App 控制。
            </p>
          </div>
          <div>
            <p className="text-base font-semibold text-zinc-900">怎么下单</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              进入商品页确认规格与库存，加入购物车后去结账页填写地址并完成支付。
            </p>
          </div>
          <div>
            <p className="text-base font-semibold text-zinc-900">怎么买得更放心</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              下单前先看 FAQ、配送与退换政策；如果仍不确定，可以先走问答或联系客服。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
