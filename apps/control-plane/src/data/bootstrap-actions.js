const actionRun = {
  id: "run-seo-001",
  input: {
    siteId: "brand-cn",
    objective: "扩写 first-time collection 的 FAQ 与 buying guide 内链",
    source: "manual",
    priority: "high",
    target: {
      type: "collection",
      id: "first-time",
      slug: "first-time",
      path: "/collection/first-time",
      locale: "en",
    },
    operation: "expand",
    model: "gpt-5-class",
    knowledgeAssetIds: ["rule-product-faq-depth", "template-collection-guide"],
    triggerSignals: ["manual-strategy-request"],
    constraints: ["保持品牌语气克制", "避免医疗承诺表达"],
  },
  status: "planning",
  transitionHistory: [
    {
      from: null,
      to: "queued",
      at: "2026-06-28T00:00:00.000Z",
      note: "Action run created",
    },
    {
      from: "queued",
      to: "planning",
      at: "2026-06-28T00:00:00.000Z",
      note: "Planner accepted initial objective",
    },
  ],
  createdAt: "2026-06-28T00:00:00.000Z",
  updatedAt: "2026-06-28T00:00:00.000Z",
};

module.exports = {
  actionRuns: [actionRun],
};

