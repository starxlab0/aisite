import Link from "next/link";
import { listProducts } from "@/lib/commerce/products";
import { formatMoney } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

export default async function AppControlPage() {
  const products = await listProducts();
  const appControlProducts = products.filter((item) => item.appControl || item.collections.includes("app-controlled"));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        App Control
      </h1>
      <p className="mt-4 text-zinc-600">
        适合想优先看 App Control、远程互动和更细粒度控制体验的人。这里先直接聚合当前可售的 App Control 路线商品。
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {appControlProducts.map((product) => (
          <Link
            key={product.slug}
            href={`/product/${product.slug}?src=app-control`}
            className="rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
          >
            <p className="text-sm font-medium text-zinc-900">{product.name}</p>
            <p className="mt-2 text-sm text-zinc-600">{formatMoney(product.price, product.currency)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">App Control</span>
              {product.remoteControl ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">Remote</span> : null}
              {product.coupleFriendly ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">Couples</span> : null}
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">Not sure which one fits?</p>
        <p className="mt-2 text-sm text-zinc-600">如果你确定想要 App Control，但还不确定是 wearable、dual 还是更适合 first-time，可以先走问答路径。</p>
        <div className="mt-4 flex gap-4 text-sm">
          <Link className="underline underline-offset-4" href="/quiz?src=app-control">
            Find Your Match
          </Link>
          <Link className="underline underline-offset-4" href="/bundles?plan=app-control">
            Browse App Control bundle
          </Link>
        </div>
      </div>
      <div className="mt-8 flex gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/shop">
          Go to Shop
        </Link>
        <Link className="underline underline-offset-4" href="/quiz">
          Find Your Match
        </Link>
      </div>
    </div>
  );
}
