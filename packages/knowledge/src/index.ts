import type {
  KnowledgeAsset,
  KnowledgeCase,
  KnowledgeExperimentResult,
  KnowledgePlaybook,
  KnowledgeRule,
  KnowledgeTemplate,
  SiteProfile,
} from "./types";

export const demoSiteProfile: SiteProfile = {
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

const knowledgeTimestamp = new Date("2026-06-28T00:00:00.000Z").toISOString();

export const productFaqDepthRule: KnowledgeRule = {
  id: "rule-product-faq-depth",
  type: "rule",
  scope: "industry",
  title: "商品页 FAQ 深度规则",
  summary: "高敏感品类商品页应优先覆盖隐私、清洁、噪音、适合人群与 App 连接问题。",
  tags: ["product-page", "faq", "conversion"],
  status: "active",
  priority: "high",
  version: 1,
  updatedAt: knowledgeTimestamp,
  sourceRefs: [
    {
      type: "manual",
      label: "创始团队对成人玩具品类前购前疑虑的归纳",
    },
  ],
  appliesTo: ["product"],
  triggerSignals: [
    "product-page-low-add-to-cart-rate",
    "high-bounce-on-product-page",
    "support-questions-clustered",
  ],
  conditions: [
    { field: "industry", operator: "eq", value: "intimacy-tech" },
    { field: "faqCount", operator: "lte", value: 4 },
  ],
  recommendedActions: [
    "扩写 FAQ 到 8-12 个问题",
    "优先补充清洁、隐私、适合人群、噪音和 App 连接问题",
    "在 FAQ 与购买说明之间增加内链",
  ],
  guardrails: [
    { kind: "medical", description: "避免任何医疗疗效或健康承诺表达" },
    { kind: "privacy", description: "不得暗示用户使用场景会被第三方感知或记录" },
  ],
  expectedMetrics: ["add_to_cart_rate", "time_on_page", "conversion_rate"],
};

export const collectionGuideTemplate: KnowledgeTemplate = {
  id: "template-collection-guide",
  type: "template",
  scope: "industry",
  title: "Collection 指导页模板",
  summary: "用于承接高意图查询，把教育内容、筛选逻辑和商品集合串起来。",
  tags: ["collection", "guide", "seo"],
  status: "active",
  priority: "high",
  version: 1,
  updatedAt: knowledgeTimestamp,
  target: "collection",
  intent: "education-to-conversion",
  sections: [
    {
      id: "intro",
      name: "简短结论",
      required: true,
      purpose: "让用户在 10 秒内知道这类产品适不适合自己",
    },
    {
      id: "picker",
      name: "选择维度",
      required: true,
      purpose: "给出新手、情侣、隐私、刺激方式等选择标准",
    },
    {
      id: "products",
      name: "商品卡组",
      required: true,
      purpose: "把解释与商品集合直接连接",
    },
    {
      id: "faq",
      name: "常见问题",
      required: true,
      purpose: "降低下单疑虑并补足长尾搜索覆盖",
    },
  ],
  promptFrame:
    "围绕用户意图先给判断，再解释差异，最后把用户导向具体商品集合与 FAQ。",
  outputFormat: "module-config",
};

export const faqExpansionCase: KnowledgeCase = {
  id: "case-faq-expansion",
  type: "case",
  scope: "site",
  title: "商品页 FAQ 扩写案例",
  summary: "通过增加 FAQ 深度与内链，让商品页从单纯交易页变成可承接长尾问题的页面。",
  tags: ["faq", "product-page", "case-study"],
  status: "active",
  priority: "medium",
  version: 1,
  updatedAt: knowledgeTimestamp,
  context: "目标页面为高客单、决策门槛较高的商品页，且客服问答集中在清洁和适合人群。",
  action: "扩写 FAQ，增加使用说明和 guide 内链，并将问题顺序按决策阶段重排。",
  outcome: "页面停留和加购前阅读深度提高，后续可用于指导自动化 FAQ 改写任务。",
  metricsBefore: {
    time_on_page: 48,
    add_to_cart_rate: 0.028,
  },
  metricsAfter: {
    time_on_page: 71,
    add_to_cart_rate: 0.041,
  },
};

export const collectionHeroExperiment: KnowledgeExperimentResult = {
  id: "experiment-collection-hero-angle",
  type: "experiment",
  scope: "site",
  title: "Collection Hero 角度实验",
  summary: "对比“功能特性导向”与“使用场景导向”的首屏标题，观察 CTR 和加购变化。",
  tags: ["collection", "hero", "experiment"],
  status: "active",
  priority: "medium",
  version: 1,
  updatedAt: knowledgeTimestamp,
  target: "collection",
  hypothesis: "场景导向首屏更容易承接第一次搜索进站的用户。",
  changeSummary: "将首屏标题从产品特性表述改为“适合谁、在什么场景下用”的表达。",
  evaluationWindow: "7d",
  metricsBefore: {
    ctr: 0.034,
    add_to_cart_rate: 0.021,
  },
  metricsAfter: {
    ctr: 0.047,
    add_to_cart_rate: 0.029,
  },
  verdict: "win",
};

export const launchPlaybook: KnowledgePlaybook = {
  id: "playbook-launch-category",
  type: "playbook",
  scope: "brand",
  title: "新品类上线内容剧本",
  summary: "新品类上线时，先做 collection guide，再补 comparison 与 FAQ，最后回收表现写回知识层。",
  tags: ["playbook", "launch", "category"],
  status: "active",
  priority: "high",
  version: 1,
  updatedAt: knowledgeTimestamp,
  objective: "在新品类上线前 2 周建立基础可搜索资产与首批转化路径。",
  steps: [
    "创建 collection 页面与 guide 引导页",
    "补 1 篇 comparison 页面和 1 组 FAQ",
    "为重点商品页挂入引导模块与 guide 内链",
    "观察 7 天表现并回写规则与模板权重",
  ],
  entrySignals: ["new-category-launch", "new-product-cluster", "seasonal-push"],
};

export const bootstrapKnowledgeAssets: KnowledgeAsset[] = [
  productFaqDepthRule,
  collectionGuideTemplate,
  faqExpansionCase,
  collectionHeroExperiment,
  launchPlaybook,
];

export function listKnowledgeAssets(): KnowledgeAsset[] {
  return bootstrapKnowledgeAssets;
}

export function getKnowledgeAssetById(id: string): KnowledgeAsset | undefined {
  return bootstrapKnowledgeAssets.find((asset) => asset.id === id);
}

export function findKnowledgeAssetsByTag(tag: string): KnowledgeAsset[] {
  return bootstrapKnowledgeAssets.filter((asset) => asset.tags.includes(tag));
}

export function getKnowledgeSnapshot() {
  return {
    siteProfile: demoSiteProfile,
    assets: bootstrapKnowledgeAssets,
  };
}

export type {
  KnowledgeAsset,
  KnowledgeCase,
  KnowledgeExperimentResult,
  KnowledgePlaybook,
  KnowledgeRule,
  KnowledgeTemplate,
  SiteProfile,
} from "./types";
