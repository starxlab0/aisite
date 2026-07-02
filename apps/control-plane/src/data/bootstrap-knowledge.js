const siteProfile = {
  siteId: "brand-cn",
  industry: "intimacy-tech",
  audience: ["solo-play", "couples", "first-time-buyers"],
  tone: ["clear", "private", "reassuring"],
  geoMarkets: ["cn", "us"],
  seoFocus: ["buying-guide", "category-education", "app-control"],
  growthLoops: ["seo-to-product", "guide-to-collection", "faq-to-conversion"],
  contentPriorities: ["product-faq", "collection-guides", "comparison-pages"],
  prohibitedClaims: ["medical-cure", "guaranteed-orgasm", "unsafe-health-claims"],
};

const assets = [
  {
    id: "rule-product-faq-depth",
    type: "rule",
    title: "商品页 FAQ 深度规则",
    tags: ["product-page", "faq", "conversion"],
    status: "active",
  },
  {
    id: "template-collection-guide",
    type: "template",
    title: "Collection 指导页模板",
    tags: ["collection", "guide", "seo"],
    status: "active",
  },
  {
    id: "case-faq-expansion",
    type: "case",
    title: "商品页 FAQ 扩写案例",
    tags: ["faq", "product-page", "case-study"],
    status: "active",
  },
  {
    id: "experiment-collection-hero-angle",
    type: "experiment",
    title: "Collection Hero 角度实验",
    tags: ["collection", "hero", "experiment"],
    status: "active",
  },
];

module.exports = {
  siteProfile,
  assets,
};

