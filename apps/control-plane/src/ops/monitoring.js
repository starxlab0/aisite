const { adapterName } = require("../cms-adapters");
const { collectionTargets, faqTargets, guideTargets, productTargets } = require("../data/bootstrap-content");
const {
  getPurchaseDiagnostics,
  getSignalsRuntimeStatus,
  listRecommendations,
  listRuleTuningProposals,
  listTargetSummaries,
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
} = require("../signals/store");
const {
  listEvents,
  listRepoChanges,
  upsertAlertsFromMonitoring,
  upsertCustomerNotificationsFromMonitoring,
  autoSendEligibleCustomerNotifications,
  upsertSupportCasesFromMonitoring,
  listSeoMetrics,
  getSeoMetricsWindowSummary,
} = require("./store");

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

function summarizeCommerceCheckout(events) {
  const commerceEvents = Array.isArray(events) ? events : [];
  const starts = commerceEvents.filter((item) => item.eventType === "checkout_start");
  const completes = commerceEvents.filter((item) => item.eventType === "checkout_complete");
  const purchases = commerceEvents.filter((item) => item.eventType === "purchase");
  const sourceMap = new Map();
  const pathMap = new Map();

  const resolveSource = (item) => {
    const attr = String(item?.metadata?.attribution?.src || "").trim();
    if (attr) return attr;
    const source = String(item?.source || "").trim();
    return source || "unknown";
  };

  const ensureSource = (key) => {
    const sourceKey = key || "unknown";
    if (!sourceMap.has(sourceKey)) {
      sourceMap.set(sourceKey, {
        source: sourceKey,
        starts: new Set(),
        completes: new Set(),
        purchases: 0,
      });
    }
    return sourceMap.get(sourceKey);
  };

  const resolvePathKey = (item) => {
    const source = resolveSource(item);
    const targetType = String(item?.targetType || "unknown").trim() || "unknown";
    const targetId = String(item?.targetId || "unknown").trim() || "unknown";
    return `${source}::${targetType}::${targetId}`;
  };

  const ensurePath = (item) => {
    const key = resolvePathKey(item);
    if (!pathMap.has(key)) {
      pathMap.set(key, {
        key,
        source: resolveSource(item),
        targetType: String(item?.targetType || "unknown").trim() || "unknown",
        targetId: String(item?.targetId || "unknown").trim() || "unknown",
        contentRef: item?.contentRef ?? null,
        starts: new Set(),
        completes: new Set(),
        purchases: 0,
      });
    }
    return pathMap.get(key);
  };

  const uniqueStarts = new Set(starts.map((item) => item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`));
  const uniqueCompletes = new Set(completes.map((item) => item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`));

  starts.forEach((item) => {
    const group = ensureSource(resolveSource(item));
    group.starts.add(item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`);
    const path = ensurePath(item);
    path.starts.add(item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`);
  });
  completes.forEach((item) => {
    const group = ensureSource(resolveSource(item));
    group.completes.add(item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`);
    const path = ensurePath(item);
    path.completes.add(item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`);
  });
  purchases.forEach((item) => {
    const group = ensureSource(resolveSource(item));
    group.purchases += 1;
    const path = ensurePath(item);
    path.purchases += 1;
  });

  const checkoutStarts = uniqueStarts.size;
  const checkoutCompletes = uniqueCompletes.size;
  const checkoutDropoff = Math.max(0, checkoutStarts - checkoutCompletes);
  const checkoutCompletionRate = checkoutStarts > 0 ? checkoutCompletes / checkoutStarts : 0;
  const bySource = Array.from(sourceMap.values())
    .map((item) => {
      const sourceStarts = item.starts.size;
      const sourceCompletes = item.completes.size;
      const paths = Array.from(pathMap.values())
        .filter((entry) => entry.source === item.source)
        .map((entry) => {
          const pathStarts = entry.starts.size;
          const pathCompletes = entry.completes.size;
          return {
            key: entry.key,
            source: entry.source,
            targetType: entry.targetType,
            targetId: entry.targetId,
            contentRef: entry.contentRef,
            checkoutStarts: pathStarts,
            checkoutCompletes: pathCompletes,
            checkoutDropoff: Math.max(0, pathStarts - pathCompletes),
            checkoutCompletionRate: pathStarts > 0 ? pathCompletes / pathStarts : 0,
            purchases24h: entry.purchases,
          };
        })
        .sort((a, b) => {
          if (b.checkoutDropoff !== a.checkoutDropoff) return b.checkoutDropoff - a.checkoutDropoff;
          if (b.checkoutStarts !== a.checkoutStarts) return b.checkoutStarts - a.checkoutStarts;
          return `${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`);
        })
        .slice(0, 5);
      return {
        source: item.source,
        checkoutStarts: sourceStarts,
        checkoutCompletes: sourceCompletes,
        checkoutDropoff: Math.max(0, sourceStarts - sourceCompletes),
        checkoutCompletionRate: sourceStarts > 0 ? sourceCompletes / sourceStarts : 0,
        purchases24h: item.purchases,
        paths,
      };
    })
    .sort((a, b) => {
      if (b.checkoutStarts !== a.checkoutStarts) return b.checkoutStarts - a.checkoutStarts;
      return a.source.localeCompare(b.source);
    });

  return {
    checkoutStarts,
    checkoutCompletes,
    checkoutDropoff,
    checkoutCompletionRate,
    purchases24h: purchases.length,
    bySource,
  };
}

function summarizePaymentResults(events) {
  const items = Array.isArray(events) ? events : [];
  const byType = {
    payment_paid: new Set(),
    payment_authorized: new Set(),
    payment_failed: new Set(),
    payment_canceled: new Set(),
    payment_requires_action: new Set(),
  };
  const targetCounts = new Map();
  const reasonCounts = new Map();
  const reasonLabel = (reason) => {
    const key = String(reason || "").trim();
    if (key === "declined") return "declined";
    if (key === "timeout") return "timeout";
    if (key === "customer_abandon") return "customer abandon";
    if (key === "action_required") return "action required";
    if (key === "capture_pending") return "capture pending";
    if (key === "completed") return "completed";
    if (key === "pending_sync") return "pending sync";
    if (key === "provider_error") return "provider error";
    return "unknown";
  };

  const resolveOrderKey = (item) =>
    String(item?.metadata?.orderId || item?.dedupeKey || `${item?.targetType || "unknown"}:${item?.targetId || "unknown"}:${item?.at || ""}`);
  const resolveTargetPath = (item) => {
    const contentRef = String(item?.contentRef || "").trim();
    if (contentRef) return `/products/${contentRef}`;
    const targetType = String(item?.targetType || "unknown").trim() || "unknown";
    const targetId = String(item?.targetId || "unknown").trim() || "unknown";
    return `${targetType}:${targetId}`;
  };

  const registerTarget = (issueKey, item) => {
    const targetType = String(item?.targetType || "unknown").trim() || "unknown";
    const targetId = String(item?.targetId || "unknown").trim() || "unknown";
    const key = `${issueKey}::${targetType}::${targetId}`;
    const existing = targetCounts.get(key) ?? {
      key,
      issueKey,
      targetType,
      targetId,
      contentRef: item?.contentRef ?? null,
      targetPath: resolveTargetPath(item),
      orders: new Set(),
    };
    existing.orders.add(resolveOrderKey(item));
    targetCounts.set(key, existing);
  };
  const registerReason = (issueKey, item) => {
    const reason = String(item?.metadata?.paymentIssueReason || "").trim() || "unknown";
    const key = `${issueKey}::${reason}`;
    const existing = reasonCounts.get(key) ?? {
      key,
      issueKey,
      reason,
      orders: new Set(),
    };
    existing.orders.add(resolveOrderKey(item));
    reasonCounts.set(key, existing);
  };

  items.forEach((item) => {
    if (!Object.prototype.hasOwnProperty.call(byType, item?.eventType)) return;
    byType[item.eventType].add(resolveOrderKey(item));
    if (item?.eventType !== "payment_paid" && item?.eventType !== "payment_authorized") {
      registerTarget(item.eventType, item);
      registerReason(item.eventType, item);
    }
  });

  const paid = byType.payment_paid.size;
  const authorized = byType.payment_authorized.size;
  const failed = byType.payment_failed.size;
  const canceled = byType.payment_canceled.size;
  const requiresAction = byType.payment_requires_action.size;
  const issues = failed + canceled + requiresAction;
  const terminal = paid + failed + canceled;
  const buildTopTargets = (issueKey) =>
    Array.from(targetCounts.values())
      .filter((item) => item.issueKey === issueKey)
      .map((item) => ({
        key: item.key,
        issueKey: item.issueKey,
        targetType: item.targetType,
        targetId: item.targetId,
        contentRef: item.contentRef,
        targetPath: item.targetPath,
        affectedOrders: item.orders.size,
      }))
      .sort((a, b) => b.affectedOrders - a.affectedOrders || `${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`))
      .slice(0, 5);
  const buildTopReasons = (issueKey) =>
    Array.from(reasonCounts.values())
      .filter((item) => item.issueKey === issueKey)
      .map((item) => ({
        key: item.key,
        issueKey: item.issueKey,
        reason: item.reason,
        label: reasonLabel(item.reason),
        affectedOrders: item.orders.size,
      }))
      .sort((a, b) => b.affectedOrders - a.affectedOrders || a.label.localeCompare(b.label))
      .slice(0, 3);
  const dominantReason = (issueKey) => buildTopReasons(issueKey)[0] ?? null;

  return {
    paid,
    authorized,
    failed,
    canceled,
    requiresAction,
    issues,
    issueRate: terminal > 0 ? issues / terminal : 0,
    recoveryLanes: {
      providerReview: failed,
      customerRetry: canceled,
      customerAction: requiresAction,
      awaitingCapture: authorized,
      fulfillmentReady: paid,
    },
    topReasons: {
      payment_failed: buildTopReasons("payment_failed"),
      payment_canceled: buildTopReasons("payment_canceled"),
      payment_requires_action: buildTopReasons("payment_requires_action"),
    },
    dominantReasons: {
      payment_failed: dominantReason("payment_failed"),
      payment_canceled: dominantReason("payment_canceled"),
      payment_requires_action: dominantReason("payment_requires_action"),
    },
    topTargets: {
      payment_failed: buildTopTargets("payment_failed"),
      payment_canceled: buildTopTargets("payment_canceled"),
      payment_requires_action: buildTopTargets("payment_requires_action"),
    },
  };
}

function summarizeFulfillmentResults(events) {
  const items = Array.isArray(events) ? events : [];
  const byType = {
    fulfillment_processing: new Set(),
    fulfillment_shipped: new Set(),
    fulfillment_delivered: new Set(),
  };
  const targetCounts = new Map();
  const resolveOrderKey = (item) =>
    String(item?.metadata?.orderId || item?.dedupeKey || `${item?.targetType || "unknown"}:${item?.targetId || "unknown"}:${item?.at || ""}`);
  const resolveTargetPath = (item) => {
    const contentRef = String(item?.contentRef || "").trim();
    if (contentRef) return `/products/${contentRef}`;
    const targetType = String(item?.targetType || "unknown").trim() || "unknown";
    const targetId = String(item?.targetId || "unknown").trim() || "unknown";
    return `${targetType}:${targetId}`;
  };
  const registerTarget = (eventType, item) => {
    const targetType = String(item?.targetType || "unknown").trim() || "unknown";
    const targetId = String(item?.targetId || "unknown").trim() || "unknown";
    const key = `${eventType}::${targetType}::${targetId}`;
    const existing = targetCounts.get(key) ?? {
      key,
      eventType,
      targetType,
      targetId,
      contentRef: item?.contentRef ?? null,
      targetPath: resolveTargetPath(item),
      orders: new Set(),
    };
    existing.orders.add(resolveOrderKey(item));
    targetCounts.set(key, existing);
  };

  items.forEach((item) => {
    if (!Object.prototype.hasOwnProperty.call(byType, item?.eventType)) return;
    byType[item.eventType].add(resolveOrderKey(item));
    registerTarget(item.eventType, item);
  });

  const buildTopTargets = (eventType) =>
    Array.from(targetCounts.values())
      .filter((item) => item.eventType === eventType)
      .map((item) => ({
        key: item.key,
        eventType: item.eventType,
        targetType: item.targetType,
        targetId: item.targetId,
        contentRef: item.contentRef,
        targetPath: item.targetPath,
        affectedOrders: item.orders.size,
      }))
      .sort((a, b) => b.affectedOrders - a.affectedOrders || `${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`))
      .slice(0, 5);

  return {
    processing: byType.fulfillment_processing.size,
    shipped: byType.fulfillment_shipped.size,
    delivered: byType.fulfillment_delivered.size,
    topTargets: {
      fulfillment_processing: buildTopTargets("fulfillment_processing"),
      fulfillment_shipped: buildTopTargets("fulfillment_shipped"),
      fulfillment_delivered: buildTopTargets("fulfillment_delivered"),
    },
  };
}

function summarizeRefundResults(events) {
  const items = Array.isArray(events) ? events : [];
  const byType = {
    refund_requested: new Set(),
    refund_refunded: new Set(),
  };
  const targetCounts = new Map();
  const resolveOrderKey = (item) =>
    String(item?.metadata?.orderId || item?.dedupeKey || `${item?.targetType || "unknown"}:${item?.targetId || "unknown"}:${item?.at || ""}`);
  const resolveTargetPath = (item) => {
    const contentRef = String(item?.contentRef || "").trim();
    if (contentRef) return `/products/${contentRef}`;
    const targetType = String(item?.targetType || "unknown").trim() || "unknown";
    const targetId = String(item?.targetId || "unknown").trim() || "unknown";
    return `${targetType}:${targetId}`;
  };
  const registerTarget = (eventType, item) => {
    const targetType = String(item?.targetType || "unknown").trim() || "unknown";
    const targetId = String(item?.targetId || "unknown").trim() || "unknown";
    const key = `${eventType}::${targetType}::${targetId}`;
    const existing = targetCounts.get(key) ?? {
      key,
      eventType,
      targetType,
      targetId,
      contentRef: item?.contentRef ?? null,
      targetPath: resolveTargetPath(item),
      orders: new Set(),
    };
    existing.orders.add(resolveOrderKey(item));
    targetCounts.set(key, existing);
  };

  items.forEach((item) => {
    if (!Object.prototype.hasOwnProperty.call(byType, item?.eventType)) return;
    byType[item.eventType].add(resolveOrderKey(item));
    registerTarget(item.eventType, item);
  });

  const buildTopTargets = (eventType) =>
    Array.from(targetCounts.values())
      .filter((item) => item.eventType === eventType)
      .map((item) => ({
        key: item.key,
        eventType: item.eventType,
        targetType: item.targetType,
        targetId: item.targetId,
        contentRef: item.contentRef,
        targetPath: item.targetPath,
        affectedOrders: item.orders.size,
      }))
      .sort((a, b) => b.affectedOrders - a.affectedOrders || `${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`))
      .slice(0, 5);

  const requested = byType.refund_requested.size;
  const refunded = byType.refund_refunded.size;
  return {
    requested,
    refunded,
    backlog: Math.max(0, requested - refunded),
    topTargets: {
      refund_requested: buildTopTargets("refund_requested"),
      refund_refunded: buildTopTargets("refund_refunded"),
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

function buildSeoGeoRecommendationSummary() {
  const contentGaps = [];
  const thinContent = [];
  const internalLinkGaps = [];

  Object.values(faqTargets).forEach((target) => {
    const faqCount = Array.isArray(target.existingFaqs) ? target.existingFaqs.length : 0;
    if (faqCount < 5) {
      contentGaps.push({
        key: `faq:${target.targetType}:${target.targetId}`,
        targetType: "faq",
        targetId: `${target.targetType}:${target.targetId}`,
        title: `${target.title} FAQ`,
        targetPath: target.targetPath,
        observedCount: faqCount,
        threshold: 5,
        missingAssetType: "faq_cluster",
      });
    }
  });

  Object.values(productTargets).forEach((target) => {
    const descLength = String(target.currentShortDescription || "").trim().length;
    const benefitCount = Array.isArray(target.currentKeyBenefits) ? target.currentKeyBenefits.length : 0;
    if (descLength < 48 || benefitCount < 4) {
      thinContent.push({
        key: `product:${target.targetId}`,
        targetType: "product",
        targetId: target.targetId,
        title: target.title,
        targetPath: target.targetPath,
        observedCount: Math.min(descLength, benefitCount * 12),
        threshold: 48,
        reason: `${target.title} still has a short explanation layer for SEO/GEO. Expand buyer intent, objections, and next-step guidance beyond the basic hero copy.`,
      });
    }
  });

  Object.values(collectionTargets).forEach((target) => {
    const moduleCount = Array.isArray(target.currentModules) ? target.currentModules.length : 0;
    const heroLength = String(target.currentHeroSummary || "").trim().length;
    if (moduleCount < 4 || heroLength < 90) {
      thinContent.push({
        key: `collection:${target.targetId}`,
        targetType: "collection",
        targetId: target.targetId,
        title: target.title,
        targetPath: target.targetPath,
        observedCount: moduleCount,
        threshold: 4,
        reason: `${target.title} needs more structured buying help and richer topic coverage before it can act as a strong organic hub.`,
      });
    }
    if (!target.currentModules?.includes("guide-links")) {
      internalLinkGaps.push({
        key: `collection:${target.targetId}`,
        targetType: "collection",
        targetId: target.targetId,
        title: target.title,
        targetPath: target.targetPath,
        observedCount: moduleCount,
        threshold: 4,
        reason: `${target.title} is not linking strongly enough into adjacent guides, FAQs, or narrower decision pages.`,
      });
    }
  });

  Object.values(guideTargets).forEach((target) => {
    const excerptLength = String(target.currentExcerpt || "").trim().length;
    if (excerptLength < 36) {
      thinContent.push({
        key: `guide:${target.targetId}`,
        targetType: "guide",
        targetId: target.targetId,
        title: target.title,
        targetPath: target.targetPath,
        observedCount: excerptLength,
        threshold: 36,
        reason: `${target.title} needs a stronger answer-first excerpt and clearer summary structure for GEO-style answer extraction.`,
      });
    }
  });

  return { contentGaps, thinContent, internalLinkGaps };
}

async function buildMonitoringSummary({ targetType, actor } = {}) {
  const generatedAt = new Date().toISOString();
  const runtime = getSignalsRuntimeStatus();
  const dependencies = await probeDependencies();

  try {
    const seoGeo = buildSeoGeoRecommendationSummary();
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

  const seoRows = listSeoMetrics({ sinceDays: 14, limit: 500 }).items;
  const seoTargets = Array.from(
    new Map(
      seoRows.map((row) => [`${row.targetType}:${row.targetId}`, { targetType: row.targetType, targetId: row.targetId }]),
    ).values(),
  );
  const metaForSeoTarget = (targetType, targetId) => {
    if (targetType === "product") return productTargets[targetId] ?? null;
    if (targetType === "collection") return collectionTargets[targetId] ?? null;
    if (targetType === "guide") return guideTargets[`guide:${targetId}`] ?? null;
    if (targetType === "faq") return faqTargets[targetId] ?? null;
    return null;
  };

  const seoPerformance = {
    windowDays: 7,
    targets: seoTargets
      .map((t) => {
        const meta = metaForSeoTarget(t.targetType, t.targetId);
        const summary = getSeoMetricsWindowSummary({ targetType: t.targetType, targetId: t.targetId, windowDays: 7 });
        const lowCtr = summary.current.impressions >= 80 && summary.current.ctr < 0.02;
        const posDrop = summary.delta.position != null && summary.delta.position > 3 && summary.current.impressions >= 50;
        const issueTypes = [lowCtr ? "low_ctr" : null, posDrop ? "position_drop" : null].filter(Boolean);
        const scoreLowCtr = lowCtr ? (0.02 - summary.current.ctr) * 10000 + summary.current.impressions / 10 : 0;
        const scorePosDrop = posDrop ? summary.delta.position * 120 + summary.current.impressions / 10 : 0;
        const issueScore = Math.max(scoreLowCtr, scorePosDrop);

        return {
          ...t,
          title: meta?.title ?? `${t.targetType}:${t.targetId}`,
          targetPath: meta?.targetPath ?? null,
          summary,
          issueTypes,
          issueScore,
        };
      })
      .sort((a, b) => (b.issueScore || 0) - (a.issueScore || 0))
      .slice(0, 50),
  };

  try {
    seoPerformance.targets.forEach((t) => {
      const s = t.summary;
      if (s.current.impressions >= 80 && s.current.ctr < 0.02) {
        createSeoLowCtrRecommendation({
          targetType: t.targetType,
          targetId: t.targetId,
          title: t.title,
          targetPath: t.targetPath,
          impressions: s.current.impressions,
          clicks: s.current.clicks,
          ctr: s.current.ctr,
          threshold: 0.02,
          windowDays: s.windowDays,
        });
      }
      if (s.delta.position != null && s.delta.position > 3 && s.current.impressions >= 50) {
        createSeoPositionDropRecommendation({
          targetType: t.targetType,
          targetId: t.targetId,
          title: t.title,
          targetPath: t.targetPath,
          impressions: s.current.impressions,
          currentPosition: s.current.position,
          previousPosition: s.previous.position,
          deltaPosition: s.delta.position,
          threshold: 3,
          windowDays: s.windowDays,
        });
      }
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

  const purchaseDiagnostics = listTargetSummaries({ targetType })
    .filter((item) => item.latestSnapshot || item.activeRecommendationsCount > 0)
    .map((item) => {
      const diagnostics = getPurchaseDiagnostics({ targetType: item.target.type, targetId: item.target.id });
      return {
        title: item.target.title,
        targetType: item.target.type,
        targetId: item.target.id,
        targetPath: item.target.targetPath ?? null,
        status: diagnostics.status,
        gap: diagnostics.gap,
        eventPurchaseCount: diagnostics.eventPurchaseCount,
        snapshotPurchaseCount: diagnostics.snapshotPurchaseCount,
        windowDays: diagnostics.windowDays,
      };
    })
    .filter((item) => item.status !== "aligned" && !(item.status === "missing_snapshot" && item.eventPurchaseCount === 0))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || String(a.title).localeCompare(String(b.title)));
  const tracked24h = listTrackedEvents({ sinceHours: 24 });
  const aiConcierge = summarizeAiConcierge(tracked24h.filter((e) => e.source === "ai_concierge" || e?.metadata?.attribution?.src === "ai_concierge"));
  const commerceCheckout = summarizeCommerceCheckout(tracked24h);
  const paymentResults24h = summarizePaymentResults(tracked24h);
  const fulfillmentResults24h = summarizeFulfillmentResults(tracked24h);
  const refundResults24h = summarizeRefundResults(tracked24h);

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
  const weakCheckoutSources = commerceCheckout.bySource.filter(
    (item) => item.checkoutStarts >= 3 && item.checkoutCompletionRate < 0.4,
  );
  [
    { issueKey: "payment_failed", count: paymentResults24h.failed },
    { issueKey: "payment_canceled", count: paymentResults24h.canceled },
    { issueKey: "payment_requires_action", count: paymentResults24h.requiresAction },
  ].forEach(({ issueKey, count }) => {
    if (count < 1 || paymentResults24h.issues < 2) return;
    const topTargets = Array.isArray(paymentResults24h.topTargets?.[issueKey]) ? paymentResults24h.topTargets[issueKey] : [];
    createPaymentIssueRecommendation({
      issueKey,
      affectedOrders: count,
      issueRate: paymentResults24h.issueRate,
      paidCount: paymentResults24h.paid,
      authorizedCount: paymentResults24h.authorized,
      requiresActionCount: paymentResults24h.requiresAction,
      failedCount: paymentResults24h.failed,
      canceledCount: paymentResults24h.canceled,
      dominantReason: paymentResults24h.dominantReasons?.[issueKey] ?? null,
      targetBreakdown: topTargets,
      weakestPath: topTargets[0] ?? null,
    });
  });
  if (fulfillmentResults24h.processing >= 3 && fulfillmentResults24h.shipped + fulfillmentResults24h.delivered <= 1) {
    const topTargets = Array.isArray(fulfillmentResults24h.topTargets?.fulfillment_processing)
      ? fulfillmentResults24h.topTargets.fulfillment_processing
      : [];
    createFulfillmentBacklogRecommendation({
      stageKey: "fulfillment_processing",
      affectedOrders: fulfillmentResults24h.processing,
      shippedCount: fulfillmentResults24h.shipped,
      deliveredCount: fulfillmentResults24h.delivered,
      targetBreakdown: topTargets,
      weakestPath: topTargets[0] ?? null,
    });
  }
  weakCheckoutSources.forEach((item) => {
    const weakestPath = item.paths?.[0] ?? null;
    createCheckoutCompletionRecommendation({
      sourceKey: item.source,
      observedRate: item.checkoutCompletionRate,
      threshold: 0.4,
      checkoutStarts: item.checkoutStarts,
      checkoutCompletes: item.checkoutCompletes,
      checkoutDropoff: item.checkoutDropoff,
      targetBreakdown: Array.isArray(item.paths) ? item.paths.slice(0, 3) : [],
      weakestPath,
    });
  });
  const baseCommerceRecommendations = listRecommendations({ statuses: ["open", "in_progress"] })
    .filter((item) => item.ruleId === "checkout-completion-dropoff")
    .slice(0, 6);
  const commerceProposalResults = baseCommerceRecommendations.map((rec) =>
    createIncidentFollowupProposal({
      actor: "ai:proposal",
      targetType: "journey",
      targetId: rec.targetId,
      anomalyKind: "checkout_completion_dropoff",
      severity: rec.severity === "critical" ? "critical" : "warning",
      summary:
        rec.reason ||
        `Checkout completion is weak for source ${rec.targetId}; investigate handoff, trust signals, and product-match before sending more traffic into this path.`,
      expectedImpact:
        "Recover more orders from an existing acquisition or content source by tightening the handoff into checkout instead of only growing top-of-funnel traffic.",
      applyHowTo:
        "Review the source journey, compare it against a stronger source, tighten CTA and product-match cues, then observe the next 24h funnel window before scaling traffic.",
      sourceRecommendationId: rec.id,
      linkedRecommendationId: rec.id,
      note: Array.isArray(rec?.context?.actionHints) && rec.context.actionHints[0] ? rec.context.actionHints[0] : null,
      context: {
        lookbackDays: 7,
        sourceKey: rec.targetId,
        targetPath: rec?.context?.targetPath ?? null,
        targetBreakdown: Array.isArray(rec?.context?.targetBreakdown) ? rec.context.targetBreakdown : [],
        weakestPath: rec?.context?.weakestPath ?? null,
        actionHints: Array.isArray(rec?.context?.actionHints) ? rec.context.actionHints : [],
        metricLabel: rec?.context?.metricLabel ?? "Checkout completion",
      },
    }),
  );
  if (weakCheckoutSources.length > 0) {
    const worst = weakCheckoutSources[0];
    alerts.push(
      buildAlert(
        worst.checkoutCompletionRate < 0.25 ? "critical" : "warning",
        `Checkout completion is low for source ${worst.source}`,
        `24h checkout starts ${worst.checkoutStarts}, completes ${worst.checkoutCompletes}, dropoff ${worst.checkoutDropoff}, completion ${(worst.checkoutCompletionRate * 100).toFixed(1)}%.`,
      ),
    );
  }
  if (paymentResults24h.failed + paymentResults24h.canceled >= 3) {
    alerts.push(
      buildAlert(
        "warning",
        "Payment issues are accumulating",
        `24h paid ${paymentResults24h.paid}, authorized ${paymentResults24h.authorized}, failed ${paymentResults24h.failed}, canceled ${paymentResults24h.canceled}, requires action ${paymentResults24h.requiresAction}.`,
      ),
    );
  }
  if (fulfillmentResults24h.processing >= 3 && fulfillmentResults24h.shipped + fulfillmentResults24h.delivered === 0) {
    alerts.push(
      buildAlert(
        "warning",
        "Fulfillment appears to be stalled",
        `24h processing ${fulfillmentResults24h.processing}, shipped ${fulfillmentResults24h.shipped}, delivered ${fulfillmentResults24h.delivered}.`,
      ),
    );
  }
  if (refundResults24h.backlog >= 3) {
    alerts.push(
      buildAlert(
        "warning",
        "Refund backlog is accumulating",
        `24h refund requested ${refundResults24h.requested}, refunded ${refundResults24h.refunded}, backlog ${refundResults24h.backlog}.`,
      ),
    );
  }
  const commerceProposals = listRuleTuningProposals({ limit: 12 }).items
    .filter((item) => item.type === "incident_followup" && item.anomalyKind === "checkout_completion_dropoff" && item.targetType === "journey")
    .slice(0, 6);
  commerceProposals.forEach((proposal) => {
    if (proposal.status === "applied" && proposal.reviewSummary?.state === "risk") {
      const sourceSummary = commerceCheckout.bySource.find((item) => item.source === proposal.targetId) ?? null;
      createCommerceJourneyObservationFollowupRecommendation({
        sourceProposalId: proposal.id,
        targetBreakdown: Array.isArray(sourceSummary?.paths) ? sourceSummary.paths.slice(0, 3) : [],
        weakestPath: sourceSummary?.paths?.[0] ?? null,
      });
    }
  });
  const commerceRecommendations = listRecommendations({ statuses: ["open", "in_progress"] })
    .filter((item) => ["checkout-completion-dropoff", "checkout-completion-observation-followup"].includes(item.ruleId))
    .slice(0, 8);
  const basePaymentRecommendations = listRecommendations({ statuses: ["open", "in_progress"] })
    .filter((item) => item.ruleId === "payment-result-issue")
    .slice(0, 6);
  const paymentProposalResults = basePaymentRecommendations.map((rec) =>
    createIncidentFollowupProposal({
      actor: "ai:proposal",
      targetType: "journey",
      targetId: rec.targetId,
      anomalyKind: "payment_result_issue",
      severity: rec.severity === "critical" ? "critical" : "warning",
      summary:
        rec.reason ||
        `Payment issue ${rec.targetId} is visible in the latest window and needs a focused recovery proposal before more traffic enters the same payment path.`,
      expectedImpact:
        "Reduce payment-stage loss by separating provider-side failures, cancellations, and action-required cases from true checkout friction.",
      applyHowTo:
        "Review provider outcome patterns, inspect the top affected targets, tighten payment-step messaging or retry recovery, then re-check the next 24h payment window.",
      sourceRecommendationId: rec.id,
      linkedRecommendationId: rec.id,
      note: Array.isArray(rec?.context?.actionHints) && rec.context.actionHints[0] ? rec.context.actionHints[0] : null,
      context: {
        lookbackDays: 7,
        issueKey: rec?.context?.issueKey ?? rec.targetId,
        targetPath: rec?.context?.targetPath ?? "/ops/monitoring",
        targetBreakdown: Array.isArray(rec?.context?.targetBreakdown) ? rec.context.targetBreakdown : [],
        weakestPath: rec?.context?.weakestPath ?? null,
        actionHints: Array.isArray(rec?.context?.actionHints) ? rec.context.actionHints : [],
        metricLabel: rec?.context?.metricLabel ?? "Payment issue",
      },
    }),
  );
  const paymentProposals = listRuleTuningProposals({ limit: 12 }).items
    .filter((item) => item.type === "incident_followup" && item.anomalyKind === "payment_result_issue" && item.targetType === "journey")
    .slice(0, 6);
  paymentProposals.forEach((proposal) => {
    if (proposal.status === "applied" && proposal.reviewSummary?.state === "risk") {
      createPaymentObservationFollowupRecommendation({ sourceProposalId: proposal.id });
    }
  });
  const paymentRecommendations = listRecommendations({ statuses: ["open", "in_progress"] })
    .filter((item) => ["payment-result-issue", "payment-observation-followup"].includes(item.ruleId))
    .slice(0, 8);
  const baseFulfillmentRecommendations = listRecommendations({ statuses: ["open", "in_progress"] })
    .filter((item) => item.ruleId === "fulfillment-backlog")
    .slice(0, 6);
  const fulfillmentProposalResults = baseFulfillmentRecommendations.map((rec) =>
    createIncidentFollowupProposal({
      actor: "ai:proposal",
      targetType: "journey",
      targetId: rec.targetId,
      anomalyKind: "fulfillment_backlog",
      severity: rec.severity === "critical" ? "critical" : "warning",
      summary:
        rec.reason ||
        "Fulfillment processing backlog is visible in the latest window and needs a focused ops proposal before more paid orders stall after payment.",
      expectedImpact:
        "Reduce post-payment stall by restoring the handoff from processing into shipped and delivered states before backlog spreads across more orders.",
      applyHowTo:
        "Review the top affected fulfillment paths, inspect warehouse or shipment handoff delays, then re-check the next 24h fulfillment window before routing more volume.",
      sourceRecommendationId: rec.id,
      linkedRecommendationId: rec.id,
      note: Array.isArray(rec?.context?.actionHints) && rec.context.actionHints[0] ? rec.context.actionHints[0] : null,
      context: {
        lookbackDays: 7,
        stageKey: rec?.context?.stageKey ?? rec.targetId,
        targetPath: rec?.context?.targetPath ?? "/ops/monitoring",
        targetBreakdown: Array.isArray(rec?.context?.targetBreakdown) ? rec.context.targetBreakdown : [],
        weakestPath: rec?.context?.weakestPath ?? null,
        actionHints: Array.isArray(rec?.context?.actionHints) ? rec.context.actionHints : [],
        metricLabel: rec?.context?.metricLabel ?? "Fulfillment backlog",
      },
    }),
  );
  const fulfillmentProposals = listRuleTuningProposals({ limit: 12 }).items
    .filter((item) => item.type === "incident_followup" && item.anomalyKind === "fulfillment_backlog" && item.targetType === "journey")
    .slice(0, 6);
  fulfillmentProposals.forEach((proposal) => {
    if (proposal.status === "applied" && proposal.reviewSummary?.state === "risk") {
      createFulfillmentObservationFollowupRecommendation({ sourceProposalId: proposal.id });
    }
  });
  const fulfillmentRecommendations = listRecommendations({ statuses: ["open", "in_progress"] })
    .filter((item) => ["fulfillment-backlog", "fulfillment-observation-followup"].includes(item.ruleId))
    .slice(0, 8);
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
  const paymentGovernance = buildPaymentGovernanceSummary({
    recommendations: paymentRecommendations,
    proposals: paymentProposals,
  });
  const governanceGroups = buildGovernanceGroups({ aiConciergeGovernance, commerceGovernance, paymentGovernance });
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
  if (purchaseDiagnostics.length > 0) {
    const worstGap = purchaseDiagnostics[0];
    const purchaseAlertLevel =
      worstGap.status === "missing_snapshot" ? "warning" : Math.abs(worstGap.gap) >= thresholds.purchaseGapAbs.critical ? "critical" : "warning";
    alerts.push(
      buildAlert(
        purchaseAlertLevel,
        "Purchase reconciliation needs review",
        `${purchaseDiagnostics.length} target(s) show purchase mismatch or missing snapshots. Largest gap: ${worstGap.title} (${worstGap.gap > 0 ? "+" : ""}${worstGap.gap}).`,
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
      dependencies,
    },
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
