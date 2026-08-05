import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listProducts } from "@/lib/commerce/products";
import { resolveGuideBySlug } from "@/lib/content/resolvers";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { getLocalizedCopy } from "@/lib/site/copy";
import { getSiteConfigForLocale } from "@/lib/site/config.server";
import { isFeaturePathEnabledForFeatures } from "@/lib/site/feature-utils";
import { localizeGuideArticle } from "@/lib/site/localize-content";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { formatMoney } from "@/lib/utils/money";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  if (!site.site.features.guides) {
    return buildSeoMetadata({
      title: "Not Found",
      description: "Not Found",
      path: "/guides",
      openGraphType: "website",
    });
  }
  const copy = getLocalizedCopy(localeKey).guides;
  const { slug } = await params;
  const resolved = await resolveGuideBySlug(slug);
  const article = localizeGuideArticle(resolved.article, localeKey);
  return buildSeoMetadata({
    title: article?.title || copy.metadataTitle,
    description: article?.excerpt || `${slug} guide`,
    path: `/guides/${slug}`,
    override: article?.seo
      ? {
          title: article.seo.title,
          description: article.seo.description,
        }
      : null,
    openGraphType: "article",
    siteKeys: article?.siteKeys,
    featurePath: "/guides",
  });
}

export default async function GuideDetailPage({ params }: Props) {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  if (!site.site.features.guides) notFound();
  const copy = getLocalizedCopy(localeKey).guides;
  const { slug } = await params;
  const resolved = await resolveGuideBySlug(slug);
  const article = localizeGuideArticle(resolved.article, localeKey);
  const products = await listProducts();
  const relatedProducts = products.filter((product) => (article?.relatedProductSlugs ?? []).includes(product.slug));
  const featureEnabledCollectionSlugs = (article?.relatedCollectionSlugs ?? []).filter((collectionSlug) =>
    isFeaturePathEnabledForFeatures(`/collection/${collectionSlug}`, site.site.features),
  );
  const guideJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article?.title ?? slug,
    description: article?.excerpt ?? "",
    url: buildAbsoluteUrl(`/guides/${slug}`),
    about: featureEnabledCollectionSlugs,
  };
  const quickSummary = article?.excerpt ?? copy.quickSummaryFallback;
  const audienceSummary = article?.relatedCollectionSlugs?.length
    ? copy.audienceSummaryWithCollections(article.relatedCollectionSlugs)
    : copy.audienceSummaryFallback;
  const nextStepSummary = relatedProducts.length
    ? copy.nextStepSummaryWithCount(relatedProducts.length)
    : copy.nextStepSummaryFallback;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guideJsonLd) }}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {article?.title ?? `Guide: ${slug}`}
          </h1>
          <p className="mt-2 text-xs text-zinc-500">source: {resolved.source}</p>
          {resolved.debug?.draftRef ? (
            <p className="mt-2 text-xs text-zinc-500">
              Draft active: <code className="rounded bg-zinc-100 px-1">{resolved.debug.draftRef}</code>
            </p>
          ) : null}
        </div>
        <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/guides", localeKey)}>
          {copy.backToGuides}
        </Link>
      </div>
      <p className="mt-4 text-zinc-600">
        {quickSummary}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">{copy.summaryTitle}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{quickSummary}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">{copy.audienceTitle}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{audienceSummary}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">{copy.nextStepTitle}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{nextStepSummary}</p>
        </div>
      </div>
      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">{copy.bodyTitle}</p>
        {Array.isArray(article?.body) && article.body.length > 0 ? (
          <div className="mt-3 space-y-4 text-sm leading-6 text-zinc-700">
            {article.body.map((block, index) => (
              <p key={index}>{typeof block === "string" ? block : JSON.stringify(block)}</p>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-600">
            <p>{copy.fallbackBody1}</p>
            <p>{copy.fallbackBody2}</p>
          </div>
        )}
      </div>
      {(relatedProducts.length || article?.relatedCollectionSlugs?.length) ? (
        <div className="mt-8 space-y-4">
          {relatedProducts.length ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{copy.relatedProductsTitle}</p>
                  <p className="mt-1 text-sm text-zinc-600">{copy.relatedProductsDescription}</p>
                </div>
                {site.site.features.quiz ? (
                  <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/quiz?src=guide", localeKey)}>
                    {copy.quizCta}
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {relatedProducts.map((product) => (
                  <Link
                    key={product.slug}
                    href={buildLocalePath(`/product/${product.slug}?src=guide&guide=${encodeURIComponent(slug)}`, localeKey)}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 hover:border-zinc-300"
                  >
                    <p className="text-sm font-medium text-zinc-900">{product.name}</p>
                    <p className="mt-1 text-sm text-zinc-600">{formatMoney(product.price, product.currency)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.appControl ? <span className="rounded-full bg-white px-2 py-1 text-xs text-zinc-700">App Control</span> : null}
                      {product.wearable ? <span className="rounded-full bg-white px-2 py-1 text-xs text-zinc-700">Wearable</span> : null}
                      {product.stimulationType.includes("dual") ? (
                        <span className="rounded-full bg-white px-2 py-1 text-xs text-zinc-700">Dual</span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {featureEnabledCollectionSlugs.length ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-medium text-zinc-900">{copy.collectionsTitle}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {featureEnabledCollectionSlugs.map((collectionSlug) => (
                  <Link
                    key={collectionSlug}
                    href={buildLocalePath(`/collection/${collectionSlug}?src=guide&guide=${encodeURIComponent(slug)}`, localeKey)}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700"
                  >
                    {collectionSlug}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">{copy.nextStepBlockTitle}</p>
          <p className="mt-2 text-sm text-zinc-600">{copy.nextStepBlockDescription}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {site.site.features.quiz ? (
              <Link className="underline underline-offset-4" href={buildLocalePath(`/quiz?src=guide&guide=${encodeURIComponent(slug)}`, localeKey)}>
                {copy.quizCta}
              </Link>
            ) : null}
            <Link className="underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
              {copy.shopAll}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
