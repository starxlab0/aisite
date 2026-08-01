import type { LocalizedByLocale } from "@/types/i18n";

export type GuideCategory =
  | "buying-guide"
  | "care"
  | "long-distance"
  | "discreet-play"
  | "education";

export type GuideArticle = {
  slug: string;
  siteKeys?: string[];
  title: string;
  excerpt: string;
  coverImage?: string;
  category: GuideCategory;
  body: unknown[];
  relatedProductSlugs?: string[];
  relatedCollectionSlugs?: string[];
  seo?: {
    title?: string;
    description?: string;
  };
  locales?: LocalizedByLocale<{
    title?: string;
    excerpt?: string;
    body?: unknown[];
    seo?: {
      title?: string;
      description?: string;
    };
  }>;
};
