import Link from "next/link";
import { notFound } from "next/navigation";
import { listProducts } from "@/lib/commerce/products";
import { getSiteConfigForLocale, isSiteFeatureEnabled } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { formatMoney } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

function getAppControlCopy(localeKey: "en" | "zh") {
  if (localeKey === "en") {
    return {
      intro:
        "Best for shoppers who want to start with app control, remote interaction, and finer-grained pacing. This page gathers the currently sellable app-control route in one place.",
      unsureTitle: "Not sure which one fits?",
      unsureBody:
        "If you know you want app control but are still unsure whether wearable, dual stimulation, or a more first-time-friendly route fits best, the quiz is the fastest next step.",
      quiz: "Find Your Match",
      bundle: "Browse App Control bundle",
      shop: "Go to Shop",
    };
  }
  return {
    intro: "适合想优先看 App Control、远程互动和更细粒度控制体验的人。这里先直接聚合当前可售的 App Control 路线商品。",
    unsureTitle: "Not sure which one fits?",
    unsureBody: "如果你确定想要 App Control，但还不确定是 wearable、dual 还是更适合 first-time，可以先走问答路径。",
    quiz: "Find Your Match",
    bundle: "Browse App Control bundle",
    shop: "Go to Shop",
  };
}

export default async function AppControlPage() {
  const localeKey = await getRequestLocaleKey();
  if (!isSiteFeatureEnabled("appControl", localeKey)) notFound();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getAppControlCopy(localeKey);
  const products = await listProducts();
  const appControlProducts = products.filter((item) => item.appControl || item.collections.includes("app-controlled"));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        App Control
      </h1>
      <p className="mt-4 text-zinc-600">
        {copy.intro}
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {appControlProducts.map((product) => (
          <Link
            key={product.slug}
            href={buildLocalePath(`/product/${product.slug}?src=app-control`, localeKey)}
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
        <p className="text-sm font-medium text-zinc-900">{copy.unsureTitle}</p>
        <p className="mt-2 text-sm text-zinc-600">{copy.unsureBody}</p>
        <div className="mt-4 flex gap-4 text-sm">
          {site.site.features.quiz ? (
            <Link className="underline underline-offset-4" href={buildLocalePath("/quiz?src=app-control", localeKey)}>
              {copy.quiz}
            </Link>
          ) : null}
          {site.site.features.bundles ? (
            <Link className="underline underline-offset-4" href={buildLocalePath("/bundles?plan=app-control", localeKey)}>
              {copy.bundle}
            </Link>
          ) : null}
        </div>
      </div>
      <div className="mt-8 flex gap-4 text-sm">
        <Link className="underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
          {copy.shop}
        </Link>
        {site.site.features.quiz ? (
          <Link className="underline underline-offset-4" href={buildLocalePath("/quiz", localeKey)}>
            {copy.quiz}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
