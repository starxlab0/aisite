import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { getProductBySlug, listProducts } from "@/lib/commerce/products";
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
              {commerce.name} 当前已展示价格、库存状态和基础参数；更完整的使用场景、FAQ
              与导购内容会随着内容配置继续补充。
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

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <div className="flex aspect-[4/3] items-end justify-between rounded-[1.5rem] bg-gradient-to-br from-zinc-50 via-white to-zinc-100 p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">
                  {resolved.content?.hero?.eyebrow || commerce.brand}
                </p>
                <p className="mt-3 text-2xl font-semibold text-zinc-900">{vm.title}</p>
                <p className="mt-2 text-sm text-zinc-600">{vm.subtitle || commerce.series}</p>
              </div>
              <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs text-zinc-700 backdrop-blur">
                {commerce.wearable ? "可穿戴" : "主力单品"}
              </div>
            </div>
            {resolved.content?.hero?.headline ? (
              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="text-lg font-semibold text-zinc-900">{resolved.content.hero.headline}</p>
                {resolved.content.hero.description ? (
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {resolved.content.hero.description}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-900">为什么值得买</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-700">
              {(vm.keyBenefits.length
                ? vm.keyBenefits
                : ["适合快速上手", "强调低调体验", "更容易理解购买决策"]).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">Who It’s For</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(vm.whoItsFor.length
                  ? vm.whoItsFor
                  : ["第一次选购但不想踩坑", "需要更安静或更低调的体验"]).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">Why It Feels Different</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(vm.whyItFeelsDifferent.length
                  ? vm.whyItFeelsDifferent
                  : ["更容易理解卖点", "更适合做首单选择"]).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">What’s In Box</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(vm.whatsInBox.length
                  ? vm.whatsInBox
                  : ["主机", "充电线", "基础使用说明"]).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="text-sm font-medium text-zinc-900">Specs</p>
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
              <p className="text-sm font-medium text-zinc-900">Care</p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {(resolved.content?.careInstructions?.length
                  ? resolved.content.careInstructions
                  : ["使用后及时清洁", "保持干燥并按说明收纳"]).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <AiConciergeEntry placement="product" productSlug={slug} />
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6">
            <p className="text-sm text-zinc-500">Price / Stock</p>
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
                <span>库存状态</span>
                <span className="font-medium text-zinc-900">
                  {vm.inStock ? "可下单" : "暂时缺货"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>发货时效</span>
                <span className="font-medium text-zinc-900">48 小时内</span>
              </div>
              <div className="flex items-center justify-between">
                <span>包装方式</span>
                <span className="font-medium text-zinc-900">低调隐私包装</span>
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
                加入购物车
              </TrackedSubmitButton>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {vm.badges.map((b) => (
                <span key={b} className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  {b}
                </span>
              ))}
            </div>
            <div className="mt-5 grid gap-2 text-sm text-zinc-600">
              <Link className="underline underline-offset-4" href="/shipping">
                配送说明
              </Link>
              <Link className="underline underline-offset-4" href="/returns">
                退换政策
              </Link>
              <Link className="underline underline-offset-4" href="/contact">
                购买前咨询
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Who It’s For</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            {(vm.whoItsFor.length
              ? vm.whoItsFor
              : ["适合第一次购买但希望尽快缩小范围的人", "适合重视体验清晰度与决策效率的人"]
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
              : ["卖点表达更直接，便于快速判断是否适合自己", "商品信息与购买入口集中，减少来回比较成本"]
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
              : ["主机", "充电线", "基础使用说明"]
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
            <p className="mt-2 text-sm text-zinc-600">
              当前还没有补充这款商品的专属 FAQ，你可以先查看通用 FAQ、配送说明或直接联系咨询。
            </p>
          )}
        </div>
      </div>

      {relatedProducts.length ? (
        <div className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">继续逛</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                相关商品
              </h2>
            </div>
            <Link className="text-sm underline underline-offset-4" href="/shop">
              查看更多
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
