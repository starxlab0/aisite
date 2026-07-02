function productPaths(document) {
  if (!document?.productSlug) return [];
  return [`/product/${document.productSlug}`];
}

function collectionPaths(document) {
  const slug = document?.slug?.current;
  if (!slug) return [];
  return [`/collection/${slug}`];
}

function faqPaths(document) {
  const paths = ["/faq"];
  if (document?.targetType === "product" && document?.targetId) {
    paths.push(`/product/${document.targetId}`);
  }
  if (document?.targetType === "collection" && document?.targetId) {
    paths.push(`/collection/${document.targetId}`);
  }
  return paths;
}

function guidePaths(document) {
  const slug = document?.slug?.current;
  if (!slug) return ["/guides"];
  return ["/guides", `/guides/${slug}`];
}

const SYSTEM_FIELDS = [
  "_id",
  "_type",
  "sourceDraftRef",
  "updatedAt",
];

const P0_ASSET_CONFIG = {
  productContent: {
    required: [
      "productSlug",
      "title",
      "shortDescription",
      "seo.title",
      "seo.description",
    ],
    allowed: [
      ...SYSTEM_FIELDS,
      "productSlug",
      "title",
      "subtitle",
      "shortDescription",
      "hero.eyebrow",
      "hero.headline",
      "hero.description",
      "hero.media",
      "keyBenefits",
      "whoItsFor",
      "whyItFeelsDifferent",
      "appControlHighlights",
      "careInstructions",
      "whatsInBox",
      "sections",
      "relatedProducts",
      "relatedGuides",
      "seo.title",
      "seo.description",
      "seo.keywords",
    ],
    revalidate: productPaths,
  },
  collectionPage: {
    required: [
      "slug.current",
      "title",
      "description",
      "seo.title",
      "seo.description",
    ],
    allowed: [
      ...SYSTEM_FIELDS,
      "slug._type",
      "slug.current",
      "title",
      "subtitle",
      "description",
      "heroImage",
      "introBlocks",
      "featuredProducts",
      "faqIds",
      "guideIds",
      "seo.title",
      "seo.description",
    ],
    revalidate: collectionPaths,
  },
  faqItem: {
    required: [
      "question",
      "answer",
      "category",
      "targetType",
      "targetId",
    ],
    allowed: [
      ...SYSTEM_FIELDS,
      "question",
      "answer",
      "category",
      "targetType",
      "targetId",
    ],
    revalidate: faqPaths,
  },
  guideArticle: {
    required: [
      "slug.current",
      "title",
      "body",
      "seo.title",
      "seo.description",
    ],
    allowed: [
      ...SYSTEM_FIELDS,
      "slug._type",
      "slug.current",
      "title",
      "excerpt",
      "category",
      "heroTitle",
      "heroSummary",
      "body",
      "toc",
      "seo.title",
      "seo.description",
      "seo.keywords",
      "relatedProductSlugs",
      "relatedCollectionSlugs",
      "faqIds",
    ],
    revalidate: guidePaths,
  },
};

function getAssetConfig(documentType) {
  return P0_ASSET_CONFIG[documentType] ?? null;
}

function buildRevalidatePaths(documents = []) {
  const paths = new Set();
  documents.forEach((doc) => {
    const config = getAssetConfig(doc?._type);
    if (!config?.revalidate) return;
    config.revalidate(doc).forEach((path) => {
      if (path) paths.add(path);
    });
  });
  return Array.from(paths);
}

module.exports = {
  P0_ASSET_CONFIG,
  getAssetConfig,
  buildRevalidatePaths,
};
