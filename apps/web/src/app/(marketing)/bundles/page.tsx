import Link from "next/link";
import { notFound } from "next/navigation";
import { listProducts } from "@/lib/commerce/products";
import { getSiteConfigForLocale, isSiteFeatureEnabled } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { formatMoney } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pickBundleProducts(
  products: Awaited<ReturnType<typeof listProducts>>,
  plan: string,
  topSlug: string | null,
) {
  const top = topSlug ? products.find((item) => item.slug === topSlug) ?? null : null;
  let filtered = products;
  if (plan === "wearable") {
    filtered = products.filter((item) => item.wearable || item.collections.includes("wearable") || item.collections.includes("discreet-play"));
  } else if (plan === "app-control") {
    filtered = products.filter((item) => item.appControl || item.collections.includes("app-controlled"));
  } else if (plan === "dual") {
    filtered = products.filter((item) => item.stimulationType.includes("dual") || item.collections.includes("dual-stimulation"));
  } else {
    filtered = products.filter((item) => item.beginnerLevel <= 3 || item.collections.includes("first-time"));
  }
  const deduped = [top, ...filtered]
    .filter((item): item is Awaited<ReturnType<typeof listProducts>>[number] => Boolean(item))
    .filter((item, index, list) => list.findIndex((x) => x.slug === item.slug) === index);
  return deduped.slice(0, 3);
}

function planCopy(plan: string, localeKey: "en" | "zh") {
  const isEn = localeKey === "en";
  if (plan === "wearable") {
    return {
      title: "Wearable bundle",
      summary: isEn
        ? "Best for discreet or hands-free use. Start by comparing 2–3 core wearable options."
        : "更适合 discreet / hands-free 场景，先看 wearable 路线的 2–3 个核心选择。",
    };
  }
  if (plan === "app-control") {
    return {
      title: "App control bundle",
      summary: isEn
        ? "Best for shoppers who want to compare app control, remote interaction, and finer-grained pacing first."
        : "适合想优先比较 App Control、远程互动和更精细控制体验的人。",
    };
  }
  if (plan === "dual") {
    return {
      title: "Dual stimulation bundle",
      summary: isEn
        ? "Best for shoppers who want a quick comparison across different dual-stimulation routes."
        : "适合想快速对比 dual stimulation 路线强弱差异的人。",
    };
  }
  return {
    title: "Starter bundle",
    summary: isEn
      ? "Start with the easier, lower-friction route first, then decide whether you want a more advanced path."
      : "从更易上手、决策成本更低的组合开始，再决定是否进入更进阶路线。",
  };
}

export default async function BundlesPage({ searchParams }: Props) {
  const localeKey = await getRequestLocaleKey();
  if (!isSiteFeatureEnabled("bundles", localeKey)) notFound();
  const site = getSiteConfigForLocale(localeKey);
  const sp = (await searchParams) ?? {};
  const plan = typeof sp.plan === "string" ? sp.plan : "starter";
  const topSlug = typeof sp.top === "string" ? sp.top : null;
  const products = await listProducts();
  const picks = pickBundleProducts(products, plan, topSlug);
  const copy = planCopy(plan, localeKey);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        {copy.title}
      </h1>
      <p className="mt-4 text-zinc-600">
        {copy.summary}
      </p>
      {topSlug ? (
        <p className="mt-2 text-sm text-zinc-500">
          {localeKey === "en" ? (
            <>
              From the quiz route. This bundle is currently anchored around{" "}
              <span className="font-medium text-zinc-700">{topSlug}</span>.
            </>
          ) : (
            <>
              来源于 quiz 推荐路径，当前优先围绕 <span className="font-medium text-zinc-700">{topSlug}</span> 延展组合浏览。
            </>
          )}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {picks.map((product) => (
          <Link
            key={product.slug}
            href={buildLocalePath(`/product/${product.slug}?src=ai_concierge&from=bundles&plan=${encodeURIComponent(plan)}`, localeKey)}
            className="rounded-2xl border border-zinc-200 bg-white p-5 hover:border-zinc-300"
          >
            <p className="text-sm font-medium text-zinc-900">{product.name}</p>
            <p className="mt-2 text-sm text-zinc-600">{formatMoney(product.price, product.currency)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.appControl ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">App Control</span> : null}
              {product.wearable ? <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">Wearable</span> : null}
              {product.stimulationType.includes("dual") ? (
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">Dual</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link className="underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
          {localeKey === "en" ? "Shop all" : "查看全部商品"}
        </Link>
        {site.site.features.quiz ? (
          <Link className="underline underline-offset-4" href={buildLocalePath("/quiz?src=bundles", localeKey)}>
            {localeKey === "en" ? "Retake quiz" : "重新做问答"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
