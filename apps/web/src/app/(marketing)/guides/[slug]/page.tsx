import type { Metadata } from "next";
import Link from "next/link";
import { listProducts } from "@/lib/commerce/products";
import { resolveGuideBySlug } from "@/lib/content/resolvers";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { formatMoney } from "@/lib/utils/money";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveGuideBySlug(slug);
  const article = resolved.article;
  return {
    title: article?.seo?.title || article?.title || slug,
    description: article?.seo?.description || article?.excerpt || `${slug} guide`,
    alternates: {
      canonical: `/guides/${slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function GuideDetailPage({ params }: Props) {
  const { slug } = await params;
  const resolved = await resolveGuideBySlug(slug);
  const article = resolved.article;
  const products = await listProducts();
  const relatedProducts = products.filter((product) => (article?.relatedProductSlugs ?? []).includes(product.slug));
  const guideJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article?.title ?? slug,
    description: article?.excerpt ?? "",
    url: buildAbsoluteUrl(`/guides/${slug}`),
    about: article?.relatedCollectionSlugs ?? [],
  };
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guideJsonLd) }}
      />
      <div className="flex items-start justify-between gap-6">
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
        <Link className="text-sm underline underline-offset-4" href="/guides">
          Back to Guides
        </Link>
      </div>
      <p className="mt-4 text-zinc-600">
        {article?.excerpt ?? "详情页骨架：后续从 Sanity 或 control-plane 已发布 draft 拉取文章正文与关联商品。"}
      </p>
      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">Body</p>
        {Array.isArray(article?.body) && article.body.length > 0 ? (
          <div className="mt-3 space-y-4 text-sm leading-6 text-zinc-700">
            {article.body.map((block, index) => (
              <p key={index}>{typeof block === "string" ? block : JSON.stringify(block)}</p>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">暂无正文内容。</p>
        )}
      </div>
      {(relatedProducts.length || article?.relatedCollectionSlugs?.length) ? (
        <div className="mt-8 space-y-4">
          {relatedProducts.length ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">Shop this guide</p>
                  <p className="mt-1 text-sm text-zinc-600">把这篇 guide 里的建议直接落到真实商品选择上。</p>
                </div>
                <Link className="text-sm underline underline-offset-4" href="/quiz?src=guide">
                  Find your match
                </Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {relatedProducts.map((product) => (
                  <Link
                    key={product.slug}
                    href={`/product/${product.slug}?src=guide&guide=${encodeURIComponent(slug)}`}
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
          {article?.relatedCollectionSlugs?.length ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-sm font-medium text-zinc-900">Continue by collection</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(article.relatedCollectionSlugs ?? []).map((collectionSlug) => (
                  <Link
                    key={collectionSlug}
                    href={`/collection/${collectionSlug}?src=guide&guide=${encodeURIComponent(slug)}`}
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
          <p className="text-sm font-medium text-zinc-900">Next step</p>
          <p className="mt-2 text-sm text-zinc-600">还没有配置关联商品时，先通过问答缩小范围，再进入商品页。</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link className="underline underline-offset-4" href={`/quiz?src=guide&guide=${encodeURIComponent(slug)}`}>
              Find your match
            </Link>
            <Link className="underline underline-offset-4" href="/shop">
              Shop all
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
