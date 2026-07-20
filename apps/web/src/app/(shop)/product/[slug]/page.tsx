import type { Metadata } from "next";
import Link from "next/link";
import { getProductBySlug } from "@/lib/commerce/products";
import { toProductPageViewModel } from "@/lib/cms/mapping";
import { resolveProductContent } from "@/lib/content/resolvers";
import { getPublishedProductFaqDraftBySlug } from "@/lib/control-plane/drafts";
import { resolvePreviewToken } from "@/lib/control-plane/ops";
import { getRepoChangeSeoOverride } from "@/lib/seo/repo-change-overrides";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { getActiveSiteConfig } from "@/lib/site/config";
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
  const { slug } = await params;
  const commerce = await getProductBySlug(slug);
  const resolved = await resolveProductContent(slug);
  const canonicalPath = `/product/${slug}`;
  const override = getRepoChangeSeoOverride("product", slug);

  const title = override?.title || resolved.content?.seo?.title || resolved.content?.title || commerce?.name || slug;
  const description =
    override?.description ||
    resolved.content?.seo?.description ||
    resolved.content?.shortDescription ||
    `${title} · 商品详情、适合人群与 FAQ。`;

  return {
    title,
    description,
    alternates: {
      canonical: override?.canonical || canonicalPath,
    },
    robots: {
      index: override?.robots?.index ?? true,
      follow: override?.robots?.follow ?? true,
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const previewToken = typeof sp.preview === "string" ? sp.preview : null;
  const commerce = await getProductBySlug(slug);
  if (!commerce) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Product not found
        </h1>
        <p className="mt-3 text-zinc-600">No product for slug: {slug}</p>
      </div>
    );
  }
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
      };
      resolved = {
        source: "control-plane-draft",
        content,
        debug: {
          contentRef: `preview:${previewToken}`,
          draftRef: `preview:${previewToken}`,
        },
      };
      previewBadge = "Preview mode";
    }
  }
  const faqDraft = await getPublishedProductFaqDraftBySlug(slug);
  const vm = toProductPageViewModel({ commerce, content: resolved.content });
  const contentRef = resolved.debug?.contentRef ?? resolved.debug?.draftRef ?? null;
  const attributionSrc = typeof sp.src === "string" ? sp.src : null;
  const attributionExp = typeof sp.exp === "string" ? sp.exp : null;
  const attributionBucket = typeof sp.bucket === "string" ? sp.bucket : null;
  const site = getActiveSiteConfig();
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: vm.title,
    description: resolved.content?.shortDescription ?? commerce.name,
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
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            {vm.title}
          </h1>
          {vm.subtitle ? (
            <p className="mt-2 text-base font-medium text-zinc-700">{vm.subtitle}</p>
          ) : null}
          {resolved.content?.shortDescription ? (
            <p className="mt-3 text-zinc-600">{resolved.content.shortDescription}</p>
          ) : (
            <p className="mt-3 text-zinc-600">
              商品页骨架：后续聚合 Sanity 的{" "}
              <code className="rounded bg-zinc-100 px-1">productContent</code> 与 Medusa
              的价格/库存/参数。
            </p>
          )}
          {resolved.debug?.draftRef ? (
            <p className="mt-3 text-xs text-zinc-500">
              Draft active:{" "}
              <code className="rounded bg-zinc-100 px-1">{resolved.debug.draftRef}</code>
            </p>
          ) : null}
        </div>
        <Link className="text-sm underline underline-offset-4" href="/shop">
          Back to Shop
        </Link>
      </div>

      {resolved.content?.hero?.headline ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
          {resolved.content.hero.eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {resolved.content.hero.eyebrow}
            </p>
          ) : null}
          <p className="mt-2 text-lg font-semibold text-zinc-900">
            {resolved.content.hero.headline}
          </p>
          {resolved.content.hero.description ? (
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {resolved.content.hero.description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Media</p>
          <div className="mt-4 h-64 rounded-xl bg-zinc-100" />
        </div>

        <div className="space-y-5">
          <AiConciergeEntry placement="product" productSlug={slug} />
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm text-zinc-500">Price / Stock (Medusa)</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">
              {formatMoney(vm.price.amount, vm.price.currency)}
            </p>
            {vm.price.compareAt ? (
              <p className="mt-1 text-sm text-zinc-500 line-through">
                {formatMoney(vm.price.compareAt, vm.price.currency)}
              </p>
            ) : null}
            <form action={addToCartAction} className="mt-4">
              <input type="hidden" name="productSlug" value={commerce.slug} />
              <input
                type="hidden"
                name="variantId"
                value={commerce.defaultVariantId ?? ""}
              />
              <input type="hidden" name="quantity" value="1" />
              <TrackedSubmitButton
                targetType="product"
                targetId={slug}
                contentRef={contentRef}
                eventType="add_to_cart"
                metadata={attributionSrc ? { stage: "add_to_cart", src: attributionSrc, exp: attributionExp, bucket: attributionBucket } : { stage: "add_to_cart" }}
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                disabled={!commerce.defaultVariantId}
                type="submit"
              >
                Add to cart
              </TrackedSubmitButton>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {vm.badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-900">Key Benefits</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {(vm.keyBenefits.length ? vm.keyBenefits : ["占位：卖点 1", "占位：卖点 2"]).map(
                (x) => (
                  <li key={x}>{x}</li>
                ),
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-900">Care</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {(resolved.content?.careInstructions?.length
                ? resolved.content.careInstructions
                : ["占位：清洁与保养说明（后续由 Sanity / draft 驱动）"]
              ).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Who It’s For</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {(vm.whoItsFor.length
              ? vm.whoItsFor
              : ["占位：适合人群（后续由 Sanity / draft 驱动）"]
            ).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Why It Feels Different</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {(vm.whyItFeelsDifferent.length
              ? vm.whyItFeelsDifferent
              : ["占位：差异化表达（后续由 Sanity / draft 驱动）"]
            ).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">What’s In Box</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {(vm.whatsInBox.length
              ? vm.whatsInBox
              : ["占位：包装内物品（后续由 Sanity / draft 驱动）"]
            ).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Specs (Medusa)</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            {vm.specs.length ? (
              vm.specs.map((s) => (
                <li key={s.label}>
                  <span className="text-zinc-500">{s.label}:</span> {s.value}
                </li>
              ))
            ) : (
              <li className="text-zinc-600">材质 / 防水 / 续航 / 充电 / 尺寸</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">FAQ (Sanity)</p>
          <div className="mt-2">
            <Link className="text-xs underline underline-offset-4 text-zinc-600" href="/faq">
              View full FAQ
            </Link>
          </div>
          {faqDraft ? (
            <div className="mt-4 space-y-4">
              <p className="text-xs text-zinc-500">
                Draft:{" "}
                <code className="rounded bg-zinc-100 px-1">{faqDraft.contentRef}</code>
              </p>
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
            <p className="mt-2 text-sm text-zinc-600">占位：后续由 Sanity / draft 配置。</p>
          )}
        </div>
      </div>
    </div>
  );
}
