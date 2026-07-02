export type ControlPlaneDraftRecord<TPayload = unknown> = {
  id: string;
  schemaType: string;
  entityType: string;
  targetType: string;
  targetId: string;
  targetPath: string;
  contentRef: string;
  status: string;
  payload: TPayload;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CollectionPageDraftPayload = {
  hero: {
    title: string;
    summary: string;
  };
  sections: Array<{
    key: string;
    title: string;
    content: string;
  }>;
  internalLinks: string[];
  authoringNotes?: string[];
};

export type FaqDraftPayload = {
  title: string;
  items: Array<{
    id: string;
    question: string;
    answer: string;
    intent?: string;
    sourceAssetIds?: string[];
    needsHumanReview?: boolean;
  }>;
  authoringNotes?: string[];
};

export type ProductContentDraftPayload = {
  productSlug: string;
  title: string;
  subtitle?: string;
  shortDescription?: string;
  hero?: {
    eyebrow?: string;
    headline?: string;
    description?: string;
    media?: string[];
  };
  keyBenefits?: string[];
  whoItsFor?: string[];
  whyItFeelsDifferent?: string[];
  careInstructions?: string[];
  whatsInBox?: string[];
};

export type GuideArticleDraftPayload = {
  slug: string;
  title: string;
  excerpt: string;
  heroTitle?: string;
  heroSummary?: string;
  body: string[];
  toc?: string[];
  relatedProductSlugs?: string[];
  relatedCollectionSlugs?: string[];
  faqIds?: string[];
  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
};
