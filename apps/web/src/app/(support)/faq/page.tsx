import type { Metadata } from "next";
import Link from "next/link";
import { fallbackGuideBySlug, fallbackProductContentBySlug } from "@/lib/content/fallback-localized-content";
import { resolveFaqContent } from "@/lib/content/resolvers";
import { resolvePreviewToken } from "@/lib/control-plane/ops";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { getLocalizedCopy } from "@/lib/site/copy";
import { localizeFaqContent } from "@/lib/site/localize-content";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatFaqGroupTitle(input: { title: string; targetPath: string; localeKey: "en" | "zh" }) {
  const { title, targetPath, localeKey } = input;
  const copy = getLocalizedCopy(localeKey).faq.groupTitles;
  if (title === "FAQ") return copy.global;
  if (!title.startsWith("FAQ:")) return title;

  const rawTarget = title.replace(/^FAQ:\s*/, "").trim();
  const pathTarget = targetPath.split("/").filter(Boolean);
  const slug = pathTarget[pathTarget.length - 1] || rawTarget;
  const productTitle =
    localeKey === "en"
      ? fallbackProductContentBySlug[slug]?.locales?.en?.title || fallbackProductContentBySlug[slug]?.title
      : fallbackProductContentBySlug[slug]?.title;
  const guideTitle =
    localeKey === "en"
      ? fallbackGuideBySlug[slug]?.locales?.en?.title || fallbackGuideBySlug[slug]?.title
      : fallbackGuideBySlug[slug]?.title;
  const humanized = productTitle || guideTitle || rawTarget.replace(/-/g, " ");

  if (targetPath.startsWith("/product/")) return `${copy.productPrefix}: ${humanized}`;
  if (targetPath.startsWith("/guides/")) return `${copy.guidePrefix}: ${humanized}`;
  if (targetPath.startsWith("/collection/")) return `${copy.collectionPrefix}: ${humanized}`;
  return `${copy.global}: ${humanized}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const copy = getLocalizedCopy(localeKey).faq;
  return buildSeoMetadata({
    title: "FAQ",
    description: copy.metadataDescription,
    path: "/faq",
    openGraphType: "website",
    siteKeys: ["cn-store", "us-store", "jp-store"],
  });
}

export default async function FaqPage({ searchParams }: Props) {
  const localeKey = await getRequestLocaleKey();
  const copy = getLocalizedCopy(localeKey).faq;
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
              locales: item.locales,
              category: item.intent,
            })),
          },
        ],
      };
      previewBadge = copy.previewBadge;
    }
  }
  content = localizeFaqContent(content, localeKey);

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
  const featuredFaqs = content.groups.flatMap((group) => group.items).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {previewBadge ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {previewBadge}
        </div>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">FAQ</h1>
      <p className="mt-3 text-zinc-600">
        {content.source === "sanity-faqItem"
          ? copy.introSanity
          : content.source === "control-plane-draft"
            ? copy.introDraft
            : copy.introFallback}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">{copy.cards.beforeBuyTitle}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{copy.cards.beforeBuyCopy}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">{copy.cards.beforePayTitle}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{copy.cards.beforePayCopy}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">{copy.cards.unsureTitle}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{copy.cards.unsureCopy}</p>
        </div>
      </div>

      {featuredFaqs.length ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{copy.quickAnswersTitle}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {copy.quickAnswersDescription}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {featuredFaqs.map((item) => (
              <article key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <h2 className="text-sm font-medium text-zinc-900">{item.question}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {content.groups.length > 0 ? (
        <div className="mt-8 space-y-6">
          {content.groups.map((draft) => (
            <section
              key={`${draft.targetPath}:${draft.contentRef}`}
              className="rounded-2xl border border-zinc-200 bg-white p-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {formatFaqGroupTitle({ title: draft.title, targetPath: draft.targetPath, localeKey })}
                </h2>
                {content.source === "control-plane-draft" ? (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                    {draft.contentRef}
                  </span>
                ) : null}
              </div>
              {content.source === "control-plane-draft" ? (
                <p className="mt-2 text-sm text-zinc-500">
                  {copy.targetLabel}:{" "}
                  <Link className="underline underline-offset-4" href={buildLocalePath(draft.targetPath, localeKey)}>
                    <code className="rounded bg-zinc-100 px-1">{draft.targetPath}</code>
                  </Link>
                </p>
              ) : null}

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
