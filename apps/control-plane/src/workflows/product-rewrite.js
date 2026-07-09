const { assets, siteProfile } = require("../data/bootstrap-knowledge");
const { productTargets } = require("../data/bootstrap-content");
const { actionRuns } = require("../data/bootstrap-actions");
const { publishWorkflowDraft, rollbackWorkflowDraft } = require("./publish-utils");

function findAsset(id) {
  return assets.find((asset) => asset.id === id);
}

function findRelatedActionRun(targetId) {
  return actionRuns.find(
    (item) =>
      item.input.target.type === "product" &&
      (item.input.target.id === targetId || item.input.target.slug === targetId),
  );
}

function isPurchaseRecommendation(recommendation) {
  return recommendation?.ruleId === "low-purchase-rate" || recommendation?.context?.optimizationGoal;
}

function purchaseAuthoringNotes(recommendation) {
  const notes = [
    "优先回答值不值得买，而不只是重复功能点。",
    "把价格、优惠、配送、收纳和连接风险说明前置，降低下单前犹豫。",
    "FAQ 和卖点优先覆盖购买前异议，而不是泛泛描述体验。",
  ];
  const hints = Array.isArray(recommendation?.context?.actionHints) ? recommendation.context.actionHints : [];
  const referencePattern = recommendation?.context?.referencePattern;
  const referenceNote = referencePattern
    ? `参考已验证模式：${referencePattern.summary} 重点复用 ${Array.isArray(referencePattern.focusAreas) ? referencePattern.focusAreas.join(" / ") : "value framing"}。`
    : null;
  return Array.from(new Set([...notes, ...hints, referenceNote].filter(Boolean)));
}

function planProductRewrite({ targetId, recommendation } = {}) {
  const target = productTargets[`product:${targetId}`];
  if (!target) return null;

  const rule = findAsset("rule-product-faq-depth");
  const caseStudy = findAsset("case-faq-expansion");
  const relatedActionRun = findRelatedActionRun(targetId);

  return {
    workflow: "product-rewrite",
    status: "planned",
    target: {
      type: target.targetType,
      id: target.targetId,
      title: target.title,
      path: target.targetPath,
    },
    siteProfile: {
      siteId: siteProfile.siteId,
      industry: siteProfile.industry,
      tone: siteProfile.tone,
      prohibitedClaims: siteProfile.prohibitedClaims,
    },
    currentState: {
      title: target.currentTitle,
      subtitle: target.currentSubtitle,
      shortDescription: target.currentShortDescription,
      keyBenefits: target.currentKeyBenefits,
    },
    rewriteObjectives: isPurchaseRecommendation(recommendation)
      ? [
          "把首屏改成先解释值不值得买，再进入功能差异。",
          "卖点优先覆盖价格感知、信任信号、配送/收纳隐私与连接风险。",
          "用 FAQ 处理购买前异议，减少加购后未下单的犹豫。",
        ]
      : [
          "把标题与副标题写得更贴近用户决策语言",
          "卖点优先覆盖隐私、清洁、噪音和连接这类高频顾虑",
          "保持语气克制，避免功效和绝对承诺",
        ],
    guardrails: [
      "避免医疗疗效、健康改善或安全承诺类表达。",
      "避免夸张承诺体验结果。",
      "不要用羞辱式或过度露骨的语言。",
    ],
    sourceAssets: [rule, caseStudy].filter(Boolean).map((asset) => ({
      id: asset.id,
      type: asset.type,
      title: asset.title,
    })),
    relatedActionRun: relatedActionRun
      ? {
          id: relatedActionRun.id,
          status: relatedActionRun.status,
          objective: relatedActionRun.input.objective,
        }
      : null,
    nextAction: {
      type: "rewrite_product_content",
      outputTarget: `product:${target.targetId}`,
      requiresReview: true,
      suggestedKnowledgeAssetIds: ["rule-product-faq-depth", "case-faq-expansion"],
    },
  };
}

function generateProductRewriteDraft({ targetId, recommendation } = {}) {
  const plan = planProductRewrite({ targetId, recommendation });
  if (!plan) return null;

  const purchaseMode = isPurchaseRecommendation(recommendation);

  return {
    workflow: "product-rewrite",
    status: "generated",
    target: plan.target,
    draft: {
      productSlug: plan.target.id,
      title: purchaseMode ? `${plan.target.title}｜先把值不值得买说清楚，再看功能差异` : `${plan.target.title}｜更容易上手的私密外部刺激`,
      subtitle: purchaseMode ? "更适合先解决价格、隐私与连接顾虑后再决定的人" : "更在意隐私、清洁与连接稳定时的第一选择",
      shortDescription: purchaseMode
        ? "如果用户已经看过、点过甚至加购过却还没下单，通常卡在值不值、隐私收货是否安心、连接是否麻烦。这个版本会先把这些问题讲清楚，再展开功能细节。"
        : "如果你第一次购买、又担心噪音和隐私，这款更适合作为入门：先把关键顾虑讲清楚，再让你按场景判断是否适合自己。",
      hero: {
        eyebrow: purchaseMode ? "Conversion-focused" : "First-time friendly",
        headline: purchaseMode ? "先把价格、信任和购买顾虑说清楚" : "先按场景判断，再看功能差异",
        description: purchaseMode
          ? "把价格感知、收货隐私、清洁门槛、连接稳定性和购买保障提前解释，降低最后一步的决策阻力。"
          : "把隐私、清洁、噪音和连接这四类决策点先说清楚，减少第一次购买的试错成本。",
      },
      keyBenefits: purchaseMode
        ? [
            "价格更好判断：先说明为什么值得买，而不是直接堆参数",
            "信任信息更前置：把收货隐私、清洁与基础保障提前说清",
            "连接风险更透明：先解释 App 配对与常见排查，减少下单犹豫",
          ]
        : [
            "入门门槛低：先给决策路径，再讲细节",
            "隐私友好：强调收纳、使用场景和表达克制",
            "连接清晰：给出 App 连接与排查的具体顺序",
          ],
      whoItsFor: [
        "第一次购买、想先降低试错成本的人",
        "更在意隐私、收纳和噪音感受的人",
        "希望先从连接和操作清晰度开始判断的人",
      ],
      whyItFeelsDifferent: purchaseMode
        ? [
            "不是先强调刺激参数，而是先解释为什么这笔购买更稳妥",
            "更强调信任、隐私和连接成本，减少加购后仍犹豫的原因",
            "把异议处理写进页面结构里，让 FAQ 真正服务下单前判断",
          ]
        : [
            "不是单纯堆刺激参数，而是先把使用场景和决策点说清楚",
            "更强调隐私友好的表达与收纳场景，而不是夸张体验承诺",
            "把 App 连接与排查逻辑写得更具体，降低第一次上手门槛",
          ],
      careInstructions: [
        "使用前后分开清洁，温和清洗并彻底晾干",
        "独立收纳，避免与尖锐物品接触",
      ],
      whatsInBox: [
        "主机",
        "充电线",
        "收纳袋或基础包装配件",
        "快速上手说明",
      ],
    },
    authoringNotes: purchaseMode
      ? purchaseAuthoringNotes(recommendation)
      : [
          "标题和卖点尽量贴近用户决策语言，而不是堆参数。",
          "避免医疗、功效或绝对承诺表达。",
          "必要时把长句拆成两句，保持阅读节奏。",
        ],
  };
}

function reviewProductRewriteDraft({ targetId }) {
  const generated = generateProductRewriteDraft({ targetId });
  if (!generated) return null;

  const bannedPatterns = ["治疗", "治愈", "医疗", "保证", "100%", "绝对", "安全无风险"];
  const blocks = [
    generated.draft.title,
    generated.draft.subtitle,
    generated.draft.shortDescription,
    generated.draft.hero?.headline ?? "",
    generated.draft.hero?.description ?? "",
    ...(generated.draft.keyBenefits ?? []),
  ];

  const issues = [];
  blocks.forEach((block, index) => {
    const violations = bannedPatterns.filter((pattern) => block.includes(pattern));
    if (violations.length) {
      issues.push({
        blockIndex: index,
        violations,
        note: "包含应避免的绝对化或高风险表达",
      });
    }
  });

  return {
    workflow: "product-rewrite",
    status: issues.length ? "needs_revision" : "approved",
    target: generated.target,
    summary: {
      issues: issues.length,
      keyBenefits: generated.draft.keyBenefits?.length ?? 0,
    },
    issues,
  };
}

async function publishProductRewriteDraft({ targetId }) {
  const review = reviewProductRewriteDraft({ targetId });
  const generated = generateProductRewriteDraft({ targetId });
  const target = productTargets[`product:${targetId}`];

  if (!review || !generated || !target) return null;

  if (review.status !== "approved") {
    return {
      workflow: "product-rewrite",
      status: "blocked",
      reason: "Draft review is not approved yet",
      target: review.target,
      reviewSummary: review.summary,
    };
  }

  const nextVersion = target.versionHistory.length + 1;
  const publishRef = `product-${target.targetId}-v${nextVersion}`;

  return publishWorkflowDraft({
    workflow: "product-rewrite",
    schemaType: "productContentDraft",
    entityType: "product-content",
    target: {
      type: review.target.type,
      id: review.target.id,
      title: review.target.title,
      path: target.targetPath,
    },
    publishRef,
    payload: generated.draft,
    summary: "商品页文案已按决策语言与高频顾虑重写。",
    meta: {
      previousRef: target.publishedVersionRef,
    },
    extra: {
      checksum: `${target.targetId}-${nextVersion}`,
    },
  });
}

async function rollbackProductRewrite({ targetId }) {
  const target = productTargets[`product:${targetId}`];
  if (!target) return null;

  const previousVersion = target.versionHistory[target.versionHistory.length - 1];
  return rollbackWorkflowDraft({
    workflow: "product-rewrite",
    schemaType: "productContentDraft",
    entityType: "product-content",
    target: {
      type: target.targetType,
      id: target.targetId,
      title: target.title,
      path: target.targetPath,
    },
    rollbackToRef: previousVersion?.ref ?? target.publishedVersionRef,
    reason: "新商品文案表现不佳或需人工撤回。",
  });
}

module.exports = {
  generateProductRewriteDraft,
  planProductRewrite,
  publishProductRewriteDraft,
  reviewProductRewriteDraft,
  rollbackProductRewrite,
};
