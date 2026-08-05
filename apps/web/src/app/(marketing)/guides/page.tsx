import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { resolveGuideList } from "@/lib/content/resolvers";
import { getLocalizedCopy } from "@/lib/site/copy";
import { getSiteConfigForLocale } from "@/lib/site/config.server";
import { localizeGuideArticle } from "@/lib/site/localize-content";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

export async function generateMetadata(): Promise<Metadata> {
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
  return buildSeoMetadata({
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    path: "/guides",
    openGraphType: "website",
    featurePath: "/guides",
  });
}

export default async function GuidesPage() {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  if (!site.site.features.guides) notFound();
  const copy = getLocalizedCopy(localeKey).guides;
  const guides = await resolveGuideList();
  const localizedItems = guides.items
    .map((guide) => localizeGuideArticle(guide, localeKey))
    .filter((guide): guide is NonNullable<typeof guide> => Boolean(guide));
  const guidesJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Guides",
    url: buildAbsoluteUrl("/guides"),
    hasPart: localizedItems.map((guide) => ({
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
        {copy.title}
      </h1>
      <p className="mt-4 text-zinc-600">
        {copy.intro}
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">{copy.startTitle}</p>
        <p className="mt-2 text-sm text-zinc-600">{copy.startDescription}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          {site.site.features.quiz ? (
            <Link className="underline underline-offset-4" href={buildLocalePath("/quiz?src=guides", localeKey)}>
              {copy.primaryCta}
            </Link>
          ) : null}
          <Link className="underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
            {copy.secondaryCta}
          </Link>
        </div>
      </div>
      <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">{copy.listTitle}</p>
        <p className="mt-1 text-xs text-zinc-500">{copy.sourceLabel}: {guides.source}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
          {localizedItems.map((guide) => (
            <li key={guide.slug}>
              <Link className="underline underline-offset-4" href={buildLocalePath(`/guides/${guide.slug}`, localeKey)}>
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
