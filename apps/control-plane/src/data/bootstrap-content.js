const faqTargets = {
  "product:kokocang-x": {
    targetType: "product",
    targetId: "kokocang-x",
    title: "口口舱X",
    targetPath: "/product/kokocang-x",
    existingFaqs: [
      "这款产品适合第一次购买的人吗？",
      "清洁时需要注意什么？",
      "连接 App 的步骤复杂吗？",
      "声音会不会很明显？",
    ],
    publishedVersionRef: "faq-product-kokocang-x-v1",
    versionHistory: [
      {
        ref: "faq-product-kokocang-x-v1",
        publishedAt: "2026-06-20T00:00:00.000Z",
        summary: "初始 FAQ 版本，覆盖新手、清洁、连接与噪音。",
      },
    ],
  },
  "collection:first-time": {
    targetType: "collection",
    targetId: "first-time",
    title: "First-time Collection",
    targetPath: "/collection/first-time",
    existingFaqs: [
      "第一次买应该怎么选刺激方式？",
      "如果更在意隐私和安静，应该看哪些产品？",
      "情侣远程使用需要重点看什么功能？",
    ],
    publishedVersionRef: "faq-collection-first-time-v1",
    versionHistory: [
      {
        ref: "faq-collection-first-time-v1",
        publishedAt: "2026-06-18T00:00:00.000Z",
        summary: "初始 FAQ 版本，覆盖入门选购、隐私与远程功能。",
      },
    ],
  },
};

const collectionTargets = {
  "collection:first-time": {
    targetType: "collection",
    targetId: "first-time",
    title: "First-time Collection",
    targetPath: "/collection/first-time",
    currentHeroTitle: "First-time Collection",
    currentHeroSummary:
      "A starter selection for first-time buyers exploring app control, privacy, and ease of use.",
    currentModules: [
      "hero",
      "product-grid",
      "basic-faq",
    ],
    existingAngles: [
      "starter-selection",
      "feature-first",
    ],
    publishedVersionRef: "collection-first-time-v1",
    versionHistory: [
      {
        ref: "collection-first-time-v1",
        publishedAt: "2026-06-16T00:00:00.000Z",
        summary: "初始版本，突出新手入门和基础商品网格。",
      },
    ],
  },
};

const productTargets = {
  "product:kokocang-x": {
    targetType: "product",
    targetId: "kokocang-x",
    title: "口口舱X",
    targetPath: "/product/kokocang-x",
    currentTitle: "口口舱X",
    currentSubtitle: "入门友好、隐私克制、可 App 控制",
    currentShortDescription:
      "适合第一次购买者的外部刺激产品，强调易上手、隐私友好和连接稳定的基础体验。",
    currentKeyBenefits: [
      "入门门槛低，适合第一次购买",
      "更偏私密场景的外观与收纳",
      "App 控制用于更细颗粒度的节奏和模式",
    ],
    publishedVersionRef: "product-kokocang-x-v1",
    versionHistory: [
      {
        ref: "product-kokocang-x-v1",
        publishedAt: "2026-06-15T00:00:00.000Z",
        summary: "初始商品文案版本，包含标题、副标题和基础卖点。",
      },
    ],
  },
};

const guideTargets = {
  "guide:how-to-choose": {
    targetType: "guide",
    targetId: "how-to-choose",
    title: "第一次买怎么选",
    targetPath: "/guides/how-to-choose",
    currentTitle: "第一次买怎么选",
    currentExcerpt: "从场景、隐私、连接与清洁四个维度，帮助第一次购买者缩小范围。",
    publishedVersionRef: "guide-how-to-choose-v1",
    versionHistory: [
      {
        ref: "guide-how-to-choose-v1",
        publishedAt: "2026-06-14T00:00:00.000Z",
        summary: "初始 buying guide 版本，覆盖场景、隐私、连接与清洁。",
      },
    ],
  },
};

module.exports = {
  collectionTargets,
  faqTargets,
  guideTargets,
  productTargets,
};
