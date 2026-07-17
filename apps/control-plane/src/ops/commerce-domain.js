function createCommerceDomain({ listTargetSummaries, getPurchaseDiagnostics, listTrackedEvents, listRecommendations, listRuleTuningProposals } = {}) {
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

  function getPurchaseMonitoringSnapshot({ targetType } = {}) {
    return listTargetSummaries({ targetType })
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
  }

  function buildPurchaseAlerts({ purchaseDiagnostics, thresholds } = {}) {
    const items = Array.isArray(purchaseDiagnostics) ? purchaseDiagnostics : [];
    if (items.length === 0) return [];
    const worstGap = items[0];
    const criticalThreshold = thresholds?.purchaseGapAbs?.critical ?? 3;
    const level = worstGap.status === "missing_snapshot" ? "warning" : Math.abs(worstGap.gap) >= criticalThreshold ? "critical" : "warning";
    return [
      {
        level,
        title: "Purchase reconciliation needs review",
        detail: `${items.length} target(s) show purchase mismatch or missing snapshots. Largest gap: ${worstGap.title} (${worstGap.gap > 0 ? "+" : ""}${worstGap.gap}).`,
      },
    ];
  }

  function getCommerceCheckoutSnapshot({ trackedEvents } = {}) {
    const items = Array.isArray(trackedEvents) ? trackedEvents : [];
    const commerceCheckout = summarizeCommerceCheckout(items);
    const weakCheckoutSources = commerceCheckout.bySource.filter((item) => item.checkoutStarts >= 3 && item.checkoutCompletionRate < 0.4);
    const recommendationCandidates = {
      checkoutCompletionDropoff: weakCheckoutSources.map((item) => {
        const weakestPath = item.paths?.[0] ?? null;
        return {
          sourceKey: item.source,
          observedRate: item.checkoutCompletionRate,
          threshold: 0.4,
          checkoutStarts: item.checkoutStarts,
          checkoutCompletes: item.checkoutCompletes,
          checkoutDropoff: item.checkoutDropoff,
          targetBreakdown: Array.isArray(item.paths) ? item.paths.slice(0, 3) : [],
          weakestPath,
        };
      }),
    };
    const alerts = weakCheckoutSources.length
      ? [
          {
            level: weakCheckoutSources[0].checkoutCompletionRate < 0.25 ? "critical" : "warning",
            title: `Checkout completion is low for source ${weakCheckoutSources[0].source}`,
            detail: `24h checkout starts ${weakCheckoutSources[0].checkoutStarts}, completes ${weakCheckoutSources[0].checkoutCompletes}, dropoff ${weakCheckoutSources[0].checkoutDropoff}, completion ${(weakCheckoutSources[0].checkoutCompletionRate * 100).toFixed(1)}%.`,
          },
        ]
      : [];
    return {
      commerceCheckout,
      weakCheckoutSources,
      recommendationCandidates,
      alerts,
    };
  }

  function buildCheckoutCompletionProposalCandidates({ recommendations } = {}) {
    const items = Array.isArray(recommendations) ? recommendations : [];
    return items.map((rec) => ({
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
    }));
  }

  function buildCommerceObservationFollowupCandidates({ proposals, commerceCheckout } = {}) {
    const items = Array.isArray(proposals) ? proposals : [];
    return items
      .filter((proposal) => proposal.status === "applied" && proposal.reviewSummary?.state === "risk")
      .map((proposal) => {
        const sourceSummary = commerceCheckout?.bySource?.find((item) => item.source === proposal.targetId) ?? null;
        return {
          sourceProposalId: proposal.id,
          targetBreakdown: Array.isArray(sourceSummary?.paths) ? sourceSummary.paths.slice(0, 3) : [],
          weakestPath: sourceSummary?.paths?.[0] ?? null,
        };
      });
  }

  function getCommerceProposalSnapshot({ commerceCheckout } = {}) {
    const openRecommendations = listRecommendations ? listRecommendations({ statuses: ["open", "in_progress"] }) : [];
    const baseRecommendations = openRecommendations.filter((item) => item.ruleId === "checkout-completion-dropoff").slice(0, 6);
    const commerceRecommendations = openRecommendations
      .filter((item) => ["checkout-completion-dropoff", "checkout-completion-observation-followup"].includes(item.ruleId))
      .slice(0, 8);
    const commerceProposals = (listRuleTuningProposals ? listRuleTuningProposals({ limit: 12 }).items : [])
      .filter((item) => item.type === "incident_followup" && item.anomalyKind === "checkout_completion_dropoff" && item.targetType === "journey")
      .slice(0, 6);

    return {
      commerceRecommendations,
      commerceProposals,
      commerceProposalCandidates: buildCheckoutCompletionProposalCandidates({ recommendations: baseRecommendations }),
      commerceObservationFollowupCandidates: buildCommerceObservationFollowupCandidates({ proposals: commerceProposals, commerceCheckout }),
    };
  }

  function getCommerceMonitoringSnapshot({ targetType, sinceHours = 24, thresholds = {} } = {}) {
    const trackedEvents = listTrackedEvents({ sinceHours });
    const purchaseDiagnostics = getPurchaseMonitoringSnapshot({ targetType });
    const { commerceCheckout, weakCheckoutSources, recommendationCandidates, alerts: checkoutAlerts } = getCommerceCheckoutSnapshot({ trackedEvents });
    const purchaseAlerts = buildPurchaseAlerts({ purchaseDiagnostics, thresholds });
    const { commerceRecommendations, commerceProposals, commerceProposalCandidates, commerceObservationFollowupCandidates } =
      getCommerceProposalSnapshot({ commerceCheckout });
    return {
      trackedEvents,
      purchaseDiagnostics,
      commerceCheckout,
      weakCheckoutSources,
      commerceRecommendations,
      commerceProposals,
      commerceProposalCandidates,
      commerceObservationFollowupCandidates,
      commerceRecommendationCandidates: recommendationCandidates,
      commerceAlerts: [...purchaseAlerts, ...checkoutAlerts],
    };
  }

  return {
    summarizeCommerceCheckout,
    getPurchaseMonitoringSnapshot,
    getCommerceCheckoutSnapshot,
    buildPurchaseAlerts,
    buildCheckoutCompletionProposalCandidates,
    buildCommerceObservationFollowupCandidates,
    getCommerceProposalSnapshot,
    getCommerceMonitoringSnapshot,
  };
}

module.exports = {
  createCommerceDomain,
};
