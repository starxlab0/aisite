const { assets, siteProfile } = require("../data/bootstrap-knowledge");
const { guideTargets } = require("../data/bootstrap-content");
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

function planGuideArticle({ targetId }) {
  const target = guideTargets[`guide:${targetId}`];
  if (!target) return null;

  const template = findAsset("template-collection-guide");
  const experiment = findAsset("experiment-collection-hero-angle");
  const relatedActionRun = findRelatedActionRun("first-time");

  return {
    workflow: "guide-article",
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
      geoMarkets: siteProfile.geoMarkets,
    },
    rewriteObjectives: [
      "围绕第一次购买者的真实判断顺序组织文章，而不是堆术语。",
      "把 guide 与 collection/product/faq 之间的站内路径写清楚。",
      "优先服务 SEO/GEO 的解释型查询与转化前教育。",
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
    nextAction: {
      type: "publish_guide_article",
      outputTarget: `guide:${target.targetId}`,
      requiresReview: true,
    },
  };
}

function generateGuideArticleDraft({ targetId }) {
  const plan = planGuideArticle({ targetId });
  if (!plan) return null;

  return {
    workflow: "guide-article",
    status: "generated",
    target: plan.target,
    draft: {
      slug: plan.target.id,
      title: plan.target.title,
      excerpt: "从场景、隐私、连接与清洁四个维度，帮助第一次购买者缩小范围，并继续进入更合适的商品与集合页。",
      heroTitle: "第一次买，不先背参数，先按场景缩小范围",
      heroSummary:
        "如果你更在意隐私、连接、收纳和第一次上手门槛，这篇 guide 会先给判断路径，再告诉你下一步应该看哪类 collection、product 与 FAQ。",
      body: [
        "先判断自己更在意哪一类场景：第一次购买、隐私优先、情侣互动，还是 App 控制与连接稳定性。这样比一开始就比较参数更容易缩小范围。",
        "如果你是第一次买，优先看上手门槛、清洁方式和隐私感受，而不是先追求复杂功能。这样能更快排除不适合自己的类型。",
        "接下来建议进入 first-time collection，再结合商品页 FAQ 继续判断噪音、清洁和连接问题，避免在 guide 里停住不动。",
      ],
      toc: ["先按场景选", "第一次买先看什么", "下一步看哪个页面"],
      relatedProductSlugs: ["kokocang-x"],
      relatedCollectionSlugs: ["first-time"],
      faqIds: ["faq"],
      seo: {
        title: "第一次买怎么选｜从场景、隐私与连接开始判断",
        description: "给第一次购买者的 buying guide：先按场景缩小范围，再进入 collection、product 和 FAQ 做下一步判断。",
        keywords: ["第一次买怎么选", "buying guide", "first-time collection"],
      },
    },
    authoringNotes: [
      "每段先给结论，再给判断依据与下一步动作。",
      "避免医疗、功效或绝对承诺表达。",
      "让 guide 成为站内流转入口，而不是孤立文章。",
    ],
  };
}

function reviewGuideArticleDraft({ targetId }) {
  const generated = generateGuideArticleDraft({ targetId });
  if (!generated) return null;

  const bannedPatterns = ["治疗", "治愈", "医疗", "保证", "100%", "绝对"];
  const blocks = [
    generated.draft.title,
    generated.draft.excerpt,
    generated.draft.heroTitle,
    generated.draft.heroSummary,
    ...(generated.draft.body ?? []),
  ];

  const issues = [];
  blocks.forEach((block, index) => {
    const violations = bannedPatterns.filter((pattern) => String(block).includes(pattern));
    if (violations.length) {
      issues.push({
        blockIndex: index,
        violations,
        note: "包含应避免的绝对化或高风险表达",
      });
    }
  });

  if ((generated.draft.body ?? []).length < 3) {
    issues.push({
      blockIndex: -1,
      violations: ["insufficient-body"],
      note: "正文段落不足，无法支撑 guide 的解释性与内链导流作用。",
    });
  }

  return {
    workflow: "guide-article",
    status: issues.length ? "needs_revision" : "approved",
    target: generated.target,
    summary: {
      issues: issues.length,
      paragraphs: generated.draft.body.length,
    },
    issues,
  };
}

async function publishGuideArticleDraft({ targetId }) {
  const review = reviewGuideArticleDraft({ targetId });
  const generated = generateGuideArticleDraft({ targetId });
  const target = guideTargets[`guide:${targetId}`];

  if (!review || !generated || !target) return null;
  if (review.status !== "approved") {
    return {
      workflow: "guide-article",
      status: "blocked",
      reason: "Draft review is not approved yet",
      target: review.target,
      reviewSummary: review.summary,
    };
  }

  const nextVersion = target.versionHistory.length + 1;
  const publishRef = `guide-${target.targetId}-v${nextVersion}`;

  return publishWorkflowDraft({
    workflow: "guide-article",
    schemaType: "guideArticleDraft",
    entityType: "guide-article",
    target: {
      type: review.target.type,
      id: review.target.id,
      title: review.target.title,
      path: target.targetPath,
    },
    publishRef,
    payload: generated.draft,
    summary: "Guide article 已发布，并作为 SEO/GEO 与站内导流入口生效。",
    meta: {
      previousRef: target.publishedVersionRef,
    },
    nextAction: {
      type: "monitor",
      window: "7d",
      metrics: ["organic_sessions", "product_ctr", "collection_ctr"],
    },
    extra: {
      checksum: `${target.targetId}-${nextVersion}`,
    },
  });
}

async function rollbackGuideArticle({ targetId }) {
  const target = guideTargets[`guide:${targetId}`];
  if (!target) return null;

  const previousVersion = target.versionHistory[target.versionHistory.length - 1];
  return rollbackWorkflowDraft({
    workflow: "guide-article",
    schemaType: "guideArticleDraft",
    entityType: "guide-article",
    target: {
      type: target.targetType,
      id: target.targetId,
      title: target.title,
      path: target.targetPath,
    },
    rollbackToRef: previousVersion?.ref ?? target.publishedVersionRef,
    reason: "新 guide 版本表现不佳或需人工撤回。",
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
  planGuideArticle,
  generateGuideArticleDraft,
  reviewGuideArticleDraft,
  publishGuideArticleDraft,
  rollbackGuideArticle,
};

