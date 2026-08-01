import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { listProducts } from "@/lib/commerce/products";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { getSiteConfigForLocale, isFeaturePathEnabled } from "@/lib/site/config";
import { getLocalizedCopy } from "@/lib/site/copy";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

function localizeMerchText<T extends { locales?: Record<string, Partial<T>> }>(value: T, localeKey: "en" | "zh") {
  const localized = value.locales?.[localeKey] ?? {};
  return { ...value, ...localized };
}

export async function generateMetadata(): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getLocalizedCopy(localeKey).home;

  return buildSeoMetadata({
    title: site.brand.name,
    description: copy.heroDescription,
    path: "/",
    openGraphType: "website",
    siteKeys: ["cn-store", "us-store", "jp-store"],
  });
}

export default async function HomePage() {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getLocalizedCopy(localeKey).home;
  const products = await listProducts();
  const featuredProducts = site.site.merchandising.homeFeaturedProductSlugs
    .map((slug) => products.find((product) => product.slug === slug))
    .filter((product): product is (typeof products)[number] => Boolean(product))
    .slice(0, 3);
  const fallbackFeaturedProducts =
    featuredProducts.length > 0 ? featuredProducts : products.slice(0, 3);
  const collectionCards = site.site.merchandising.homeCollectionCards
    .filter((item) => isFeaturePathEnabled(item.href, localeKey))
    .map((item) => localizeMerchText(item, localeKey));

  return (
    <div className="bg-zinc-50">
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">
            {site.brand.name}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 md:text-6xl">
            {copy.heroTitle}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-600">
            {copy.heroDescription}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
              href={buildLocalePath("/shop", localeKey)}
            >
              {copy.primaryCta}
            </Link>
            {site.site.features.quiz ? (
              <Link
                className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium text-zinc-900 hover:bg-white"
                href={buildLocalePath("/quiz", localeKey)}
              >
                {copy.secondaryCta}
              </Link>
            ) : null}
          </div>
          <div className="grid gap-4 pt-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-2xl font-semibold text-zinc-900">3+</p>
              <p className="mt-1 text-sm text-zinc-600">{copy.stats[0]}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-2xl font-semibold text-zinc-900">48h</p>
              <p className="mt-1 text-sm text-zinc-600">{copy.stats[1]}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-2xl font-semibold text-zinc-900">1 对 1</p>
              <p className="mt-1 text-sm text-zinc-600">{copy.stats[2]}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-900">{copy.whyTitle}</p>
          <div className="mt-6 space-y-4">
            {copy.whyItems.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-600">
            <Link className="underline underline-offset-4" href={buildLocalePath("/shipping", localeKey)}>
              {copy.links.shipping}
            </Link>
            <Link className="underline underline-offset-4" href={buildLocalePath("/returns", localeKey)}>
              {copy.links.returns}
            </Link>
            <Link className="underline underline-offset-4" href={buildLocalePath("/faq", localeKey)}>
              {copy.links.faq}
            </Link>
            <Link className="underline underline-offset-4" href={buildLocalePath("/contact", localeKey)}>
              {copy.links.contact}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{copy.featuredSectionEyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              {copy.featuredSectionTitle}
            </h2>
          </div>
          <Link className="text-sm text-zinc-700 underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
            {copy.featuredSectionCta}
          </Link>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {fallbackFeaturedProducts.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              eyebrow={copy.featuredEyebrows[index] ?? copy.featuredEyebrows[0]}
              href={buildLocalePath(`/product/${product.slug}`, localeKey)}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{copy.collectionsEyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              {copy.collectionsTitle}
            </h2>
          </div>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {collectionCards.map((item) => (
            <Link
              key={item.href}
              href={buildLocalePath(item.href, localeKey)}
              className="rounded-3xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 hover:shadow-sm"
            >
              <p className="text-lg font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{item.summary}</p>
              <p className="mt-6 text-sm text-zinc-900">{copy.collectionCardCta}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{copy.guidanceEyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              {copy.guidanceTitle}
            </h2>
            <div className="mt-8 space-y-4">
              {copy.guidanceSteps.map((item, index) => (
                <div key={item.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                  <p className="text-sm font-medium text-zinc-900">
                    {index + 1}. {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{copy.audienceEyebrow}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              {copy.audienceTitle}
            </h2>
            <p className="mt-4 text-sm leading-7 text-zinc-600">
              {copy.audienceDescription}
            </p>
            <div className="mt-6 space-y-3">
              {copy.audienceBlocks.map((item) => (
                <div key={item} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              {site.site.features.quiz ? (
                <Link className="underline underline-offset-4" href={buildLocalePath("/quiz", localeKey)}>
                  {copy.audiencePrimaryCta}
                </Link>
              ) : null}
              {site.site.features.guides ? (
                <Link className="underline underline-offset-4" href={buildLocalePath("/guides", localeKey)}>
                  {copy.audienceSecondaryCta}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{copy.trustEyebrow}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
                {copy.trustTitle}
              </h2>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
              href={buildLocalePath("/checkout", localeKey)}
            >
              {copy.trustPrimaryCta}
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {copy.trustBlocks.map((item) => (
              <div key={item.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="text-base font-semibold text-zinc-900">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
