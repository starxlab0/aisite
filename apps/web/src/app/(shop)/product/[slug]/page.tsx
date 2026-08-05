import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { getProductBySlug, listProducts } from "@/lib/commerce/products";
import { toProductPageViewModel } from "@/lib/cms/mapping";
import { resolveProductContent } from "@/lib/content/resolvers";
import { getPublishedProductFaqDraftBySlug } from "@/lib/control-plane/drafts";
import { resolvePreviewToken } from "@/lib/control-plane/ops";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { getRepoChangeSeoOverride } from "@/lib/seo/repo-change-overrides";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { getLocalizedCopy } from "@/lib/site/copy";
import { localizeProductContent } from "@/lib/site/localize-content";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { getActiveSiteConfig } from "@/lib/site/config.server";
import { formatMoney } from "@/lib/utils/money";
import { addToCartAction } from "@/features/cart/actions";
import type { ProductContent } from "@/types/product";
import { SignalTracker } from "@/components/signals/signal-tracker";
import { TrackedSubmitButton } from "@/components/signals/tracked-submit-button";
import { AiConciergeEntry } from "@/components/ai/ai-concierge-entry";
import { AttributionCapture } from "@/components/signals/attribution-capture";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const copy = getLocalizedCopy(localeKey).product;
  const { slug } = await params;
  const commerce = await getProductBySlug(slug);
  const resolved = await resolveProductContent(slug);
  const localizedContent = localizeProductContent(resolved.content, localeKey);
  const override = getRepoChangeSeoOverride("product", slug);

  const title = localizedContent?.seo?.title || localizedContent?.title || commerce?.name || slug;
  const description = localizedContent?.seo?.description || localizedContent?.shortDescription || `${title} · ${copy.metadataDescriptionSuffix}`;
  const siteKeys = Array.from(new Set([...(commerce?.siteKeys ?? []), ...(resolved.content?.siteKeys ?? [])]));

  return buildSeoMetadata({
    title,
    description,
    path: `/product/${slug}`,
    override: {
      title: override?.title,
      description: override?.description,
      canonical: override?.canonical,
      robots: override?.robots,
    },
    openGraphType: "website",
    siteKeys: siteKeys.length ? siteKeys : undefined,
  });
}

export default async function ProductPage({ params, searchParams }: Props) {
  const localeKey = await getRequestLocaleKey();
  const copy = getLocalizedCopy(localeKey).product;
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const previewToken = typeof sp.preview === "string" ? sp.preview : null;

  let previewBadge: string | null = null;
  let resolved = await resolveProductContent(slug);
  if (previewToken) {
    const preview = await resolvePreviewToken(previewToken);
    if (
      preview?.draft?.schemaType === "productContentDraft" &&
      preview.draft.targetId === slug
    ) {
      const payload = preview.draft.payload;
      const content: ProductContent = {
        productSlug: payload.productSlug ?? slug,
        title: payload.title,
        subtitle: payload.subtitle,
        shortDescription: payload.shortDescription,
        hero: payload.hero,
        keyBenefits: payload.keyBenefits,
        whoItsFor: payload.whoItsFor,
        whyItFeelsDifferent: payload.whyItFeelsDifferent,
        careInstructions: payload.careInstructions,
        whatsInBox: payload.whatsInBox,
        locales: payload.locales,
      };
      resolved = {
        source: "control-plane-draft",
        content,
        debug: {
          contentRef: `preview:${previewToken}`,
          draftRef: `preview:${previewToken}`,
        },
      };
      previewBadge = copy.previewBadge;
    }
  }

  const localizedContent = localizeProductContent(resolved.content, localeKey);
  const commerce = await getProductBySlug(slug);
  if (!commerce) {
    if (!localizedContent) {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 py-14">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {copy.notFoundTitle}
          </h1>
          <p className="mt-3 text-zinc-600">{copy.notFoundDescription}</p>
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-14">
        {previewBadge ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {previewBadge}: 当前页面正在渲染未发布内容（仅用于预览）。
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              {localizedContent.title || slug}
            </h1>
            {localizedContent.subtitle ? (
              <p className="mt-2 text-base font-medium text-zinc-700">{localizedContent.subtitle}</p>
            ) : null}
            {localizedContent.shortDescription ? (
              <p className="mt-3 text-zinc-600">{localizedContent.shortDescription}</p>
            ) : null}
            <p className="mt-3 text-xs text-zinc-500">source: {resolved.source}</p>
            {resolved.debug?.draftRef ? (
              <p className="mt-2 text-xs text-zinc-500">
                {copy.draftActive}: <code className="rounded bg-zinc-100 px-1">{resolved.debug.draftRef}</code>
              </p>
            ) : null}
          </div>
          <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
            {copy.backToShop}
          </Link>
        </div>

        {localizedContent.hero?.headline || localizedContent.hero?.description ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            {localizedContent.hero.eyebrow ? (
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{localizedContent.hero.eyebrow}</p>
            ) : null}
            {localizedContent.hero.headline ? (
              <p className="mt-2 text-lg font-semibold text-zinc-900">{localizedContent.hero.headline}</p>
            ) : null}
            {localizedContent.hero.description ? (
              <p className="mt-2 text-sm leading-6 text-zinc-600">{localizedContent.hero.description}</p>
            ) : null}
          </div>
        ) : null}

        {Array.isArray(localizedContent.keyBenefits) && localizedContent.keyBenefits.length ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">你会得到什么</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {localizedContent.keyBenefits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {Array.isArray(localizedContent.whoItsFor) && localizedContent.whoItsFor.length ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">适合谁</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {localizedContent.whoItsFor.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {Array.isArray(localizedContent.whyItFeelsDifferent) && localizedContent.whyItFeelsDifferent.length ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">为什么体验不一样</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {localizedContent.whyItFeelsDifferent.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {Array.isArray(localizedContent.appControlHighlights) && localizedContent.appControlHighlights.length ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">App Control 亮点</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {localizedContent.appControlHighlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {Array.isArray(localizedContent.careInstructions) && localizedContent.careInstructions.length ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">使用与清洁</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {localizedContent.careInstructions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {Array.isArray(localizedContent.whatsInBox) && localizedContent.whatsInBox.length ? (
          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">盒内有什么</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {localizedContent.whatsInBox.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const faqDraft = await getPublishedProductFaqDraftBySlug(slug);
  const vm = toProductPageViewModel({ commerce, content: localizedContent, localeKey });
  const relatedProducts = (await listProducts())
    .filter((item) => item.slug !== slug)
    .filter(
      (item) =>
        item.brand === commerce.brand ||
        item.wearable === commerce.wearable ||
        item.stimulationType.some((type) => commerce.stimulationType.includes(type)),
    )
    .slice(0, 3);
  const contentRef = resolved.debug?.contentRef ?? resolved.debug?.draftRef ?? null;
  const attributionSrc = typeof sp.src === "string" ? sp.src : null;
  const attributionExp = typeof sp.exp === "string" ? sp.exp : null;
  const attributionBucket = typeof sp.bucket === "string" ? sp.bucket : null;
  const site = await getActiveSiteConfig();
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: vm.title,
    description: localizedContent?.shortDescription ?? commerce.name,
    url: buildAbsoluteUrl(`/product/${slug}`),
    brand: {
      "@type": "Brand",
      name: site.brand.name,
    },
    offers: {
      "@type": "Offer",
      priceCurrency: vm.price.currency,
      price: String(vm.price.amount / 100),
      availability: vm.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: buildAbsoluteUrl(`/product/${slug}`),
    },
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      {attributionSrc === "ai_concierge" ? (
        <AttributionCapture
          context={{
            src: "ai_concierge",
            experiment: attributionExp ?? undefined,
            bucket: attributionBucket ?? undefined,
            placement: "product",
            sourceProductSlug: slug,
          }}
        />
      ) : null}
      <SignalTracker
        targetType="product"
        targetId={slug}
        contentRef={contentRef}
        metadata={attributionSrc ? { stage: "product_view", src: attributionSrc, exp: attributionExp, bucket: attributionBucket } : { stage: "product_view" }}
      />
      {previewBadge ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {previewBadge}: 当前页面正在渲染未发布内容（仅用于预览）。
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            {vm.title}
          </h1>
          {vm.subtitle ? (
            <p className="mt-2 text-base font-medium text-zinc-700">{vm.subtitle}</p>
          ) : null}
          {localizedContent?.shortDescription ? (
            <p className="mt-3 text-zinc-600">{localizedContent.shortDescription}</p>
          ) : (
            <p className="mt-3 text-zinc-600">{commerce.name} {copy.defaultDescription}</p>
          )}
          {resolved.debug?.draftRef ? (
            <p className="mt-3 text-xs text-zinc-500">
              {copy.draftActive}:{" "}
              <code className="rounded bg-zinc-100 px-1">{resolved.debug.draftRef}</code>
            </p>
          ) : null}
        </div>
        <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
          {copy.backToShop}
        </Link>
      </div>

      <div className="mt-8 rounded-[2rem] border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-zinc-900">{copy.quickCheckTitle}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {vm.title}
              {vm.subtitle ? ` 更偏向 ${vm.subtitle}。` : ` ${copy.quickCheckWithoutSubtitle}`}
              {vm.whoItsFor[0]
                ? ` 如果你属于“${vm.whoItsFor[0]}”这类场景，这款会比继续盲目横向比较更省时间。`
                : ` ${copy.quickCheckFallbackWho}`}
            </p>
          </div>
          <div className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600">
            {copy.quickCheckBadge}
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-medium text-zinc-900">{copy.whatItIs}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {localizedContent?.shortDescription || copy.fallbackWhatItIs(vm.title)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-medium text-zinc-900">{copy.whoItsFor}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {vm.whoItsFor[0]
                ? vm.whoItsFor[0]
                : copy.fallbackWho}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-medium text-zinc-900">{copy.whyChooseIt}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {vm.whyItFeelsDifferent[0]
                ? vm.whyItFeelsDifferent[0]
                : copy.fallbackWhyChoose}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="order-2 space-y-6 lg:order-1">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <div className="flex aspect-[4/3] items-end justify-between rounded-[1.5rem] bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-6">
              <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
                  {localizedContent?.hero?.eyebrow || commerce.brand}
                </p>
                <p className="mt-3 text-2xl font-semibold text-zinc-900">{vm.title}</p>
                <p className="mt-2 text-sm text-zinc-600">{vm.subtitle || commerce.series}</p>
              </div>
              <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
                {commerce.wearable ? copy.heroBadgeWearable : copy.heroBadgePrimary}
              </div>
            </div>
            {localizedContent?.hero?.headline ? (
              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="text-lg font-semibold text-zinc-900">{localizedContent.hero.headline}</p>
                {localizedContent.hero.description ? (
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {localizedContent.hero.description}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-900">{copy.whyWorthBuying}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {(vm.keyBenefits.length
                ? vm.keyBenefits
                : copy.whyWorthBuyingFallback).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">{copy.whoItsFor}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(vm.whoItsFor.length
                  ? vm.whoItsFor
                  : copy.fallbackWhoList).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">{copy.whyDifferent}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(vm.whyItFeelsDifferent.length
                  ? vm.whyItFeelsDifferent
                  : copy.whyDifferentFallback).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">{copy.whatsInBox}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(vm.whatsInBox.length
                  ? vm.whatsInBox
                  : copy.whatsInBoxFallback).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">{copy.specs}</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {vm.specs.length ? (
                  vm.specs.map((s) => (
                    <li key={s.label}>
                      <span className="text-zinc-500">{s.label}:</span> {s.value}
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-600">{copy.specsFallback}</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">{copy.care}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(localizedContent?.careInstructions?.length
                  ? localizedContent.careInstructions
                  : copy.careFallback).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="order-1 space-y-5 lg:order-2 lg:sticky lg:top-28 lg:self-start">
          <AiConciergeEntry placement="product" productSlug={slug} />
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <p className="text-sm text-zinc-500">{copy.priceAndStock}</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">
              {formatMoney(vm.price.amount, vm.price.currency)}
            </p>
            {vm.price.compareAt ? (
              <p className="mt-1 text-sm text-zinc-500 line-through">
                {formatMoney(vm.price.compareAt, vm.price.currency)}
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <div className="flex items-center justify-between">
                <span>{copy.stockStatus}</span>
                <span className="font-medium text-zinc-900">
                  {vm.inStock ? copy.inStock : copy.outOfStock}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{copy.shippingSla}</span>
                <span className="font-medium text-zinc-900">{copy.shippingSlaValue}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{copy.packaging}</span>
                <span className="font-medium text-zinc-900">{copy.packagingValue}</span>
              </div>
            </div>
            <form action={addToCartAction} className="mt-4">
              <input type="hidden" name="productSlug" value={commerce.slug} />
              <input type="hidden" name="variantId" value={commerce.defaultVariantId ?? ""} />
              <input type="hidden" name="quantity" value="1" />
              <TrackedSubmitButton
                targetType="product"
                targetId={slug}
                contentRef={contentRef}
                eventType="add_to_cart"
                metadata={
                  attributionSrc
                    ? { stage: "add_to_cart", src: attributionSrc, exp: attributionExp, bucket: attributionBucket }
                    : { stage: "add_to_cart" }
                }
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                disabled={!commerce.defaultVariantId}
                type="submit"
              >
                {copy.addToCart}
              </TrackedSubmitButton>
            </form>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link className="underline underline-offset-4" href={buildLocalePath("/cart", localeKey)}>
                {copy.goToCart}
              </Link>
              <Link className="underline underline-offset-4" href={buildLocalePath("/checkout", localeKey)}>
                {copy.checkout}
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {vm.badges.map((b) => (
                <span key={b} className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  {b}
                </span>
              ))}
            </div>
            <div className="mt-5 grid gap-2 text-sm text-zinc-600">
              <Link className="underline underline-offset-4" href={buildLocalePath("/shipping", localeKey)}>
                {copy.shipping}
              </Link>
              <Link className="underline underline-offset-4" href={buildLocalePath("/returns", localeKey)}>
                {copy.returns}
              </Link>
              <Link className="underline underline-offset-4" href={buildLocalePath("/contact", localeKey)}>
                {copy.contact}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{copy.whoItsFor}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {(vm.whoItsFor.length
              ? vm.whoItsFor
              : [copy.fallbackWho, "适合重视体验清晰度与决策效率的人"]
            ).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{copy.whyDifferent}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {(vm.whyItFeelsDifferent.length
              ? vm.whyItFeelsDifferent
              : copy.whyDifferentFallback
            ).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{copy.whatsInBox}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {(vm.whatsInBox.length
              ? vm.whatsInBox
              : copy.whatsInBoxFallback
            ).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{copy.specs}</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            {vm.specs.length ? (
              vm.specs.map((s) => (
                <li key={s.label}>
                  <span className="text-zinc-500">{s.label}:</span> {s.value}
                </li>
              ))
            ) : (
              <li className="text-zinc-600">{copy.specsFallback}</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{copy.productFaq}</p>
          <div className="mt-2">
            <Link className="text-xs underline underline-offset-4 text-zinc-600" href={buildLocalePath("/faq", localeKey)}>
              {copy.viewFullFaq}
            </Link>
          </div>
          {faqDraft ? (
            <div className="mt-4 space-y-4">
              {faqDraft.payload.items.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <p className="text-sm font-medium text-zinc-900">
                    {item.question}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 space-y-3 text-sm text-zinc-600">
              <p>{copy.productFaqFallback1}</p>
              <p>{copy.productFaqFallback2}</p>
            </div>
          )}
        </div>
      </div>

      {relatedProducts.length ? (
        <div className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">{copy.continueEyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                {copy.relatedProducts}
              </h2>
            </div>
            <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
              {copy.viewMore}
            </Link>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {relatedProducts.map((product) => (
              <ProductCard key={product.id} product={product} compact />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
