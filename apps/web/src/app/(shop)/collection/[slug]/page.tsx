import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { resolveCollectionContent } from "@/lib/content/resolvers";
import { listProducts } from "@/lib/commerce/products";
import { resolvePreviewToken } from "@/lib/control-plane/ops";
import { getRepoChangeSeoOverride } from "@/lib/seo/repo-change-overrides";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { SignalTracker } from "@/components/signals/signal-tracker";
import { TrackedLink } from "@/components/signals/tracked-link";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await resolveCollectionContent(slug);
  const override = getRepoChangeSeoOverride("collection", slug);
  return {
    title: override?.title || content.heroTitle,
    description: override?.description || content.heroSummary || `Collection ${slug} 页面。`,
    alternates: {
      canonical: override?.canonical || `/collection/${slug}`,
    },
    robots: {
      index: override?.robots?.index ?? true,
      follow: override?.robots?.follow ?? true,
    },
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
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
        heroTitle: payload.hero?.title ?? `Collection: ${slug}`,
        heroSummary: payload.hero?.summary ?? "",
        sections: payload.sections ?? [],
        internalLinks: payload.internalLinks ?? [],
        debug: {
          contentRef: `preview:${previewToken}`,
          draftRef: `preview:${previewToken}`,
        },
      };
      previewBadge = "Preview mode";
    }
  }
  const heroTitle = content.heroTitle;
  const heroSummary = content.heroSummary;
  const draftSections = content.sections;
  const internalLinks = content.internalLinks;
  const contentRef = content.debug?.contentRef ?? content.debug?.draftRef ?? null;
  const allProducts = await listProducts();
  const filteredProducts = allProducts.filter((product) => {
    if (slug === "first-time") return product.beginnerLevel >= 4;
    if (slug === "app-control") return product.appControl;
    if (slug === "wearable") return product.wearable;
    if (slug === "dual-stimulation") return product.stimulationType.includes("dual");
    return product.collections.includes(slug);
  });
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
          {previewBadge}: 当前页面正在渲染未发布内容（仅用于预览）。
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
          {content.debug?.draftRef ? (
            <p className="mt-3 text-xs text-zinc-500">
              Draft active:{" "}
              <code className="rounded bg-zinc-100 px-1">{content.debug.draftRef}</code>
            </p>
          ) : null}
        </div>
        <Link className="text-sm underline underline-offset-4" href="/shop">
          返回商品列表
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
          <p className="text-sm font-medium text-zinc-900">进入这类商品前，先想清三件事</p>
          <p className="mt-2 text-sm text-zinc-600">
            你更在意的是 App Control、可穿戴与否、新手友好度、安静低调，还是更强刺激感。
            方向越清楚，进入商品页后越容易做决定。
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.length ? (
          filteredProducts.map((product) => (
            <TrackedLink
              key={product.id}
              href={`/product/${product.slug}`}
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
            这个合集目前还没有可展示的商品。你可以先回到全部商品页继续浏览，
            或直接做一次选购问答，让系统先帮你缩小方向。
            <div className="mt-3 flex flex-wrap gap-3">
              <Link className="underline underline-offset-4" href="/shop">
                去全部商品
              </Link>
              <Link className="underline underline-offset-4" href="/quiz">
                去做问答
              </Link>
            </div>
          </div>
        )}
      </div>

      {internalLinks.length > 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">继续了解</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {internalLinks.map((href) => (
              <Link
                key={href}
                href={href}
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
