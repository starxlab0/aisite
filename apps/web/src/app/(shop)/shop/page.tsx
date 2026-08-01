import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { AiConciergeEntry } from "@/components/ai/ai-concierge-entry";
import { listProducts } from "@/lib/commerce/products";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { getSiteConfigForLocale, isFeaturePathEnabled } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

export const dynamic = "force-dynamic";

function localizeMerchText<T extends { locales?: Record<string, Partial<T>> }>(value: T, localeKey: "en" | "zh") {
  const localized = value.locales?.[localeKey] ?? {};
  return { ...value, ...localized };
}

export async function generateMetadata(): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const shopIntro = localizeMerchText(site.site.merchandising.shopIntro, localeKey);

  return buildSeoMetadata({
    title: shopIntro.title,
    description: shopIntro.description,
    path: "/shop",
    openGraphType: "website",
    siteKeys: ["cn-store", "us-store", "jp-store"],
  });
}

export default async function ShopPage() {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const products = await listProducts();
  const availableProducts = products.filter(
    (product) => product.allowBackorder || (product.inventoryQuantity ?? 0) > 0,
  );
  const wearableCount = products.filter((product) => product.wearable).length;
  const appControlCount = products.filter((product) => product.appControl).length;
  const beginnerFriendlyCount = products.filter((product) => product.beginnerLevel >= 4).length;
  const shopIntro = localizeMerchText(site.site.merchandising.shopIntro, localeKey);
  const shopQuickLinks = site.site.merchandising.shopQuickLinks
    .filter((item) => isFeaturePathEnabled(item.href, localeKey))
    .map((item) => localizeMerchText(item, localeKey));
  const shopAdviceCards = site.site.merchandising.shopAdviceCards.map((item) => localizeMerchText(item, localeKey));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <section className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{shopIntro.eyebrow}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900">{shopIntro.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
              {shopIntro.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {site.site.features.quiz ? (
              <Link
                className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
                href={buildLocalePath("/quiz", localeKey)}
              >
                先做选购问答
              </Link>
            ) : null}
            <Link
              className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              href={buildLocalePath("/shipping", localeKey)}
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
        {shopQuickLinks.map((item) => (
          <Link
            key={item.href}
            href={buildLocalePath(item.href, localeKey)}
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
          {shopAdviceCards.map((item) => (
            <div key={item.title}>
              <p className="text-base font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{item.copy}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
