import type { SupportedLocaleKey } from "@/lib/site/locale-routing";
import type { GuideArticle } from "@/types/guide";
import type { ProductContent } from "@/types/product";
import type { ResolvedFaqContent } from "@/lib/content/resolvers/faq";

export function localizeProductContent(
  content: ProductContent | null,
  localeKey: SupportedLocaleKey,
): ProductContent | null {
  if (!content) return null;
  const localized = content.locales?.[localeKey];
  if (!localized) return content;

  return {
    ...content,
    ...localized,
    hero: {
      ...content.hero,
      ...localized.hero,
    },
    seo: {
      ...content.seo,
      ...localized.seo,
    },
  };
}

export function localizeGuideArticle(
  article: GuideArticle | null,
  localeKey: SupportedLocaleKey,
): GuideArticle | null {
  if (!article) return null;
  const localized = article.locales?.[localeKey];
  if (!localized) return article;

  return {
    ...article,
    ...localized,
    seo: {
      ...article.seo,
      ...localized.seo,
    },
  };
}

export function localizeFaqContent(
  content: ResolvedFaqContent,
  localeKey: SupportedLocaleKey,
): ResolvedFaqContent {
  return {
    ...content,
    groups: content.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const localized = item.locales?.[localeKey];
        return {
          ...item,
          question: localized?.question || item.question,
          answer: localized?.answer || item.answer,
        };
      }),
    })),
  };
}
