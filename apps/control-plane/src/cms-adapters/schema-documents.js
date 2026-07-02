function buildProductContentDocument(record) {
  if (record.schemaType !== "productContentDraft" || !record.payload) {
    return null;
  }

  const productSlug = record.payload.productSlug || record.targetId;

  return {
    _id: `productContent.${productSlug}`,
    _type: "productContent",
    productSlug,
    title: record.payload.title,
    subtitle: record.payload.subtitle,
    shortDescription: record.payload.shortDescription,
    hero: {
      eyebrow: record.payload.hero?.eyebrow,
      headline: record.payload.hero?.headline,
      description: record.payload.hero?.description,
      media: record.payload.hero?.media ?? [],
    },
    keyBenefits: record.payload.keyBenefits ?? [],
    whoItsFor: record.payload.whoItsFor ?? [],
    whyItFeelsDifferent: record.payload.whyItFeelsDifferent ?? [],
    appControlHighlights: record.payload.appControlHighlights ?? [],
    careInstructions: record.payload.careInstructions ?? [],
    whatsInBox: record.payload.whatsInBox ?? [],
    sections: record.payload.sections ?? [],
    relatedProducts: record.payload.relatedProducts ?? [],
    relatedGuides: record.payload.relatedGuides ?? [],
    seo: record.payload.seo ?? {
      title: record.payload.title,
      description: record.payload.shortDescription,
      keywords: [productSlug, "product-content"],
    },
    sourceDraftRef: record.contentRef,
    updatedAt: record.updatedAt,
  };
}

function buildCollectionPageDocument(record) {
  if (record.schemaType !== "collectionPageDraft" || !record.payload?.hero) {
    return null;
  }

  const slug = record.targetId;
  const sections = record.payload.sections ?? [];
  const introBlocks = sections.map((section) => section.content).filter(Boolean);
  const guideIds = (record.payload.internalLinks ?? [])
    .filter((href) => href.startsWith("/guides"))
    .map((href) => href.replace("/guides/", "").replace("/guides", "guides"));
  const faqIds = (record.payload.internalLinks ?? [])
    .filter((href) => href.startsWith("/faq"))
    .map(() => "faq");

  return {
    _id: `collectionPage.${slug}`,
    _type: "collectionPage",
    slug: {
      _type: "slug",
      current: slug,
    },
    title: record.payload.hero.title,
    subtitle: sections[0]?.title,
    description: record.payload.hero.summary,
    heroImage: undefined,
    introBlocks,
    featuredProducts: [],
    faqIds,
    guideIds,
    seo: record.payload.seo ?? {
      title: record.payload.hero.title,
      description: record.payload.hero.summary,
    },
    sourceDraftRef: record.contentRef,
    updatedAt: record.updatedAt,
  };
}

function buildGuideArticleDocument(record) {
  if (record.schemaType !== "guideArticleDraft" || !record.payload?.slug || !record.payload?.title) {
    return null;
  }

  const slug = record.payload.slug;

  return {
    _id: `guideArticle.${slug}`,
    _type: "guideArticle",
    slug: {
      _type: "slug",
      current: slug,
    },
    title: record.payload.title,
    excerpt: record.payload.excerpt,
    category: record.payload.category ?? "buying-guide",
    heroTitle: record.payload.heroTitle ?? record.payload.title,
    heroSummary: record.payload.heroSummary ?? record.payload.excerpt,
    body: record.payload.body ?? [],
    toc: record.payload.toc ?? [],
    relatedProductSlugs: record.payload.relatedProductSlugs ?? [],
    relatedCollectionSlugs: record.payload.relatedCollectionSlugs ?? [],
    faqIds: record.payload.faqIds ?? [],
    seo: record.payload.seo ?? {
      title: record.payload.title,
      description: record.payload.excerpt,
      keywords: [slug, "guide-article"],
    },
    sourceDraftRef: record.contentRef,
    updatedAt: record.updatedAt,
  };
}

function mapFaqCategory(item, record) {
  const intent = item.intent ?? "";

  if (intent === "care") return "care";
  if (intent === "privacy") return "privacy";
  if (intent === "app-control") return "app-control";
  if (record.targetType === "product") return "product";
  return "product";
}

function buildFaqItemDocuments(record) {
  if (record.schemaType !== "faqDraft" || !Array.isArray(record.payload?.items)) {
    return [];
  }

  return record.payload.items.map((item, index) => ({
    _id: `faqItem.${record.targetType}.${record.targetId}.${index + 1}`,
    _type: "faqItem",
    question: item.question,
    answer: item.answer,
    category: mapFaqCategory(item, record),
    sourceDraftRef: record.contentRef,
    targetType: record.targetType,
    targetId: record.targetId,
    updatedAt: record.updatedAt,
  }));
}

function buildMirroredDocuments(record) {
  const productContent = buildProductContentDocument(record);
  const collectionPage = buildCollectionPageDocument(record);
  const guideArticle = buildGuideArticleDocument(record);
  const faqItems = buildFaqItemDocuments(record);

  return [productContent, collectionPage, guideArticle, ...faqItems]
    .filter(Boolean)
    .map((document) => ({
      id: document._id,
      type: document._type,
      targetId:
        document._type === "productContent"
          ? document.productSlug
          : document._type === "collectionPage"
            ? document.slug?.current
            : document._type === "guideArticle"
              ? document.slug?.current
            : document.targetId,
      document,
    }));
}

module.exports = {
  buildMirroredDocuments,
};
