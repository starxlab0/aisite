import type { Metadata } from "next";
import { getSiteConfigForLocale } from "@/lib/site/config.server";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { buildSeoAlternates } from "@/lib/seo/alternates";
import { buildAbsoluteUrl } from "@/lib/seo/url";

export type SeoRobotsConfig = {
  index?: boolean;
  follow?: boolean;
};

export type SeoMetadataOverride = {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: SeoRobotsConfig;
};

type BuildSeoMetadataInput = {
  title: string;
  description: string;
  path: string;
  override?: SeoMetadataOverride | null;
  openGraphType?: "website" | "article";
  image?: string | null;
  siteKeys?: string[];
  featurePath?: string | null;
};

function toAbsoluteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return buildAbsoluteUrl(value);
}

export async function buildSeoMetadata(input: BuildSeoMetadataInput): Promise<Metadata> {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  const title = input.override?.title || input.title;
  const description = input.override?.description || input.description;
  const canonical = toAbsoluteUrl(input.override?.canonical || buildLocalePath(input.path, localeKey));
  const robots = {
    index: input.override?.robots?.index ?? true,
    follow: input.override?.robots?.follow ?? true,
  };
  const image = input.image ? toAbsoluteUrl(input.image) : null;

  return {
    title,
    description,
    alternates: await buildSeoAlternates({
      path: input.path,
      canonicalPath: input.override?.canonical || buildLocalePath(input.path, localeKey),
      siteKeys: input.siteKeys,
      featurePath: input.featurePath,
    }),
    robots,
    openGraph: {
      type: input.openGraphType || "website",
      title,
      description,
      url: canonical,
      siteName: site.brand.name,
      locale: site.locale.lang,
      ...(image
        ? {
            images: [{ url: image, alt: title }],
          }
        : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image
        ? {
            images: [image],
          }
        : {}),
    },
  };
}
