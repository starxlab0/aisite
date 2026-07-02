export type StimulationType =
  | "clitoral"
  | "licking"
  | "suction"
  | "insertable"
  | "dual"
  | "thrusting";

export type WaterproofRating = "none" | "IPX6" | "IPX7";

export type CommerceProduct = {
  id: string;
  defaultVariantId?: string;
  slug: string;
  name: string;
  status: "draft" | "published";

  brand: string;
  series?: string;

  thumbnail?: string;
  images: string[];

  price: number;
  compareAtPrice?: number;
  currency: string;

  inventoryQuantity?: number;
  allowBackorder?: boolean;

  material?: string;
  waterproof?: WaterproofRating;
  runtimeMinutes?: number;
  chargeMinutes?: number;
  weightGrams?: number;
  sizeText?: string;

  stimulationType: StimulationType[];

  appControl: boolean;
  remoteControl: boolean;
  wearable: boolean;
  heating: boolean;
  coupleFriendly: boolean;

  beginnerLevel: 1 | 2 | 3 | 4 | 5;
  intensityLevel: 1 | 2 | 3 | 4 | 5;
  noiseLevel: 1 | 2 | 3 | 4 | 5;
  discreetLevel: 1 | 2 | 3 | 4 | 5;

  tags: string[];
  collections: string[];
};

export type ProductContent = {
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
  appControlHighlights?: string[];
  careInstructions?: string[];
  whatsInBox?: string[];

  relatedProducts?: string[];
  relatedGuides?: string[];

  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
};

export type ProductPageViewModel = {
  slug: string;
  title: string;
  subtitle?: string;

  price: {
    amount: number;
    compareAt?: number;
    currency: string;
  };

  media: string[];
  inStock: boolean;

  badges: string[];
  keyBenefits: string[];
  whoItsFor: string[];
  whyItFeelsDifferent: string[];
  specs: Array<{ label: string; value: string }>;
  whatsInBox: string[];
  faqs: Array<{ question: string; answer: string }>;

  relatedProducts: Array<{
    slug: string;
    title: string;
    thumbnail?: string;
    price: number;
  }>;
};
