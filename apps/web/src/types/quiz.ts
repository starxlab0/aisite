export type QuizAnswerValue = string | number | boolean;

export type QuizQuestion = {
  id: string;
  title: string;
  description?: string;
  options: Array<{
    label: string;
    value: QuizAnswerValue;
  }>;
};

export type QuizResult = {
  recommendedCollectionSlug?: string;
  recommendedProductSlugs?: string[];
};

