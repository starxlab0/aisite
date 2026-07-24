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
                这里集中回答购买前最常被问到的问题，包括隐私包装、清洁、连接稳定性、配送与售后说明。
                当前内容已从 Sanity 聚合读取，并会随着内容更新持续同步。
              </>
            )
          : content.source === "control-plane-draft"
            ? "这里优先展示已经发布的 FAQ 内容，方便在支付前先把隐私、清洁、配送和使用顾虑一次看清。"
            : (
                <>
                  当前 FAQ 还在继续补充中，但已经覆盖购买前最常见的疑问。若这里没有命中你的问题，
                  可以继续查看配送、退换或直接联系支持。
                </>
              )}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">购买前先看</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">是否适合自己、是否安静、是否支持 App，以及第一次购买是否容易上手。</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">支付前再确认</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">配送方式、隐私包装、退换范围和联系客服时需要准备哪些信息。</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">如果还不确定</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">可以先做问答缩小范围，再回到商品页比较 FAQ、参数和价格。</p>
        </div>
      </div>

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
