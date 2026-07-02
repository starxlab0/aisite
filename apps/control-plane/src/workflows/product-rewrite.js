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

function planProductRewrite({ targetId }) {
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
    rewriteObjectives: [
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

function generateProductRewriteDraft({ targetId }) {
  const plan = planProductRewrite({ targetId });
  if (!plan) return null;

  return {
    workflow: "product-rewrite",
    status: "generated",
    target: plan.target,
    draft: {
      productSlug: plan.target.id,
      title: `${plan.target.title}｜更容易上手的私密外部刺激`,
      subtitle: "更在意隐私、清洁与连接稳定时的第一选择",
      shortDescription:
        "如果你第一次购买、又担心噪音和隐私，这款更适合作为入门：先把关键顾虑讲清楚，再让你按场景判断是否适合自己。",
      hero: {
        eyebrow: "First-time friendly",
        headline: "先按场景判断，再看功能差异",
        description:
          "把隐私、清洁、噪音和连接这四类决策点先说清楚，减少第一次购买的试错成本。",
      },
      keyBenefits: [
        "入门门槛低：先给决策路径，再讲细节",
        "隐私友好：强调收纳、使用场景和表达克制",
        "连接清晰：给出 App 连接与排查的具体顺序",
      ],
      whoItsFor: [
        "第一次购买、想先降低试错成本的人",
        "更在意隐私、收纳和噪音感受的人",
        "希望先从连接和操作清晰度开始判断的人",
      ],
      whyItFeelsDifferent: [
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
    authoringNotes: [
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
