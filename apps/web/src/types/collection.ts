export type CollectionPage = {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  heroImage?: string;
  introBlocks?: string[];
  featuredProducts?: string[];
  faqIds?: string[];
  guideIds?: string[];
  seo?: {
    title?: string;
    description?: string;
  };
};

export type CollectionFilterPreset = {
  appControl?: boolean;
  wearable?: boolean;
  stimulationType?: string[];
  beginnerLevelMax?: number;
  discreetLevelMin?: number;
  intensityLevelMin?: number;
};

export type CollectionPageViewModel = {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  heroImage?: string;
  introBlocks?: string[];
};

