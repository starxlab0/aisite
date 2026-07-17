const { adapterName } = require("../cms-adapters");
const {
  getSignalsRuntimeStatus,
  listRecommendations,
  listRuleTuningProposals,
  listTrackedEvents,
  createAiConciergeFunnelRecommendation,
  createFulfillmentBacklogRecommendation,
  createFulfillmentObservationFollowupRecommendation,
  createPaymentIssueRecommendation,
  createPaymentObservationFollowupRecommendation,
  createCheckoutCompletionRecommendation,
  createCommerceJourneyObservationFollowupRecommendation,
  createContentGapRecommendation,
  createThinContentRecommendation,
  createInternalLinkGapRecommendation,
  createSeoLowCtrRecommendation,
  createSeoPositionDropRecommendation,
  createIncidentFollowupProposal,
  syncAiConciergeTuningProposal,
  maybeOpenAiConciergeDraftPullRequestForProposal,
  createAiConciergeRiskFollowupProposal,
  listDailyMonitoringSnapshots,
  upsertDailyMonitoringSnapshot,
} = require("../signals/store");
const {
  listEvents,
  listRepoChanges,
  getSeoSyncStatus,
  upsertAlertsFromMonitoring,
  upsertCustomerNotificationsFromMonitoring,
  autoSendEligibleCustomerNotifications,
  upsertSupportCasesFromMonitoring,
  commerceOps,
  resultGovernanceOps,
  seoOps,
  findPlaybookByKey,
  upsertPlaybook,
  listPlaybooks,
} = require("./store");
const { getSeoSearchConsoleAutomationConfig, summarizeSeoSearchConsoleHealth } = require("./seo-search-console-sync");
const { getAutoActionPolicy } = require("./auto-action-policy");

function hoursAgo(hours) {
  return Date.now() - Math.max(0, Number(hours || 0)) * 60 * 60 * 1000;
}

function occurredSince(event, sinceTs) {
  const ts = Date.parse(event?.at || "");
  return Number.isFinite(ts) && ts >= sinceTs;
}

function buildAlert(level, title, detail) {
  return { level, title, detail };
}

function buildCustomerNotificationTemplate({ paymentKind, hasFulfillmentDelay }) {
  const detailParts = [];
  let kind = "";
  let title = "";
  let ctaLabel = "Open order";

  if (paymentKind === "payment_requires_action") {
    kind = "payment_requires_action";
    title = "Complete your payment verification";
    ctaLabel = "Complete verification";
    detailParts.push(
      "Your order is waiting for an extra payment confirmation step. Reopen your order and complete the required verification to finish checkout.",
    );
  } else if (paymentKind === "payment_failed") {
    kind = "payment_failed";
    title = "Retry payment for your order";
    ctaLabel = "Retry payment";
    detailParts.push(
      "We couldn't complete your payment. Reopen your order to retry payment or switch to a different payment method.",
    );
  } else if (paymentKind === "payment_canceled") {
    kind = "payment_canceled";
    title = "Your payment session expired";
    ctaLabel = "Reopen order";
    detailParts.push(
      "Your payment session was canceled or expired before checkout finished. Reopen your order to start payment again.",
    );
  }

  if (hasFulfillmentDelay) {
    if (!kind) {
      kind = "fulfillment_delay";
      title = "Your order is taking longer to ship";
      ctaLabel = "View order status";
      detailParts.push(
        "Your order is still processing and may take longer than usual to ship. We'll keep your order updated as soon as it moves to shipping.",
      );
    } else {
      detailParts.push(
        "We also see the order is still processing, so shipping may take longer than usual while we resolve the payment side.",
      );
    }
  }

  if (!kind) return null;
  return {
    kind,
    title,
    detail: detailParts.join("\n\n"),
    ctaLabel,
  };
}

function buildCustomerNotificationIntents(events) {
  const items = Array.isArray(events) ? events : [];
  const byOrder = new Map();
  const orderIdFrom = (e) => String(e?.metadata?.orderId || "").trim();
  const emailFrom = (e) => String(e?.metadata?.email || "").trim();
  const atFrom = (e) => Date.parse(String(e?.at || "")) || 0;
  const paymentRank = {
    payment_requires_action: 3,
    payment_failed: 2,
    payment_canceled: 1,
  };

  items.forEach((e) => {
    const orderId = orderIdFrom(e);
    if (!orderId) return;
    const existing = byOrder.get(orderId) ?? {
      orderId,
      email: "",
      latestPayment: null,
      latestFulfillment: null,
      targets: new Set(),
    };
    const email = emailFrom(e);
    if (email) existing.email = email;
    if (e?.contentRef) existing.targets.add(String(e.contentRef));

    const paymentTypes = new Set(["payment_failed", "payment_canceled", "payment_requires_action"]);
    const fulfillmentTypes = new Set(["fulfillment_processing", "fulfillment_shipped", "fulfillment_delivered"]);
    if (paymentTypes.has(String(e?.eventType || ""))) {
      const ts = atFrom(e);
      const nextType = String(e.eventType || "");
      const nextRank = paymentRank[nextType] ?? 0;
      const currentType = existing.latestPayment?.eventType ? String(existing.latestPayment.eventType) : "";
      const currentRank = paymentRank[currentType] ?? 0;
      if (
        !existing.latestPayment ||
        nextRank > currentRank ||
        (nextRank === currentRank && ts >= existing.latestPayment.ts)
      ) {
        existing.latestPayment = { eventType: nextType, ts };
      }
    }
    if (fulfillmentTypes.has(String(e?.eventType || ""))) {
      const ts = atFrom(e);
      if (!existing.latestFulfillment || ts >= existing.latestFulfillment.ts) {
        existing.latestFulfillment = { eventType: e.eventType, ts };
      }
    }
    byOrder.set(orderId, existing);
  });

  const intents = [];
  byOrder.forEach((order) => {
    if (!order.email) return;
    const actionUrl = `/order/${encodeURIComponent(order.orderId)}`;

    const p = order.latestPayment?.eventType ?? null;
    const f = order.latestFulfillment?.eventType ?? null;
    const template = buildCustomerNotificationTemplate({
      paymentKind: p,
      hasFulfillmentDelay: f === "fulfillment_processing",
    });
    if (!template) return;
    intents.push({
      kind: template.kind,
      orderId: order.orderId,
      to: order.email,
      title: template.title,
      detail: template.detail,
      ctaLabel: template.ctaLabel,
      actionUrl,
    });
  });

  return intents.slice(0, 50);
}

function buildSupportCaseIntents(input = {}) {
  const intents = [];
  const tracked24h = Array.isArray(input.tracked24h) ? input.tracked24h : [];
  const paymentRecommendations = Array.isArray(input.paymentRecommendations) ? input.paymentRecommendations : [];
  const fulfillmentRecommendations = Array.isArray(input.fulfillmentRecommendations) ? input.fulfillmentRecommendations : [];
  const refundResults24h = input.refundResults24h && typeof input.refundResults24h === "object" ? input.refundResults24h : null;

  const atFrom = (e) => Date.parse(String(e?.at || "")) || 0;
  const recentOrderIdByEventType = new Map();
  tracked24h.forEach((event) => {
    const orderId = String(event?.metadata?.orderId || "").trim();
    if (!orderId) return;
    const eventType = String(event?.eventType || "").trim();
    if (!eventType) return;
    const ts = atFrom(event);
    const current = recentOrderIdByEventType.get(eventType);
    if (!current || ts >= current.ts) {
      recentOrderIdByEventType.set(eventType, { orderId, ts });
    }
  });
  const orderIdForJourney = (journeyId) => recentOrderIdByEventType.get(String(journeyId || "").trim())?.orderId ?? null;

  paymentRecommendations
    .filter((item) => item.ruleId === "payment-observation-followup")
    .forEach((item) => {
      intents.push({
        kind: "payment_recovery_review",
        severity: item.severity ?? "warning",
        title: "Payment recovery still needs manual follow-up",
        detail: item.reason || "Payment recovery remained risky after the previous recovery step and needs manual review.",
        target: { type: "journey", id: item.targetId },
        targetPath: item?.context?.parentProposalId ? `/ops/proposals/${item.context.parentProposalId}` : "/ops/monitoring",
        context: {
          parentProposalId: item?.context?.parentProposalId ?? null,
          recoveryLane: item?.context?.recoveryLane ?? null,
          observedCount: item?.context?.observedCount ?? 0,
          orderId: orderIdForJourney(item.targetId),
        },
      });
    });

  fulfillmentRecommendations
    .filter((item) => item.ruleId === "fulfillment-observation-followup")
    .forEach((item) => {
      intents.push({
        kind: "fulfillment_followup_review",
        severity: item.severity ?? "warning",
        title: "Fulfillment follow-up still needs support review",
        detail: item.reason || "Fulfillment remained stalled after the previous recovery step and needs a support or ops follow-up.",
        target: { type: "journey", id: item.targetId },
        targetPath: item?.context?.parentProposalId ? `/ops/proposals/${item.context.parentProposalId}` : "/ops/monitoring",
        context: {
          parentProposalId: item?.context?.parentProposalId ?? null,
          recoveryLane: item?.context?.recoveryLane ?? null,
          processingCount: item?.context?.processingCount ?? 0,
          orderId: orderIdForJourney(item.targetId),
        },
      });
    });

  if (refundResults24h && refundResults24h.backlog >= 2) {
    intents.push({
      kind: "refund_backlog_review",
      severity: refundResults24h.backlog >= 4 ? "critical" : "warning",
      title: "Refund backlog needs support review",
      detail: `Recent refund requests are outpacing completed refunds. Backlog ${refundResults24h.backlog} requires manual follow-up.`,
      target: { type: "journey", id: "refund_backlog" },
      targetPath: "/ops/monitoring",
      context: {
        requested: refundResults24h.requested,
        refunded: refundResults24h.refunded,
        backlog: refundResults24h.backlog,
        orderId: orderIdForJourney("refund_requested"),
        topTargets: Array.isArray(refundResults24h.topTargets?.refund_requested) ? refundResults24h.topTargets.refund_requested.slice(0, 3) : [],
      },
    });
  }

  return intents;
}

function summarizeAiConcierge(events) {
  const aiEvents = Array.isArray(events) ? events : [];
  const stageCounts = {
    entryViews: 0,
    entryClicks: 0,
    quizViews: 0,
    resultsViews: 0,
    resultClicks: 0,
    attributedProductViews: 0,
    attributedAddToCart: 0,
    attributedPurchases: 0,
  };
  const buckets = { A: 0, B: 0, unknown: 0 };

  aiEvents.forEach((event) => {
    const stage = String(event?.metadata?.stage || "");
    const bucket = String(event?.metadata?.bucket || "unknown");
    if (bucket === "A" || bucket === "B") buckets[bucket] += 1;
    else buckets.unknown += 1;

    if (stage === "entry_view") stageCounts.entryViews += 1;
    else if (stage === "entry_click") stageCounts.entryClicks += 1;
    else if (stage === "quiz_view") stageCounts.quizViews += 1;
    else if (stage === "results_view") stageCounts.resultsViews += 1;
    else if (stage === "result_click") stageCounts.resultClicks += 1;

    const attributionSrc = event?.metadata?.attribution?.src;
    if (attributionSrc === "ai_concierge") {
      if (event.eventType === "view" && stage === "product_view") stageCounts.attributedProductViews += 1;
      if (event.eventType === "add_to_cart") stageCounts.attributedAddToCart += 1;
      if (event.eventType === "purchase") stageCounts.attributedPurchases += 1;
    }
  });

  const entryCtr = stageCounts.entryViews > 0 ? stageCounts.entryClicks / stageCounts.entryViews : 0;
  const resultCtr = stageCounts.resultsViews > 0 ? stageCounts.resultClicks / stageCounts.resultsViews : 0;
  const atcRate =
    stageCounts.attributedProductViews > 0 ? stageCounts.attributedAddToCart / stageCounts.attributedProductViews : 0;
  const purchaseRateFromAtc =
    stageCounts.attributedAddToCart > 0 ? stageCounts.attributedPurchases / stageCounts.attributedAddToCart : 0;
  const purchaseRateFromView =
    stageCounts.attributedProductViews > 0 ? stageCounts.attributedPurchases / stageCounts.attributedProductViews : 0;
  return {
    events24h: aiEvents.length,
    buckets,
    funnel: {
      ...stageCounts,
      entryCtr,
      resultCtr,
      atcRate,
      purchaseRateFromAtc,
      purchaseRateFromView,
    },
  };
}

function buildAiConciergeGovernanceSummary(proposals) {
  const items = Array.isArray(proposals) ? proposals : [];
  const followups = items.filter((p) => p?.context?.source === "ai-concierge-followup");
  const mains = items.filter((p) => p?.context?.source !== "ai-concierge-followup");

  const followupFixCi = followups.filter((p) => p?.followupExecution?.state === "repo_ci_failed");
  const followupManualReview = followups.filter((p) =>
    ["repo_draft", "repo_review", "repo_pending_pr", "pending_repo_change", "repo_ci_running"].includes(String(p?.followupExecution?.state || "")),
  );
  const followupObserving = followups.filter(
    (p) => p?.followupExecution?.state === "repo_merged" && p?.reviewSummary?.state === "observe",
  );
  const followupSuccess = followups.filter(
    (p) => p?.followupExecution?.state === "repo_merged" && p?.reviewSummary?.state === "success",
  );
  const followupRisk = followups.filter(
    (p) => p?.followupExecution?.state === "repo_merged" && p?.reviewSummary?.state === "risk",
  );

  const mainNeedsDecision = mains.filter((p) => ["draft", "approved"].includes(String(p?.status || "")));
  const mainAppliedRisk = mains.filter((p) => p?.status === "applied" && p?.reviewSummary?.state === "risk");
  const mainAppliedObserving = mains.filter(
    (p) => p?.status === "applied" && ["observe", "steady"].includes(String(p?.reviewSummary?.state || "")),
  );

  const pick = (arr, limit = 3) =>
    arr
      .slice()
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        status: p.status,
        headline: p.reviewSummary?.headline ?? p.ruleMeta?.description ?? p.ruleId ?? "proposal",
        state: p.reviewSummary?.state ?? null,
        signals: Array.isArray(p.reviewSummary?.signals) ? p.reviewSummary.signals.slice(0, 4) : [],
        postApplyEffect: p.postApplyEffect ?? null,
        prUrl: p.followupExecution?.prUrl ?? null,
        nextStep: p.followupExecution?.recommendedNextStep?.label ?? null,
      }));

  return {
    key: "ai_concierge",
    title: "AI concierge",
    description: "主策略、风险修正、观察窗口的统一治理摘要。",
    counts: {
      mainNeedsDecision: mainNeedsDecision.length,
      mainAppliedObserving: mainAppliedObserving.length,
      mainAppliedRisk: mainAppliedRisk.length,
      followupFixCi: followupFixCi.length,
      followupManualReview: followupManualReview.length,
      followupObserving: followupObserving.length,
      followupSuccess: followupSuccess.length,
      followupRisk: followupRisk.length,
    },
    top: {
      followupFixCi: pick(followupFixCi),
      followupManualReview: pick(followupManualReview),
      followupObserving: pick(followupObserving),
    },
  };
}

function buildCommerceGovernanceSummary({ recommendations, proposals }) {
  const recs = Array.isArray(recommendations) ? recommendations : [];
  const items = Array.isArray(proposals) ? proposals : [];

  const mainNeedsDecision = recs.filter((item) => item.ruleId === "checkout-completion-dropoff");
  const followupRisk = recs.filter((item) => item.ruleId === "checkout-completion-observation-followup");
  const observing = items.filter(
    (item) => item.status === "applied" && ["observe", "steady", "success"].includes(String(item?.reviewSummary?.state || "")),
  );

  const describePath = (ctx) => {
    const path = ctx?.weakestPath ?? ctx?.targetBreakdown?.[0] ?? null;
    return path ? path.targetPath || `${path.targetType}:${path.targetId}` : null;
  };

  const pickRecommendations = (arr, limit = 3) =>
    arr
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        status: item.status,
        source: item.targetId,
        path: describePath(item.context),
        headline: item.reason,
        nextStep: Array.isArray(item?.context?.actionHints) && item.context.actionHints[0] ? item.context.actionHints[0] : null,
      }));

  const pickProposals = (arr, limit = 3) =>
    arr
      .slice()
      .sort((a, b) => String(b.appliedAt || b.createdAt || "").localeCompare(String(a.appliedAt || a.createdAt || "")))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        status: item.status,
        source: item.targetId,
        path: describePath(item.context),
        headline: item.reviewSummary?.headline ?? item.summary ?? "commerce journey proposal",
        state: item.reviewSummary?.state ?? null,
        signals: Array.isArray(item.reviewSummary?.signals) ? item.reviewSummary.signals.slice(0, 4) : [],
        postApplyEffect: item.postApplyEffect ?? null,
        nextStep: item.reviewSummary?.recommendation ?? null,
      }));

  return {
    key: "commerce_checkout",
    title: "Commerce checkout",
    description: "来源与 source-path 级别的 checkout 掉队治理摘要。",
    counts: {
      mainNeedsDecision: mainNeedsDecision.length,
      observing: observing.length,
      followupRisk: followupRisk.length,
      recovered: items.filter((item) => item.status === "applied" && item?.reviewSummary?.state === "success").length,
    },
    top: {
      mainNeedsDecision: pickRecommendations(mainNeedsDecision),
      observing: pickProposals(observing),
      followupRisk: pickRecommendations(followupRisk),
    },
  };
}

function buildPaymentGovernanceSummary({ recommendations, proposals }) {
  const recs = Array.isArray(recommendations) ? recommendations : [];
  const items = Array.isArray(proposals) ? proposals : [];

  const mainNeedsDecision = recs.filter((item) => item.ruleId === "payment-result-issue");
  const followupRisk = recs.filter((item) => item.ruleId === "payment-observation-followup");
  const observing = items.filter(
    (item) => item.status === "applied" && ["observe", "steady"].includes(String(item?.reviewSummary?.state || "")),
  );
  const recovered = items.filter((item) => item.status === "applied" && item?.reviewSummary?.state === "success");

  const describePath = (ctx) => {
    const path = ctx?.weakestPath ?? ctx?.targetBreakdown?.[0] ?? null;
    return path ? `${path.targetType}:${path.targetId}` : null;
  };

  const pickRecommendations = (arr, limit = 3) =>
    arr
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        status: item.status,
        source: item.targetId,
        path: describePath(item.context),
        headline: item.reason,
        nextStep: Array.isArray(item?.context?.actionHints) && item.context.actionHints[0] ? item.context.actionHints[0] : null,
      }));

  const pickProposals = (arr, limit = 3) =>
    arr
      .slice()
      .sort((a, b) => String(b.appliedAt || b.createdAt || "").localeCompare(String(a.appliedAt || a.createdAt || "")))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        status: item.status,
        source: item.targetId,
        path: describePath(item.context),
        headline: item.reviewSummary?.headline ?? item.summary ?? "payment recovery proposal",
        state: item.reviewSummary?.state ?? null,
        signals: Array.isArray(item.reviewSummary?.signals) ? item.reviewSummary.signals.slice(0, 4) : [],
        postApplyEffect: item.postApplyEffect ?? null,
        nextStep: item.reviewSummary?.recommendation ?? null,
      }));

  return {
    key: "payment_recovery",
    title: "Payment recovery",
    description: "支付失败、取消、额外确认与 post-apply 观察结果的治理摘要。",
    counts: {
      mainNeedsDecision: mainNeedsDecision.length,
      observing: observing.length,
      followupRisk: followupRisk.length,
      recovered: recovered.length,
    },
    top: {
      mainNeedsDecision: pickRecommendations(mainNeedsDecision),
      observing: pickProposals(observing),
      followupRisk: pickRecommendations(followupRisk),
    },
  };
}

function buildGovernanceGroups({ aiConciergeGovernance, commerceGovernance, paymentGovernance }) {
  const groups = [aiConciergeGovernance, commerceGovernance, paymentGovernance].filter(Boolean);
  return groups.map((group) => ({
    key: group.key,
    title: group.title,
    description: group.description,
    counts: group.counts,
    top: group.top,
  }));
}

function targetKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

function deriveGovernanceAction({
  governanceStatus,
  verificationLevel,
  incidentProposalStatus,
  repoChangeStatus,
  repoChangeNextStepCode,
  rollbackTriggerReason,
}) {
  if (repoChangeNextStepCode === "ready_auto_merge") {
    return {
      actionCode: "wait_merge",
      actionLabel: "等待合并",
      actionTone: "progress",
      actionDetail: "修复 PR 已通过当前门控，等待合并或自动合并。",
    };
  }
  if (repoChangeNextStepCode === "auto_revert_ready") {
    return {
      actionCode: "revert_now",
      actionLabel: "立即回退",
      actionTone: "critical",
      actionDetail: "当前 repo change 已满足回退条件，应优先处理回退。",
    };
  }
  if (repoChangeNextStepCode === "wait_ci" || repoChangeNextStepCode === "wait_ci_start") {
    return {
      actionCode: "wait_ci",
      actionLabel: "等待 CI",
      actionTone: "progress",
      actionDetail: "修复已经进入 repo change 流程，先等待 CI / workflow 结果。",
    };
  }
  if (repoChangeNextStepCode === "blocked_auto_merge_policy" || repoChangeNextStepCode === "blocked_revert_policy") {
    return {
      actionCode: "hold_publish",
      actionLabel: "暂停发布",
      actionTone: "warning",
      actionDetail: "当前动作被策略门控拦住，先处理策略或人工确认，再继续发布。",
    };
  }
  if (repoChangeNextStepCode === "ready_for_review") {
    return {
      actionCode: "review_now",
      actionLabel: "立即审核",
      actionTone: "ready",
      actionDetail: "修复项已经准备好，优先进入 review。",
    };
  }
  if (incidentProposalStatus === "draft") {
    return {
      actionCode: "review_now",
      actionLabel: "立即审核",
      actionTone: "ready",
      actionDetail: "incident follow-up proposal 已生成，先审核 proposal 再决定是否推进修复。",
    };
  }
  if (incidentProposalStatus === "approved") {
    return {
      actionCode: "prepare_fix",
      actionLabel: "推进修复",
      actionTone: "ready",
      actionDetail: "proposal 已批准，进入修复执行和后续发布准备。",
    };
  }
  if (governanceStatus === "repair_draft_ready" || governanceStatus === "warning_followup_ready") {
    return {
      actionCode: "prepare_fix",
      actionLabel: "推进修复",
      actionTone: "ready",
      actionDetail: "已有可用修复 draft，优先检查并继续推进。",
    };
  }
  if (governanceStatus === "warning_threshold_escalated") {
    return {
      actionCode: "hold_publish",
      actionLabel: "暂停发布",
      actionTone: "warning",
      actionDetail: "warning 已升级为阈值问题，先停发并处理根因。",
    };
  }
  if (governanceStatus === "blocked_needs_manual_fix" || verificationLevel === "blocked") {
    return {
      actionCode: "prepare_fix",
      actionLabel: "推进修复",
      actionTone: "critical",
      actionDetail: "当前发布被 blocked，必须先修复问题后再发布。",
    };
  }
  if (governanceStatus === "rollback_completed" || rollbackTriggerReason === "verification-warning-threshold") {
    return {
      actionCode: "hold_publish",
      actionLabel: "暂停发布",
      actionTone: "warning",
      actionDetail: "已发生回退，先确认根因和修复方案，不要立即重发。",
    };
  }
  if (verificationLevel === "warning" || governanceStatus === "observe_warning") {
    return {
      actionCode: "safe_to_republish",
      actionLabel: "观察后再发",
      actionTone: "progress",
      actionDetail: "当前属于 warning，允许观察，但下一次发布前应确认问题已收敛。",
    };
  }
  return {
    actionCode: "investigate",
    actionLabel: "继续排查",
    actionTone: "warning",
    actionDetail: "先查看 audit、target 和依赖状态，再决定下一步。",
  };
}

function governanceActionPriority(item) {
  const priorityMap = {
    revert_now: 100,
    prepare_fix: item => (item.actionTone === "critical" ? 95 : 85),
    review_now: 80,
    hold_publish: 70,
    wait_ci: 50,
    wait_merge: 45,
    safe_to_republish: 35,
    investigate: 20,
  };
  const resolver = priorityMap[item.actionCode];
  return typeof resolver === "function" ? resolver(item) : resolver ?? 10;
}

function deriveGovernanceState(item) {
  if (item.actionCode === "review_now") {
    return {
      stateCode: "review_now",
      stateLabel: "需要立即审核",
      stateTone: "ready",
    };
  }
  if (item.actionCode === "prepare_fix" || item.actionCode === "revert_now") {
    return {
      stateCode: "fix_now",
      stateLabel: "需要立即处理",
      stateTone: item.actionCode === "revert_now" ? "critical" : item.actionTone,
    };
  }
  if (item.actionCode === "hold_publish") {
    return {
      stateCode: "hold_publish",
      stateLabel: "暂停发布中",
      stateTone: "warning",
    };
  }
  if (item.actionCode === "wait_ci" || item.actionCode === "wait_merge") {
    return {
      stateCode: "waiting",
      stateLabel: "等待外部结果",
      stateTone: "progress",
    };
  }
  if (item.actionCode === "safe_to_republish") {
    return {
      stateCode: "safe_to_republish",
      stateLabel: "可观察后重发",
      stateTone: "progress",
    };
  }
  return {
    stateCode: "investigate",
    stateLabel: "继续排查",
    stateTone: "warning",
  };
}

function buildPublishingQueue(cases) {
  const items = [...cases]
    .map((item) => ({
      ...item,
      priorityScore: governanceActionPriority(item),
      ...deriveGovernanceState(item),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore || String(b.eventAt || "").localeCompare(String(a.eventAt || "")));

  const counts = items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.actionCode] = (acc[item.actionCode] || 0) + 1;
      acc[item.stateCode] = (acc[item.stateCode] || 0) + 1;
      return acc;
    },
    { total: 0 },
  );

  return {
    items,
    counts,
    top: items.slice(0, 6),
  };
}

function buildPublishingGovernanceCases({ recentEvents, verificationFollowups, incidentProposals }) {
  const casesByKey = new Map();
  const verificationByTarget = new Map(
    verificationFollowups.map((item) => [targetKey(item.targetType, item.targetId), item]),
  );
  const incidentByTarget = new Map(
    incidentProposals.map((item) => [targetKey(item.targetType, item.targetId), item]),
  );
  const repoChanges = listRepoChanges({}).filter((item) => item.kind === "incident_followup");
  const repoChangeByProposalId = new Map(repoChanges.filter((item) => item.proposalId).map((item) => [item.proposalId, item]));

  recentEvents
    .filter(
      (event) =>
        (event.action === "publish" && ["warning", "blocked"].includes(String(event?.verification?.level || ""))) ||
        event.action === "rollback",
    )
    .forEach((event) => {
      const key = targetKey(event.target?.type, event.target?.id);
      if (!event.target?.type || !event.target?.id || casesByKey.has(key)) return;
      const verificationFollowup = verificationByTarget.get(key) ?? null;
      const incidentProposal = incidentByTarget.get(key) ?? null;
      const repoChange = incidentProposal?.id ? repoChangeByProposalId.get(incidentProposal.id) ?? null : null;
      const publishLevel = String(event?.verification?.level || "");
      let governanceStatus = "investigate";
      let nextAction = "Inspect audit trail and target details before the next publish.";
      if (event.action === "rollback") {
        if (incidentProposal?.status === "approved") {
          governanceStatus = "repair_approved";
          nextAction = "Apply the approved incident follow-up change and only republish after verification passes.";
        } else if (incidentProposal?.status === "draft") {
          governanceStatus = "repair_proposal_draft";
          nextAction = "Review the incident follow-up proposal and linked repair draft before republishing.";
        } else {
          governanceStatus = "rollback_completed";
          nextAction = "Inspect the rollback reason and prepare a repair draft before the next publish.";
        }
      } else if (publishLevel === "blocked") {
        if (verificationFollowup?.preparedDraft?.draftId) {
          governanceStatus = "repair_draft_ready";
          nextAction = "Open the prepared verification follow-up draft, fix the issue, then republish after review.";
        } else {
          governanceStatus = "blocked_needs_manual_fix";
          nextAction = "Create or update a repair draft, resolve blocked verification issues, then republish.";
        }
      } else if (publishLevel === "warning") {
        if (incidentProposal?.anomalyKind === "warning_threshold") {
          governanceStatus = "warning_threshold_escalated";
          nextAction = "Treat repeated warnings as a repair task now; do not keep republishing until the root cause is fixed.";
        } else if (verificationFollowup?.preparedDraft?.draftId) {
          governanceStatus = "warning_followup_ready";
          nextAction = "Review the prepared follow-up draft and decide whether to republish or keep observing.";
        } else {
          governanceStatus = "observe_warning";
          nextAction = "Inspect verification warnings and watch the next publish closely.";
        }
      }
      const governanceAction = deriveGovernanceAction({
        governanceStatus,
        verificationLevel: publishLevel || null,
        incidentProposalStatus: incidentProposal?.status ?? null,
        repoChangeStatus: repoChange?.status ?? null,
        repoChangeNextStepCode: repoChange?.recommendedNextStep?.code ?? null,
        rollbackTriggerReason: event.action === "rollback" ? event.triggerReason ?? null : null,
      });

      casesByKey.set(key, {
        targetType: event.target.type,
        targetId: event.target.id,
        action: event.action,
        eventAt: event.at,
        verificationLevel: publishLevel || null,
        rollbackTrigger: event.action === "rollback" ? event.trigger ?? null : null,
        rollbackTriggerReason: event.action === "rollback" ? event.triggerReason ?? null : null,
        note: event.note ?? null,
        governanceStatus,
        nextAction,
        linkedDraftId: verificationFollowup?.preparedDraft?.draftId ?? incidentProposal?.linkedDraftId ?? null,
        linkedRecommendationId: verificationFollowup?.id ?? incidentProposal?.linkedRecommendationId ?? null,
        incidentProposalId: incidentProposal?.id ?? null,
        incidentProposalStatus: incidentProposal?.status ?? null,
        repoChangeId: repoChange?.id ?? incidentProposal?.repoChangeId ?? null,
        repoChangeStatus: repoChange?.status ?? null,
        repoChangePrUrl: repoChange?.prUrl ?? null,
        repoChangeNextStepCode: repoChange?.recommendedNextStep?.code ?? null,
        repoChangeNextStepLabel: repoChange?.recommendedNextStep?.label ?? null,
        actionCode: governanceAction.actionCode,
        actionLabel: governanceAction.actionLabel,
        actionTone: governanceAction.actionTone,
        actionDetail: governanceAction.actionDetail,
      });
    });

  return Array.from(casesByKey.values()).sort((a, b) => String(b.eventAt || "").localeCompare(String(a.eventAt || "")));
}

function normalizeBaseUrl(url) {
  return typeof url === "string" && url.trim() ? url.replace(/\/$/, "") : null;
}

async function probeJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);
  try {
    const res = await fetch(url, {
      method: "GET",
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.headers || {}),
      },
    });
    return {
      ok: res.ok,
      statusCode: res.status,
      statusText: res.statusText,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      statusText: error instanceof Error ? error.message : "probe_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeDependencies() {
  const medusaBaseUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_MEDUSA_URL || process.env.MEDUSA_BACKEND_URL);
  const medusaPublishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || null;
  const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || null;
  const sanityDataset = process.env.NEXT_PUBLIC_SANITY_DATASET || null;
  const sanityToken = process.env.SANITY_API_TOKEN || null;

  const medusa = medusaBaseUrl
    ? await probeJson(`${medusaBaseUrl}/store/products?limit=1`, {
        headers: medusaPublishableKey ? { "x-publishable-api-key": medusaPublishableKey } : {},
      })
    : null;

  const sanity =
    sanityProjectId && sanityDataset
      ? await probeJson(
          `https://${sanityProjectId}.api.sanity.io/v2021-06-07/data/query/${sanityDataset}?query=*%5B0%5D`,
          {
            headers: sanityToken ? { authorization: `Bearer ${sanityToken}` } : {},
          },
        )
      : null;

  return {
    medusa: medusaBaseUrl
      ? {
          status: medusa?.ok ? "healthy" : "degraded",
          baseUrl: medusaBaseUrl,
          statusCode: medusa?.statusCode ?? null,
          detail: medusa?.ok ? "store api reachable" : medusa?.statusText || "store api probe failed",
        }
      : {
          status: "not_configured",
          baseUrl: null,
          statusCode: null,
          detail: "NEXT_PUBLIC_MEDUSA_URL / MEDUSA_BACKEND_URL not configured",
        },
    sanity:
      sanityProjectId && sanityDataset
        ? {
            status: sanity?.ok ? "healthy" : "degraded",
            projectId: sanityProjectId,
            dataset: sanityDataset,
            statusCode: sanity?.statusCode ?? null,
            detail: sanity?.ok ? "content api reachable" : sanity?.statusText || "content api probe failed",
          }
        : {
            status: "not_configured",
            projectId: sanityProjectId,
            dataset: sanityDataset,
            statusCode: null,
            detail: "NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET not configured",
          },
  };
}

function publishingAlertLevel({ warningPublishes24h, blockedPublishes24h, rollbacks24h, blockedVerificationFollowups, warningVerificationFollowups, thresholds }) {
  if (blockedPublishes24h >= thresholds.blockedPublishes24h.critical) return "critical";
  if (rollbacks24h >= thresholds.rollbacks24h.critical) return "critical";
  if (blockedVerificationFollowups >= thresholds.blockedFollowupsOpen.critical) return "critical";
  if (
    warningPublishes24h >= thresholds.warningPublishes24h.critical ||
    warningVerificationFollowups >= thresholds.warningFollowupsOpen.critical
  ) {
    return "critical";
  }
  if (
    warningPublishes24h >= thresholds.warningPublishes24h.warning ||
    warningVerificationFollowups >= thresholds.warningFollowupsOpen.warning
  ) {
    return "warning";
  }
  return null;
}

function buildSeoRuntimeJudgment({ seoSyncHealth, seoFreshness, seoImportDiagnostics } = {}) {
  const issues = [];
  const latestImport = seoImportDiagnostics?.latestRun ?? null;

  if (seoSyncHealth?.health === "degraded") {
    issues.push({
      severity: 3,
      focusArea: "sync",
      headline: "SEO runtime is degraded by Search Console sync failures",
      detail: seoSyncHealth.detail,
      actionHint: "Check the latest Search Console sync error, fix the upstream issue, then retry the sync.",
    });
  } else if (["warning", "paused", "not_configured"].includes(String(seoSyncHealth?.health || ""))) {
    issues.push({
      severity: 2,
      focusArea: "sync",
      headline:
        seoSyncHealth?.health === "paused"
          ? "SEO runtime is waiting on a paused Search Console sync"
          : seoSyncHealth?.health === "not_configured"
            ? "SEO runtime needs Search Console sync configuration"
            : "SEO runtime needs Search Console sync attention",
      detail: seoSyncHealth?.detail || "Search Console sync needs attention.",
      actionHint:
        seoSyncHealth?.recoveryHint ||
        (seoSyncHealth?.health === "paused"
          ? "Resume automation or run a manual retry when you are ready to continue SEO ingestion."
          : seoSyncHealth?.health === "not_configured"
            ? "Add the missing Search Console credentials and site settings before relying on automated SEO monitoring."
            : "Review the sync runtime, clear backoff if needed, and confirm the next successful import."),
    });
  }

  if (seoFreshness?.status === "critical") {
    issues.push({
      severity: 3,
      focusArea: "freshness",
      headline: "SEO runtime is degraded by stale metrics",
      detail:
        seoFreshness.daysSinceLatest == null
          ? "SEO metrics do not have a recent successful import."
          : `Latest SEO metrics are ${seoFreshness.daysSinceLatest} day(s) old${seoFreshness.latestDate ? `, last dated ${seoFreshness.latestDate}` : ""}.`,
      actionHint: "Restore a successful SEO sync before acting on SEO recommendations that depend on fresh metrics.",
    });
  } else if (["warning", "not_configured"].includes(String(seoFreshness?.status || ""))) {
    issues.push({
      severity: 2,
      focusArea: "freshness",
      headline:
        seoFreshness?.status === "not_configured"
          ? "SEO runtime is missing metrics freshness coverage"
          : "SEO metrics freshness needs attention",
      detail:
        seoFreshness?.status === "not_configured"
          ? "No recent SEO metrics are available yet, so freshness checks cannot confirm current data coverage."
          : `Latest SEO metrics are ${seoFreshness?.daysSinceLatest ?? "n/a"} day(s) old${seoFreshness?.latestDate ? `, last dated ${seoFreshness.latestDate}` : ""}.`,
      actionHint: "Run or repair the next SEO sync so freshness returns to a healthy window.",
    });
  }

  if (latestImport?.status === "warning") {
    issues.push({
      severity: 2,
      focusArea: "import_gap",
      headline: "SEO runtime still has unmapped import gaps",
      detail: `Latest SEO import still has ${latestImport.activeUnmappedPages ?? 0} active unmapped page(s).`,
      actionHint: "Review unmapped pages, register the missing targets, then replay or rerun the import.",
    });
  } else if (latestImport?.status === "partial") {
    issues.push({
      severity: 1,
      focusArea: "import_gap",
      headline: "SEO runtime has minor import mapping gaps",
      detail: `Latest SEO import has ${latestImport.activeUnmappedPages ?? 0} active unmapped page(s) and ${latestImport.resolvedUnmappedPages ?? 0} page(s) waiting for refreshed data.`,
      actionHint: "Tidy the remaining unmapped pages before they accumulate into a larger import gap.",
    });
  }

  const highestSeverity = issues.reduce((max, item) => Math.max(max, item.severity), 0);
  if (highestSeverity === 0) {
    return {
      health: "healthy",
      headline: "SEO runtime is healthy",
      detail: `Freshness is healthy${seoFreshness?.latestDate ? `, latest metrics dated ${seoFreshness.latestDate}` : ""}; Search Console sync is healthy; no active import gap needs immediate attention.`,
      focusArea: "healthy",
      actionHint: "Keep the current sync cadence and monitor for new SEO anomalies rather than runtime drift.",
    };
  }

  const topIssues = issues.filter((item) => item.severity === highestSeverity);
  if (topIssues.length === 1) {
    const primary = topIssues[0];
    return {
      health: highestSeverity >= 3 ? "degraded" : "warning",
      headline: primary.headline,
      detail: primary.detail,
      focusArea: primary.focusArea,
      actionHint: primary.actionHint,
    };
  }

  return {
    health: highestSeverity >= 3 ? "degraded" : "warning",
    headline: "SEO runtime needs attention across multiple signals",
    detail: topIssues
      .slice(0, 2)
      .map((item) => item.detail)
      .join(" "),
    focusArea: "combined",
    actionHint: "Start with Search Console sync health and freshness, then clean up import gaps before relying on SEO recommendations.",
  };
}

function buildSeoSyncHistorySummary({ seoSyncStatus } = {}) {
  const runs = Array.isArray(seoSyncStatus?.recentRuns) ? seoSyncStatus.recentRuns.slice(0, 12) : [];
  const statusCounts = runs.reduce(
    (acc, run) => {
      if (run?.status === "success") acc.success += 1;
      else if (run?.status === "failure") acc.failure += 1;
      else if (run?.status === "skipped") acc.skipped += 1;
      return acc;
    },
    { success: 0, failure: 0, skipped: 0 },
  );
  const latestSuccessRun = runs.find((run) => run?.status === "success") || null;
  const latestFailureRun = runs.find((run) => run?.status === "failure") || null;
  const latestSkippedRun = runs.find((run) => run?.status === "skipped") || null;
  const failureRuns = runs.filter((run) => run?.status === "failure");
  const firstFailureInCurrentStreak =
    seoSyncStatus?.consecutiveFailures > 0
      ? failureRuns[Math.min(failureRuns.length - 1, Math.max(0, seoSyncStatus.consecutiveFailures - 1))] || latestFailureRun
      : null;

  let comparison = null;
  if (latestSuccessRun || latestFailureRun) {
    comparison = {
      latestSuccessAt: latestSuccessRun?.at ?? null,
      latestFailureAt: latestFailureRun?.at ?? null,
      latestSuccessRows: latestSuccessRun
        ? {
            fetched: latestSuccessRun.fetchedRows ?? 0,
            ingested: latestSuccessRun.ingestedRows ?? 0,
          }
        : null,
      latestFailure:
        latestFailureRun != null
          ? {
              category: latestFailureRun.errorCategory ?? "unknown",
              code: latestFailureRun.errorCode ?? "unknown",
              retryable: latestFailureRun.errorRetryable ?? null,
            }
          : null,
      changedSinceLastSuccess:
        Boolean(latestSuccessRun?.at && latestFailureRun?.at) &&
        Date.parse(String(latestFailureRun.at || "")) > Date.parse(String(latestSuccessRun.at || "")),
    };
  }

  return {
    totalRunsTracked: runs.length,
    statusCounts,
    latestSuccessRun,
    latestFailureRun,
    latestSkippedRun,
    firstFailureInCurrentStreak,
    comparison,
    recentRuns: runs,
  };
}

function mapSeoSyncControlAction(action) {
  if (action === "seo_metrics_sync_search_console_retry_now") return "retry_now";
  if (action === "seo_metrics_sync_search_console_pause") return "pause";
  if (action === "seo_metrics_sync_search_console_resume") return "resume";
  if (action === "seo_metrics_sync_search_console_clear_backoff") return "clear_backoff";
  return null;
}

function assessSeoSyncIntervention({ action, postRuns } = {}) {
  const runs = Array.isArray(postRuns) ? postRuns : [];
  if (action === "pause") {
    return {
      status: "paused_intentionally",
      label: "paused intentionally",
      detail: "Automation was paused on purpose, so no recovery judgment is needed yet.",
    };
  }
  if (!runs.length) {
    return {
      status: "pending_evidence",
      label: "pending evidence",
      detail: "No sync run has been recorded after this manual action yet.",
    };
  }
  const firstMeaningfulRun = runs.find((run) => run?.status === "success" || run?.status === "failure") || null;
  if (!firstMeaningfulRun) {
    return {
      status: "pending_evidence",
      label: "pending evidence",
      detail: "Only skipped runs have been recorded after this action, so the recovery result is still unclear.",
    };
  }
  if (firstMeaningfulRun.status === "failure") {
    return {
      status: "still_failing",
      label: "still failing",
      detail: `The first sync run after this action still failed${firstMeaningfulRun.errorCategory ? ` with ${firstMeaningfulRun.errorCategory}` : ""}.`,
    };
  }
  const laterFailure = runs.find((run) => run?.status === "failure");
  if (laterFailure) {
    return {
      status: "regressed",
      label: "regressed",
      detail: `A sync run succeeded after this action, but a later run failed again${laterFailure.errorCategory ? ` with ${laterFailure.errorCategory}` : ""}.`,
    };
  }
  return {
    status: "recovered",
    label: "recovered",
    detail: `The first sync run after this action succeeded${firstMeaningfulRun.ingestedRows ? ` and ingested ${firstMeaningfulRun.ingestedRows} row(s)` : ""}.`,
  };
}

function buildSeoSyncControlAudit({ events, seoSyncHistory } = {}) {
  const runs = Array.isArray(seoSyncHistory?.recentRuns) ? seoSyncHistory.recentRuns : [];
  const controlEvents = (Array.isArray(events) ? events : [])
    .filter((event) => mapSeoSyncControlAction(String(event?.action || "")))
    .slice(0, 8)
    .map((event) => {
      const action = mapSeoSyncControlAction(String(event?.action || ""));
      const eventTs = Date.parse(String(event?.at || ""));
      const postRuns = Number.isFinite(eventTs)
        ? runs
            .filter((run) => {
              const runTs = Date.parse(String(run?.at || ""));
              return Number.isFinite(runTs) && runTs >= eventTs;
            })
            .sort((a, b) => Date.parse(String(a?.at || "")) - Date.parse(String(b?.at || "")))
        : [];
      const nextRun = postRuns[0] || null;
      const assessment = assessSeoSyncIntervention({
        action,
        postRuns: postRuns.slice(0, 3),
      });
      return {
        at: event?.at ?? null,
        actor: event?.actor ?? null,
        action,
        note: event?.note ?? null,
        assessment,
        nextRun:
          nextRun != null
            ? {
                at: nextRun.at ?? null,
                status: nextRun.status ?? null,
                errorCategory: nextRun.errorCategory ?? null,
                errorCode: nextRun.errorCode ?? null,
                retryable: nextRun.errorRetryable ?? null,
                reason: nextRun.reason ?? null,
                ingestedRows: nextRun.ingestedRows ?? 0,
              }
            : null,
      };
    });

  const actionCounts = controlEvents.reduce(
    (acc, item) => {
      if (!item?.action) return acc;
      acc[item.action] = (acc[item.action] || 0) + 1;
      return acc;
    },
    { retry_now: 0, pause: 0, resume: 0, clear_backoff: 0 },
  );

  const latestRecoveryAction =
    controlEvents.find((item) => ["retry_now", "resume", "clear_backoff"].includes(String(item?.action || ""))) || null;

  return {
    totalActionsTracked: controlEvents.length,
    actionCounts,
    latestAction: controlEvents[0] || null,
    latestRecoveryAction,
    recentActions: controlEvents,
  };
}

function buildSeoSyncRecoveryReview({ seoSyncControlAudit } = {}) {
  const latest = seoSyncControlAudit?.latestRecoveryAction ?? null;
  if (!latest) {
    return {
      status: "not_applicable",
      label: "no manual recovery yet",
      detail: "No recovery-oriented manual intervention has been recorded yet.",
      latestAction: null,
    };
  }
  return {
    status: latest.assessment?.status || "pending_evidence",
    label: latest.assessment?.label || "pending evidence",
    detail: latest.assessment?.detail || "Recovery result is still being evaluated.",
    latestAction: {
      at: latest.at ?? null,
      actor: latest.actor ?? null,
      action: latest.action ?? null,
      nextRun: latest.nextRun ?? null,
    },
  };
}

function buildResultGovernanceRuntimeJudgment({ paymentResults24h, fulfillmentResults24h, refundResults24h, workflowSnapshot } = {}) {
  const payment = paymentResults24h && typeof paymentResults24h === "object" ? paymentResults24h : {};
  const fulfillment = fulfillmentResults24h && typeof fulfillmentResults24h === "object" ? fulfillmentResults24h : {};
  const refund = refundResults24h && typeof refundResults24h === "object" ? refundResults24h : {};

  const lanes = workflowSnapshot?.lanes && typeof workflowSnapshot.lanes === "object" ? workflowSnapshot.lanes : {};
  const paymentLane = lanes.payment ?? null;
  const fulfillmentLane = lanes.fulfillment ?? null;
  const refundLane = lanes.refund ?? null;

  const paymentIssues = Number(payment.issues ?? (Number(payment.failed ?? 0) + Number(payment.canceled ?? 0) + Number(payment.requiresAction ?? 0)));
  const paymentIssueRate = Number(payment.issueRate ?? 0);
  const fulfillmentProcessing = Number(fulfillment.processing ?? 0);
  const fulfillmentShipped = Number(fulfillment.shipped ?? 0);
  const fulfillmentDelivered = Number(fulfillment.delivered ?? 0);
  const refundBacklog = Number(refund.backlog ?? Math.max(0, Number(refund.requested ?? 0) - Number(refund.refunded ?? 0)));

  const paymentOpenRecs = Array.isArray(paymentLane?.recommendations) ? paymentLane.recommendations.length : 0;
  const paymentOpenProposals = Array.isArray(paymentLane?.proposals) ? paymentLane.proposals.length : 0;
  const paymentObservationFollowups = Array.isArray(paymentLane?.observationFollowupCandidates) ? paymentLane.observationFollowupCandidates.length : 0;

  const fulfillmentOpenRecs = Array.isArray(fulfillmentLane?.recommendations) ? fulfillmentLane.recommendations.length : 0;
  const fulfillmentOpenProposals = Array.isArray(fulfillmentLane?.proposals) ? fulfillmentLane.proposals.length : 0;
  const fulfillmentObservationFollowups = Array.isArray(fulfillmentLane?.observationFollowupCandidates)
    ? fulfillmentLane.observationFollowupCandidates.length
    : 0;

  const refundOpenRecs = Array.isArray(refundLane?.recommendations) ? refundLane.recommendations.length : 0;

  const issues = [];

  if (paymentIssues >= 6 || paymentIssueRate >= 0.25) {
    issues.push({
      severity: 3,
      focusArea: "payment",
      headline: "Payment result governance is degraded",
      detail: `24h payment issues ${paymentIssues} · issue rate ${(paymentIssueRate * 100).toFixed(1)}%.`,
      actionHint:
        paymentObservationFollowups > 0
          ? "Review payment observation follow-up recommendations and decide the next recovery step."
          : paymentOpenProposals > 0
            ? "Review and apply the payment follow-up proposals, then monitor the next payment window."
            : paymentOpenRecs > 0
              ? "Approve and apply a payment recovery proposal for the dominant issue, then observe the next window."
              : "Inspect payment events and provider outcomes; start a recovery proposal if the issue persists.",
    });
  } else if (paymentIssues >= 3) {
    issues.push({
      severity: 2,
      focusArea: "payment",
      headline: "Payment results need attention",
      detail: `24h payment issues ${paymentIssues} · issue rate ${(paymentIssueRate * 100).toFixed(1)}%.`,
      actionHint:
        paymentOpenRecs > 0
          ? "Review payment issue recommendations and promote the main one into a proposal."
          : "Monitor payment outcomes and confirm whether the issue keeps accumulating.",
    });
  }

  if (fulfillmentProcessing >= 6 && fulfillmentShipped + fulfillmentDelivered === 0) {
    issues.push({
      severity: 3,
      focusArea: "fulfillment",
      headline: "Fulfillment backlog governance is degraded",
      detail: `24h processing ${fulfillmentProcessing} · shipped ${fulfillmentShipped} · delivered ${fulfillmentDelivered}.`,
      actionHint:
        fulfillmentObservationFollowups > 0
          ? "Review fulfillment observation follow-up recommendations and coordinate the next ops action."
          : fulfillmentOpenProposals > 0
            ? "Review and apply the fulfillment follow-up proposals, then re-check the next 24h fulfillment window."
            : fulfillmentOpenRecs > 0
              ? "Approve a fulfillment backlog proposal and coordinate fulfillment operations before backlog grows further."
              : "Inspect fulfillment processing events and confirm whether warehouse/shipping handoff is stalled.",
    });
  } else if (fulfillmentProcessing >= 3 && fulfillmentShipped + fulfillmentDelivered === 0) {
    issues.push({
      severity: 2,
      focusArea: "fulfillment",
      headline: "Fulfillment backlog needs attention",
      detail: `24h processing ${fulfillmentProcessing} · shipped ${fulfillmentShipped} · delivered ${fulfillmentDelivered}.`,
      actionHint:
        fulfillmentOpenRecs > 0
          ? "Review fulfillment backlog recommendations and promote the main one into a proposal."
          : "Monitor fulfillment processing counts and confirm whether shipments resume.",
    });
  }

  if (refundBacklog >= 6) {
    issues.push({
      severity: 3,
      focusArea: "refund",
      headline: "Refund backlog governance is degraded",
      detail: `24h refund backlog ${refundBacklog}.`,
      actionHint: refundOpenRecs > 0 ? "Review refund-related recommendations and confirm whether an ops proposal is needed." : "Inspect refund queues and address the backlog before it grows.",
    });
  } else if (refundBacklog >= 3) {
    issues.push({
      severity: 2,
      focusArea: "refund",
      headline: "Refund backlog needs attention",
      detail: `24h refund backlog ${refundBacklog}.`,
      actionHint: "Monitor refund throughput and confirm the backlog clears within the next window.",
    });
  }

  if (!issues.length) {
    return {
      health: "healthy",
      headline: "Result governance runtime is healthy",
      detail: "Payment, fulfillment, and refund lanes are within expected ranges for the current 24h window.",
      focusArea: "healthy",
      actionHint: "Keep monitoring, and only promote new anomalies into proposals when they persist across windows.",
    };
  }

  const maxSeverity = issues.reduce((max, item) => Math.max(max, item.severity), 0);
  const top = issues.filter((item) => item.severity === maxSeverity);
  if (top.length === 1) {
    return {
      health: maxSeverity >= 3 ? "degraded" : "warning",
      headline: top[0].headline,
      detail: top[0].detail,
      focusArea: top[0].focusArea,
      actionHint: top[0].actionHint,
    };
  }

  return {
    health: maxSeverity >= 3 ? "degraded" : "warning",
    headline: "Result governance runtime needs attention across multiple lanes",
    detail: top
      .slice(0, 2)
      .map((item) => item.detail)
      .join(" "),
    focusArea: "combined",
    actionHint: "Start with payment and fulfillment issues that are accumulating, then ensure refund backlog stays controlled.",
  };
}

function buildResultGovernanceLaneSummary({ paymentResults24h, fulfillmentResults24h, refundResults24h, workflowSnapshot } = {}) {
  const payment = paymentResults24h && typeof paymentResults24h === "object" ? paymentResults24h : {};
  const fulfillment = fulfillmentResults24h && typeof fulfillmentResults24h === "object" ? fulfillmentResults24h : {};
  const refund = refundResults24h && typeof refundResults24h === "object" ? refundResults24h : {};

  const lanes = workflowSnapshot?.lanes && typeof workflowSnapshot.lanes === "object" ? workflowSnapshot.lanes : {};
  const paymentLane = lanes.payment ?? null;
  const fulfillmentLane = lanes.fulfillment ?? null;
  const refundLane = lanes.refund ?? null;

  const paymentIssues = Number(payment.issues ?? (Number(payment.failed ?? 0) + Number(payment.canceled ?? 0) + Number(payment.requiresAction ?? 0)));
  const paymentIssueRate = Number(payment.issueRate ?? 0);
  const fulfillmentProcessing = Number(fulfillment.processing ?? 0);
  const fulfillmentShipped = Number(fulfillment.shipped ?? 0);
  const fulfillmentDelivered = Number(fulfillment.delivered ?? 0);
  const refundBacklog = Number(refund.backlog ?? Math.max(0, Number(refund.requested ?? 0) - Number(refund.refunded ?? 0)));

  const paymentCounts = {
    recommendations: Array.isArray(paymentLane?.recommendations) ? paymentLane.recommendations.length : 0,
    proposals: Array.isArray(paymentLane?.proposals) ? paymentLane.proposals.length : 0,
    observationFollowups: Array.isArray(paymentLane?.observationFollowupCandidates) ? paymentLane.observationFollowupCandidates.length : 0,
  };
  const fulfillmentCounts = {
    recommendations: Array.isArray(fulfillmentLane?.recommendations) ? fulfillmentLane.recommendations.length : 0,
    proposals: Array.isArray(fulfillmentLane?.proposals) ? fulfillmentLane.proposals.length : 0,
    observationFollowups: Array.isArray(fulfillmentLane?.observationFollowupCandidates)
      ? fulfillmentLane.observationFollowupCandidates.length
      : 0,
  };
  const refundCounts = {
    recommendations: Array.isArray(refundLane?.recommendations) ? refundLane.recommendations.length : 0,
    proposals: Array.isArray(refundLane?.proposals) ? refundLane.proposals.length : 0,
    observationFollowups: Array.isArray(refundLane?.observationFollowupCandidates) ? refundLane.observationFollowupCandidates.length : 0,
  };

  const paymentHealth = paymentIssues >= 6 || paymentIssueRate >= 0.25 ? "degraded" : paymentIssues >= 3 ? "warning" : "healthy";
  const fulfillmentHealth =
    fulfillmentProcessing >= 6 && fulfillmentShipped + fulfillmentDelivered === 0
      ? "degraded"
      : fulfillmentProcessing >= 3 && fulfillmentShipped + fulfillmentDelivered === 0
        ? "warning"
        : "healthy";
  const refundHealth = refundBacklog >= 6 ? "degraded" : refundBacklog >= 3 ? "warning" : "healthy";

  const paymentLaneSummary = {
    key: "payment",
    title: "Payment",
    health: paymentHealth,
    headline: paymentHealth === "healthy" ? "Payment lane is healthy" : paymentHealth === "degraded" ? "Payment lane is degraded" : "Payment lane needs attention",
    detail: `24h issues ${paymentIssues} · issue rate ${(paymentIssueRate * 100).toFixed(1)}%.`,
    counts: paymentCounts,
    actionHint:
      paymentCounts.observationFollowups > 0
        ? "Review payment observation follow-ups and decide the next recovery step."
        : paymentCounts.proposals > 0
          ? "Review and apply the payment follow-up proposals."
          : paymentCounts.recommendations > 0
            ? "Promote the dominant payment issue recommendation into a proposal."
            : "Monitor payment outcomes and confirm whether issues persist.",
    actionPath: "/ops/support-cases?status=open&q=payment",
    actionLabel:
      paymentCounts.observationFollowups > 0 || paymentCounts.proposals > 0 || paymentCounts.recommendations > 0
        ? "Open payment queue"
        : "Open payment cases",
  };
  const fulfillmentLaneSummary = {
    key: "fulfillment",
    title: "Fulfillment",
    health: fulfillmentHealth,
    headline:
      fulfillmentHealth === "healthy"
        ? "Fulfillment lane is healthy"
        : fulfillmentHealth === "degraded"
          ? "Fulfillment lane is degraded"
          : "Fulfillment lane needs attention",
    detail: `24h processing ${fulfillmentProcessing} · shipped ${fulfillmentShipped} · delivered ${fulfillmentDelivered}.`,
    counts: fulfillmentCounts,
    actionHint:
      fulfillmentCounts.observationFollowups > 0
        ? "Review fulfillment observation follow-ups and coordinate the next ops action."
        : fulfillmentCounts.proposals > 0
          ? "Review and apply the fulfillment follow-up proposals."
          : fulfillmentCounts.recommendations > 0
            ? "Promote the main fulfillment backlog recommendation into a proposal."
            : "Monitor fulfillment processing and confirm shipments resume.",
    actionPath: "/ops/support-cases?status=open&q=fulfillment",
    actionLabel:
      fulfillmentCounts.observationFollowups > 0 || fulfillmentCounts.proposals > 0 || fulfillmentCounts.recommendations > 0
        ? "Open fulfillment queue"
        : "Open fulfillment cases",
  };
  const refundLaneSummary = {
    key: "refund",
    title: "Refund",
    health: refundHealth,
    headline: refundHealth === "healthy" ? "Refund lane is healthy" : refundHealth === "degraded" ? "Refund lane is degraded" : "Refund lane needs attention",
    detail: `24h backlog ${refundBacklog} · requested ${Number(refund.requested ?? 0)} · refunded ${Number(refund.refunded ?? 0)}.`,
    counts: refundCounts,
    actionHint:
      refundCounts.recommendations > 0
        ? "Review refund-related recommendations and decide whether an ops proposal is needed."
        : refundBacklog >= 3
          ? "Monitor refund throughput and ensure the backlog clears."
          : "Keep monitoring refund flow; no action needed.",
    actionPath: "/ops/support-cases?status=open&q=refund",
    actionLabel: refundCounts.recommendations > 0 || refundBacklog >= 3 ? "Open refund queue" : "Open refund cases",
  };

  const laneList = [paymentLaneSummary, fulfillmentLaneSummary, refundLaneSummary];
  const totals = laneList.reduce(
    (acc, lane) => {
      acc.recommendations += lane.counts.recommendations;
      acc.proposals += lane.counts.proposals;
      acc.observationFollowups += lane.counts.observationFollowups;
      return acc;
    },
    { recommendations: 0, proposals: 0, observationFollowups: 0 },
  );
  return { lanes: laneList, totals };
}

function buildCommerceHealthSummary({ commerceCheckout, weakCheckoutSources, commerceGovernance } = {}) {
  const checkout = commerceCheckout && typeof commerceCheckout === "object" ? commerceCheckout : {};
  const weakSources = Array.isArray(weakCheckoutSources) ? weakCheckoutSources : [];
  const governance = commerceGovernance && typeof commerceGovernance === "object" ? commerceGovernance : {};
  const starts = Number(checkout.checkoutStarts ?? 0);
  const completes = Number(checkout.checkoutCompletes ?? 0);
  const completionRate = Number(checkout.checkoutCompletionRate ?? 0);
  const weakest = weakSources[0] ?? checkout.bySource?.[0] ?? null;
  const mainNeedsDecision = Number(governance.counts?.mainNeedsDecision ?? 0);
  const followupRisk = Number(governance.counts?.followupRisk ?? 0);
  const observing = Number(governance.counts?.observing ?? 0);

  if (starts === 0) {
    return {
      health: "healthy",
      label: "no recent signal",
      detail: "No checkout starts were recorded in the current 24h window.",
      actionHint: "Wait for fresh commerce traffic before judging checkout health.",
      weakestSource: null,
    };
  }

  if ((starts >= 6 && completionRate < 0.35) || followupRisk >= 2) {
    return {
      health: "degraded",
      label: "checkout degraded",
      detail: `24h completion ${(completionRate * 100).toFixed(1)}% from ${starts} starts and ${completes} completes${weakest?.source ? ` · weakest source ${weakest.source}` : ""}.`,
      actionHint:
        followupRisk > 0
          ? "Review commerce observation follow-up recommendations first, then confirm whether the weakest source keeps regressing."
          : mainNeedsDecision > 0
            ? "Promote the weakest checkout source recommendation into a proposal and watch the next window."
            : "Inspect the weakest checkout source and identify where dropoff is accumulating.",
      weakestSource: weakest?.source ?? null,
    };
  }

  if ((starts >= 3 && completionRate < 0.5) || mainNeedsDecision > 0 || followupRisk > 0) {
    return {
      health: "warning",
      label: "checkout needs attention",
      detail: `24h completion ${(completionRate * 100).toFixed(1)}% from ${starts} starts and ${completes} completes${weakest?.source ? ` · weakest source ${weakest.source}` : ""}.`,
      actionHint:
        mainNeedsDecision > 0
          ? "Review the open commerce recommendation for the weakest source and decide whether to apply a proposal."
          : followupRisk > 0
            ? "Check the commerce follow-up risk items and confirm whether the recent fix is holding."
            : "Monitor weak checkout sources and confirm whether completion improves in the next window.",
      weakestSource: weakest?.source ?? null,
    };
  }

  return {
    health: "healthy",
    label: observing > 0 ? "observing checkout recovery" : "checkout healthy",
    detail: `24h completion ${(completionRate * 100).toFixed(1)}% from ${starts} starts and ${completes} completes.`,
    actionHint:
      observing > 0
        ? "Keep observing recently applied commerce changes before declaring the journey fully recovered."
        : "Keep monitoring top checkout sources and only intervene when completion drops again.",
    weakestSource: weakest?.source ?? null,
  };
}

function buildCommerceRuntimeJudgment({ commerceCheckout, weakCheckoutSources, commerceGovernance, commerceHealthSummary } = {}) {
  const checkout = commerceCheckout && typeof commerceCheckout === "object" ? commerceCheckout : {};
  const weakSources = Array.isArray(weakCheckoutSources) ? weakCheckoutSources : [];
  const governance = commerceGovernance && typeof commerceGovernance === "object" ? commerceGovernance : {};
  const healthSummary = commerceHealthSummary && typeof commerceHealthSummary === "object" ? commerceHealthSummary : {};
  const weakest = weakSources[0] ?? checkout.bySource?.[0] ?? null;
  const mainNeedsDecision = Number(governance.counts?.mainNeedsDecision ?? 0);
  const followupRisk = Number(governance.counts?.followupRisk ?? 0);
  const observing = Number(governance.counts?.observing ?? 0);

  if (healthSummary.health === "degraded") {
    return {
      health: "degraded",
      headline: "Commerce checkout runtime is degraded",
      detail:
        weakSources.length > 1
          ? `Multiple sources are underperforming. Weakest source ${weakest?.source ?? "n/a"} is dragging completion down.`
          : `Checkout completion is weak${weakest?.source ? `, led by source ${weakest.source}` : ""}.`,
      focusArea: weakest?.source ?? "checkout",
      actionHint: String(healthSummary.actionHint || "Investigate the weakest checkout source and apply the next commerce fix."),
    };
  }

  if (healthSummary.health === "warning") {
    return {
      health: "warning",
      headline: followupRisk > 0 ? "Commerce journey follow-up is still risky" : "Commerce checkout needs attention",
      detail:
        followupRisk > 0
          ? "A recently applied commerce change is still showing risk in the current observation window."
          : `Checkout completion is below the preferred range${weakest?.source ? `, especially for source ${weakest.source}` : ""}.`,
      focusArea: weakest?.source ?? "checkout",
      actionHint:
        followupRisk > 0
          ? "Start with the commerce follow-up risk items, then verify whether the weakest source still needs a fresh proposal."
          : String(healthSummary.actionHint || "Review the weakest source recommendation and decide the next journey fix."),
    };
  }

  return {
    health: "healthy",
    headline: observing > 0 ? "Commerce checkout is stable and under observation" : "Commerce checkout runtime is healthy",
    detail:
      observing > 0
        ? "Recently applied commerce changes are in observation and current checkout signals remain within range."
        : "Checkout sources and completion are within the expected range for the current 24h window.",
    focusArea: weakest?.source ?? "healthy",
    actionHint: String(healthSummary.actionHint || "Keep monitoring checkout sources and only intervene when a source weakens again."),
  };
}

function buildCommerceSourceSummary({ commerceCheckout, commerceRecommendations, commerceProposals } = {}) {
  const checkout = commerceCheckout && typeof commerceCheckout === "object" ? commerceCheckout : {};
  const bySource = Array.isArray(checkout.bySource) ? checkout.bySource : [];
  const recommendations = Array.isArray(commerceRecommendations) ? commerceRecommendations : [];
  const proposals = Array.isArray(commerceProposals) ? commerceProposals : [];

  const sourceItems = bySource
    .slice()
    .sort((a, b) => {
      const rateDelta = Number(a?.checkoutCompletionRate ?? 0) - Number(b?.checkoutCompletionRate ?? 0);
      if (rateDelta !== 0) return rateDelta;
      return Number(b?.checkoutStarts ?? 0) - Number(a?.checkoutStarts ?? 0);
    })
    .slice(0, 6)
    .map((item) => {
      const source = String(item?.source || "unknown");
      const openRecommendations = recommendations.filter((rec) => String(rec?.context?.sourceKey || rec?.targetId || "") === source);
      const followupRecommendations = openRecommendations.filter((rec) => rec?.ruleId === "checkout-completion-observation-followup");
      const openProposals = proposals.filter((proposal) => String(proposal?.targetId || "") === source);
      const starts = Number(item?.checkoutStarts ?? 0);
      const completes = Number(item?.checkoutCompletes ?? 0);
      const dropoff = Number(item?.checkoutDropoff ?? 0);
      const completionRate = Number(item?.checkoutCompletionRate ?? 0);
      const purchases24h = Number(item?.purchases24h ?? 0);

      const health =
        (starts >= 6 && completionRate < 0.35) || followupRecommendations.length >= 1
          ? "degraded"
          : (starts >= 3 && completionRate < 0.5) || openRecommendations.length >= 1 || openProposals.length >= 1
            ? "warning"
            : "healthy";

      return {
        key: source,
        source,
        health,
        headline:
          health === "healthy"
            ? `${source} is stable`
            : health === "degraded"
              ? `${source} is dragging checkout completion`
              : `${source} needs attention`,
        detail: `starts ${starts} · completes ${completes} · dropoff ${dropoff} · completion ${(completionRate * 100).toFixed(1)}% · purchases ${purchases24h}`,
        counts: {
          recommendations: openRecommendations.length,
          proposals: openProposals.length,
          followupRisk: followupRecommendations.length,
        },
        actionHint:
          followupRecommendations.length > 0
            ? "Review follow-up risk items for this source before declaring the recent fix successful."
            : openProposals.length > 0
              ? "Review the active commerce proposal for this source and confirm whether it should be applied or observed."
              : openRecommendations.length > 0
                ? "Review the weak-source recommendation and decide whether to promote it into a proposal."
                : "Keep monitoring this source unless completion drops further.",
        actionPath: `/ops?status=open,in_progress&q=${encodeURIComponent(source)}`,
        actionLabel:
          followupRecommendations.length > 0
            ? "Open follow-up items"
            : openProposals.length > 0
              ? "Open source proposals"
              : openRecommendations.length > 0
                ? "Open source recommendations"
                : "Open source view",
      };
    });

  const totals = sourceItems.reduce(
    (acc, item) => {
      acc.recommendations += item.counts.recommendations;
      acc.proposals += item.counts.proposals;
      acc.followupRisk += item.counts.followupRisk;
      return acc;
    },
    { recommendations: 0, proposals: 0, followupRisk: 0 },
  );

  return {
    sources: sourceItems,
    totals,
  };
}

function buildTopLevelGovernanceOverview({
  seoRuntimeJudgment,
  seoSyncRecoveryReview,
  resultGovernanceRuntimeJudgment,
  resultGovernanceLaneSummary,
  commerceRuntimeJudgment,
  commerceHealthSummary,
  commerceSourceSummary,
} = {}) {
  const rank = (health) => {
    if (health === "degraded") return 3;
    if (health === "warning") return 2;
    return 1;
  };

  const seoLine = {
    key: "seo",
    title: "SEO",
    health: seoRuntimeJudgment?.health ?? "healthy",
    headline: seoRuntimeJudgment?.headline ?? "SEO runtime is healthy",
    detail: seoRuntimeJudgment?.detail ?? "SEO monitoring is within the expected range.",
    actionHint:
      seoRuntimeJudgment?.actionHint ??
      (seoSyncRecoveryReview?.status && seoSyncRecoveryReview.status !== "not_applicable"
        ? seoSyncRecoveryReview.detail
        : "Keep monitoring Search Console sync and freshness."),
    actionPath: "/ops/audit/seo-sync",
    actionLabel: "Open SEO audit",
    supportingCount:
      Number(seoSyncRecoveryReview?.status && ["still_failing", "regressed"].includes(seoSyncRecoveryReview.status) ? 1 : 0),
  };

  const resultLine = {
    key: "result_governance",
    title: "Result governance",
    health: resultGovernanceRuntimeJudgment?.health ?? "healthy",
    headline: resultGovernanceRuntimeJudgment?.headline ?? "Result governance is healthy",
    detail: resultGovernanceRuntimeJudgment?.detail ?? "Payment, fulfillment, and refund lanes are stable.",
    actionHint: resultGovernanceRuntimeJudgment?.actionHint ?? "Keep monitoring payment, fulfillment, and refund lanes.",
    actionPath: "/ops/audit/result-governance",
    actionLabel: "Open governance audit",
    supportingCount: Number(resultGovernanceLaneSummary?.totals?.observationFollowups ?? 0) + Number(resultGovernanceLaneSummary?.totals?.proposals ?? 0),
  };

  const commerceLine = {
    key: "commerce",
    title: "Commerce",
    health: commerceRuntimeJudgment?.health ?? "healthy",
    headline: commerceRuntimeJudgment?.headline ?? "Commerce runtime is healthy",
    detail: commerceRuntimeJudgment?.detail ?? commerceHealthSummary?.detail ?? "Checkout sources are within range.",
    actionHint: commerceRuntimeJudgment?.actionHint ?? commerceHealthSummary?.actionHint ?? "Keep monitoring checkout sources.",
    actionPath: "/ops/audit/commerce",
    actionLabel: "Open commerce audit",
    supportingCount: Number(commerceSourceSummary?.totals?.followupRisk ?? 0) + Number(commerceSourceSummary?.totals?.proposals ?? 0),
  };

  const lines = [seoLine, resultLine, commerceLine];
  const primaryLine = lines
    .slice()
    .sort((a, b) => {
      const healthDelta = rank(b.health) - rank(a.health);
      if (healthDelta !== 0) return healthDelta;
      return Number(b.supportingCount ?? 0) - Number(a.supportingCount ?? 0);
    })[0];

  const overviewHealth = primaryLine?.health ?? "healthy";
  if (overviewHealth === "healthy") {
    return {
      health: "healthy",
      headline: "Top-level governance is healthy",
      detail: "SEO, result governance, and commerce are all within the expected range right now.",
      primaryLine: primaryLine?.key ?? "seo",
      actionHint: "Start with routine monitoring and only drill into a line when its local judgment weakens.",
      lines,
    };
  }

  return {
    health: overviewHealth,
    headline:
      overviewHealth === "degraded"
        ? `${primaryLine.title} needs attention first`
        : `${primaryLine.title} should be reviewed first`,
    detail: `${primaryLine.headline}. ${primaryLine.detail}`,
    primaryLine: primaryLine.key,
    actionHint: primaryLine.actionHint,
    lines,
  };
}

function buildGrowthLoopOverview({
  seoPerformance,
  seoRuntimeJudgment,
  commerceCheckout,
  commerceRuntimeJudgment,
  commerceSourceSummary,
  purchase,
  governanceOverview,
} = {}) {
  const targets = Array.isArray(seoPerformance?.targets) ? seoPerformance.targets : [];
  const seoTrackedTargets = targets.length;
  const seoLowCtrCount = targets.filter((t) => Number(t?.summary?.current?.impressions ?? 0) >= 80 && Number(t?.summary?.current?.ctr ?? 0) < 0.02).length;
  const seoPositionDropCount = targets.filter((t) => Number(t?.summary?.delta?.position ?? 0) > 3 && Number(t?.summary?.current?.impressions ?? 0) >= 50).length;

  const starts = Number(commerceCheckout?.checkoutStarts ?? 0);
  const completes = Number(commerceCheckout?.checkoutCompletes ?? 0);
  const purchases24h = Number(commerceCheckout?.purchases24h ?? 0);
  const completionRate = Number(commerceCheckout?.checkoutCompletionRate ?? 0);
  const weakSources = Array.isArray(commerceSourceSummary?.sources)
    ? commerceSourceSummary.sources.filter((item) => item.health !== "healthy").length
    : 0;

  const purchaseMisaligned = Number(purchase?.misalignedTargetsCount ?? 0);

  let health = "healthy";
  let headline = "Growth loop looks healthy";
  let detail = `SEO visibility, commerce conversion, and purchase reconciliation are within the expected range.`;
  let actionHint = "Keep monitoring cross-line changes and only intervene when visibility, conversion, or reconciliation weakens together.";

  if (
    String(governanceOverview?.health || "healthy") === "degraded" ||
    (seoLowCtrCount >= 3 && weakSources >= 1) ||
    (completionRate < 0.35 && starts >= 6) ||
    purchaseMisaligned >= 3
  ) {
    health = "degraded";
    headline = "Growth loop needs attention";
    detail = `Visibility → conversion → result signals are not lining up cleanly right now. SEO weak targets ${seoLowCtrCount}, weak commerce sources ${weakSources}, purchase gaps ${purchaseMisaligned}.`;
    actionHint =
      weakSources > 0
        ? "Start with the weakest commerce source, then confirm whether SEO/content signals are sending qualified traffic into checkout."
        : purchaseMisaligned > 0
          ? "Start with purchase reconciliation gaps and confirm whether conversion improvements are turning into real purchases."
          : "Start with the top SEO/runtime issue, then verify whether commerce conversion recovers after traffic quality improves.";
  } else if (
    String(governanceOverview?.health || "healthy") === "warning" ||
    seoLowCtrCount > 0 ||
    weakSources > 0 ||
    purchaseMisaligned > 0
  ) {
    health = "warning";
    headline = "Growth loop should be reviewed";
    detail = `Some parts of the traffic → conversion → purchase chain are soft. SEO weak targets ${seoLowCtrCount}, weak commerce sources ${weakSources}, purchase gaps ${purchaseMisaligned}.`;
    actionHint =
      weakSources > 0
        ? "Review the weakest source first and confirm whether recent content or funnel changes are helping checkout completion."
        : purchaseMisaligned > 0
          ? "Review purchase gaps and make sure conversion changes are reflected in the purchase snapshots."
          : "Review SEO weak targets and confirm whether search visibility improvements are feeding healthier conversion sources.";
  }

  return {
    health,
    headline,
    detail,
    actionHint,
    metrics: {
      seoTrackedTargets,
      seoLowCtrCount,
      seoPositionDropCount,
      checkoutStarts: starts,
      checkoutCompletes: completes,
      purchases24h,
      weakSources,
      purchaseMisalignedTargets: purchaseMisaligned,
    },
    lines: [
      {
        key: "traffic",
        title: "Traffic",
        status: seoRuntimeJudgment?.health ?? "healthy",
        detail: `tracked SEO targets ${seoTrackedTargets} · low CTR ${seoLowCtrCount} · position drops ${seoPositionDropCount}`,
      },
      {
        key: "conversion",
        title: "Conversion",
        status: commerceRuntimeJudgment?.health ?? "healthy",
        detail: `checkout starts ${starts} · completes ${completes} · completion ${(completionRate * 100).toFixed(1)}% · weak sources ${weakSources}`,
      },
      {
        key: "result",
        title: "Result",
        status: purchaseMisaligned >= 3 ? "degraded" : purchaseMisaligned > 0 ? "warning" : "healthy",
        detail: `purchases 24h ${purchases24h} · reconciliation gaps ${purchaseMisaligned}`,
      },
    ],
  };
}

function buildGeoOverview({ seoPerformance, seoRuntimeJudgment, aiConcierge, aiConciergeGovernance } = {}) {
  const targets = Array.isArray(seoPerformance?.targets) ? seoPerformance.targets : [];
  const seoTrackedTargets = targets.length;
  const seoLowCtrCount = targets.filter((t) => Number(t?.summary?.current?.impressions ?? 0) >= 80 && Number(t?.summary?.current?.ctr ?? 0) < 0.02).length;
  const seoPositionDropCount = targets.filter((t) => Number(t?.summary?.delta?.position ?? 0) > 3 && Number(t?.summary?.current?.impressions ?? 0) >= 50).length;

  const funnel = aiConcierge?.funnel && typeof aiConcierge.funnel === "object" ? aiConcierge.funnel : {};
  const entryViews = Number(funnel.entryViews ?? 0);
  const entryCtr = Number(funnel.entryCtr ?? 0);
  const resultsViews = Number(funnel.resultsViews ?? 0);
  const resultCtr = Number(funnel.resultCtr ?? 0);
  const attributedProductViews = Number(funnel.attributedProductViews ?? 0);
  const attributedPurchases = Number(funnel.attributedPurchases ?? 0);
  const purchaseRateFromView = Number(funnel.purchaseRateFromView ?? 0);
  const governanceCounts = aiConciergeGovernance?.counts && typeof aiConciergeGovernance.counts === "object" ? aiConciergeGovernance.counts : {};
  const geoRiskItems =
    Number(governanceCounts.mainAppliedRisk ?? 0) +
    Number(governanceCounts.followupManualReview ?? 0) +
    Number(governanceCounts.followupFixCi ?? 0);

  let health = "healthy";
  let headline = "GEO signals are healthy";
  let detail = "Search discoverability and AI-assisted answer/commercial handoff are within the expected range.";
  let actionHint = "Keep monitoring discoverability, answer engagement, and AI-assisted purchase flow together.";

  if (
    (entryViews >= 50 && entryCtr < 0.05) ||
    (resultsViews >= 20 && resultCtr < 0.15) ||
    (attributedProductViews >= 50 && purchaseRateFromView < 0.01) ||
    geoRiskItems >= 2
  ) {
    health = "degraded";
    headline = "GEO layer needs attention";
    detail = `Discoverability or AI-assisted answer quality is not converting cleanly. entry CTR ${(entryCtr * 100).toFixed(1)}% · result CTR ${(resultCtr * 100).toFixed(1)}% · AI purchase/view ${(purchaseRateFromView * 100).toFixed(2)}% · risk items ${geoRiskItems}.`;
    actionHint =
      entryViews >= 50 && entryCtr < 0.05
        ? "Start with AI entry placement/copy, then verify whether stronger answer engagement improves assisted commerce."
        : resultsViews >= 20 && resultCtr < 0.15
          ? "Start with answer/result quality and ranking, then verify whether answer clicks improve product handoff."
          : attributedProductViews >= 50 && purchaseRateFromView < 0.01
            ? "Start with AI-assisted product handoff and checkout friction, then confirm purchases recover."
            : "Start with open AI concierge governance risks before pushing more GEO traffic into the funnel.";
  } else if (
    seoRuntimeJudgment?.health === "warning" ||
    seoLowCtrCount > 0 ||
    geoRiskItems > 0 ||
    (resultsViews > 0 && resultCtr < 0.2)
  ) {
    health = "warning";
    headline = "GEO signals should be reviewed";
    detail = `Some GEO inputs are soft. tracked SEO targets ${seoTrackedTargets} · low CTR ${seoLowCtrCount} · result CTR ${(resultCtr * 100).toFixed(1)}% · risk items ${geoRiskItems}.`;
    actionHint =
      seoLowCtrCount > 0
        ? "Review weak discoverability first, then confirm whether AI-assisted answer flow is receiving qualified traffic."
        : geoRiskItems > 0
          ? "Review AI concierge governance risks and confirm the latest GEO-facing change is holding."
          : "Monitor answer engagement and verify it keeps improving with current content/search visibility.";
  }

  return {
    health,
    headline,
    detail,
    actionHint,
    metrics: {
      seoTrackedTargets,
      seoLowCtrCount,
      seoPositionDropCount,
      entryViews,
      entryCtr,
      resultsViews,
      resultCtr,
      attributedProductViews,
      attributedPurchases,
      purchaseRateFromView,
      geoRiskItems,
    },
    lines: [
      {
        key: "discoverability",
        title: "Discoverability",
        status: seoRuntimeJudgment?.health ?? "healthy",
        detail: `tracked targets ${seoTrackedTargets} · low CTR ${seoLowCtrCount} · position drops ${seoPositionDropCount}`,
      },
      {
        key: "answer_quality",
        title: "Answer quality",
        status:
          (entryViews >= 50 && entryCtr < 0.05) || (resultsViews >= 20 && resultCtr < 0.15)
            ? "degraded"
            : (resultsViews > 0 && resultCtr < 0.2) || (entryViews > 0 && entryCtr < 0.08)
              ? "warning"
              : "healthy",
        detail: `entry views ${entryViews} · entry CTR ${(entryCtr * 100).toFixed(1)}% · results views ${resultsViews} · result CTR ${(resultCtr * 100).toFixed(1)}%`,
      },
      {
        key: "assisted_commerce",
        title: "Assisted commerce",
        status:
          (attributedProductViews >= 50 && purchaseRateFromView < 0.01) || geoRiskItems >= 2
            ? "degraded"
            : attributedProductViews > 0 && (purchaseRateFromView < 0.02 || geoRiskItems > 0)
              ? "warning"
              : "healthy",
        detail: `AI product views ${attributedProductViews} · purchases ${attributedPurchases} · purchase/view ${(purchaseRateFromView * 100).toFixed(2)}% · risks ${geoRiskItems}`,
      },
    ],
  };
}

function buildGrowthExperimentOverview({ governanceGroups } = {}) {
  const groups = Array.isArray(governanceGroups) ? governanceGroups : [];
  const rank = (status) => {
    if (status === "degraded") return 3;
    if (status === "warning") return 2;
    return 1;
  };

  const groupSummaries = groups.map((group) => {
    const counts = group?.counts && typeof group.counts === "object" ? group.counts : {};
    const needsDecision = Number(counts.mainNeedsDecision ?? 0);
    const observing = Number(counts.observing ?? counts.mainAppliedObserving ?? 0);
    const followupRisk = Number(counts.followupRisk ?? counts.mainAppliedRisk ?? 0);
    const recovered = Number(counts.recovered ?? counts.followupSuccess ?? 0);

    const status = followupRisk > 0 ? "degraded" : needsDecision > 0 || observing > 0 ? "warning" : "healthy";
    return {
      key: String(group?.key || "unknown"),
      title: String(group?.title || "Unknown"),
      status,
      counts: {
        needsDecision,
        observing,
        followupRisk,
        recovered,
      },
    };
  });

  const items = [];
  const formatPct = (value, digits = 1) => `${(Number(value || 0) * 100).toFixed(digits)}%`;
  const formatDeltaPts = (value, digits = 1) => `${Number(value || 0) >= 0 ? "+" : ""}${(Number(value || 0) * 100).toFixed(digits)}pts`;
  const buildEffectMetrics = (effect) => {
    if (!effect || typeof effect !== "object") return [];
    const mode = String(effect.mode || "");
    if (mode === "ai_concierge_followup_observation" || mode === "ai_concierge_funnel") {
      return [
        {
          key: "entry_ctr",
          label: "Δ entry CTR",
          value: formatDeltaPts(effect?.delta?.entryCtr, 1),
        },
        {
          key: "result_ctr",
          label: "Δ result CTR",
          value: formatDeltaPts(effect?.delta?.resultCtr, 1),
        },
        {
          key: "purchase_view",
          label: "Δ purchase/view",
          value: formatDeltaPts(effect?.delta?.purchaseRateFromView, 2),
        },
      ].filter((item) => item.value !== "+0.00pts");
    }
    if (mode === "commerce_checkout_source") {
      return [
        {
          key: "completion",
          label: "Δ completion",
          value: formatDeltaPts(effect?.delta?.checkoutCompletionRate, 1),
        },
        {
          key: "purchase_checkout",
          label: "Δ purchase/checkout",
          value: formatDeltaPts(effect?.delta?.purchaseRateFromCheckout, 2),
        },
        {
          key: "post_completion",
          label: "Post completion",
          value: formatPct(effect?.post?.funnel?.checkoutCompletionRate, 1),
        },
      ];
    }
    if (mode === "payment_issue_window") {
      return [
        {
          key: "issue_rate",
          label: "Δ issue rate",
          value: formatDeltaPts(effect?.delta?.targetedIssueRate, 1),
        },
        {
          key: "paid_rate",
          label: "Δ paid rate",
          value: formatDeltaPts(effect?.delta?.paidRate, 1),
        },
        {
          key: "post_issue_rate",
          label: "Post issue rate",
          value: formatPct(effect?.post?.funnel?.targetedIssueRate, 1),
        },
      ];
    }
    if (mode === "fulfillment_backlog_window") {
      return [
        {
          key: "backlog_rate",
          label: "Δ backlog",
          value: formatDeltaPts(effect?.delta?.processingBacklogRate, 1),
        },
        {
          key: "shipped_rate",
          label: "Δ shipped",
          value: formatDeltaPts(effect?.delta?.shippedRate, 1),
        },
        {
          key: "delivered_rate",
          label: "Δ delivered",
          value: formatDeltaPts(effect?.delta?.deliveredRate, 1),
        },
      ];
    }
    return [];
  };
  groups.forEach((group) => {
    const groupKey = String(group?.key || "unknown");
    const groupTitle = String(group?.title || "Unknown");
    const top = group?.top && typeof group.top === "object" ? group.top : {};
    const pushItems = (kind, list) => {
      if (!Array.isArray(list)) return;
      list.slice(0, 3).forEach((entry) => {
        const status = String(entry?.status || "");
        const isProposal = ["draft", "approved", "applied"].includes(status);
        const source = entry?.source ? String(entry.source) : "";
        let actionPath = "/ops?status=open,in_progress";
        let actionLabel = "Open queue";
        if (isProposal && entry?.id) {
          actionPath = `/ops/proposals/${entry.id}`;
          actionLabel = "Open proposal";
        } else if (groupKey === "commerce_checkout" && source) {
          actionPath = `/ops/audit/commerce?source=${encodeURIComponent(source)}`;
          actionLabel = "Open commerce audit";
        } else if (groupKey === "payment_recovery" && source) {
          actionPath = `/ops/audit/result-governance?lane=payment&q=${encodeURIComponent(source)}`;
          actionLabel = "Open governance audit";
        } else if (groupKey === "ai_concierge") {
          actionPath = source ? `/ops?status=open,in_progress&q=${encodeURIComponent(source)}` : "/ops/monitoring";
          actionLabel = source ? "Open queue" : "Open monitoring";
        } else if (source) {
          actionPath = `/ops?status=open,in_progress&q=${encodeURIComponent(source)}`;
          actionLabel = "Open queue";
        }
        const headline = String(entry?.headline || entry?.reason || entry?.summary || entry?.ruleId || "work item");
        const effectStateRaw = typeof entry?.state === "string" ? entry.state : null;
        const effectState =
          effectStateRaw && ["success", "risk", "observe", "steady", "failure"].includes(effectStateRaw) ? effectStateRaw : null;
        const rawSignals = Array.isArray(entry?.signals) ? entry.signals : [];
        const effectSignals = rawSignals
          .filter((s) => typeof s === "string" && (s.includes("delta") || s.includes("→")))
          .slice(0, 2);
        const effectSummary = effectSignals.length ? effectSignals.join(" | ") : null;
        const effectMetrics = buildEffectMetrics(entry?.postApplyEffect);
        items.push({
          groupKey,
          groupTitle,
          kind,
          id: entry?.id ?? null,
          headline,
          status: status || (isProposal ? "draft" : "open"),
          actionPath,
          actionLabel,
          targetType: isProposal
            ? "proposal"
            : groupKey === "commerce_checkout"
              ? "commerce_source"
              : groupKey === "payment_recovery"
                ? "result_governance_lane"
                : groupKey === "ai_concierge"
                  ? "ai_concierge_item"
                  : "queue_item",
          targetId: isProposal ? String(entry?.id || "") || null : source || String(entry?.id || "") || null,
          targetLabel: isProposal ? headline : source || headline,
          targetMeta: source ? { source } : null,
          automationArtifact:
            groupKey === "ai_concierge" && entry?.id
              ? {
                  kind: entry?.prUrl ? "draft_pr" : "proposal",
                  id: String(entry.id),
                  status: String(entry?.status || "draft"),
                  label: headline,
                  actionPath: `/ops/proposals/${entry.id}`,
                  actionLabel: entry?.prUrl ? "Open draft proposal" : "Open proposal",
                  repoChangeId: entry?.repoChangeId ? String(entry.repoChangeId) : entry?.followupExecution?.repoChangeId ? String(entry.followupExecution.repoChangeId) : null,
                  repoChangeStatus:
                    entry?.followupExecution?.state === "repo_ci_running"
                      ? "ci_running"
                      : entry?.followupExecution?.state === "repo_ci_failed"
                        ? "ci_failed"
                        : entry?.followupExecution?.state === "repo_review"
                          ? "merge_candidate"
                          : entry?.followupExecution?.state === "repo_merged"
                            ? "merged"
                            : entry?.followupExecution?.state === "repo_draft"
                              ? "merge_candidate"
                              : entry?.followupExecution?.state === "repo_pending_pr"
                                ? "draft"
                                : null,
                  repoNextStepCode: entry?.followupExecution?.recommendedNextStep?.code ?? null,
                  repoNextStepLabel: entry?.followupExecution?.recommendedNextStep?.label ?? null,
                }
              : null,
          effectState,
          effectSummary,
          effectMetrics,
        });
      });
    };

    pushItems("followup_risk", top.followupRisk);
    pushItems("needs_decision", top.mainNeedsDecision);
    pushItems("observing", top.observing);
  });

  const totals = groupSummaries.reduce(
    (acc, g) => {
      acc.needsDecision += g.counts.needsDecision;
      acc.observing += g.counts.observing;
      acc.followupRisk += g.counts.followupRisk;
      acc.recovered += g.counts.recovered;
      return acc;
    },
    { needsDecision: 0, observing: 0, followupRisk: 0, recovered: 0 },
  );

  const sortedGroups = groupSummaries
    .slice()
    .sort((a, b) => {
      const delta = rank(b.status) - rank(a.status);
      if (delta !== 0) return delta;
      return b.counts.followupRisk - a.counts.followupRisk || b.counts.needsDecision - a.counts.needsDecision;
    });
  const primary = sortedGroups[0] ?? null;

  const health = totals.followupRisk > 0 ? "degraded" : totals.needsDecision > 0 || totals.observing > 0 ? "warning" : "healthy";
  const headline =
    health === "healthy"
      ? "Experiment queue is clear"
      : health === "degraded"
        ? "Experiment follow-ups need attention"
        : "Experiment queue needs review";
  const detail = `needs decision ${totals.needsDecision} · observing ${totals.observing} · followup risk ${totals.followupRisk} · recovered ${totals.recovered}`;
  const actionHint =
    health === "healthy"
      ? "Keep monitoring; no pending experiment decisions right now."
      : primary
        ? `Start with ${primary.title}: resolve follow-up risk first, then decide the next proposal.`
        : "Start with follow-up risks first, then decide the next proposals.";

  return {
    health,
    headline,
    detail,
    actionHint,
    totals,
    groups: sortedGroups,
    items: items.slice(0, 9),
  };
}

function buildTodaysBestBet({
  governanceOverview,
  growthLoopOverview,
  geoOverview,
  growthExperimentOverview,
  commerceSourceSummary,
  commerceProposals,
} = {}) {
  const autoActionPolicy = getAutoActionPolicy();
  const rank = (health) => {
    if (health === "degraded") return 3;
    if (health === "warning") return 2;
    return 1;
  };

  const experimentItems = Array.isArray(growthExperimentOverview?.items) ? growthExperimentOverview.items : [];
  const prioritizedExperiment = experimentItems
    .slice()
    .sort((a, b) => {
      const aRisk = a.kind === "followup_risk" ? 3 : a.kind === "needs_decision" ? 2 : 1;
      const bRisk = b.kind === "followup_risk" ? 3 : b.kind === "needs_decision" ? 2 : 1;
      return bRisk - aRisk;
    })[0] ?? null;
  const prioritizedGeoItem = experimentItems
    .filter((item) => item.groupKey === "ai_concierge")
    .slice()
    .sort((a, b) => {
      const aRisk = a.kind === "followup_risk" ? 3 : a.kind === "needs_decision" ? 2 : 1;
      const bRisk = b.kind === "followup_risk" ? 3 : b.kind === "needs_decision" ? 2 : 1;
      return bRisk - aRisk;
    })[0] ?? null;
  const weakestCommerceSource = (Array.isArray(commerceSourceSummary?.sources) ? commerceSourceSummary.sources : [])
    .slice()
    .sort((a, b) => {
      const score = (item) => (item?.health === "degraded" ? 3 : item?.health === "warning" ? 2 : 1);
      return score(b) - score(a);
    })[0] ?? null;
  const buildCommerceProposalArtifact = (source) => {
    if (!source) return null;
    const proposals = Array.isArray(commerceProposals) ? commerceProposals : [];
    const match = proposals
      .filter((item) => String(item?.targetId || "") === String(source))
      .slice()
      .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")))[0];
    if (!match?.id) return null;
    return {
      kind: "proposal",
      id: String(match.id),
      status: String(match.status || "draft"),
      label: String(match.reviewSummary?.headline || match.summary || `Proposal for ${source}`),
      actionPath: `/ops/proposals/${match.id}`,
      actionLabel: "Open auto draft",
    };
  };
  const weakestCommerceProposalArtifact = buildCommerceProposalArtifact(weakestCommerceSource?.source ?? null);
  const governancePrimaryLine =
    Array.isArray(governanceOverview?.lines) && governanceOverview?.primaryLine
      ? governanceOverview.lines.find((line) => line.key === governanceOverview.primaryLine) ?? null
      : null;
  const weakestGrowthLoopLine = (Array.isArray(growthLoopOverview?.lines) ? growthLoopOverview.lines : [])
    .slice()
    .sort((a, b) => {
      const score = (item) => (item?.status === "degraded" ? 3 : item?.status === "warning" ? 2 : 1);
      return score(b) - score(a);
    })[0] ?? null;

  const buildAutomationEligibility = ({ source, targetType, targetId, targetMeta } = {}) => {
    const targetIdString = targetId == null ? "" : String(targetId);
    const targetTypeString = targetType == null ? "" : String(targetType);
    const meta = targetMeta && typeof targetMeta === "object" ? targetMeta : {};

    if (source === "governance" || targetTypeString === "audit_line" || targetTypeString === "result_governance_lane") {
      return {
        automationEligibility: "manual_only",
        automationReason: "This path can affect cross-line governance or recovery policy, so it should stay manual-first.",
      };
    }

    if (source === "growth_loop" && targetTypeString === "commerce_source") {
      return {
        automationEligibility: "auto_proposal_candidate",
        automationReason: `Weak source ${String(meta.source || targetIdString || "unknown")} is repetitive enough to auto-prepare a proposal candidate, but it should still be reviewed before apply.`,
      };
    }

    if (source === "geo" || targetTypeString === "ai_concierge_item") {
      return {
        automationEligibility: "auto_draft",
        automationReason:
          "AI concierge tuning already has a draft-oriented workflow, so the next safe step is auto-draft rather than direct apply.",
      };
    }

    if (source === "experiment" && targetTypeString === "proposal") {
      const repoPolicyEnabled = Boolean(autoActionPolicy?.autoMerge?.enabled || autoActionPolicy?.autoRevert?.enabled);
      return {
        automationEligibility: "auto_proposal_candidate",
        automationReason: repoPolicyEnabled
          ? "A proposal exists and repo auto-actions are enabled for later stages, so this item is a good proposal candidate with human review."
          : "A proposal exists, but later execution still needs human review, so keep it at proposal-candidate level.",
      };
    }

    if (source === "experiment" || targetTypeString === "queue_item" || targetTypeString === "proposal") {
      return {
        automationEligibility: "auto_draft",
        automationReason: "This item is structured enough for auto-draft preparation, but it still needs a human decision before rollout.",
      };
    }

    return {
      automationEligibility: "manual_only",
      automationReason: "This suggestion still needs manual review before the system should automate the next step.",
    };
  };

  const candidates = [
    governanceOverview
      ? {
          key: "governance",
          health: governanceOverview.health,
          headline: governanceOverview.headline,
          reason: governanceOverview.detail,
          actionHint: governanceOverview.actionHint,
          actionPath:
            governancePrimaryLine?.actionPath ??
            "/ops/monitoring",
          actionLabel:
            governancePrimaryLine?.actionLabel ??
            "Open overview",
          expectedImpact: "Reduce the highest-priority governance risk before it spills into other lines.",
          targetType: "audit_line",
          targetId: governancePrimaryLine?.key ?? governanceOverview.primaryLine ?? null,
          targetLabel: governancePrimaryLine?.title ?? governanceOverview.primaryLine ?? "Governance overview",
          targetMeta: governancePrimaryLine ? { lineKey: governancePrimaryLine.key } : null,
          ...buildAutomationEligibility({
            source: "governance",
            targetType: "audit_line",
            targetId: governancePrimaryLine?.key ?? governanceOverview.primaryLine ?? null,
            targetMeta: governancePrimaryLine ? { lineKey: governancePrimaryLine.key } : null,
          }),
        }
      : null,
    growthLoopOverview
      ? {
          key: "growth_loop",
          health: growthLoopOverview.health,
          headline: growthLoopOverview.headline,
          reason: growthLoopOverview.detail,
          actionHint: growthLoopOverview.actionHint,
          actionPath:
            weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
              ? weakestCommerceProposalArtifact?.actionPath ?? `/ops/audit/commerce?source=${encodeURIComponent(weakestCommerceSource.source)}`
              : weakestGrowthLoopLine?.key === "traffic"
                ? "/ops/audit/seo-sync"
                : weakestGrowthLoopLine?.key === "result"
                  ? "/ops/audit/result-governance"
                  : "/ops/monitoring",
          actionLabel:
            weakestGrowthLoopLine?.key === "conversion"
              ? weakestCommerceProposalArtifact?.actionLabel ?? "Open commerce audit"
              : weakestGrowthLoopLine?.key === "traffic"
                ? "Open SEO audit"
                : weakestGrowthLoopLine?.key === "result"
                  ? "Open governance audit"
                  : "Open monitoring",
          expectedImpact: "Tighten the traffic → conversion → result chain and stop losses from compounding.",
          targetType:
            weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
              ? "commerce_source"
              : weakestGrowthLoopLine?.key === "traffic"
                ? "growth_segment"
                : weakestGrowthLoopLine?.key === "result"
                  ? "result_governance_lane"
                  : "growth_segment",
          targetId:
            weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
              ? weakestCommerceSource.source
              : weakestGrowthLoopLine?.key ?? "growth_loop",
          targetLabel:
            weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
              ? weakestCommerceSource.source
              : weakestGrowthLoopLine?.title ?? "Growth loop",
          targetMeta:
            weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
              ? { source: weakestCommerceSource.source, segment: "conversion" }
              : weakestGrowthLoopLine?.key
                ? { segment: weakestGrowthLoopLine.key }
                : null,
          ...buildAutomationEligibility({
            source: "growth_loop",
            targetType:
              weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
                ? "commerce_source"
                : weakestGrowthLoopLine?.key === "traffic"
                  ? "growth_segment"
                  : weakestGrowthLoopLine?.key === "result"
                    ? "result_governance_lane"
                    : "growth_segment",
            targetId:
              weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
                ? weakestCommerceSource.source
                : weakestGrowthLoopLine?.key ?? "growth_loop",
            targetMeta:
              weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source
                ? { source: weakestCommerceSource.source, segment: "conversion" }
                : weakestGrowthLoopLine?.key
                  ? { segment: weakestGrowthLoopLine.key }
                  : null,
          }),
          automationArtifact:
            weakestGrowthLoopLine?.key === "conversion" && weakestCommerceSource?.source ? weakestCommerceProposalArtifact : null,
          automationReason:
            weakestGrowthLoopLine?.key === "conversion" && weakestCommerceProposalArtifact
              ? `A draft proposal is already prepared for weakest source ${weakestCommerceSource.source}; review it before apply.`
              : undefined,
        }
      : null,
    geoOverview
      ? {
          key: "geo",
          health: geoOverview.health,
          headline: geoOverview.headline,
          reason: geoOverview.detail,
          actionHint: geoOverview.actionHint,
          actionPath: prioritizedGeoItem?.automationArtifact?.actionPath ?? prioritizedGeoItem?.actionPath ?? "/ops/monitoring",
          actionLabel: prioritizedGeoItem?.automationArtifact?.actionLabel ?? prioritizedGeoItem?.actionLabel ?? "Open GEO overview",
          expectedImpact: "Improve discoverability and AI-assisted handoff quality before more top-funnel traffic is lost.",
          targetType: prioritizedGeoItem?.targetType ?? "geo_overview",
          targetId: prioritizedGeoItem?.targetId ?? "geo",
          targetLabel: prioritizedGeoItem?.targetLabel ?? "GEO overview",
          targetMeta: prioritizedGeoItem?.targetMeta ?? null,
          ...buildAutomationEligibility({
            source: "geo",
            targetType: prioritizedGeoItem?.targetType ?? "geo_overview",
            targetId: prioritizedGeoItem?.targetId ?? "geo",
            targetMeta: prioritizedGeoItem?.targetMeta ?? null,
          }),
          automationArtifact: prioritizedGeoItem?.automationArtifact ?? null,
          automationReason:
            prioritizedGeoItem?.automationArtifact
              ? `A draft proposal is already prepared for ${prioritizedGeoItem.targetLabel}; review it before rollout.`
              : undefined,
        }
      : null,
    prioritizedExperiment
      ? {
          key: "experiment",
          health: prioritizedExperiment.effectState === "risk" || prioritizedExperiment.kind === "followup_risk" ? "degraded" : "warning",
          headline: prioritizedExperiment.headline,
          reason: `${prioritizedExperiment.groupTitle} has the highest-priority queued action right now.`,
          actionHint: `Execute or review this item first: ${prioritizedExperiment.headline}.`,
          actionPath: prioritizedExperiment.actionPath,
          actionLabel: prioritizedExperiment.actionLabel,
          expectedImpact:
            prioritizedExperiment.effectMetrics?.length
              ? `Clarify whether ${prioritizedExperiment.effectMetrics.map((m) => m.label).join(", ")} are improving in the right direction.`
              : "Resolve the highest-priority experiment queue item before starting another round of changes.",
          targetType: prioritizedExperiment.targetType ?? "queue_item",
          targetId: prioritizedExperiment.targetId ?? prioritizedExperiment.id ?? null,
          targetLabel: prioritizedExperiment.targetLabel ?? prioritizedExperiment.headline,
          targetMeta: prioritizedExperiment.targetMeta ?? null,
          ...buildAutomationEligibility({
            source: "experiment",
            targetType: prioritizedExperiment.targetType ?? "queue_item",
            targetId: prioritizedExperiment.targetId ?? prioritizedExperiment.id ?? null,
            targetMeta: prioritizedExperiment.targetMeta ?? null,
          }),
        }
      : null,
  ].filter(Boolean);

  const best = candidates
    .slice()
    .sort((a, b) => rank(b.health) - rank(a.health))[0] ?? null;

  if (!best) {
    return {
      health: "healthy",
      headline: "No urgent action today",
      reason: "All top-level lines are stable and there is no queued experiment risk that needs immediate attention.",
      actionHint: "Continue routine monitoring and only intervene when one of the overviews weakens.",
      actionPath: "/ops/monitoring",
      actionLabel: "Stay on monitoring",
      expectedImpact: "Preserve the current healthy state.",
      source: "governance",
      targetType: "monitoring",
      targetId: "monitoring",
      targetLabel: "Monitoring overview",
      targetMeta: null,
      automationEligibility: "manual_only",
      automationReason: "No urgent action is available to automate right now.",
      automationArtifact: null,
      promotionEligibility: "manual_review_only",
      promotionReason: "No urgent automated promotion is available right now.",
      executionState: "pending",
      executionReason: "No urgent action is queued right now.",
      observationStatus: "not_started",
      observationWindow: "starts after execution",
      observationMetrics: ["health trend", "follow-up risk", "execution outcome"],
      observationNextStep: "Keep monitoring until a new bet needs execution.",
    };
  }

  const promotion = buildPromotionState({
    automationEligibility: best.automationEligibility,
    automationArtifact: best.automationArtifact,
    targetType: best.targetType,
  });
  const promotionAction = buildPromotionAction({
    promotionEligibility: promotion.promotionEligibility,
    automationArtifact: best.automationArtifact,
    actionPath: best.actionPath,
    targetType: best.targetType,
    targetLabel: best.targetLabel ?? best.headline,
  });
  const execution = buildExecutionState({
    source: best.key,
    targetType: best.targetType,
    health: best.health,
    effectState: best.effectState ?? null,
    automationArtifact: best.automationArtifact,
  });
  const playbookKey = `${best.key}:${String(best.targetType || "monitoring")}`;
  const playbook = findPlaybookByKey(playbookKey);
  const observation = buildObservationHandoff({
    source: best.key,
    targetType: best.targetType,
    targetLabel: best.targetLabel ?? best.headline,
    executionState: execution.executionState,
  });

  return {
    health: best.health,
    headline: best.health === "healthy" ? "Best bet: keep monitoring" : `Best bet: ${best.headline}`,
    reason: best.reason,
    actionHint: best.actionHint,
    actionPath: best.actionPath,
    actionLabel: best.actionLabel,
    expectedImpact: best.expectedImpact,
    source: best.key,
    targetType: best.targetType ?? "monitoring",
    targetId: best.targetId ?? null,
    targetLabel: best.targetLabel ?? best.headline,
    targetMeta: best.targetMeta ?? null,
    automationEligibility: best.automationEligibility ?? "manual_only",
    automationReason: best.automationReason ?? "This suggestion should stay manual-first.",
    automationArtifact: best.automationArtifact ?? null,
    promotionEligibility: promotion.promotionEligibility,
    promotionReason: promotion.promotionReason,
    promotionAction,
    executionState: execution.executionState,
    executionReason: execution.executionReason,
    observationStatus: observation.observationStatus,
    observationWindow: observation.observationWindow,
    observationMetrics: observation.observationMetrics,
    observationNextStep: observation.observationNextStep,
    playbookRef: summarizePlaybookRef(playbook),
  };
}

function buildDecisionTimeline({
  events,
  todaysBestBet,
  governanceOverview,
  growthLoopOverview,
  geoOverview,
  growthExperimentOverview,
} = {}) {
  const items = Array.isArray(events) ? events : [];
  const recent = items
    .slice()
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, 120);

  const classify = (event) => {
    const action = String(event?.action || "");
    const note = String(event?.note || "");
    const lower = `${action} ${note}`.toLowerCase();
    if (lower.includes("failed") || lower.includes("risk") || lower.includes("rollback")) return "risk";
    if (lower.includes("transition") || lower.includes("proposal")) return "decision";
    if (lower.includes("sync") || lower.includes("merged") || lower.includes("apply")) return "execution";
    return "signal";
  };

  const labelForEvent = (event) => {
    const action = String(event?.action || "");
    const map = {
      rule_tuning_proposal: "Rule tuning proposal created",
      rule_tuning_proposal_transition: "Rule tuning proposal moved",
      rule_tuning_proposal_followup: "Rule tuning follow-up created",
      incident_followup_proposal: "Incident follow-up proposal created",
      incident_followup_proposal_transition: "Incident follow-up moved",
      seo_metrics_sync_search_console: "Search Console sync succeeded",
      seo_metrics_sync_search_console_failed: "Search Console sync failed",
      seo_metrics_sync_search_console_skipped: "Search Console sync skipped",
      auto_start_recommendation: "Recommendation auto-started",
    };
    return map[action] ?? action;
  };

  const eventItems = recent
    .filter((event) => {
      const action = String(event?.action || "");
      return (
        action.includes("proposal") ||
        action.includes("recommendation") ||
        action.includes("seo_metrics_sync") ||
        action.includes("rollback") ||
        action.includes("publish")
      );
    })
    .slice(0, 8)
    .map((event) => ({
      at: event.at,
      kind: classify(event),
      title: labelForEvent(event),
      detail: event.note || `${event.action}${event.target?.id ? ` · ${event.target.id}` : ""}`,
    }));

  const totals = eventItems.reduce(
    (acc, item) => {
      acc[item.kind] += 1;
      return acc;
    },
    { decision: 0, execution: 0, risk: 0, signal: 0 },
  );

  const trend =
    totals.risk > 0
      ? "risk_heavy"
      : totals.decision > totals.execution
        ? "decision_heavy"
        : totals.execution > 0
          ? "execution_heavy"
          : "steady";

  const summary =
    trend === "risk_heavy"
      ? "Recent history is dominated by risk or failure handling."
      : trend === "decision_heavy"
        ? "Recent history is dominated by proposal and decision movement."
        : trend === "execution_heavy"
          ? "Recent history is dominated by execution and rollout activity."
          : "Recent history is relatively steady.";

  const currentStory = [
    todaysBestBet ? `Best bet now: ${todaysBestBet.headline}.` : null,
    governanceOverview ? `Governance is ${governanceOverview.health}.` : null,
    growthLoopOverview ? `Growth loop is ${growthLoopOverview.health}.` : null,
    geoOverview ? `GEO is ${geoOverview.health}.` : null,
    growthExperimentOverview ? `Experiment queue is ${growthExperimentOverview.health}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    trend,
    summary,
    counts: totals,
    currentStory,
    items: eventItems,
  };
}

function buildPromotionState({
  automationEligibility,
  automationArtifact,
  targetType,
} = {}) {
  const eligibility = String(automationEligibility || "manual_only");
  const artifact = automationArtifact && typeof automationArtifact === "object" ? automationArtifact : null;
  const artifactStatus = String(artifact?.status || "");
  const artifactKind = String(artifact?.kind || "");
  const targetTypeString = String(targetType || "");

  if (eligibility === "manual_only") {
    return {
      promotionEligibility: "manual_review_only",
      promotionReason: "This path should stay manual-first before it can be promoted.",
    };
  }

  if (!artifact) {
    return {
      promotionEligibility: "draft_missing",
      promotionReason: "No draft artifact is attached yet, so promotion should wait until the draft is prepared.",
    };
  }

  if (artifactKind === "draft_pr") {
    return {
      promotionEligibility: "candidate_ready",
      promotionReason: "A draft PR already exists, so this item is ready to be treated as a proposal candidate after review.",
    };
  }

  if (artifactKind === "proposal" && ["draft", "manual_review", "approved", "open"].includes(artifactStatus)) {
    return {
      promotionEligibility: "candidate_ready",
      promotionReason: "A proposal draft already exists, so this item is ready for candidate-level review and promotion.",
    };
  }

  if (eligibility === "auto_proposal_candidate") {
    return {
      promotionEligibility: "candidate_ready",
      promotionReason: "This item already satisfies the proposal-candidate automation boundary.",
    };
  }

  if (eligibility === "auto_draft" && (targetTypeString === "ai_concierge_item" || targetTypeString === "proposal")) {
    return {
      promotionEligibility: "review_after_draft",
      promotionReason: "The draft is ready, but this path still needs explicit review before candidate promotion.",
    };
  }

  return {
    promotionEligibility: "draft_only",
    promotionReason: "The system can prepare a draft here, but it is not yet ready for candidate promotion.",
  };
}

function buildPromotionAction({
  promotionEligibility,
  automationArtifact,
  actionPath,
  targetType,
  targetLabel,
} = {}) {
  const eligibility = String(promotionEligibility || "manual_review_only");
  const artifact = automationArtifact && typeof automationArtifact === "object" ? automationArtifact : null;
  const targetTypeString = String(targetType || "");
  const fallbackPath = String(actionPath || "/ops/monitoring");
  const label = String(targetLabel || "this item");

  if (eligibility === "candidate_ready") {
    const repoChangeId = artifact?.repoChangeId ? String(artifact.repoChangeId) : "";
    const repoChangeStatus = artifact?.repoChangeStatus ? String(artifact.repoChangeStatus) : "";
    const repoNextStepCode = artifact?.repoNextStepCode ? String(artifact.repoNextStepCode) : "";
    const repoMutation =
      repoChangeId && (repoChangeStatus === "ci_passed" || repoChangeStatus === "merge_candidate")
        ? {
            kind: "repo_change_transition",
            targetId: repoChangeId,
            nextStatus: repoChangeStatus === "ci_passed" ? "merge_candidate" : "auto_merge_candidate",
          }
        : null;
    return {
      code: repoMutation ? "promote_repo_candidate" : "promote_candidate",
      actionPath: artifact?.actionPath ?? fallbackPath,
      actionLabel: repoMutation
        ? repoMutation.nextStatus === "merge_candidate"
          ? "Promote repo candidate"
          : "Promote auto-merge candidate"
        : artifact?.kind === "draft_pr"
          ? "Promote candidate PR"
          : "Promote proposal candidate",
      description: repoMutation
        ? `Promote ${label} through the repo-change lane${repoNextStepCode ? ` (${repoNextStepCode})` : ""}.`
        : `This draft is mature enough to promote ${label} into candidate review.`,
      mutation:
        repoMutation ??
        (artifact?.kind === "proposal" && ["draft", "manual_review", "open"].includes(String(artifact?.status || ""))
          ? {
              kind: "proposal_transition",
              targetId: String(artifact.id),
              nextStatus: "approved",
            }
          : null),
    };
  }

  if (eligibility === "review_after_draft") {
    return {
      code: "review_draft",
      actionPath: artifact?.actionPath ?? fallbackPath,
      actionLabel: "Review draft first",
      description: `Review the prepared draft for ${label} before promoting it further.`,
      mutation: null,
    };
  }

  if (eligibility === "draft_missing") {
    return {
      code: "prepare_draft",
      actionPath: fallbackPath,
      actionLabel: "Prepare draft",
      description: `Create or sync the draft artifact for ${label} before promotion.`,
      mutation: null,
    };
  }

  if (eligibility === "draft_only") {
    return {
      code: "keep_draft",
      actionPath: artifact?.actionPath ?? fallbackPath,
      actionLabel: "Keep draft in review",
      description: `Keep ${label} in draft mode until stronger evidence supports candidate promotion.`,
      mutation: null,
    };
  }

  return {
    code: targetTypeString === "audit_line" ? "manual_audit" : "manual_review",
    actionPath: fallbackPath,
    actionLabel: targetTypeString === "audit_line" ? "Review manually" : "Keep manual review",
    description: `This path should stay manual-first for ${label}.`,
    mutation: null,
  };
}

function buildExecutionState({
  source,
  targetType,
  health,
  effectState,
  automationArtifact,
} = {}) {
  const artifact = automationArtifact && typeof automationArtifact === "object" ? automationArtifact : null;
  const artifactStatus = String(artifact?.status || "");
  const repoChangeStatus = String(artifact?.repoChangeStatus || "");
  const normalizedEffectState = typeof effectState === "string" ? effectState : null;
  const sourceKey = String(source || "");
  const targetTypeKey = String(targetType || "");
  const healthKey = String(health || "");

  if (normalizedEffectState === "success") {
    return {
      executionState: "succeeded",
      executionReason: "Recent post-apply signals are already showing success.",
    };
  }

  if (normalizedEffectState === "risk" || repoChangeStatus === "ci_failed") {
    return {
      executionState: "returned_to_risk",
      executionReason: "The last execution path is still risky and needs another corrective step.",
    };
  }

  if (normalizedEffectState === "observe" || normalizedEffectState === "steady" || repoChangeStatus === "merged" || artifactStatus === "applied") {
    return {
      executionState: "observing",
      executionReason: "The latest action has been applied and is now in the observation window.",
    };
  }

  if (artifact && (sourceKey === "growth_loop" || sourceKey === "geo" || sourceKey === "experiment" || targetTypeKey === "proposal")) {
    return {
      executionState: "pending",
      executionReason: "A draft or candidate artifact exists, but the action has not been executed yet.",
    };
  }

  if (healthKey === "degraded") {
    return {
      executionState: "returned_to_risk",
      executionReason: "This area is still degraded, so the bet remains unresolved.",
    };
  }

  return {
    executionState: "pending",
    executionReason: "This bet is queued and waiting for execution.",
  };
}

function buildObservationHandoff({
  source,
  targetType,
  targetLabel,
  executionState,
} = {}) {
  const sourceKey = String(source || "");
  const targetTypeKey = String(targetType || "");
  const label = String(targetLabel || "this bet");

  const metricsFor = () => {
    if (sourceKey === "growth_loop" && targetTypeKey === "commerce_source") {
      return ["completion rate", "purchase rate", "dropoff"];
    }
    if (sourceKey === "growth_loop" && targetTypeKey === "growth_segment") {
      return ["impressions", "CTR", "qualified traffic"];
    }
    if (sourceKey === "growth_loop" && targetTypeKey === "result_governance_lane") {
      return ["payment recovery", "fulfillment backlog", "refund backlog"];
    }
    if (sourceKey === "geo" || targetTypeKey === "ai_concierge_item") {
      return ["entry CTR", "result CTR", "purchase / view"];
    }
    if (sourceKey === "experiment" || targetTypeKey === "proposal" || targetTypeKey === "queue_item") {
      return ["primary effect metric", "follow-up risk", "candidate movement"];
    }
    if (sourceKey === "governance" || targetTypeKey === "audit_line") {
      return ["alert volume", "open risk items", "recovery backlog"];
    }
    return ["health trend", "follow-up risk", "execution outcome"];
  };

  const metrics = metricsFor();
  const state = String(executionState || "pending");

  if (state === "executed") {
    return {
      observationStatus: "handoff_ready",
      observationWindow: "next 24-72h",
      observationMetrics: metrics,
      observationNextStep: `Start the observation window for ${label} and watch ${metrics.slice(0, 2).join(" / ")} first.`,
    };
  }

  if (state === "observing") {
    return {
      observationStatus: "observing",
      observationWindow: "active observation window",
      observationMetrics: metrics,
      observationNextStep: `Keep monitoring ${label} until the observation window resolves into success or renewed risk.`,
    };
  }

  if (state === "succeeded") {
    return {
      observationStatus: "complete",
      observationWindow: "observation completed",
      observationMetrics: metrics,
      observationNextStep: `Capture the winning pattern from ${label} and reuse it in the next cycle.`,
    };
  }

  if (state === "returned_to_risk") {
    return {
      observationStatus: "regressed",
      observationWindow: "immediate follow-up",
      observationMetrics: metrics,
      observationNextStep: `End observation for ${label} and open a corrective follow-up based on the renewed risk.`,
    };
  }

  return {
    observationStatus: "not_started",
    observationWindow: "starts after execution",
    observationMetrics: metrics,
    observationNextStep: `Execute ${label} first, then begin the observation window.`,
  };
}

function summarizePlaybookRef(playbook) {
  if (!playbook) return null;
  const latestApplication = Array.isArray(playbook.applications) && playbook.applications.length ? playbook.applications[0] : null;
  return {
    id: playbook.id,
    title: playbook.title,
    actionPath: `/ops/playbooks/${playbook.id}`,
    latestApplication: latestApplication
      ? {
          id: latestApplication.id,
          status: latestApplication.status,
          createdAt: latestApplication.createdAt,
          nextAction: latestApplication.nextAction ?? null,
        }
      : null,
  };
}

function buildDailySnapshotHistory({ snapshots } = {}) {
  const items = Array.isArray(snapshots) ? snapshots : [];
  const recent = items
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 7);

  return {
    items: recent,
  };
}

function buildWeeklyOperatingReview({
  dailySnapshotHistory,
  governanceOverview,
  growthLoopOverview,
  geoOverview,
  growthExperimentOverview,
  commerceSourceSummary,
  commerceProposals,
} = {}) {
  const autoActionPolicy = getAutoActionPolicy();
  const items = Array.isArray(dailySnapshotHistory?.items) ? dailySnapshotHistory.items : [];
  const sorted = items.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const from = sorted[0]?.date ?? null;
  const to = sorted[sorted.length - 1]?.date ?? null;

  const bestBetSources = sorted.reduce((acc, item) => {
    const src = item?.todaysBestBet?.source ? String(item.todaysBestBet.source) : "none";
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {});

  const healthBuckets = {
    governance: { healthy: 0, warning: 0, degraded: 0 },
    growth_loop: { healthy: 0, warning: 0, degraded: 0 },
    geo: { healthy: 0, warning: 0, degraded: 0 },
    experiment: { healthy: 0, warning: 0, degraded: 0 },
  };
  const bump = (bucket, health) => {
    if (!bucket) return;
    if (health === "degraded") bucket.degraded += 1;
    else if (health === "warning") bucket.warning += 1;
    else bucket.healthy += 1;
  };

  const riskDays = [];
  sorted.forEach((item) => {
    bump(healthBuckets.governance, item?.governanceOverview?.health);
    bump(healthBuckets.growth_loop, item?.growthLoopOverview?.health);
    bump(healthBuckets.geo, item?.geoOverview?.health);
    bump(healthBuckets.experiment, item?.growthExperimentOverview?.health);

    const degraded = [];
    if (item?.governanceOverview?.health === "degraded") degraded.push("governance");
    if (item?.growthLoopOverview?.health === "degraded") degraded.push("growth_loop");
    if (item?.geoOverview?.health === "degraded") degraded.push("geo");
    if (item?.growthExperimentOverview?.health === "degraded") degraded.push("experiment");
    if (degraded.length) {
      riskDays.push({
        date: item.date,
        degraded,
        bestBetSource: item?.todaysBestBet?.source ?? "none",
      });
    }
  });

  const degradedTotal =
    healthBuckets.governance.degraded +
    healthBuckets.growth_loop.degraded +
    healthBuckets.geo.degraded +
    healthBuckets.experiment.degraded;
  const warningTotal =
    healthBuckets.governance.warning +
    healthBuckets.growth_loop.warning +
    healthBuckets.geo.warning +
    healthBuckets.experiment.warning;

  const health = degradedTotal > 0 ? "warning" : warningTotal > 0 ? "warning" : "healthy";
  const headline =
    health === "healthy"
      ? "Weekly review: stable week"
      : degradedTotal > 0
        ? "Weekly review: risk surfaced"
        : "Weekly review: soft signals";

  const focus = (() => {
    const scores = [
      ["governance", healthBuckets.governance.degraded * 3 + healthBuckets.governance.warning],
      ["growth_loop", healthBuckets.growth_loop.degraded * 3 + healthBuckets.growth_loop.warning],
      ["geo", healthBuckets.geo.degraded * 3 + healthBuckets.geo.warning],
      ["experiment", healthBuckets.experiment.degraded * 3 + healthBuckets.experiment.warning],
    ];
    scores.sort((a, b) => b[1] - a[1]);
    return scores[0]?.[0] ?? "governance";
  })();

  const summary = `days ${sorted.length} · best bet sources ${Object.entries(bestBetSources)
    .map(([k, v]) => `${k}:${v}`)
    .join(" ")} · focus ${focus}`;
  const executionOutcomes = (() => {
    const counts = {
      executed: 0,
      observing: 0,
      succeeded: 0,
      returned_to_risk: 0,
    };
    const items = sorted
      .map((item) => {
        const bet = item?.todaysBestBet ?? null;
        const executionState = bet?.executionState ? String(bet.executionState) : "pending";
        if (counts[executionState] !== undefined) counts[executionState] += 1;
        return bet
          ? {
              date: item.date,
              source: bet.source,
              headline: bet.headline,
              targetType: bet.targetType ?? "monitoring",
              targetLabel: bet.targetLabel,
              executionState,
              observationStatus: bet.observationStatus ?? "not_started",
            }
          : null;
      })
      .filter(Boolean)
      .slice(-5)
      .reverse();
    const summary =
      `executed ${counts.executed} · observing ${counts.observing} · succeeded ${counts.succeeded} · returned_to_risk ${counts.returned_to_risk}`;
    return {
      counts,
      summary,
      items,
    };
  })();
  const outcomeAttribution = (() => {
    const bySource = {
      governance: { total: 0, executed: 0, observing: 0, succeeded: 0, returned_to_risk: 0 },
      growth_loop: { total: 0, executed: 0, observing: 0, succeeded: 0, returned_to_risk: 0 },
      geo: { total: 0, executed: 0, observing: 0, succeeded: 0, returned_to_risk: 0 },
      experiment: { total: 0, executed: 0, observing: 0, succeeded: 0, returned_to_risk: 0 },
    };
    const winners = new Map();
    const regressions = new Map();

    sorted.forEach((item) => {
      const bet = item?.todaysBestBet ?? null;
      if (!bet?.source) return;
      const src = String(bet.source);
      if (!bySource[src]) return;
      const state = bet?.executionState ? String(bet.executionState) : "pending";
      bySource[src].total += 1;
      if (bySource[src][state] !== undefined) bySource[src][state] += 1;

      const targetType = String(bet.targetType || "unknown");
      const key = `${src}:${targetType}:${String(bet.targetLabel || bet.headline || "")}`;
      if (state === "succeeded") {
        const current = winners.get(key) ?? {
          source: src,
          targetType,
          targetLabel: bet.targetLabel,
          headline: bet.headline,
          count: 0,
        };
        current.count += 1;
        winners.set(key, current);
      }
      if (state === "returned_to_risk") {
        const current = regressions.get(key) ?? {
          source: src,
          targetType,
          targetLabel: bet.targetLabel,
          headline: bet.headline,
          count: 0,
        };
        current.count += 1;
        regressions.set(key, current);
      }
    });

    const topWinners = Array.from(winners.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const topRegressions = Array.from(regressions.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const bestSource = Object.entries(bySource)
      .slice()
      .sort((a, b) => b[1].succeeded - a[1].succeeded || b[1].executed - a[1].executed)[0]?.[0] ?? null;

    const hints = [];
    if (topWinners.length) {
      hints.push(`Capture winning patterns: ${topWinners.map((w) => `${w.source}:${w.targetLabel || w.headline}`).join(" · ")}`);
    } else {
      hints.push("No confirmed wins this week; prioritize observation follow-ups and tighten rollout scope.");
    }
    if (topRegressions.length) {
      hints.push(`Regressions to watch: ${topRegressions.map((r) => `${r.source}:${r.targetLabel || r.headline}`).join(" · ")}`);
    }
    if (bestSource) {
      hints.push(`Most effective bet source this week: ${bestSource}`);
    }

    return {
      bySource,
      winningPatterns: topWinners,
      regressionPatterns: topRegressions,
      hints,
    };
  })();
  const playbookDrafts = (() => {
    const candidates = Array.isArray(outcomeAttribution?.winningPatterns) ? outcomeAttribution.winningPatterns : [];
    const drafts = [];
    candidates.forEach((pattern) => {
      const key = `${pattern.source}:${pattern.targetType}`;
      const observation = buildObservationHandoff({
        source: pattern.source,
        targetType: pattern.targetType,
        targetLabel: pattern.targetLabel || pattern.headline,
        executionState: "executed",
      });
      const steps = [
        { code: "review_draft", label: "Review draft", detail: "Review the generated draft/proposal and confirm scope." },
        { code: "promote_candidate", label: "Promote candidate", detail: "Promote to candidate stage once review is satisfied." },
        { code: "execute_transition", label: "Execute transition", detail: "Trigger the safe transition (proposal/repo lane) and record feedback." },
        { code: "observe", label: "Observe", detail: `Observe for ${observation.observationWindow} and watch key metrics.` },
      ];
      const playbook = upsertPlaybook({
        key,
        title: `Playbook: ${pattern.source} / ${pattern.targetType}`,
        source: pattern.source,
        targetType: pattern.targetType,
        steps,
        observationWindow: observation.observationWindow,
        observationMetrics: observation.observationMetrics,
        examples: [{ targetLabel: pattern.targetLabel, headline: pattern.headline, count: pattern.count }],
        actor: "monitoring",
      });
      if (playbook) {
        drafts.push({
          ...summarizePlaybookRef(playbook),
          key: playbook.key,
          source: playbook.source,
          targetType: playbook.targetType,
        });
      }
    });
    return drafts.slice(0, 3);
  })();
  const playbookApplicationOutcomes = (() => {
    const playbooks = listPlaybooks({ limit: 100 })?.items ?? [];
    const counts = { draft: 0, in_review: 0, executed: 0, observing: 0, succeeded: 0, regressed: 0, cancelled: 0 };
    const items = [];
    playbooks.forEach((pb) => {
      const apps = Array.isArray(pb.applications) ? pb.applications : [];
      apps.forEach((app) => {
        const createdDate = String(app?.createdAt || "").slice(0, 10);
        if (from && createdDate && createdDate < from) return;
        if (to && createdDate && createdDate > to) return;
        const status = String(app?.status || "draft");
        if (counts[status] !== undefined) counts[status] += 1;
        items.push({
          playbookId: pb.id,
          playbookTitle: pb.title,
          applicationId: app.id,
          createdAt: app.createdAt,
          status,
          targetType: app.targetType,
          targetId: app.targetId ?? null,
          targetLabel: app.targetLabel || app.targetType || pb.title,
          nextAction: app.nextAction ?? null,
          actionPath: `/ops/playbooks/${pb.id}`,
        });
      });
    });
    items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const recent = items.slice(0, 6);
    const summary = `draft ${counts.draft} · in_review ${counts.in_review} · executed ${counts.executed} · observing ${counts.observing} · succeeded ${counts.succeeded} · regressed ${counts.regressed}`;
    return { counts, summary, items: recent };
  })();

  const pickExperimentItem = (predicate) => {
    const list = Array.isArray(growthExperimentOverview?.items) ? growthExperimentOverview.items : [];
    const ranked = list
      .filter((item) => (predicate ? predicate(item) : true))
      .slice()
      .sort((a, b) => {
        const aRank = a.kind === "followup_risk" ? 3 : a.kind === "needs_decision" ? 2 : 1;
        const bRank = b.kind === "followup_risk" ? 3 : b.kind === "needs_decision" ? 2 : 1;
        return bRank - aRank;
      });
    return ranked[0] ?? null;
  };

  const pickWeakCommerceSource = () => {
    const sources = Array.isArray(commerceSourceSummary?.sources) ? commerceSourceSummary.sources : [];
    return (
      sources
      .slice()
      .sort((a, b) => {
        const rank = (health) => (health === "degraded" ? 3 : health === "warning" ? 2 : 1);
        const healthDelta = rank(b.health) - rank(a.health);
        if (healthDelta !== 0) return healthDelta;
        return Number(b.followupRisk ?? 0) - Number(a.followupRisk ?? 0) || Number(b.proposals ?? 0) - Number(a.proposals ?? 0);
      })[0] ?? null
    );
  };
  const buildCommerceProposalArtifact = (source) => {
    if (!source) return null;
    const proposals = Array.isArray(commerceProposals) ? commerceProposals : [];
    const match = proposals
      .filter((item) => String(item?.targetId || "") === String(source))
      .slice()
      .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")))[0];
    if (!match?.id) return null;
    return {
      kind: "proposal",
      id: String(match.id),
      status: String(match.status || "draft"),
      label: String(match.reviewSummary?.headline || match.summary || `Proposal for ${source}`),
      actionPath: `/ops/proposals/${match.id}`,
      actionLabel: "Open auto draft",
    };
  };

  const actionForFocus = (key) => {
    const buildAutomationEligibility = ({ source, targetType, targetId, targetMeta } = {}) => {
      const targetIdString = targetId == null ? "" : String(targetId);
      const targetTypeString = targetType == null ? "" : String(targetType);
      const meta = targetMeta && typeof targetMeta === "object" ? targetMeta : {};

      if (source === "governance" || targetTypeString === "audit_line" || targetTypeString === "result_governance_lane") {
        return {
          automationEligibility: "manual_only",
          automationReason: "This path can affect cross-line governance or recovery policy, so it should stay manual-first.",
        };
      }

      if (source === "growth_loop" && targetTypeString === "commerce_source") {
        return {
          automationEligibility: "auto_proposal_candidate",
          automationReason: `Weak source ${String(meta.source || targetIdString || "unknown")} is repetitive enough to auto-prepare a proposal candidate, but it should still be reviewed before apply.`,
        };
      }

      if (source === "geo" || targetTypeString === "ai_concierge_item") {
        return {
          automationEligibility: "auto_draft",
          automationReason:
            "AI concierge tuning already has a draft-oriented workflow, so the next safe step is auto-draft rather than direct apply.",
        };
      }

      if (source === "experiment" && targetTypeString === "proposal") {
        const repoPolicyEnabled = Boolean(autoActionPolicy?.autoMerge?.enabled || autoActionPolicy?.autoRevert?.enabled);
        return {
          automationEligibility: "auto_proposal_candidate",
          automationReason: repoPolicyEnabled
            ? "A proposal exists and repo auto-actions are enabled for later stages, so this item is a good proposal candidate with human review."
            : "A proposal exists, but later execution still needs human review, so keep it at proposal-candidate level.",
        };
      }

      if (source === "experiment" || targetTypeString === "queue_item" || targetTypeString === "proposal") {
        return {
          automationEligibility: "auto_draft",
          automationReason: "This item is structured enough for auto-draft preparation, but it still needs a human decision before rollout.",
        };
      }

      return {
        automationEligibility: "manual_only",
        automationReason: "This suggestion still needs manual review before the system should automate the next step.",
      };
    };

    if (key === "governance") {
      const primaryKey = governanceOverview?.primaryLine ?? null;
      const line = Array.isArray(governanceOverview?.lines) ? governanceOverview.lines.find((l) => l.key === primaryKey) : null;
      return {
        actionPath: line?.actionPath ?? "/ops/monitoring",
        actionLabel: line?.actionLabel ?? "Open governance audit",
        expectedImpact: "Reduce the highest-priority governance risk and keep lanes stable.",
        metricSummary: line?.detail ?? null,
        targetType: "audit_line",
        targetId: line?.key ?? governanceOverview?.primaryLine ?? null,
        targetLabel: line?.title ?? governanceOverview?.primaryLine ?? "Governance overview",
        targetMeta: line ? { lineKey: line.key } : null,
        ...buildAutomationEligibility({
          source: "governance",
          targetType: "audit_line",
          targetId: line?.key ?? governanceOverview?.primaryLine ?? null,
          targetMeta: line ? { lineKey: line.key } : null,
        }),
      };
    }

    if (key === "growth_loop") {
      const lines = Array.isArray(growthLoopOverview?.lines) ? growthLoopOverview.lines : [];
      const rank = (status) => (status === "degraded" ? 3 : status === "warning" ? 2 : 1);
      const weakest = lines.slice().sort((a, b) => rank(b.status) - rank(a.status))[0] ?? null;
      if (weakest?.key === "conversion") {
        const source = pickWeakCommerceSource();
        const artifact = buildCommerceProposalArtifact(source?.source ?? null);
        return {
          actionPath: artifact?.actionPath ?? (source?.source ? `/ops/audit/commerce?source=${encodeURIComponent(source.source)}` : "/ops/audit/commerce"),
          actionLabel: artifact?.actionLabel ?? "Open commerce audit",
          expectedImpact: "Improve checkout conversion and remove the most visible friction first.",
          metricSummary: source?.detail ?? weakest?.detail ?? null,
          targetType: source?.source ? "commerce_source" : "growth_segment",
          targetId: source?.source ?? "conversion",
          targetLabel: source?.source ?? "Conversion",
          targetMeta: source?.source ? { source: source.source, segment: "conversion" } : { segment: "conversion" },
          ...buildAutomationEligibility({
            source: "growth_loop",
            targetType: source?.source ? "commerce_source" : "growth_segment",
            targetId: source?.source ?? "conversion",
            targetMeta: source?.source ? { source: source.source, segment: "conversion" } : { segment: "conversion" },
          }),
          automationArtifact: artifact,
          automationReason:
            artifact && source?.source
              ? `A draft proposal is already prepared for weakest source ${source.source}; review it before apply.`
              : undefined,
        };
      }
      if (weakest?.key === "traffic") {
        return {
          actionPath: "/ops/audit/seo-sync",
          actionLabel: "Open SEO audit",
          expectedImpact: "Improve discoverability and traffic quality before funnel optimizations.",
          metricSummary: weakest?.detail ?? null,
          targetType: "growth_segment",
          targetId: "traffic",
          targetLabel: weakest?.title ?? "Traffic",
          targetMeta: { segment: "traffic" },
          ...buildAutomationEligibility({
            source: "growth_loop",
            targetType: "growth_segment",
            targetId: "traffic",
            targetMeta: { segment: "traffic" },
          }),
          automationArtifact: null,
        };
      }
      if (weakest?.key === "result") {
        return {
          actionPath: "/ops/audit/result-governance",
          actionLabel: "Open governance audit",
          expectedImpact: "Reduce payment/fulfillment issues that block conversion gains from turning into real purchases.",
          metricSummary: weakest?.detail ?? null,
          targetType: "result_governance_lane",
          targetId: "result",
          targetLabel: weakest?.title ?? "Result",
          targetMeta: { segment: "result" },
          ...buildAutomationEligibility({
            source: "growth_loop",
            targetType: "result_governance_lane",
            targetId: "result",
            targetMeta: { segment: "result" },
          }),
          automationArtifact: null,
        };
      }
      return {
        actionPath: "/ops/monitoring",
        actionLabel: "Open monitoring",
        expectedImpact: "Tighten traffic → conversion → result alignment and stop compounding losses.",
        metricSummary: weakest?.detail ?? null,
        targetType: "growth_segment",
        targetId: weakest?.key ?? "growth_loop",
        targetLabel: weakest?.title ?? "Growth loop",
        targetMeta: weakest?.key ? { segment: weakest.key } : null,
        ...buildAutomationEligibility({
          source: "growth_loop",
          targetType: "growth_segment",
          targetId: weakest?.key ?? "growth_loop",
          targetMeta: weakest?.key ? { segment: weakest.key } : null,
        }),
        automationArtifact: null,
      };
    }

    if (key === "geo") {
      const geoTop = pickExperimentItem((item) => item.groupKey === "ai_concierge");
      return geoTop
        ? {
            actionPath: geoTop.automationArtifact?.actionPath ?? geoTop.actionPath,
            actionLabel: geoTop.automationArtifact?.actionLabel ?? geoTop.actionLabel,
            expectedImpact: "Improve AI-assisted answer quality and handoff before scaling more GEO traffic.",
            metricSummary:
              geoTop.effectMetrics?.length
                ? geoTop.effectMetrics.map((metric) => `${metric.label} ${metric.value}`).join(" · ")
                : geoTop.effectSummary ?? null,
            targetType: geoTop.targetType ?? "ai_concierge_item",
            targetId: geoTop.targetId ?? geoTop.id ?? null,
            targetLabel: geoTop.targetLabel ?? geoTop.headline,
            targetMeta: geoTop.targetMeta ?? null,
            effectState: geoTop.effectState ?? null,
            ...buildAutomationEligibility({
              source: "geo",
              targetType: geoTop.targetType ?? "ai_concierge_item",
              targetId: geoTop.targetId ?? geoTop.id ?? null,
              targetMeta: geoTop.targetMeta ?? null,
            }),
            automationArtifact: geoTop.automationArtifact ?? null,
            automationReason:
              geoTop.automationArtifact
                ? `A draft proposal is already prepared for ${geoTop.targetLabel ?? geoTop.headline}; review it before rollout.`
                : undefined,
          }
        : {
            actionPath: "/ops/monitoring",
            actionLabel: "Open GEO overview",
            expectedImpact: "Improve AI-assisted discoverability and answer quality before scaling more GEO traffic.",
            metricSummary: geoOverview?.detail ?? null,
            targetType: "geo_overview",
            targetId: "geo",
            targetLabel: "GEO overview",
            targetMeta: null,
            ...buildAutomationEligibility({
              source: "geo",
              targetType: "geo_overview",
              targetId: "geo",
              targetMeta: null,
            }),
            automationArtifact: null,
          };
    }

    if (key === "experiment") {
      const top = pickExperimentItem();
      return top
        ? {
            actionPath: top.actionPath,
            actionLabel: top.actionLabel,
            expectedImpact: "Reduce follow-up risk and unblock the next high-leverage proposals.",
            metricSummary:
              top.effectMetrics?.length
                ? top.effectMetrics.map((metric) => `${metric.label} ${metric.value}`).join(" · ")
                : top.effectSummary ?? null,
            targetType: top.targetType ?? "queue_item",
            targetId: top.targetId ?? top.id ?? null,
            targetLabel: top.targetLabel ?? top.headline,
            targetMeta: top.targetMeta ?? null,
            effectState: top.effectState ?? null,
            ...buildAutomationEligibility({
              source: "experiment",
              targetType: top.targetType ?? "queue_item",
              targetId: top.targetId ?? top.id ?? null,
              targetMeta: top.targetMeta ?? null,
            }),
            automationArtifact: null,
          }
        : {
            actionPath: "/ops/monitoring",
            actionLabel: "Open experiment queue",
            expectedImpact: "Reduce follow-up risk and unblock the next high-leverage proposals.",
            metricSummary: growthExperimentOverview?.detail ?? null,
            targetType: "experiment_queue",
            targetId: "experiment",
            targetLabel: "Experiment queue",
            targetMeta: null,
            ...buildAutomationEligibility({
              source: "experiment",
              targetType: "experiment_queue",
              targetId: "experiment",
              targetMeta: null,
            }),
            automationArtifact: null,
          };
    }

    return {
      actionPath: "/ops/monitoring",
      actionLabel: "Open monitoring",
      expectedImpact: "Keep the operating loop stable.",
      metricSummary: null,
      targetType: "monitoring",
      targetId: "monitoring",
      targetLabel: "Monitoring overview",
      targetMeta: null,
      ...buildAutomationEligibility({
        source: "governance",
        targetType: "monitoring",
        targetId: "monitoring",
        targetMeta: null,
      }),
      automationArtifact: null,
    };
  };

  const mostCommonDegradedLayer = (() => {
    const counts = { governance: 0, growth_loop: 0, geo: 0, experiment: 0 };
    riskDays.forEach((day) => {
      (day.degraded || []).forEach((key) => {
        if (counts[key] !== undefined) counts[key] += 1;
      });
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[1] > 0 ? entries[0][0] : null;
  })();

  const topSource = (() => {
    const entries = Object.entries(bestBetSources).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? "none";
  })();

  const nextWeekBets = [];
  const focusAction = actionForFocus(focus);
  const focusPromotion = buildPromotionState({
    automationEligibility: focusAction.automationEligibility,
    automationArtifact: focusAction.automationArtifact,
    targetType: focusAction.targetType,
  });
  const focusExecution = buildExecutionState({
    source: focus,
    targetType: focusAction.targetType,
    health,
    effectState: focusAction.effectState ?? null,
    automationArtifact: focusAction.automationArtifact,
  });
  const focusObservation = buildObservationHandoff({
    source: focus,
    targetType: focusAction.targetType,
    targetLabel: focusAction.targetLabel ?? `Focus ${focus}`,
    executionState: focusExecution.executionState,
  });
  const focusPlaybook = findPlaybookByKey(`${focus}:${String(focusAction.targetType || "monitoring")}`);
  const focusPromotionAction = buildPromotionAction({
    promotionEligibility: focusPromotion.promotionEligibility,
    automationArtifact: focusAction.automationArtifact,
    actionPath: focusAction.actionPath,
    targetType: focusAction.targetType,
    targetLabel: focusAction.targetLabel ?? `Focus ${focus}`,
  });
  nextWeekBets.push({
    priority: "p0",
    title: `Focus bet: ${focus}`,
    reason: `This week’s weighted risk and soft signals concentrate in ${focus}.`,
    actionPath: focusAction.actionPath,
    actionLabel: focusAction.actionLabel,
    expectedImpact: focusAction.expectedImpact,
    metricSummary: focusAction.metricSummary ?? null,
    targetType: focusAction.targetType ?? "monitoring",
    targetId: focusAction.targetId ?? null,
    targetLabel: focusAction.targetLabel ?? `Focus ${focus}`,
    targetMeta: focusAction.targetMeta ?? null,
    automationEligibility: focusAction.automationEligibility ?? "manual_only",
    automationReason: focusAction.automationReason ?? "This suggestion should stay manual-first.",
    automationArtifact: focusAction.automationArtifact ?? null,
    promotionEligibility: focusPromotion.promotionEligibility,
    promotionReason: focusPromotion.promotionReason,
    promotionAction: focusPromotionAction,
    executionState: focusExecution.executionState,
    executionReason: focusExecution.executionReason,
    observationStatus: focusObservation.observationStatus,
    observationWindow: focusObservation.observationWindow,
    observationMetrics: focusObservation.observationMetrics,
    observationNextStep: focusObservation.observationNextStep,
    playbookRef: summarizePlaybookRef(focusPlaybook),
  });

  if (mostCommonDegradedLayer && mostCommonDegradedLayer !== focus) {
    const action = actionForFocus(mostCommonDegradedLayer);
    const actionPromotion = buildPromotionState({
      automationEligibility: action.automationEligibility,
      automationArtifact: action.automationArtifact,
      targetType: action.targetType,
    });
    const actionExecution = buildExecutionState({
      source: mostCommonDegradedLayer,
      targetType: action.targetType,
      health,
      effectState: action.effectState ?? null,
      automationArtifact: action.automationArtifact,
    });
    const actionObservation = buildObservationHandoff({
      source: mostCommonDegradedLayer,
      targetType: action.targetType,
      targetLabel: action.targetLabel ?? `Stabilize ${mostCommonDegradedLayer}`,
      executionState: actionExecution.executionState,
    });
    const actionPlaybook = findPlaybookByKey(`${mostCommonDegradedLayer}:${String(action.targetType || "monitoring")}`);
    const actionPromotionAction = buildPromotionAction({
      promotionEligibility: actionPromotion.promotionEligibility,
      automationArtifact: action.automationArtifact,
      actionPath: action.actionPath,
      targetType: action.targetType,
      targetLabel: action.targetLabel ?? `Stabilize ${mostCommonDegradedLayer}`,
    });
    nextWeekBets.push({
      priority: "p1",
      title: `Stabilize bet: ${mostCommonDegradedLayer}`,
      reason: `Degraded days repeatedly surfaced in ${mostCommonDegradedLayer}.`,
      actionPath: action.actionPath,
      actionLabel: action.actionLabel,
      expectedImpact: action.expectedImpact,
      metricSummary: action.metricSummary ?? null,
      targetType: action.targetType ?? "monitoring",
      targetId: action.targetId ?? null,
      targetLabel: action.targetLabel ?? `Stabilize ${mostCommonDegradedLayer}`,
      targetMeta: action.targetMeta ?? null,
      automationEligibility: action.automationEligibility ?? "manual_only",
      automationReason: action.automationReason ?? "This suggestion should stay manual-first.",
      automationArtifact: action.automationArtifact ?? null,
      promotionEligibility: actionPromotion.promotionEligibility,
      promotionReason: actionPromotion.promotionReason,
      promotionAction: actionPromotionAction,
      executionState: actionExecution.executionState,
      executionReason: actionExecution.executionReason,
      observationStatus: actionObservation.observationStatus,
      observationWindow: actionObservation.observationWindow,
      observationMetrics: actionObservation.observationMetrics,
      observationNextStep: actionObservation.observationNextStep,
      playbookRef: summarizePlaybookRef(actionPlaybook),
    });
  }

  if (topSource !== "none" && topSource !== "governance") {
    const repeatAction = actionForFocus(topSource === "growth_loop" ? "growth_loop" : topSource === "geo" ? "geo" : topSource === "experiment" ? "experiment" : "governance");
    const repeatPromotion = buildPromotionState({
      automationEligibility: repeatAction.automationEligibility,
      automationArtifact: repeatAction.automationArtifact,
      targetType: repeatAction.targetType,
    });
    const repeatExecution = buildExecutionState({
      source: topSource,
      targetType: repeatAction.targetType,
      health,
      effectState: repeatAction.effectState ?? null,
      automationArtifact: repeatAction.automationArtifact,
    });
    const repeatObservation = buildObservationHandoff({
      source: topSource,
      targetType: repeatAction.targetType,
      targetLabel: repeatAction.targetLabel ?? `Work area ${topSource}`,
      executionState: repeatExecution.executionState,
    });
    const repeatPlaybook = findPlaybookByKey(`${topSource}:${String(repeatAction.targetType || "monitoring")}`);
    const repeatPromotionAction = buildPromotionAction({
      promotionEligibility: repeatPromotion.promotionEligibility,
      automationArtifact: repeatAction.automationArtifact,
      actionPath: repeatAction.actionPath,
      targetType: repeatAction.targetType,
      targetLabel: repeatAction.targetLabel ?? `Work area ${topSource}`,
    });
    nextWeekBets.push({
      priority: "p2",
      title: `Make it repeatable: ${topSource}`,
      reason: `Best bet repeatedly pointed to ${topSource}; convert it into a reusable playbook and reduce manual iteration.`,
      actionPath: repeatAction.actionPath,
      actionLabel: "Open work area",
      expectedImpact: "Turn repeated fixes into a stable operating loop and cut follow-up risk.",
      metricSummary: repeatAction.metricSummary ?? null,
      targetType: repeatAction.targetType ?? "monitoring",
      targetId: repeatAction.targetId ?? null,
      targetLabel: repeatAction.targetLabel ?? `Work area ${topSource}`,
      targetMeta: repeatAction.targetMeta ?? null,
      automationEligibility: repeatAction.automationEligibility ?? "manual_only",
      automationReason: repeatAction.automationReason ?? "This suggestion should stay manual-first.",
      automationArtifact: repeatAction.automationArtifact ?? null,
      promotionEligibility: repeatPromotion.promotionEligibility,
      promotionReason: repeatPromotion.promotionReason,
      promotionAction: repeatPromotionAction,
      executionState: repeatExecution.executionState,
      executionReason: repeatExecution.executionReason,
      observationStatus: repeatObservation.observationStatus,
      observationWindow: repeatObservation.observationWindow,
      observationMetrics: repeatObservation.observationMetrics,
      observationNextStep: repeatObservation.observationNextStep,
      playbookRef: summarizePlaybookRef(repeatPlaybook),
    });
  }

  return {
    health,
    range: { from, to, days: sorted.length },
    headline,
    summary,
    executionOutcomes,
    outcomeAttribution,
    playbookDrafts,
    playbookApplicationOutcomes,
    focus,
    bestBetSources,
    healthBuckets,
    riskDays: riskDays.slice(0, 7),
    nextWeekBets: nextWeekBets.slice(0, 3),
  };
}

async function buildMonitoringSummary({ targetType, actor } = {}) {
  const generatedAt = new Date().toISOString();
  const runtime = getSignalsRuntimeStatus();
  const dependencies = await probeDependencies();
  const seoSyncConfig = getSeoSearchConsoleAutomationConfig();
  const seoSyncStatus = getSeoSyncStatus();
  const seoSyncHealth = summarizeSeoSearchConsoleHealth({ config: seoSyncConfig, status: seoSyncStatus });
  const seoSyncHistory = buildSeoSyncHistorySummary({ seoSyncStatus });

  try {
    const seoGeo = seoOps.getSeoGeoRecommendationSummary();
    seoGeo.contentGaps.forEach((item) => {
      createContentGapRecommendation({
        targetType: item.targetType,
        targetId: item.targetId,
        title: item.title,
        targetPath: item.targetPath,
        observedCount: item.observedCount,
        threshold: item.threshold,
        missingAssetType: item.missingAssetType,
        suggestedWorkflow: item.targetType === "faq" ? "faq-expansion" : undefined,
      });
    });
    seoGeo.thinContent.forEach((item) => {
      createThinContentRecommendation({
        targetType: item.targetType,
        targetId: item.targetId,
        title: item.title,
        targetPath: item.targetPath,
        observedCount: item.observedCount,
        threshold: item.threshold,
        reason: item.reason,
      });
    });
    seoGeo.internalLinkGaps.forEach((item) => {
      createInternalLinkGapRecommendation({
        targetType: item.targetType,
        targetId: item.targetId,
        title: item.title,
        targetPath: item.targetPath,
        observedCount: item.observedCount,
        threshold: item.threshold,
        reason: item.reason,
      });
    });
  } catch {
    // non-blocking
  }

  const { seoFreshness, seoImportDiagnostics, seoPerformance, seoAlerts, seoRecommendationCandidates } = seoOps.getSeoMonitoringSnapshot({
    warningDays: 3,
    criticalDays: 7,
    sinceDays: 14,
    limit: 500,
    windowDays: 7,
  });
  const seoRuntimeJudgment = buildSeoRuntimeJudgment({
    seoSyncHealth,
    seoFreshness,
    seoImportDiagnostics,
  });

  try {
    seoRecommendationCandidates.lowCtr.forEach((candidate) => {
      createSeoLowCtrRecommendation(candidate);
    });
    seoRecommendationCandidates.positionDrop.forEach((candidate) => {
      createSeoPositionDropRecommendation(candidate);
    });
  } catch {
    // non-blocking
  }

  const activeRecommendations = listRecommendations({ targetType, statuses: ["open", "in_progress"] });
  const staleRecommendations = activeRecommendations.filter((item) => item.status === "in_progress" && item.stale);
  const staleExamples = staleRecommendations.slice(0, 5).map((item) => ({
    id: item.id,
    ruleId: item.ruleId,
    targetType: item.targetType,
    targetId: item.targetId,
    staleDays: item.staleDays,
    priorityLevel: item.effectivePriorityLevel ?? item.priorityLevel ?? "p3",
    targetPath: item.targetPath ?? null,
  }));

  const since24h = hoursAgo(24);
  const recentEvents = listEvents().filter((event) => occurredSince(event, since24h));
  const seoSyncControlAudit = buildSeoSyncControlAudit({ events: listEvents(), seoSyncHistory });
  const seoSyncRecoveryReview = buildSeoSyncRecoveryReview({ seoSyncControlAudit });
  const warningPublishes24h = recentEvents.filter(
    (event) => event.action === "publish" && event?.verification?.level === "warning",
  );
  const blockedPublishes24h = recentEvents.filter(
    (event) => event.action === "publish" && event?.verification?.level === "blocked",
  );
  const rollbacks24h = recentEvents.filter((event) => event.action === "rollback");

  const verificationFollowups = activeRecommendations.filter((item) => item.ruleId === "publish-verification-followup");
  const blockedVerificationFollowups = verificationFollowups.filter(
    (item) => item?.context?.verificationLevel === "blocked" || item.severity === "critical",
  );
  const warningVerificationFollowups = verificationFollowups.filter(
    (item) => item?.context?.verificationLevel === "warning" || item.severity === "warning",
  );
  const incidentFollowups = listRuleTuningProposals({ limit: 20 }).items.filter((item) => item.type === "incident_followup");

  const thresholds = {
    workflowStale: { warning: 1, critical: 3 },
    warningPublishes24h: { warning: 1, critical: 3 },
    warningFollowupsOpen: { warning: 1, critical: 3 },
    blockedPublishes24h: { critical: 1 },
    blockedFollowupsOpen: { critical: 1 },
    rollbacks24h: { critical: 1 },
    purchaseGapAbs: { warning: 1, critical: 3 },
  };

  const {
    trackedEvents: tracked24h,
    purchaseDiagnostics,
    commerceCheckout,
    weakCheckoutSources,
    commerceRecommendationCandidates,
    commerceAlerts,
  } = commerceOps.getCommerceMonitoringSnapshot({
    targetType,
    sinceHours: 24,
    thresholds,
  });
  const aiConcierge = summarizeAiConcierge(tracked24h.filter((e) => e.source === "ai_concierge" || e?.metadata?.attribution?.src === "ai_concierge"));
  const {
    paymentResults24h,
    fulfillmentResults24h,
    refundResults24h,
    resultGovernanceRecommendationCandidates,
    resultGovernanceAlerts,
  } = resultGovernanceOps.getResultGovernanceMonitoringSnapshot({ trackedEvents: tracked24h });

  const publishingCases = buildPublishingGovernanceCases({
    recentEvents,
    verificationFollowups,
    incidentProposals: incidentFollowups,
  });
  const publishingQueue = buildPublishingQueue(publishingCases);
  const alerts = [];
  if (runtime.health !== "healthy") {
    alerts.push(
      buildAlert(
        runtime.health === "critical" ? "critical" : "warning",
        "Signals runtime is degraded",
        runtime.consecutiveBatchFailures > 0
          ? `${runtime.consecutiveBatchFailures} consecutive batch failure(s) detected.`
          : "Recent batch state is not healthy.",
      ),
    );
  }
  if (dependencies.medusa.status === "degraded") {
    alerts.push(buildAlert("critical", "Medusa probe failed", dependencies.medusa.detail));
  } else if (dependencies.medusa.status === "not_configured") {
    alerts.push(buildAlert("warning", "Medusa probe is not configured", dependencies.medusa.detail));
  }
  if (dependencies.sanity.status === "degraded") {
    alerts.push(buildAlert("critical", "Sanity probe failed", dependencies.sanity.detail));
  } else if (dependencies.sanity.status === "not_configured") {
    alerts.push(buildAlert("warning", "Sanity probe is not configured", dependencies.sanity.detail));
  }
  if (seoSyncHealth.health === "not_configured") {
    alerts.push(
      buildAlert(
        "warning",
        "Search Console sync is not configured",
        `${seoSyncHealth.detail} ${seoSyncHealth.recoveryHint || ""}`.trim(),
      ),
    );
  } else if (seoSyncHealth.health === "degraded" || seoSyncHealth.health === "warning") {
    if (seoSyncStatus.lastRunStatus === "failure") {
      alerts.push(
        buildAlert(
          seoSyncHealth.health === "degraded" ? "critical" : "warning",
          "Search Console sync is failing",
          `${seoSyncHealth.detail} ${seoSyncHealth.recoveryHint || ""}`.trim(),
        ),
      );
      if (seoSyncStatus.nextAllowedRunAt) {
        alerts.push(
          buildAlert(
            "warning",
            "Search Console sync is backing off",
            `Automatic retry is paused until ${seoSyncStatus.nextAllowedRunAt}.`,
          ),
        );
      }
    }
    if (seoSyncStatus.lastRunStatus === "skipped" && seoSyncStatus.recentRuns?.[0]?.reason === "backoff_active") {
      alerts.push(buildAlert("warning", "Search Console sync is backing off", seoSyncHealth.detail));
    }
  } else if (seoSyncHealth.health === "paused") {
    alerts.push(
      buildAlert(
        "warning",
        "Search Console sync is paused",
        `${seoSyncHealth.detail} ${seoSyncHealth.recoveryHint || ""}`.trim(),
      ),
    );
  } else if (seoSyncHealth.label === "not run yet") {
    alerts.push(buildAlert("warning", "Search Console sync has not run yet", "Automation is enabled but no successful or failed sync has been recorded yet."));
  }
  seoAlerts.forEach((item) => alerts.push(buildAlert(item.level, item.title, item.detail)));
  (resultGovernanceRecommendationCandidates?.paymentIssues || []).forEach((candidate) => {
    createPaymentIssueRecommendation(candidate);
  });
  (resultGovernanceRecommendationCandidates?.fulfillmentBacklog || []).forEach((candidate) => {
    createFulfillmentBacklogRecommendation(candidate);
  });
  (commerceRecommendationCandidates?.checkoutCompletionDropoff || []).forEach((candidate) => {
    createCheckoutCompletionRecommendation(candidate);
  });
  const initialCommerceProposalSnapshot = commerceOps.getCommerceProposalSnapshot({ commerceCheckout });
  const commerceProposalResults = (initialCommerceProposalSnapshot.commerceProposalCandidates || []).map((candidate) =>
    createIncidentFollowupProposal(candidate),
  );
  (commerceAlerts || []).forEach((item) => alerts.push(buildAlert(item.level, item.title, item.detail)));
  (resultGovernanceAlerts || []).forEach((item) => alerts.push(buildAlert(item.level, item.title, item.detail)));
  const refreshedCommerceProposalSnapshot = commerceOps.getCommerceProposalSnapshot({ commerceCheckout });
  (refreshedCommerceProposalSnapshot.commerceObservationFollowupCandidates || []).forEach((candidate) => {
    createCommerceJourneyObservationFollowupRecommendation(candidate);
  });
  const finalCommerceProposalSnapshot = commerceOps.getCommerceProposalSnapshot({ commerceCheckout });
  const commerceRecommendations = finalCommerceProposalSnapshot.commerceRecommendations || [];
  const commerceProposals = finalCommerceProposalSnapshot.commerceProposals || [];
  const initialResultGovernanceWorkflowSnapshot = resultGovernanceOps.getResultGovernanceWorkflowSnapshot();
  const paymentProposalResults = (initialResultGovernanceWorkflowSnapshot.proposalCandidates?.payment || []).map((candidate) =>
    createIncidentFollowupProposal(candidate),
  );
  const fulfillmentProposalResults = (initialResultGovernanceWorkflowSnapshot.proposalCandidates?.fulfillment || []).map((candidate) =>
    createIncidentFollowupProposal(candidate),
  );
  const refreshedResultGovernanceWorkflowSnapshot = resultGovernanceOps.getResultGovernanceWorkflowSnapshot();
  (refreshedResultGovernanceWorkflowSnapshot.observationFollowupCandidates?.payment || []).forEach((candidate) => {
    createPaymentObservationFollowupRecommendation(candidate);
  });
  (refreshedResultGovernanceWorkflowSnapshot.observationFollowupCandidates?.fulfillment || []).forEach((candidate) => {
    createFulfillmentObservationFollowupRecommendation(candidate);
  });
  const finalResultGovernanceWorkflowSnapshot = resultGovernanceOps.getResultGovernanceWorkflowSnapshot();
  const paymentRecommendations = finalResultGovernanceWorkflowSnapshot.lanes?.payment?.recommendations || [];
  const paymentProposals = finalResultGovernanceWorkflowSnapshot.lanes?.payment?.proposals || [];
  const fulfillmentRecommendations = finalResultGovernanceWorkflowSnapshot.lanes?.fulfillment?.recommendations || [];
  const fulfillmentProposals = finalResultGovernanceWorkflowSnapshot.lanes?.fulfillment?.proposals || [];
  const resultGovernanceRuntimeJudgment = buildResultGovernanceRuntimeJudgment({
    paymentResults24h,
    fulfillmentResults24h,
    refundResults24h,
    workflowSnapshot: finalResultGovernanceWorkflowSnapshot,
  });
  const resultGovernanceLaneSummary = buildResultGovernanceLaneSummary({
    paymentResults24h,
    fulfillmentResults24h,
    refundResults24h,
    workflowSnapshot: finalResultGovernanceWorkflowSnapshot,
  });
  if (staleRecommendations.length > 0) {
    alerts.push(
      buildAlert(
        staleRecommendations.length >= thresholds.workflowStale.critical ? "critical" : "warning",
        "Workflow has stale in-progress recommendations",
        `${staleRecommendations.length} recommendation(s) have been in progress beyond the stale threshold.`,
      ),
    );
  }

  // AI concierge funnel quality alert (only if we have enough volume).
  try {
    const entryViews = aiConcierge?.funnel?.entryViews ?? 0;
    const entryCtr = aiConcierge?.funnel?.entryCtr ?? 0;
    const resultsViews = aiConcierge?.funnel?.resultsViews ?? 0;
    const resultCtr = aiConcierge?.funnel?.resultCtr ?? 0;
    const attributedProductViews = aiConcierge?.funnel?.attributedProductViews ?? 0;
    const atcRate = aiConcierge?.funnel?.atcRate ?? 0;
    const purchaseRateFromView = aiConcierge?.funnel?.purchaseRateFromView ?? 0;

    if (entryViews >= 50 && entryCtr < 0.05) {
      alerts.push(
        buildAlert(
          "warning",
          "AI concierge entry CTR is low",
          `24h entry views ${entryViews}, entry CTR ${(entryCtr * 100).toFixed(1)}%. Consider improving entry copy/placement.`,
        ),
      );
      createAiConciergeFunnelRecommendation({
        metricKey: "entry_ctr",
        metricLabel: "Entry CTR",
        observedRate: entryCtr,
        threshold: 0.05,
        sampleSize: entryViews,
        reason: `AI concierge entry CTR is ${(entryCtr * 100).toFixed(1)}% with ${entryViews} entry views. Entry placement/copy likely needs tuning.`,
      });
    }
    if (resultsViews >= 20 && resultCtr < 0.15) {
      alerts.push(
        buildAlert(
          "warning",
          "AI concierge result CTR is low",
          `24h results views ${resultsViews}, result CTR ${(resultCtr * 100).toFixed(1)}%. Consider improving recommendations/reasoning.`,
        ),
      );
      createAiConciergeFunnelRecommendation({
        metricKey: "result_ctr",
        metricLabel: "Result CTR",
        observedRate: resultCtr,
        threshold: 0.15,
        sampleSize: resultsViews,
        reason: `AI concierge result CTR is ${(resultCtr * 100).toFixed(1)}% with ${resultsViews} result views. Recommendation explanation or ranking likely needs tuning.`,
      });
    }
    if (attributedProductViews >= 30 && atcRate < 0.03) {
      alerts.push(
        buildAlert(
          "warning",
          "AI concierge attributed ATC rate is low",
          `24h attributed product views ${attributedProductViews}, ATC rate ${(atcRate * 100).toFixed(1)}%. Consider tuning quiz targeting.`,
        ),
      );
      createAiConciergeFunnelRecommendation({
        metricKey: "atc_view_rate",
        metricLabel: "ATC / product view",
        observedRate: atcRate,
        threshold: 0.03,
        sampleSize: attributedProductViews,
        reason: `AI concierge attributed ATC/view is ${(atcRate * 100).toFixed(1)}% with ${attributedProductViews} product views. Quiz targeting or value framing likely needs tuning.`,
      });
    }
    if (attributedProductViews >= 50 && purchaseRateFromView < 0.01) {
      alerts.push(
        buildAlert(
          "warning",
          "AI concierge attributed purchase rate is low",
          `24h attributed purchases ${aiConcierge?.funnel?.attributedPurchases ?? 0}, purchase/view ${(purchaseRateFromView * 100).toFixed(2)}%. Check checkout friction or recommendation quality.`,
        ),
      );
      createAiConciergeFunnelRecommendation({
        metricKey: "purchase_view_rate",
        metricLabel: "Purchase / product view",
        observedRate: purchaseRateFromView,
        threshold: 0.01,
        sampleSize: attributedProductViews,
        reason: `AI concierge attributed purchase/view is ${(purchaseRateFromView * 100).toFixed(2)}% with ${attributedProductViews} product views. Checkout handoff or recommendation quality needs review.`,
      });
    }
  } catch {
    // non-blocking
  }
  const aiConciergeProposal = syncAiConciergeTuningProposal({ actor: actor || "system" });
  if (aiConciergeProposal?.id && aiConciergeProposal?.status === "approved") {
    try {
      await maybeOpenAiConciergeDraftPullRequestForProposal({
        proposalId: aiConciergeProposal.id,
        actor: actor || "system:ai_concierge_pr",
      });
    } catch {
      // non-blocking
    }
  }
  // If an applied strategy ends up risky, auto-create a conservative follow-up proposal and open a draft PR (if configured).
  const latestAiConciergeApplied = listRuleTuningProposals({ limit: 6, ruleId: "ai-concierge-strategy" }).items.find(
    (p) => String(p.status) === "applied",
  );
  let followupProposal = null;
  if (latestAiConciergeApplied?.id) {
    try {
      followupProposal = createAiConciergeRiskFollowupProposal({
        sourceProposalId: latestAiConciergeApplied.id,
        actor: actor || "system:ai_concierge_followup",
      });
    } catch {
      // non-blocking
    }
  }
  if (followupProposal?.id) {
    try {
      await maybeOpenAiConciergeDraftPullRequestForProposal({
        proposalId: followupProposal.id,
        actor: actor || "system:ai_concierge_followup_pr",
      });
    } catch {
      // non-blocking
    }
  }
  const aiConciergeRecommendations = listRecommendations({
    statuses: ["open", "in_progress"],
    targetType: "collection",
    targetId: "ai-concierge",
  }).slice(0, 5);
  const aiConciergeProposals = listRuleTuningProposals({ limit: 3, ruleId: "ai-concierge-strategy" }).items.filter((item) =>
    ["draft", "approved", "applied"].includes(String(item.status || "")),
  );
  const aiConciergeGovernance = buildAiConciergeGovernanceSummary(
    listRuleTuningProposals({ limit: 12, ruleId: "ai-concierge-strategy" }).items,
  );
  const commerceGovernance = buildCommerceGovernanceSummary({
    recommendations: commerceRecommendations,
    proposals: commerceProposals,
  });
  const commerceHealthSummary = buildCommerceHealthSummary({
    commerceCheckout,
    weakCheckoutSources,
    commerceGovernance,
  });
  const commerceRuntimeJudgment = buildCommerceRuntimeJudgment({
    commerceCheckout,
    weakCheckoutSources,
    commerceGovernance,
    commerceHealthSummary,
  });
  const commerceSourceSummary = buildCommerceSourceSummary({
    commerceCheckout,
    commerceRecommendations,
    commerceProposals,
  });
  const governanceOverview = buildTopLevelGovernanceOverview({
    seoRuntimeJudgment,
    seoSyncRecoveryReview,
    resultGovernanceRuntimeJudgment,
    resultGovernanceLaneSummary,
    commerceRuntimeJudgment,
    commerceHealthSummary,
    commerceSourceSummary,
  });
  const growthLoopOverview = buildGrowthLoopOverview({
    seoPerformance,
    seoRuntimeJudgment,
    commerceCheckout,
    commerceRuntimeJudgment,
    commerceSourceSummary,
    purchase: {
      misalignedTargetsCount: purchaseDiagnostics.length,
      topGaps: purchaseDiagnostics.slice(0, 5),
      thresholdAbsGap: thresholds.purchaseGapAbs,
    },
    governanceOverview,
  });
  const geoOverview = buildGeoOverview({
    seoPerformance,
    seoRuntimeJudgment,
    aiConcierge,
    aiConciergeGovernance,
  });
  const paymentGovernance = buildPaymentGovernanceSummary({
    recommendations: paymentRecommendations,
    proposals: paymentProposals,
  });
  const governanceGroups = buildGovernanceGroups({ aiConciergeGovernance, commerceGovernance, paymentGovernance });
  const growthExperimentOverview = buildGrowthExperimentOverview({ governanceGroups });
  const todaysBestBet = buildTodaysBestBet({
    governanceOverview,
    growthLoopOverview,
    geoOverview,
    growthExperimentOverview,
    commerceSourceSummary,
    commerceProposals,
  });
  const decisionTimeline = buildDecisionTimeline({
    events: listEvents(),
    todaysBestBet,
    governanceOverview,
    growthLoopOverview,
    geoOverview,
    growthExperimentOverview,
  });
  const snapshotDate = String(generatedAt).slice(0, 10);
  upsertDailyMonitoringSnapshot({
    date: snapshotDate,
    recordedAt: generatedAt,
    todaysBestBet,
    governanceOverview,
    growthLoopOverview,
    geoOverview,
    growthExperimentOverview,
  });
  const dailySnapshotHistory = buildDailySnapshotHistory({
    snapshots: listDailyMonitoringSnapshots(7),
  });
  const weeklyOperatingReview = buildWeeklyOperatingReview({
    dailySnapshotHistory,
    governanceOverview,
    growthLoopOverview,
    geoOverview,
    growthExperimentOverview,
    commerceSourceSummary,
    commerceProposals,
  });
  const publishAlertLevel = publishingAlertLevel({
    warningPublishes24h: warningPublishes24h.length,
    blockedPublishes24h: blockedPublishes24h.length,
    rollbacks24h: rollbacks24h.length,
    blockedVerificationFollowups: blockedVerificationFollowups.length,
    warningVerificationFollowups: warningVerificationFollowups.length,
    thresholds,
  });
  if (publishAlertLevel === "critical") {
    alerts.push(
      buildAlert(
        "critical",
        "Publish verification issues need attention",
        `${warningPublishes24h.length} warning publish event(s), ${blockedPublishes24h.length} blocked publish event(s), ${rollbacks24h.length} rollback(s) and ${blockedVerificationFollowups.length} blocked follow-up recommendation(s) in the current view.`,
      ),
    );
  } else if (publishAlertLevel === "warning") {
    alerts.push(
      buildAlert(
        "warning",
        "Publish warnings are accumulating",
        `${warningPublishes24h.length} warning publish event(s) and ${warningVerificationFollowups.length} active warning follow-up recommendation(s) in the current view.`,
      ),
    );
  }
  if (rollbacks24h.length > 0) {
    alerts.push(
      buildAlert(
        "critical",
        "Recent rollback activity detected",
        `${rollbacks24h.length} rollback event(s) occurred in the last 24 hours.`,
      ),
    );
  }
  // 落盘：把 monitoring 生成的告警同步到 ops alert queue，供值班回看/ack。
  // 非阻断：即使持久化失败，也不影响 monitoring summary 返回。
  try {
    upsertAlertsFromMonitoring({ alerts, actor: actor || "system", source: "monitoring" });
  } catch {
    // non-blocking
  }
  // 落盘：把需要用户触达的通知/召回意图落盘成队列对象。默认仍是人工确认；如果 env gating 命中，则允许自动发送。
  try {
    const intents = buildCustomerNotificationIntents(tracked24h);
    upsertCustomerNotificationsFromMonitoring({ notifications: intents, actor: actor || "system", source: "monitoring" });
    await autoSendEligibleCustomerNotifications({ actor: actor || "system", limit: 20 });
  } catch {
    // non-blocking
  }
  try {
    const supportCases = buildSupportCaseIntents({
      tracked24h,
      paymentRecommendations,
      fulfillmentRecommendations,
      refundResults24h,
    });
    upsertSupportCasesFromMonitoring({ cases: supportCases, actor: actor || "system", source: "monitoring" });
  } catch {
    // non-blocking
  }

  return {
    generatedAt,
    runtime: {
      controlPlane: "healthy",
      signalsHealth: runtime.health,
      cmsAdapter: adapterName,
      consecutiveBatchFailures: runtime.consecutiveBatchFailures,
      lastBatchRunAt: runtime.lastBatchRun?.at ?? null,
      counts: runtime.counts,
      seoSync: {
        enabled: seoSyncConfig.enabled,
        configured: seoSyncConfig.configured,
        intervalMinutes: seoSyncConfig.intervalMinutes,
        failureBaseDelayMinutes: seoSyncConfig.failureBaseDelayMinutes,
        failureMaxDelayMinutes: seoSyncConfig.failureMaxDelayMinutes,
        runOnStart: seoSyncConfig.runOnStart,
        siteUrl: seoSyncConfig.siteUrl,
        missing: seoSyncConfig.missing,
        health: seoSyncHealth.health,
        healthLabel: seoSyncHealth.label,
        healthDetail: seoSyncHealth.detail,
        recoveryHint: seoSyncHealth.recoveryHint || seoSyncStatus.recoveryHint || null,
        lastErrorCategory: seoSyncStatus.lastErrorCategory,
        lastErrorCode: seoSyncStatus.lastErrorCode,
        lastErrorRetryable: seoSyncStatus.lastErrorRetryable,
        ...seoSyncStatus,
        recentRuns: Array.isArray(seoSyncStatus.recentRuns) ? seoSyncStatus.recentRuns.slice(0, 10) : [],
      },
      dependencies,
    },
    governanceOverview,
    growthLoopOverview,
    geoOverview,
    growthExperimentOverview,
    todaysBestBet,
    decisionTimeline,
    dailySnapshotHistory,
    weeklyOperatingReview,
    seoRuntimeJudgment,
    seoSyncHistory,
    seoSyncControlAudit,
    seoSyncRecoveryReview,
    seoFreshness,
    seoImportDiagnostics,
    seoPerformance,
    workflow: {
      openCount: activeRecommendations.filter((item) => item.status === "open").length,
      inProgressCount: activeRecommendations.filter((item) => item.status === "in_progress").length,
      staleCount: staleRecommendations.length,
      staleExamples,
      thresholds: thresholds.workflowStale,
    },
    publishing: {
      warningPublishes24h: warningPublishes24h.length,
      blockedPublishes24h: blockedPublishes24h.length,
      rollbacks24h: rollbacks24h.length,
      blockedFollowupsOpen: blockedVerificationFollowups.length,
      warningFollowupsOpen: warningVerificationFollowups.length,
      cases: publishingCases.slice(0, 8),
      queue: publishingQueue,
      thresholds: {
        warningPublishes24h: thresholds.warningPublishes24h,
        blockedPublishes24h: thresholds.blockedPublishes24h,
        rollbacks24h: thresholds.rollbacks24h,
        blockedFollowupsOpen: thresholds.blockedFollowupsOpen,
        warningFollowupsOpen: thresholds.warningFollowupsOpen,
      },
    },
    purchase: {
      misalignedTargetsCount: purchaseDiagnostics.length,
      topGaps: purchaseDiagnostics.slice(0, 5),
      thresholdAbsGap: thresholds.purchaseGapAbs,
    },
    paymentResults24h: {
      ...paymentResults24h,
      recommendations: paymentRecommendations,
      proposals: paymentProposals,
      proposalSync: {
        evaluated: paymentRecommendations.length,
        createdOrUpdated: paymentProposalResults.filter(Boolean).length,
      },
      governance: paymentGovernance,
    },
    fulfillmentResults24h: {
      ...fulfillmentResults24h,
      recommendations: fulfillmentRecommendations,
      proposals: fulfillmentProposals,
      proposalSync: {
        evaluated: fulfillmentRecommendations.length,
        createdOrUpdated: fulfillmentProposalResults.filter(Boolean).length,
      },
    },
    refundResults24h,
    resultGovernanceRuntimeJudgment,
    resultGovernanceLaneSummary,
    commerceHealthSummary,
    commerceRuntimeJudgment,
    commerceSourceSummary,
    commerceCheckout: {
      ...commerceCheckout,
      recommendations: commerceRecommendations,
      proposals: commerceProposals,
      governance: commerceGovernance,
      proposalSync: {
        evaluated: commerceRecommendations.length,
        createdOrUpdated: commerceProposalResults.filter(Boolean).length,
      },
    },
    aiConcierge: {
      ...aiConcierge,
      recommendations: aiConciergeRecommendations,
      proposals: aiConciergeProposal ? aiConciergeProposals : aiConciergeProposals,
      governance: aiConciergeGovernance,
    },
    governanceGroups,
    alerts,
  };
}

module.exports = {
  buildMonitoringSummary,
};
