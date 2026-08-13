import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { AiConciergeEntry } from "@/components/ai/ai-concierge-entry";
import { listProducts } from "@/lib/commerce/products";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { getSiteConfigForLocale } from "@/lib/site/config.server";
import { isFeaturePathEnabledForFeatures } from "@/lib/site/feature-utils";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { getShopPageCopy } from "@/lib/site/shop-copy";

export const dynamic = "force-dynamic";

function localizeMerchText<T extends { locales?: Record<string, Partial<T>> }>(value: T, localeKey: "en" | "zh") {
  const localized = value.locales?.[localeKey] ?? {};
  return { ...value, ...localized };
}

function getRouteGridClass(routeCount: number) {
  const cappedRouteCount = Math.min(Math.max(routeCount, 1), 4);

  switch (cappedRouteCount) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 sm:grid-cols-2";
    case 3:
      return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
    case 4:
    default:
      return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
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
  const site = await getSiteConfigForLocale(localeKey);
  const copy = getShopPageCopy(localeKey);
  const products = await listProducts();
  const availableProducts = products.filter(
    (product) => product.allowBackorder || (product.inventoryQuantity ?? 0) > 0,
  );
  const wearableCount = products.filter((product) => product.wearable).length;
  const appControlCount = products.filter((product) => product.appControl).length;
  const beginnerFriendlyCount = products.filter((product) => product.beginnerLevel >= 4).length;
  const shopIntro = localizeMerchText(site.site.merchandising.shopIntro, localeKey);
  const routeCards = site.site.merchandising.homeCollectionCards
    .filter((item) => isFeaturePathEnabledForFeatures(item.href, site.site.features))
    .map((item) => localizeMerchText(item, localeKey))
    .slice(0, 4);
  const shopQuickLinks = site.site.merchandising.shopQuickLinks
    .filter((item) => isFeaturePathEnabledForFeatures(item.href, site.site.features))
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
                {copy.primaryCta}
              </Link>
            ) : null}
            <Link
              className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-white"
              href={buildLocalePath("/shipping", localeKey)}
            >
              {copy.secondaryCta}
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{copy.routesEyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">{copy.routesTitle}</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-600">{copy.routesDescription}</p>
        </div>
        <div className={`mt-8 grid gap-5 ${getRouteGridClass(routeCards.length)}`}>
          {routeCards.map((item) => (
            <Link
              key={item.href}
              href={buildLocalePath(item.href, localeKey)}
              className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 transition hover:border-zinc-300 hover:bg-white hover:shadow-sm"
            >
              <p className="text-lg font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{item.summary}</p>
              <p className="mt-6 text-sm text-zinc-900">{copy.routeCardCta}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-zinc-200/80 bg-zinc-50/80 p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-zinc-900">{copy.inventoryTitle}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{copy.inventoryDescription}</p>
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{copy.inventoryStats.available}</p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{availableProducts.length}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{copy.inventoryStats.wearable}</p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{wearableCount}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{copy.inventoryStats.appControl}</p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{appControlCount}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{copy.inventoryStats.beginnerFriendly}</p>
              <p className="mt-2 text-xl font-semibold text-zinc-900">{beginnerFriendlyCount}</p>
            </div>
          </div>
        </div>
      </section>

      <AiConciergeEntry
        placement="shop"
        introEyebrow={copy.aiHandoffEyebrow}
        introDescription={copy.aiHandoffDescription}
      />

      <section className="mt-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">{copy.quickLinksTitle}</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {shopQuickLinks.map((item) => (
            <Link
              key={item.href}
              href={buildLocalePath(item.href, localeKey)}
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section id="all-products" className="mt-10 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">{copy.allProductsTitle}</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
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
