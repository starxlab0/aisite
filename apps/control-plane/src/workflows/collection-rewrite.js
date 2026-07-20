const { assets, siteProfile } = require("../data/bootstrap-knowledge");
const { collectionTargets } = require("../data/bootstrap-content");
const { actionRuns } = require("../data/bootstrap-actions");
const { publishWorkflowDraft, rollbackWorkflowDraft } = require("./publish-utils");

function findAsset(id) {
  return assets.find((asset) => asset.id === id);
}

function findRelatedActionRun(targetId) {
  return actionRuns.find(
    (item) =>
      item.input.target.type === "collection" &&
      (item.input.target.id === targetId || item.input.target.slug === targetId),
  );
}

function isPurchaseRecommendation(recommendation) {
  return recommendation?.ruleId === "low-purchase-rate" || recommendation?.context?.optimizationGoal;
}

function purchaseAuthoringNotes(recommendation) {
  const notes = [
    "集合页首屏优先解释为什么值得继续往下看，而不是只做参数罗列。",
    "把预算、信任、配送/隐私和购买保障信息更早暴露，减少跳失。",
    "内部链接优先导向高意图、高信任的商品与 FAQ/guide，而不是平均分流。",
  ];
  const hints = Array.isArray(recommendation?.context?.actionHints) ? recommendation.context.actionHints : [];
  const referencePattern = recommendation?.context?.referencePattern;
  const referenceNote = referencePattern
    ? `参考已验证模式：${referencePattern.summary} 重点复用 ${Array.isArray(referencePattern.focusAreas) ? referencePattern.focusAreas.join(" / ") : "trust + pricing"}。`
    : null;
  return Array.from(new Set([...notes, ...hints, referenceNote].filter(Boolean)));
}

function planCollectionRewrite({ targetId, recommendation } = {}) {
  const target = collectionTargets[`collection:${targetId}`];
  if (!target) {
    return null;
  }

  const template = findAsset("template-collection-guide");
  const experiment = findAsset("experiment-collection-hero-angle");
  const relatedActionRun = findRelatedActionRun(targetId);

  return {
    workflow: "collection-rewrite",
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
      seoFocus: siteProfile.seoFocus,
    },
    currentState: {
      heroTitle: target.currentHeroTitle,
      heroSummary: target.currentHeroSummary,
      modules: target.currentModules,
      angles: target.existingAngles,
    },
    rewriteObjectives: isPurchaseRecommendation(recommendation)
      ? [
          "把首屏从泛场景导向改成更偏成交判断导向，先解释为什么值得继续筛选。",
          "增加预算、信任与购买保障维度，减少高流量低成交的犹豫。",
          "把导流重点放到更容易转化的商品与答疑内容，而不是平均分发。",
          "为 FAQ、guide 和高信任商品卡建立更明确的购买前路径。",
        ]
      : [
          "把首屏从功能导向改成场景导向",
          "增加选择维度模块，帮助第一次购买者筛选",
          "把 guide 和商品集合之间的路径写得更明确",
          "为 FAQ 和 guide 入口预留站内流转",
        ],
    recommendedStructure: [
      "scene-hero",
      "decision-points",
      "curated-grid",
      "trust-faq",
      ...(recommendation?.ruleId === "internal-link-gap" ? ["guide-links"] : []),
      "next-read",
    ],
    sourceAssets: [template, experiment].filter(Boolean).map((asset) => ({
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
    guardrails: [
      "避免只堆参数，不解释适合谁和为什么。",
      "避免夸张承诺转化或体验结果。",
      "首屏语言保持克制、清晰、非羞辱式。",
    ],
    nextAction: {
      type: "rewrite_collection",
      outputTarget: `collection:${target.targetId}`,
      requiresReview: true,
      suggestedKnowledgeAssetIds: [
        "template-collection-guide",
        "experiment-collection-hero-angle",
      ],
    },
  };
}

function buildSectionDraft(target, section, recommendation) {
  const purchaseMode = isPurchaseRecommendation(recommendation);
  if (section === "scene-hero") {
    return {
      key: section,
      title: purchaseMode ? "先判断值不值得继续看，再决定看哪一类" : "不知道从哪一类开始时，先按场景选",
      content: purchaseMode
        ? `这组 ${target.title} 先解释预算、隐私、配送与连接顾虑，再把用户导向更值得深入比较的商品和 FAQ，减少只逛不买。`
        : `这组 ${target.title} 不先强调参数，而先告诉用户在第一次购买、合租隐私、情侣互动和 App 控制这几种典型场景下分别应该优先看什么。`,
    };
  }

  if (section === "decision-points") {
    return {
      key: section,
      title: purchaseMode ? "先看预算、信任和使用门槛这三个判断点" : "先看这三个判断点",
      content: purchaseMode
        ? "先判断预算带是否合适，再判断自己最在意的是隐私/收货、连接稳定还是清洁门槛，最后再比较刺激方式与体积。"
        : "先判断自己更在意刺激方式还是佩戴/体积，再判断是否需要 App 控制，最后再比较噪音和清洁门槛。",
    };
  }

  if (section === "curated-grid") {
    return {
      key: section,
      title: purchaseMode ? "按预算与购买把握度组织商品卡组" : "按人群与场景分组的商品卡组",
      content: purchaseMode
        ? "商品卡组优先按预算友好、隐私友好、连接更稳和进阶选择组织，让用户先缩小到更可能下单的一小组。"
        : "商品卡组不只按价格或参数排序，而应按新手友好、情侣远程、隐私优先、功能进阶四类目的组织。",
    };
  }

  if (section === "trust-faq") {
    return {
      key: section,
      title: purchaseMode ? "把最容易阻断下单的顾虑提前回答" : "购买前最常见的顾虑",
      content: purchaseMode
        ? "这里集中回答收货隐私、噪音、清洁、连接、预算和值不值得买这六类问题，把购买前最后一步的不确定感压低。"
        : "这里集中回答隐私、噪音、清洁、连接和入门选择五类问题，降低第一次购买者的不确定感。",
    };
  }

  if (section === "guide-links") {
    return {
      key: section,
      title: "继续阅读：guide 与 FAQ 入口",
      content:
        "把“下一步看什么”做成明确入口：先去对应 guide 建立判断路径，再去 FAQ 补齐隐私、噪音、清洁与连接疑虑，最后回到商品卡完成选择。",
    };
  }

  return {
    key: section,
    title: "继续阅读与比较",
    content:
      "给出下一步应该读的 guide、comparison 和 FAQ，避免用户停在集合页不知道怎么继续判断。",
  };
}

function generateCollectionRewriteDraft({ targetId, recommendation } = {}) {
  const plan = planCollectionRewrite({ targetId, recommendation });
  if (!plan) {
    return null;
  }

  const purchaseMode = isPurchaseRecommendation(recommendation);

  const internalLinkBoost = recommendation?.ruleId === "internal-link-gap" || recommendation?.context?.gapType === "internal_link_gap";
  const boostedLinks = [
    "/guides",
    "/faq",
    plan.target.path,
    ...(internalLinkBoost ? ["/guides/how-to-choose", "/product/kokocang-x"] : []),
  ]
    .filter(Boolean)
    .filter((value, idx, arr) => arr.indexOf(value) === idx);

  return {
    workflow: "collection-rewrite",
    status: "generated",
    target: plan.target,
    draft: {
      hero: {
        title: purchaseMode ? "先判断值不值得买，再缩小到更合适的一组" : "第一次买，不必先研究参数，先按场景缩小范围",
        summary: purchaseMode
          ? "如果你已经逛过但还没下单，这一页会先把预算、隐私、连接和购买保障讲清楚，再带你进入更值得比较的商品与答疑内容。"
          : "如果你更在意隐私、情侣互动、App 控制或入门门槛，这一页会先帮你按决策场景筛选，再带你进入更合适的商品和 guide。",
      },
      sections: plan.recommendedStructure.map((section) =>
        buildSectionDraft(plan.target, section, recommendation),
      ),
      internalLinks: boostedLinks,
      schemaHints: ["CollectionPage", "BreadcrumbList"],
      structuredData: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: plan.target.title,
          description: purchaseMode
            ? "面向购买前判断的集合页，优先解释预算、信任和下一步阅读路径。"
            : "帮助第一次购买者按场景缩小范围的集合页。",
          hasPart: plan.recommendedStructure.map((section, index) => ({
            "@type": "WebPageElement",
            position: index + 1,
            name: section,
          })),
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Shop", item: "/shop" },
            { "@type": "ListItem", position: 2, name: plan.target.title, item: plan.target.path },
          ],
        },
      ],
    },
    authoringNotes: purchaseMode
      ? purchaseAuthoringNotes(recommendation)
      : [
          "首屏先给用户判断路径，不要先讲功能堆砌。",
          "模块标题尽量让用户知道为什么要读这一段。",
          "每个模块都应指向下一步筛选或阅读路径。",
          internalLinkBoost ? "补齐 guide/FAQ/商品导流入口，避免内容解释完就断链。" : null,
        ],
  };
}

function reviewCollectionRewriteDraft({ targetId }) {
  const generated = generateCollectionRewriteDraft({ targetId });
  if (!generated) {
    return null;
  }

  const bannedPatterns = ["保证", "100%", "绝对", "治愈", "医疗"];
  const textBlocks = [
    generated.draft.hero.title,
    generated.draft.hero.summary,
    ...generated.draft.sections.map((section) => `${section.title} ${section.content}`),
  ];

  const issues = [];

  textBlocks.forEach((block, index) => {
    const violations = bannedPatterns.filter((pattern) => block.includes(pattern));
    if (violations.length) {
      issues.push({
        blockIndex: index,
        violations,
        note: "包含应避免的绝对化或高风险表达",
      });
    }
  });

  const hasDecisionSection = generated.draft.sections.some(
    (section) => section.key === "decision-points",
  );

  if (!hasDecisionSection) {
    issues.push({
      blockIndex: -1,
      violations: ["missing-decision-points"],
      note: "缺少帮助用户缩小范围的决策模块",
    });
  }

  return {
    workflow: "collection-rewrite",
    status: issues.length ? "needs_revision" : "approved",
    target: generated.target,
    summary: {
      issues: issues.length,
      sections: generated.draft.sections.length,
      links: generated.draft.internalLinks.length,
    },
    reviewerGuidance: [
      "确认首屏是否从场景和意图切入，而不是从参数堆砌开始。",
      "确认是否存在帮助用户做判断的模块。",
      "确认是否给出明确的站内下一步路径。",
    ],
    issues,
  };
}

async function publishCollectionRewriteDraft({ targetId }) {
  const review = reviewCollectionRewriteDraft({ targetId });
  const generated = generateCollectionRewriteDraft({ targetId });
  const target = collectionTargets[`collection:${targetId}`];

  if (!review || !generated || !target) {
    return null;
  }

  if (review.status !== "approved") {
    return {
      workflow: "collection-rewrite",
      status: "blocked",
      reason: "Draft review is not approved yet",
      target: review.target,
      reviewSummary: review.summary,
    };
  }

  const nextVersion = target.versionHistory.length + 1;
  const publishRef = `collection-${target.targetId}-v${nextVersion}`;

  return publishWorkflowDraft({
    workflow: "collection-rewrite",
    schemaType: "collectionPageDraft",
    entityType: "collection-page",
    target: {
      type: review.target.type,
      id: review.target.id,
      title: review.target.title,
      path: target.targetPath,
    },
    publishRef,
    payload: {
      hero: generated.draft.hero,
      sections: generated.draft.sections,
      internalLinks: generated.draft.internalLinks,
      authoringNotes: generated.authoringNotes,
    },
    summary: "集合页已切换为场景导向首屏和决策路径结构。",
    meta: {
      previousRef: target.publishedVersionRef,
    },
    nextAction: {
      type: "monitor",
      window: "7d",
      metrics: ["ctr", "add_to_cart_rate", "conversion_rate"],
    },
    extra: {
      checksum: `${target.targetId}-${nextVersion}`,
    },
  });
}

async function rollbackCollectionRewrite({ targetId }) {
  const target = collectionTargets[`collection:${targetId}`];
  if (!target) {
    return null;
  }

  const previousVersion = target.versionHistory[target.versionHistory.length - 1];
  return rollbackWorkflowDraft({
    workflow: "collection-rewrite",
    schemaType: "collectionPageDraft",
    entityType: "collection-page",
    target: {
      type: target.targetType,
      id: target.targetId,
      title: target.title,
      path: target.targetPath,
    },
    rollbackToRef: previousVersion?.ref ?? target.publishedVersionRef,
    reason: "新集合页版本表现不佳或需人工撤回。",
    previousPublishedSnapshot: previousVersion
      ? {
          ref: previousVersion.ref,
          publishedAt: previousVersion.publishedAt,
          summary: previousVersion.summary,
        }
      : null,
  });
}

module.exports = {
  generateCollectionRewriteDraft,
  planCollectionRewrite,
  publishCollectionRewriteDraft,
  reviewCollectionRewriteDraft,
  rollbackCollectionRewrite,
};
