import Link from "next/link";
import { formatMoney } from "@/lib/utils/money";
import type { CommerceProduct } from "@/types/product";

type ProductCardProps = {
  product: CommerceProduct;
  href?: string;
  eyebrow?: string;
  compact?: boolean;
  plain?: boolean;
};

function buildProductBadges(product: CommerceProduct) {
  const badges: string[] = [];
  if (product.appControl) badges.push("App 控制");
  if (product.wearable) badges.push("可穿戴");
  if (product.coupleFriendly) badges.push("适合情侣");
  if (product.stimulationType.includes("dual")) badges.push("双重刺激");
  if (product.discreetLevel >= 4) badges.push("低调安静");
  return badges.slice(0, 4);
}

function stockLabel(product: CommerceProduct) {
  if (product.allowBackorder) return "支持预售";
  if (typeof product.inventoryQuantity === "number" && product.inventoryQuantity <= 0) {
    return "暂时缺货";
  }
  if (typeof product.inventoryQuantity === "number" && product.inventoryQuantity < 10) {
    return `仅剩 ${product.inventoryQuantity} 件`;
  }
  return "现货可下单";
}

export function ProductCard({ product, href, eyebrow, compact = false, plain = false }: ProductCardProps) {
  const targetHref = href ?? `/product/${product.slug}`;
  const badges = buildProductBadges(product);
  const content = (
    <>
      <div className="flex aspect-[4/3] items-end justify-between bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-5">
        <div>
          {eyebrow ? <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{eyebrow}</p> : null}
          <p className="mt-2 text-lg font-semibold text-zinc-900">{product.name}</p>
          <p className="mt-1 text-sm text-zinc-600">{product.series || product.brand}</p>
        </div>
        <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
          {product.brand}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-semibold text-zinc-900">
              {formatMoney(product.price, product.currency)}
            </p>
            {product.compareAtPrice ? (
              <p className="mt-1 text-sm text-zinc-500 line-through">
                {formatMoney(product.compareAtPrice, product.currency)}
              </p>
            ) : null}
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {stockLabel(product)}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700"
            >
              {badge}
            </span>
          ))}
        </div>

        {!compact ? (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-zinc-600">
            <div>
              <p className="text-zinc-500">续航</p>
              <p className="mt-1 font-medium text-zinc-900">
                {product.runtimeMinutes ? `${product.runtimeMinutes} 分钟` : "待补充"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">防水</p>
              <p className="mt-1 font-medium text-zinc-900">{product.waterproof || "待补充"}</p>
            </div>
            <div>
              <p className="text-zinc-500">静音度</p>
              <p className="mt-1 font-medium text-zinc-900">{product.discreetLevel}/5</p>
            </div>
            <div>
              <p className="text-zinc-500">新手友好</p>
              <p className="mt-1 font-medium text-zinc-900">{product.beginnerLevel}/5</p>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-sm text-zinc-600 group-hover:text-zinc-900">
            查看详情
          </span>
          <span className="text-lg text-zinc-400 transition group-hover:translate-x-1">→</span>
        </div>
      </div>
    </>
  );

  if (plain) {
    return (
      <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={targetHref}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
    >
      {content}
    </Link>
  );
}
