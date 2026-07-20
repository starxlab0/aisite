const { assets, siteProfile } = require("../data/bootstrap-knowledge");
const { faqTargets } = require("../data/bootstrap-content");
const { actionRuns } = require("../data/bootstrap-actions");
const { publishWorkflowDraft, rollbackWorkflowDraft } = require("./publish-utils");

function findAsset(id) {
  return assets.find((asset) => asset.id === id);
}

function buildSuggestedQuestions(targetType, existingFaqs, maxCount = 5) {
  const productQuestions = [
    "这款产品更适合哪类用户和使用场景？",
    "哪些人可能不适合这款产品？",
    "使用前后分别应该怎么清洁和保存？",
    "噪音水平在真实居家场景下大概是什么感受？",
    "和 App 连接失败时应该先排查哪些问题？",
    "如果更在意隐私和收纳，购买前要注意什么？",
    "第一次使用建议从哪些模式和强度开始？",
    "如果想提升情侣互动体验，应该优先看哪些点？",
    "需要搭配润滑或其他配件吗？新手怎么选？",
  ];

  const collectionQuestions = [
    "第一次购买时，应该先看刺激方式还是佩戴方式？",
    "如果希望情侣远程互动，筛选时最重要的功能是什么？",
    "预算有限时，优先看哪些参数最能避免买错？",
    "如果住合租环境，更适合哪类安静和隐私友好的产品？",
    "从这个集合里选到下单前，还应该补看哪类 guide？",
    "这个集合更适合哪类人？不适合哪类人？",
    "如果只想快速缩小到 1–2 个商品，最推荐的判断顺序是什么？",
  ];

  const pool = targetType === "product" ? productQuestions : collectionQuestions;
  return pool.filter((question) => !existingFaqs.includes(question)).slice(0, Math.max(3, Number(maxCount || 5)));
}

function findRelatedActionRun(targetType, targetId) {
  return actionRuns.find(
    (item) =>
      item.input.target.type === targetType &&
      (item.input.target.id === targetId || item.input.target.slug === targetId),
  );
}

function planFaqExpansion({ targetType, targetId, recommendation } = {}) {
  const key = `${targetType}:${targetId}`;
  const target = faqTargets[key];

  if (!target) {
    return null;
  }

  const rule = findAsset("rule-product-faq-depth");
  const caseStudy = findAsset("case-faq-expansion");
  const relatedActionRun = findRelatedActionRun(targetType, targetId);
  const wantsCluster = recommendation?.ruleId === "content-gap" || recommendation?.context?.gapType === "content_gap";
  const suggestedQuestions = buildSuggestedQuestions(target.targetType, target.existingFaqs, wantsCluster ? 8 : 5);

  return {
    workflow: "faq-expansion",
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
    currentFaqCount: target.existingFaqs.length,
    recommendedFaqCount: Math.max(8, target.existingFaqs.length + suggestedQuestions.length),
    existingFaqs: target.existingFaqs,
    suggestedQuestions,
    rationale: [
      "当前 FAQ 数量不足以覆盖购买前高频疑问。",
      "该品类对清洁、隐私、噪音、适合人群和连接问题高度敏感。",
      "扩写 FAQ 可以同时服务 SEO 覆盖和转化疑虑消除。",
    ],
    guardrails: [
      "避免医疗疗效、健康改善或安全承诺类表达。",
      "避免夸张承诺体验结果。",
      "保持品牌语气克制、清晰、非羞辱式。",
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
      type: "expand_faq",
      outputTarget: `${target.targetType}:${target.targetId}`,
      requiresReview: true,
      suggestedKnowledgeAssetIds: ["rule-product-faq-depth", "case-faq-expansion"],
    },
  };
}

function buildAnswer(target, question) {
  if (target.targetType === "product") {
    if (question.includes("适合哪类用户")) {
      return `如果用户更在意 ${target.title} 的外部刺激体验、希望先从清晰易理解的功能差异开始判断，这类页面应该先解释适合人群、典型使用场景，以及第一次使用时最值得优先关注的体验重点。`;
    }
    if (question.includes("清洁和保存")) {
      return `回答应明确区分使用前与使用后的清洁动作，强调温和清洁、彻底晾干和独立收纳，同时避免给出任何医疗或安全承诺式表达。`;
    }
    if (question.includes("噪音水平")) {
      return `建议用相对、克制的方式描述噪音，例如“更适合私密空间或被褥环境下使用”，而不要用绝对静音这类容易引发误解的表述。`;
    }
    if (question.includes("连接失败")) {
      return `回答应优先给出可执行排查顺序，例如蓝牙权限、App 版本、距离和重新配对步骤，同时提醒用户以官方连接流程为准。`;
    }
    if (question.includes("隐私和收纳")) {
      return `这一问应回答包装、收纳和使用后的处理方式，重点缓解首次购买者对隐私暴露和居家收纳的担忧。`;
    }
    if (question.includes("第一次使用")) {
      return `建议引导用户从较低强度和较短时长开始，先熟悉模式与触感，再逐步判断是否适合更高刺激设置。`;
    }
  }

  if (question.includes("第一次购买")) {
    return `这一问应帮助用户先建立判断顺序：先看适合人群和刺激方式，再看穿戴/体积/噪音，最后再比较价格与附加功能。`;
  }
  if (question.includes("情侣远程互动")) {
    return `应优先解释 App Control、连接稳定性和互动场景，再引导用户进入对应商品页，而不是只罗列参数。`;
  }
  if (question.includes("预算有限")) {
    return `建议回答时先给“最不该妥协的参数”，例如舒适度、易清洁和连接稳定性，再解释哪些附加功能可以后置。`;
  }
  if (question.includes("合租环境")) {
    return `回答应从体积、噪音、收纳与使用门槛四个方面帮助用户筛选更适合隐私场景的产品。`;
  }
  if (question.includes("guide")) {
    return `建议把这类问题回答成导购入口，明确告诉用户还应继续阅读哪类 guide、comparison 或 FAQ，形成站内路径。`;
  }

  return `回答应围绕用户真实决策顺序展开，先给简短结论，再解释差异和注意事项，最后提供下一步阅读或购买建议。`;
}

function inferIntent(question) {
  if (question.includes("清洁") || question.includes("保存")) return "care";
  if (question.includes("噪音") || question.includes("隐私")) return "privacy";
  if (question.includes("连接") || question.includes("App")) return "app-control";
  if (question.includes("第一次")) return "first-time";
  return "selection";
}

function generateFaqDraft({ targetType, targetId, recommendation } = {}) {
  const plan = planFaqExpansion({ targetType, targetId, recommendation });
  if (!plan) {
    return null;
  }

  const draftItems = plan.suggestedQuestions.map((question, index) => ({
    id: `${plan.target.type}-${plan.target.id}-faq-${index + 1}`,
    question,
    answer: buildAnswer(plan.target, question),
    intent: inferIntent(question),
    sourceAssetIds: plan.sourceAssets.map((asset) => asset.id),
    needsHumanReview: true,
  }));

  return {
    workflow: "faq-expansion",
    status: "generated",
    target: plan.target,
    basedOnPlan: {
      currentFaqCount: plan.currentFaqCount,
      recommendedFaqCount: plan.recommendedFaqCount,
    },
    draftItems,
    schemaHints: ["FAQPage", "BreadcrumbList"],
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: draftItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "FAQ", item: "/faq" },
          { "@type": "ListItem", position: 2, name: plan.target.title, item: plan.target.path },
        ],
      },
    ],
    authoringNotes: [
      "回答应先给结论，再解释细节，最后给下一步阅读或购买建议。",
      "语气保持克制，不使用医疗、功效或绝对化承诺表达。",
      "必要时把回答拆成 2 段，便于前台 FAQ 模块展示。",
    ],
  };
}

function reviewFaqExpansionDraft({ targetType, targetId }) {
  const generated = generateFaqDraft({ targetType, targetId });
  if (!generated) {
    return null;
  }

  const bannedPatterns = [
    "治疗",
    "治愈",
    "医疗",
    "保证",
    "绝对静音",
    "100%",
    "安全无风险",
  ];

  const checks = generated.draftItems.map((item) => {
    const violations = bannedPatterns.filter((pattern) =>
      item.answer.includes(pattern),
    );
    const answerLength = item.answer.length;

    return {
      id: item.id,
      question: item.question,
      passed: violations.length === 0 && answerLength >= 28,
      answerLength,
      violations,
      notes:
        violations.length > 0
          ? "包含应避免的高风险表达"
          : answerLength < 28
            ? "回答过短，建议补充判断依据与下一步建议"
            : "通过基础规则检查",
    };
  });

  const failedChecks = checks.filter((check) => !check.passed);

  return {
    workflow: "faq-expansion",
    status: failedChecks.length ? "needs_revision" : "approved",
    target: generated.target,
    summary: {
      total: checks.length,
      passed: checks.length - failedChecks.length,
      failed: failedChecks.length,
    },
    reviewerGuidance: [
      "优先检查是否出现医疗功效、绝对承诺和不必要的羞耻感表达。",
      "确认回答是否先给结论，再解释差异，最后提供下一步引导。",
      "确认问题顺序符合购买决策路径，而不是随意堆叠。",
    ],
    checks,
  };
}

async function publishFaqExpansionDraft({ targetType, targetId }) {
  const review = reviewFaqExpansionDraft({ targetType, targetId });
  const generated = generateFaqDraft({ targetType, targetId });
  const target = faqTargets[`${targetType}:${targetId}`];

  if (!review || !generated || !target) {
    return null;
  }

  if (review.status !== "approved") {
    return {
      workflow: "faq-expansion",
      status: "blocked",
      reason: "Draft review is not approved yet",
      target: review.target,
      reviewSummary: review.summary,
    };
  }

  const nextVersion = target.versionHistory.length + 1;
  const publishRef = `faq-${target.targetType}-${target.targetId}-v${nextVersion}`;

  return publishWorkflowDraft({
    workflow: "faq-expansion",
    schemaType: "faqDraft",
    entityType: "faq",
    target: {
      type: review.target.type,
      id: review.target.id,
      title: review.target.title,
      path: target.targetPath,
    },
    publishRef,
    payload: {
      title: `${target.title} FAQ Draft`,
      items: generated.draftItems,
      authoringNotes: generated.authoringNotes,
    },
    summary: "在现有 FAQ 基础上追加经审核通过的新问题与回答。",
    meta: {
      previousRef: target.publishedVersionRef,
    },
    nextAction: {
      type: "monitor",
      window: "7d",
      metrics: ["time_on_page", "add_to_cart_rate", "conversion_rate"],
    },
    extra: {
      checksum: `${target.targetType}-${target.targetId}-${nextVersion}`,
      publishedSnapshot: {
        ref: publishRef,
        previousRef: target.publishedVersionRef,
        publishedAt: "2026-06-28T00:00:00.000Z",
        faqCount: target.existingFaqs.length + review.summary.passed,
        summary: "在现有 FAQ 基础上追加经审核通过的新问题与回答。",
      },
    },
  });
}

async function rollbackFaqExpansion({ targetType, targetId }) {
  const target = faqTargets[`${targetType}:${targetId}`];
  if (!target) {
    return null;
  }

  const currentVersion = target.versionHistory[target.versionHistory.length - 1];
  const rollbackToVersion = target.versionHistory[target.versionHistory.length - 1] ?? null;
  return rollbackWorkflowDraft({
    workflow: "faq-expansion",
    schemaType: "faqDraft",
    entityType: "faq",
    target: {
      type: target.targetType,
      id: target.targetId,
      title: target.title,
      path: target.targetPath,
    },
    rollbackToRef: rollbackToVersion?.ref ?? target.publishedVersionRef,
    reason: "新 FAQ 版本表现不佳或需人工撤回。",
    previousPublishedSnapshot: currentVersion
      ? {
          ref: currentVersion.ref,
          publishedAt: currentVersion.publishedAt,
          summary: currentVersion.summary,
        }
      : null,
  });
}

module.exports = {
  generateFaqDraft,
  planFaqExpansion,
  publishFaqExpansionDraft,
  rollbackFaqExpansion,
  reviewFaqExpansionDraft,
};
