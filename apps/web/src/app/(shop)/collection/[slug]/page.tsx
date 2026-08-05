import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { resolveCollectionContent } from "@/lib/content/resolvers";
import { listProducts } from "@/lib/commerce/products";
import { pickCollectionCtaLinks, pickCollectionProducts } from "@/lib/collections/collection-merchandising";
import { resolvePreviewToken } from "@/lib/control-plane/ops";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { getRepoChangeSeoOverride } from "@/lib/seo/repo-change-overrides";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { filterFeatureEnabledNavItems, getSiteConfigForLocale } from "@/lib/site/config.server";
import { isFeaturePathEnabledForFeatures } from "@/lib/site/feature-utils";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { SignalTracker } from "@/components/signals/signal-tracker";
import { TrackedLink } from "@/components/signals/tracked-link";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function localizeValue<T extends { locales?: Record<string, Partial<T>> }>(value: T, localeKey: "en" | "zh") {
  const localized = value.locales?.[localeKey] ?? {};
  return { ...value, ...localized };
}

function getCollectionPageCopy(localeKey: "en" | "zh") {
  if (localeKey === "en") {
    return {
      metadataDescription: (slug: string) => `Collection page for ${slug}.`,
      previewBadge: "Preview mode: unpublished content is being rendered for review only.",
      draftActive: "Draft active",
      backToShop: "Back to shop",
      fallbackTitle: "Three questions to answer before entering this route",
      fallbackDescription:
        "Decide whether App Control, wearable use, beginner fit, discretion, or stronger feedback matters most. The clearer your direction is, the easier the product decision becomes.",
      emptyState:
        "There are no products available in this collection yet. You can return to the full shop or take the quiz first to narrow the direction.",
      shopAll: "Go to shop",
      takeQuiz: "Take the quiz",
      continueLearn: "Keep exploring",
    };
  }

  return {
    metadataDescription: (slug: string) => `Collection ${slug} 页面。`,
    previewBadge: "Preview mode: 当前页面正在渲染未发布内容（仅用于预览）。",
    draftActive: "Draft active",
    backToShop: "返回商品列表",
    fallbackTitle: "进入这类商品前，先想清三件事",
    fallbackDescription:
      "你更在意的是 App Control、可穿戴与否、新手友好度、安静低调，还是更强刺激感。方向越清楚，进入商品页后越容易做决定。",
    emptyState:
      "这个合集目前还没有可展示的商品。你可以先回到全部商品页继续浏览，或直接做一次选购问答，让系统先帮你缩小方向。",
    shopAll: "去全部商品",
    takeQuiz: "去做问答",
    continueLearn: "继续了解",
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  const copy = getCollectionPageCopy(localeKey);
  const { slug } = await params;
  const content = await resolveCollectionContent(slug);
  const override = getRepoChangeSeoOverride("collection", slug);
  return buildSeoMetadata({
    title: content.heroTitle,
    description: content.heroSummary || copy.metadataDescription(slug),
    path: `/collection/${slug}`,
    override,
    openGraphType: "website",
    siteKeys: content.siteKeys,
    featurePath: `/collection/${slug}`,
  });
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  const copy = getCollectionPageCopy(localeKey);
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const previewToken = typeof sp.preview === "string" ? sp.preview : null;
  let previewBadge: string | null = null;

  let content = await resolveCollectionContent(slug);
  if (previewToken) {
    const preview = await resolvePreviewToken(previewToken);
    if (preview?.draft?.schemaType === "collectionPageDraft" && preview.draft.targetId === slug) {
      const payload = preview.draft.payload;
      content = {
        source: "control-plane-draft" as const,
        slug,
        siteKeys: payload.siteKeys,
        heroTitle: payload.hero?.title ?? `Collection: ${slug}`,
        heroSummary: payload.hero?.summary ?? "",
        sections: payload.sections ?? [],
        internalLinks: payload.internalLinks ?? [],
        featuredProductSlugs: payload.featuredProductSlugs ?? [],
        ctaLinks: payload.ctaLinks ?? [],
        debug: {
          contentRef: `preview:${previewToken}`,
          draftRef: `preview:${previewToken}`,
        },
      };
      previewBadge = copy.previewBadge;
    }
  }
  const collectionOverride = site.site.merchandising.collectionOverrides?.[slug];
  const localizedOverride = collectionOverride ? localizeValue(collectionOverride, localeKey) : null;
  const heroTitle = localizedOverride?.heroTitle ?? content.heroTitle;
  const heroSummary = localizedOverride?.heroSummary ?? content.heroSummary;
  const draftSections = localizedOverride?.sections
    ? localizedOverride.sections.map((section) => localizeValue(section, localeKey))
    : content.sections;
  const internalLinks = localizedOverride?.internalLinks ?? content.internalLinks;
  const featureEnabledInternalLinks = (await filterFeatureEnabledNavItems(
    internalLinks.map((href) => ({ href })),
    localeKey,
  )).map((item) => item.href);
  const localizedOverrideCtaLinks = (localizedOverride?.ctaLinks ?? []).map((item) => localizeValue(item, localeKey));
  const heroCtaLinks = pickCollectionCtaLinks(
    content.ctaLinks,
    localizedOverrideCtaLinks,
    (pathname) => isFeaturePathEnabledForFeatures(pathname, site.site.features),
  );
  const contentRef = content.debug?.contentRef ?? content.debug?.draftRef ?? null;
  const allProducts = await listProducts();
  const filteredProducts = pickCollectionProducts(
    allProducts,
    slug,
    content.featuredProductSlugs,
    localizedOverride?.featuredProductSlugs,
  );
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: heroTitle,
    description: heroSummary,
    url: buildAbsoluteUrl(`/collection/${slug}`),
    mainEntity: draftSections.map((section) => ({
      "@type": "WebPageElement",
      name: section.title,
      text: section.content,
    })),
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <SignalTracker targetType="collection" targetId={slug} contentRef={contentRef} />
      {previewBadge ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {previewBadge}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            {heroTitle}
          </h1>
          <p className="mt-3 text-zinc-600">
            {heroSummary}
          </p>
          {heroCtaLinks.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {heroCtaLinks.map((item) => (
                <Link
                  key={item.href}
                  href={buildLocalePath(item.href, localeKey)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-300"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
          {content.debug?.draftRef ? (
            <p className="mt-3 text-xs text-zinc-500">
              {copy.draftActive}:{" "}
              <code className="rounded bg-zinc-100 px-1">{content.debug.draftRef}</code>
            </p>
          ) : null}
        </div>
        <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
          {copy.backToShop}
        </Link>
      </div>

      {draftSections.length > 0 ? (
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {draftSections.map((section) => (
            <section
              key={section.key}
              className="rounded-xl border border-zinc-200 bg-white p-5"
            >
              <p className="text-sm font-medium text-zinc-900">{section.title}</p>
              <p className="mt-2 text-sm text-zinc-600">{section.content}</p>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">{copy.fallbackTitle}</p>
          <p className="mt-2 text-sm text-zinc-600">{copy.fallbackDescription}</p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.length ? (
          filteredProducts.map((product) => (
            <TrackedLink
              key={product.id}
              href={buildLocalePath(`/product/${product.slug}`, localeKey)}
              className="block"
              targetType="collection"
              targetId={slug}
              contentRef={contentRef}
            >
              <ProductCard product={product} compact plain />
            </TrackedLink>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
            {copy.emptyState}
            <div className="mt-3 flex flex-wrap gap-3">
              <Link className="underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
                {copy.shopAll}
              </Link>
              {site.site.features.quiz ? (
                <Link className="underline underline-offset-4" href={buildLocalePath("/quiz", localeKey)}>
                  {copy.takeQuiz}
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {featureEnabledInternalLinks.length > 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">{copy.continueLearn}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {featureEnabledInternalLinks.map((href) => (
              <Link
                key={href}
                href={buildLocalePath(href, localeKey)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-300"
              >
                {href}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
