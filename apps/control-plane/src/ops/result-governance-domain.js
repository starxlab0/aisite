function createResultGovernanceDomain({ listRecommendations, listRuleTuningProposals } = {}) {
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

  function buildPaymentRecommendationCandidates({ paymentResults24h } = {}) {
    const summary = paymentResults24h && typeof paymentResults24h === "object" ? paymentResults24h : {};
    return [
      { issueKey: "payment_failed", count: summary.failed ?? 0 },
      { issueKey: "payment_canceled", count: summary.canceled ?? 0 },
      { issueKey: "payment_requires_action", count: summary.requiresAction ?? 0 },
    ]
      .filter(({ count }) => count >= 1 && (summary.issues ?? 0) >= 2)
      .map(({ issueKey, count }) => {
        const topTargets = Array.isArray(summary.topTargets?.[issueKey]) ? summary.topTargets[issueKey] : [];
        return {
          issueKey,
          affectedOrders: count,
          issueRate: summary.issueRate ?? 0,
          paidCount: summary.paid ?? 0,
          authorizedCount: summary.authorized ?? 0,
          requiresActionCount: summary.requiresAction ?? 0,
          failedCount: summary.failed ?? 0,
          canceledCount: summary.canceled ?? 0,
          dominantReason: summary.dominantReasons?.[issueKey] ?? null,
          targetBreakdown: topTargets,
          weakestPath: topTargets[0] ?? null,
        };
      });
  }

  function buildFulfillmentRecommendationCandidates({ fulfillmentResults24h } = {}) {
    const summary = fulfillmentResults24h && typeof fulfillmentResults24h === "object" ? fulfillmentResults24h : {};
    if ((summary.processing ?? 0) < 3 || (summary.shipped ?? 0) + (summary.delivered ?? 0) > 1) return [];
    const topTargets = Array.isArray(summary.topTargets?.fulfillment_processing) ? summary.topTargets.fulfillment_processing : [];
    return [
      {
        stageKey: "fulfillment_processing",
        affectedOrders: summary.processing ?? 0,
        shippedCount: summary.shipped ?? 0,
        deliveredCount: summary.delivered ?? 0,
        targetBreakdown: topTargets,
        weakestPath: topTargets[0] ?? null,
      },
    ];
  }

  function buildResultGovernanceAlerts({ paymentResults24h, fulfillmentResults24h, refundResults24h } = {}) {
    const alerts = [];
    if ((paymentResults24h?.failed ?? 0) + (paymentResults24h?.canceled ?? 0) >= 3) {
      alerts.push({
        level: "warning",
        title: "Payment issues are accumulating",
        detail: `24h paid ${paymentResults24h?.paid ?? 0}, authorized ${paymentResults24h?.authorized ?? 0}, failed ${paymentResults24h?.failed ?? 0}, canceled ${paymentResults24h?.canceled ?? 0}, requires action ${paymentResults24h?.requiresAction ?? 0}.`,
      });
    }
    if ((fulfillmentResults24h?.processing ?? 0) >= 3 && (fulfillmentResults24h?.shipped ?? 0) + (fulfillmentResults24h?.delivered ?? 0) === 0) {
      alerts.push({
        level: "warning",
        title: "Fulfillment appears to be stalled",
        detail: `24h processing ${fulfillmentResults24h?.processing ?? 0}, shipped ${fulfillmentResults24h?.shipped ?? 0}, delivered ${fulfillmentResults24h?.delivered ?? 0}.`,
      });
    }
    if ((refundResults24h?.backlog ?? 0) >= 3) {
      alerts.push({
        level: "warning",
        title: "Refund backlog is accumulating",
        detail: `24h refund requested ${refundResults24h?.requested ?? 0}, refunded ${refundResults24h?.refunded ?? 0}, backlog ${refundResults24h?.backlog ?? 0}.`,
      });
    }
    return alerts;
  }

  function buildPaymentProposalCandidates({ recommendations } = {}) {
    const items = Array.isArray(recommendations) ? recommendations : [];
    return items.map((rec) => ({
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
    }));
  }

  function buildFulfillmentProposalCandidates({ recommendations } = {}) {
    const items = Array.isArray(recommendations) ? recommendations : [];
    return items.map((rec) => ({
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
    }));
  }

  function buildPaymentObservationFollowupCandidates({ proposals } = {}) {
    const items = Array.isArray(proposals) ? proposals : [];
    return items
      .filter((proposal) => proposal.status === "applied" && proposal.reviewSummary?.state === "risk")
      .map((proposal) => ({
        sourceProposalId: proposal.id,
      }));
  }

  function buildFulfillmentObservationFollowupCandidates({ proposals } = {}) {
    const items = Array.isArray(proposals) ? proposals : [];
    return items
      .filter((proposal) => proposal.status === "applied" && proposal.reviewSummary?.state === "risk")
      .map((proposal) => ({
        sourceProposalId: proposal.id,
      }));
  }

  function getResultGovernanceProposalSnapshot() {
    const openRecommendations = listRecommendations ? listRecommendations({ statuses: ["open", "in_progress"] }) : [];
    const basePaymentRecommendations = openRecommendations.filter((item) => item.ruleId === "payment-result-issue").slice(0, 6);
    const paymentRecommendations = openRecommendations
      .filter((item) => ["payment-result-issue", "payment-observation-followup"].includes(item.ruleId))
      .slice(0, 8);
    const baseFulfillmentRecommendations = openRecommendations.filter((item) => item.ruleId === "fulfillment-backlog").slice(0, 6);
    const fulfillmentRecommendations = openRecommendations
      .filter((item) => ["fulfillment-backlog", "fulfillment-observation-followup"].includes(item.ruleId))
      .slice(0, 8);

    const proposals = listRuleTuningProposals ? listRuleTuningProposals({ limit: 12 }).items : [];
    const paymentProposals = proposals
      .filter((item) => item.type === "incident_followup" && item.anomalyKind === "payment_result_issue" && item.targetType === "journey")
      .slice(0, 6);
    const fulfillmentProposals = proposals
      .filter((item) => item.type === "incident_followup" && item.anomalyKind === "fulfillment_backlog" && item.targetType === "journey")
      .slice(0, 6);

    return {
      paymentRecommendations,
      paymentProposals,
      paymentProposalCandidates: buildPaymentProposalCandidates({ recommendations: basePaymentRecommendations }),
      paymentObservationFollowupCandidates: buildPaymentObservationFollowupCandidates({ proposals: paymentProposals }),
      fulfillmentRecommendations,
      fulfillmentProposals,
      fulfillmentProposalCandidates: buildFulfillmentProposalCandidates({ recommendations: baseFulfillmentRecommendations }),
      fulfillmentObservationFollowupCandidates: buildFulfillmentObservationFollowupCandidates({ proposals: fulfillmentProposals }),
    };
  }

  function getResultGovernanceWorkflowSnapshot() {
    const proposalSnapshot = getResultGovernanceProposalSnapshot();
    const paymentLane = {
      key: "payment",
      title: "Payment result governance",
      recommendations: proposalSnapshot.paymentRecommendations || [],
      proposals: proposalSnapshot.paymentProposals || [],
      proposalCandidates: proposalSnapshot.paymentProposalCandidates || [],
      observationFollowupCandidates: proposalSnapshot.paymentObservationFollowupCandidates || [],
    };
    const fulfillmentLane = {
      key: "fulfillment",
      title: "Fulfillment result governance",
      recommendations: proposalSnapshot.fulfillmentRecommendations || [],
      proposals: proposalSnapshot.fulfillmentProposals || [],
      proposalCandidates: proposalSnapshot.fulfillmentProposalCandidates || [],
      observationFollowupCandidates: proposalSnapshot.fulfillmentObservationFollowupCandidates || [],
    };
    const refundLane = {
      key: "refund",
      title: "Refund result governance",
      recommendations: [],
      proposals: [],
      proposalCandidates: [],
      observationFollowupCandidates: [],
    };

    return {
      lanes: {
        payment: paymentLane,
        fulfillment: fulfillmentLane,
        refund: refundLane,
      },
      proposalCandidates: {
        payment: paymentLane.proposalCandidates,
        fulfillment: fulfillmentLane.proposalCandidates,
        refund: refundLane.proposalCandidates,
      },
      observationFollowupCandidates: {
        payment: paymentLane.observationFollowupCandidates,
        fulfillment: fulfillmentLane.observationFollowupCandidates,
        refund: refundLane.observationFollowupCandidates,
      },
    };
  }

  function getResultGovernanceMonitoringSnapshot({ trackedEvents } = {}) {
    const items = Array.isArray(trackedEvents) ? trackedEvents : [];
    const paymentResults24h = summarizePaymentResults(items);
    const fulfillmentResults24h = summarizeFulfillmentResults(items);
    const refundResults24h = summarizeRefundResults(items);
    return {
      paymentResults24h,
      fulfillmentResults24h,
      refundResults24h,
      resultGovernanceRecommendationCandidates: {
        paymentIssues: buildPaymentRecommendationCandidates({ paymentResults24h }),
        fulfillmentBacklog: buildFulfillmentRecommendationCandidates({ fulfillmentResults24h }),
      },
      resultGovernanceAlerts: buildResultGovernanceAlerts({ paymentResults24h, fulfillmentResults24h, refundResults24h }),
    };
  }

  return {
    summarizePaymentResults,
    summarizeFulfillmentResults,
    summarizeRefundResults,
    buildPaymentRecommendationCandidates,
    buildFulfillmentRecommendationCandidates,
    buildResultGovernanceAlerts,
    buildPaymentProposalCandidates,
    buildFulfillmentProposalCandidates,
    buildPaymentObservationFollowupCandidates,
    buildFulfillmentObservationFollowupCandidates,
    getResultGovernanceProposalSnapshot,
    getResultGovernanceWorkflowSnapshot,
    getResultGovernanceMonitoringSnapshot,
  };
}

module.exports = {
  createResultGovernanceDomain,
};
