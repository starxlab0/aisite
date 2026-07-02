export type GuideCategory =
  | "buying-guide"
  | "care"
  | "long-distance"
  | "discreet-play"
  | "education";

export type GuideArticle = {
  slug: string;
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
};
