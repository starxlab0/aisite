export type BundlePage = {
  slug: string;
  title: string;
  subtitle?: string;
  description: string;
  productSlugs: string[];
  reasonToBuy?: string[];
  audienceTag: "first-time" | "couples" | "intense" | "discreet";
  faqIds?: string[];
};

