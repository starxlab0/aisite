export type FaqCategory =
  | "product"
  | "shipping"
  | "returns"
  | "privacy"
  | "app-control"
  | "care";

export type FAQItem = {
  question: string;
  answer: string;
  category: FaqCategory;
};

