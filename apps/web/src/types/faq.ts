import type { LocalizedByLocale } from "@/types/i18n";

export type FaqCategory =
  | "product"
  | "shipping"
  | "returns"
  | "privacy"
  | "app-control"
  | "care";

export type FAQItem = {
  siteKeys?: string[];
  question: string;
  answer: string;
  category: FaqCategory;
  locales?: LocalizedByLocale<{
    question?: string;
    answer?: string;
  }>;
};
