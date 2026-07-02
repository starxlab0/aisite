import type { Metadata } from "next";
import Link from "next/link";
import { resolveFaqContent } from "@/lib/content/resolvers";
import { resolvePreviewToken } from "@/lib/control-plane/ops";
import { buildAbsoluteUrl } from "@/lib/seo/url";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "FAQ",
    description: "常见问题、隐私、清洁、连接与购买前说明。",
    alternates: {
      canonical: "/faq",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function FaqPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const previewToken = typeof sp.preview === "string" ? sp.preview : null;

  let previewBadge: string | null = null;
  let content = await resolveFaqContent();

  if (previewToken) {
    const preview = await resolvePreviewToken(previewToken);
    if (preview?.draft?.schemaType === "faqDraft") {
      const payload = preview.draft.payload;
      content = {
        source: "control-plane-draft" as const,
        groups: [
          {
            source: "control-plane-draft" as const,
            title: payload.title ?? "FAQ Draft",
            contentRef: `preview:${previewToken}`,
            targetPath: "/faq",
            items: (payload.items ?? []).map((item: any) => ({
              id: item.id,
              question: item.question,
              answer: item.answer,
              category: item.intent,
            })),
          },
        ],
      };
      previewBadge = "Preview mode";
    }
  }

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.groups.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    ),
    url: buildAbsoluteUrl("/faq"),
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {previewBadge ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {previewBadge}: 当前页面正在渲染未发布内容（仅用于预览）。
        </div>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">FAQ</h1>
      <p className="mt-3 text-zinc-600">
        {content.source === "sanity-faqItem"
          ? (
              <>
                当前页面已从 Sanity 的 <code className="rounded bg-zinc-100 px-1">faqItem</code>{" "}
                聚合读取内容。
              </>
            )
          : content.source === "control-plane-draft"
            ? "当前页面已接入 control-plane draft，会优先展示已发布的 FAQ 内容。"
          : (
              <>
                支持页骨架：后续由 Sanity 的 <code className="rounded bg-zinc-100 px-1">faqItem</code> 驱动。
              </>
            )}
      </p>

      {content.groups.length > 0 ? (
        <div className="mt-8 space-y-6">
          {content.groups.map((draft) => (
            <section
              key={`${draft.targetPath}:${draft.contentRef}`}
              className="rounded-2xl border border-zinc-200 bg-white p-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {draft.title}
                </h2>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                  {draft.contentRef}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                Target:{" "}
                <Link className="underline underline-offset-4" href={draft.targetPath}>
                  <code className="rounded bg-zinc-100 px-1">{draft.targetPath}</code>
                </Link>
              </p>

              <div className="mt-5 space-y-4">
                {draft.items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <h3 className="text-sm font-medium text-zinc-900">{item.question}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">{item.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
