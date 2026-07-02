import type { Metadata } from "next";
import Link from "next/link";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { resolveGuideList } from "@/lib/content/resolvers";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Guides",
    description: "购买指南、场景建议与关联商品入口。",
    alternates: {
      canonical: "/guides",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function GuidesPage() {
  const guides = await resolveGuideList();
  const guidesJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Guides",
    url: buildAbsoluteUrl("/guides"),
    hasPart: guides.items.map((guide) => ({
      "@type": "Article",
      headline: guide.title,
      url: buildAbsoluteUrl(`/guides/${guide.slug}`),
    })),
  };
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guidesJsonLd) }}
      />
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Guides
      </h1>
      <p className="mt-4 text-zinc-600">
        内容中心：优先展示已发布的 <code className="rounded bg-zinc-100 px-1">guideArticle</code>，支持从
        control-plane draft 或 Sanity 渲染。
      </p>
      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">文章列表</p>
        <p className="mt-1 text-xs text-zinc-500">source: {guides.source}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
          {guides.items.map((guide) => (
            <li key={guide.slug}>
              <Link className="underline underline-offset-4" href={`/guides/${guide.slug}`}>
                {guide.title}
              </Link>
              {guide.excerpt ? <p className="mt-1 text-zinc-600">{guide.excerpt}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
