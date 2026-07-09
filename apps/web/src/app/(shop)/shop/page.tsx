import Link from "next/link";
import { listProducts } from "@/lib/commerce/products";
import { formatMoney } from "@/lib/utils/money";
import { AiConciergeEntry } from "@/components/ai/ai-concierge-entry";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const productsPromise = listProducts();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            Shop
          </h1>
          <p className="mt-3 text-zinc-600">
            商品列表骨架：后续从 Medusa 拉取可售商品，并叠加体验标签筛选。
          </p>
        </div>
        <Link className="text-sm underline underline-offset-4" href="/collection/first-time">
          Browse by need
        </Link>
      </div>

      <div className="mt-6">
        <AiConciergeEntry placement="shop" />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(await productsPromise).map((p) => (
          <Link
            key={p.slug}
            href={`/product/${p.slug}`}
            className="rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
          >
            <p className="text-sm font-medium text-zinc-900">{p.name}</p>
            <p className="mt-2 text-sm text-zinc-600">
              {formatMoney(p.price, p.currency)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.appControl && (
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  App Control
                </span>
              )}
              {p.wearable && (
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  Wearable
                </span>
              )}
              {p.stimulationType.includes("dual") && (
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  Dual
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
