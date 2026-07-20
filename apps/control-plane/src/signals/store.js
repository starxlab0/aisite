const crypto = require("crypto");
const { listAllTargets } = require("../ops/targets");
const { createRepoChange, listRepoChanges, updateRepoChange } = require("../ops/store");
const { loadState, saveState, getFilePath } = require("./persistence");
const { prepareOpsDraftForRecommendation } = require("../ops/drafts");
const { createEvent: createOpsEvent } = require("../ops/store");
const { ensureRulesFileExists, getAllRuleDefinitions, getRuleDefinition } = require("./rules-config");
const { getRuleEvaluator } = require("./rules-evaluators");
const { getRuleStrategy } = require("./rules-strategies");
const {
  computeFunnelObservationEffectFromAnchor,
  attachFunnelRateDeltas,
  judgeRateDeltaWindow,
} = require("./governance-patterns/funnel-governance");

const persisted = loadState();
const snapshots = Array.isArray(persisted.snapshots) ? persisted.snapshots : [];
const recommendations = Array.isArray(persisted.recommendations) ? persisted.recommendations : [];
const proposals = Array.isArray(persisted.proposals) ? persisted.proposals : [];
const events = Array.isArray(persisted.events) ? persisted.events : [];
const meta = persisted.meta && typeof persisted.meta === "object"
  ? persisted.meta
  : { lastBatchRun: null, batchRuns: [], consecutiveBatchFailures: 0 };
if (!Array.isArray(meta.dailyMonitoringSnapshots)) meta.dailyMonitoringSnapshots = [];
const { computeRates, normalizeNumber } = require("./metrics");

// Ensure default rules file exists so proposals can reference an explicit config location.
ensureRulesFileExists();

function nowIso() {
  return new Date().toISOString();
}

function nextId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function inferSuggestionWorkflow(targetType) {
  if (targetType === "product") return "product-rewrite";
  if (targetType === "collection") return "collection-rewrite";
  if (targetType === "faq") return "faq-expansion";
  if (targetType === "guide") return "guide-article";
  return "unknown";
}

// normalizeNumber / computeRates moved to `metrics.js` for reuse across store + evaluators.

function findPreviousSnapshotForComparison(current) {
  return (
    snapshots.find(
      (item) =>
        item.targetType === current.targetType &&
        item.targetId === current.targetId &&
        item.id !== current.id &&
        (item.contentRef ?? null) !== (current.contentRef ?? null),
    ) ?? null
  );
}

function focusAreasForTarget(targetType) {
  if (targetType === "product") {
    return ["hero_title", "selling_points", "cta_copy", "faq_coverage"];
  }
  if (targetType === "collection") {
    return ["hero_title", "hero_summary", "sections_structure", "internal_links"];
  }
  if (targetType === "faq") {
    return ["question_coverage", "answer_tone", "ordering", "duplication"];
  }
  return ["content_quality"];
}

function focusAreasForRecommendation(snapshot, recommendation) {
  if (Array.isArray(recommendation?.focusAreas) && recommendation.focusAreas.length > 0) {
    return recommendation.focusAreas;
  }
  return focusAreasForTarget(snapshot.targetType);
}

function isPurchaseRecommendationLike(recommendation) {
  return recommendation?.ruleId === "low-purchase-rate" || recommendation?.ruleId === "purchase-effect-followup";
}

function buildReusablePurchasePattern(recommendation, effect) {
  const purchaseDeltaRate = Number(effect?.delta?.rates?.purchaseRate ?? 0);
  if (!isPurchaseRecommendationLike(recommendation)) return null;
  if (!["resolved", "dismissed"].includes(recommendation?.status)) return null;
  if (!effect?.after || purchaseDeltaRate < 0.001) return null;
  const focusAreas = Array.isArray(recommendation?.context?.focusAreas) ? recommendation.context.focusAreas : [];
  const actionHints = Array.isArray(recommendation?.context?.actionHints) ? recommendation.context.actionHints : [];
  return {
    sourceRecommendationId: recommendation.id,
    sourceRuleId: recommendation.ruleId,
    targetType: recommendation.targetType,
    contentRef: effect.after.contentRef ?? recommendation.contentRef ?? null,
    purchaseDeltaRate,
    focusAreas,
    actionHints,
    optimizationGoal: recommendation?.context?.optimizationGoal ?? null,
    summary:
      recommendation?.ruleId === "purchase-effect-followup"
        ? `Follow-up conversion rewrite lifted purchase by ${Math.round(purchaseDeltaRate * 10000) / 100} pts.`
        : `Conversion rewrite lifted purchase by ${Math.round(purchaseDeltaRate * 10000) / 100} pts.`,
  };
}

function findReusablePurchasePattern({ targetType, excludeRecommendationId } = {}) {
  const candidates = recommendations
    .filter(
      (item) =>
        item.id !== excludeRecommendationId &&
        item.targetType === targetType &&
        ["resolved", "dismissed"].includes(item.status) &&
        isPurchaseRecommendationLike(item),
    )
    .map((item) => {
      const evaluated = computeRecommendationEffect(item);
      const pattern = buildReusablePurchasePattern(item, evaluated.effect);
      return pattern
        ? {
            pattern,
            resolvedAt: item.resolvedAt || item.updatedAt || item.createdAt || "",
          }
        : null;
    })
    .filter(Boolean);

  candidates.sort((a, b) => {
    if (a.pattern.purchaseDeltaRate !== b.pattern.purchaseDeltaRate) {
      return b.pattern.purchaseDeltaRate - a.pattern.purchaseDeltaRate;
    }
    return String(b.resolvedAt).localeCompare(String(a.resolvedAt));
  });

  return candidates[0]?.pattern ?? null;
}

function buildRecommendationContext({ snapshot, recommendation }) {
  const previous = findPreviousSnapshotForComparison(snapshot);
  const currentRates = computeRates(snapshot.metrics);
  const previousRates = previous ? computeRates(previous.metrics) : null;
  const referencePattern = isPurchaseRecommendationLike(recommendation)
    ? findReusablePurchasePattern({
        targetType: snapshot.targetType,
        excludeRecommendationId: recommendation?.id,
      })
    : null;

  return {
    snapshot: {
      id: snapshot.id,
      capturedAt: snapshot.capturedAt,
      windowDays: snapshot.windowDays,
      contentRef: snapshot.contentRef ?? null,
      metrics: snapshot.metrics,
      rates: currentRates,
    },
    previous: previous
      ? {
          id: previous.id,
          capturedAt: previous.capturedAt,
          contentRef: previous.contentRef ?? null,
          metrics: previous.metrics,
          rates: previousRates,
        }
      : null,
    delta: previous
      ? {
          metrics: {
            views: snapshot.metrics.views - previous.metrics.views,
            ctaClicks: snapshot.metrics.ctaClicks - previous.metrics.ctaClicks,
            addToCart: snapshot.metrics.addToCart - previous.metrics.addToCart,
            purchases: snapshot.metrics.purchases - previous.metrics.purchases,
          },
          rates: {
            ctaRate: currentRates.ctaRate - previousRates.ctaRate,
            addToCartRate: currentRates.addToCartRate - previousRates.addToCartRate,
            purchaseRate: currentRates.purchaseRate - previousRates.purchaseRate,
          },
        }
      : null,
    focusAreas: focusAreasForRecommendation(snapshot, recommendation),
    suggestedWorkflow: recommendation.suggestedWorkflow,
    optimizationGoal: recommendation.optimizationGoal ?? null,
    actionHints: Array.isArray(recommendation.actionHints) ? recommendation.actionHints : [],
    referencePattern,
  };
}

function referencePatternPriorityBoost(context) {
  const delta = Number(context?.referencePattern?.purchaseDeltaRate ?? 0);
  if (!Number.isFinite(delta) || delta < 0.001) return 0;
  return Math.min(500, 180 + Math.round(delta * 40000));
}

const severityRank = {
  info: 1,
  warning: 2,
  critical: 3,
};

const statusRank = {
  open: 1,
  in_progress: 2,
  resolved: 3,
  dismissed: 4,
};

function listTrackedEvents(filters = {}) {
  const sinceHours = filters.sinceHours ? Math.max(0, Number(filters.sinceHours)) : null;
  const sinceAt = typeof filters.sinceAt === "string" ? Date.parse(filters.sinceAt) : null;
  const sinceTs = Number.isFinite(sinceAt) ? sinceAt : sinceHours !== null ? Date.now() - sinceHours * 60 * 60 * 1000 : null;
  const source = typeof filters.source === "string" ? filters.source : null;
  const eventType = typeof filters.eventType === "string" ? filters.eventType : null;
  return events.filter((e) => {
    if (sinceTs !== null) {
      const t = Date.parse(String(e.at || ""));
      if (!Number.isFinite(t) || t < sinceTs) return false;
    }
    if (source && String(e.source || "") !== source) return false;
    if (eventType && String(e.eventType || "") !== eventType) return false;
    return true;
  });
}

const inProgressStaleDays = Math.max(1, Number(process.env.RECOMMENDATION_IN_PROGRESS_STALE_DAYS || 3));

function daysSince(iso) {
  const ts = Date.parse(String(iso || ""));
  if (!Number.isFinite(ts)) return null;
  const days = (Date.now() - ts) / (24 * 60 * 60 * 1000);
  return days >= 0 ? days : 0;
}

function computeStaleMeta(rec) {
  if (rec.status !== "in_progress") return { stale: false, staleDays: 0 };
  const d = daysSince(rec.startedAt);
  if (d === null) return { stale: false, staleDays: 0 };
  const staleDays = Math.floor(d);
  return { stale: staleDays >= inProgressStaleDays, staleDays };
}

function effectStatus({ baselineRates, afterRates }) {
  if (!baselineRates || !afterRates) return { status: "unknown", summary: "insufficient data" };

  const deltaCta = Number(afterRates.ctaRate) - Number(baselineRates.ctaRate);
  const deltaAtc = Number(afterRates.addToCartRate) - Number(baselineRates.addToCartRate);
  const deltaPurchase = Number(afterRates.purchaseRate) - Number(baselineRates.purchaseRate);

  // thresholds in "rate" units (0.005 = +0.5pts)
  const improve = deltaCta >= 0.005 || deltaAtc >= 0.002 || deltaPurchase >= 0.001;
  const worsen = deltaCta <= -0.005 || deltaAtc <= -0.002 || deltaPurchase <= -0.001;

  const summary = `cta ${Math.round(deltaCta * 10000) / 100}pts, atc ${Math.round(deltaAtc * 10000) / 100}pts, purchase ${Math.round(
    deltaPurchase * 10000,
  ) / 100}pts`;
  if (improve) return { status: "improved", summary };
  if (worsen) return { status: "worsened", summary };
  return { status: "neutral", summary };
}

function computeRecommendationEffect(rec) {
  // Only evaluate once it is no longer open/in_progress
  if (!["resolved", "dismissed"].includes(rec.status)) {
    return { effect: null };
  }

  const anchorAt = rec.resolvedAt || rec.startedAt || rec.createdAt;
  const baseline = rec.context?.snapshot ?? null;
  if (!baseline || !anchorAt) {
    return {
      effect: {
        status: "unknown",
        summary: "no baseline context",
        baseline: null,
        after: null,
        delta: null,
      },
    };
  }

  const baselineRates = baseline.rates ?? computeRates(baseline.metrics);
  const baselineContentRef = baseline.contentRef ?? rec.contentRef ?? null;

  const afterSnapshot =
    snapshots
      .filter((s) => {
        if (s.targetType !== rec.targetType) return false;
        if (s.targetId !== rec.targetId) return false;
        if (Date.parse(s.capturedAt) <= Date.parse(anchorAt)) return false;
        // Prefer a different contentRef to represent "after change"
        if ((s.contentRef ?? null) === (baselineContentRef ?? null)) return false;
        return true;
      })
      .sort((a, b) => String(a.capturedAt || "").localeCompare(String(b.capturedAt || "")))[0] ?? null;

  if (!afterSnapshot) {
    return {
      effect: {
        status: "unknown",
        summary: "no post-change snapshot yet",
        baseline: {
          contentRef: baselineContentRef,
          capturedAt: baseline.capturedAt,
          metrics: baseline.metrics,
          rates: baselineRates,
        },
        after: null,
        delta: null,
      },
    };
  }

  const afterRates = computeRates(afterSnapshot.metrics);
  const status = effectStatus({ baselineRates, afterRates });
  const effect = {
    status: status.status,
    summary: status.summary,
    baseline: {
      contentRef: baselineContentRef,
      capturedAt: baseline.capturedAt,
      metrics: baseline.metrics,
      rates: baselineRates,
    },
    after: {
      contentRef: afterSnapshot.contentRef ?? null,
      capturedAt: afterSnapshot.capturedAt,
      metrics: afterSnapshot.metrics,
      rates: afterRates,
    },
    delta: {
      rates: {
        ctaRate: afterRates.ctaRate - baselineRates.ctaRate,
        addToCartRate: afterRates.addToCartRate - baselineRates.addToCartRate,
        purchaseRate: afterRates.purchaseRate - baselineRates.purchaseRate,
      },
    },
  };
  return {
    effect,
    successPattern: buildReusablePurchasePattern(rec, effect),
  };
}

function computePriorityScore({ severity, context, reason }) {
  const base = (severityRank[severity] ?? 0) * 1000;
  const views = normalizeNumber(context?.snapshot?.metrics?.views);
  const ctaRate = Number(context?.snapshot?.rates?.ctaRate ?? 0);
  const atcRate = Number(context?.snapshot?.rates?.addToCartRate ?? 0);
  const purchaseRate = Number(context?.snapshot?.rates?.purchaseRate ?? 0);
  const deltaCta = Number(context?.delta?.rates?.ctaRate ?? 0);
  const deltaAtc = Number(context?.delta?.rates?.addToCartRate ?? 0);
  const deltaPurchase = Number(context?.delta?.rates?.purchaseRate ?? 0);

  // traffic weight: higher traffic = higher priority (cap to avoid runaway)
  const traffic = Math.min(800, views);

  // performance drop weight: focus on negative deltas
  const dropCta = Math.max(0, -deltaCta) * 10000; // points
  const dropAtc = Math.max(0, -deltaAtc) * 10000;
  const dropPurchase = Math.max(0, -deltaPurchase) * 20000;

  // absolute under-performance weight
  const lowCta = Math.max(0, 0.02 - ctaRate) * 10000; // how far under 2%
  const lowAtc = Math.max(0, 0.01 - atcRate) * 10000; // under 1%
  const lowPurchase = Math.max(0, 0.003 - purchaseRate) * 20000; // under 0.3%

  // small boost if the rule reason indicates hard threshold breach
  const thresholdBoost = typeof reason === "string" && reason.includes("below") ? 50 : 0;
  const patternBoost = referencePatternPriorityBoost(context);

  const score = Math.round(base + traffic + dropCta + dropAtc + dropPurchase + lowCta + lowAtc + lowPurchase + thresholdBoost + patternBoost);
  return Math.max(0, score);
}

function priorityLevel(score) {
  if (score >= 2600) return "p0";
  if (score >= 1900) return "p1";
  if (score >= 1300) return "p2";
  return "p3";
}

function autoStartDecision(rec) {
  if (!rec || rec.status !== "open" || !rec.preparedDraft?.draftId) {
    return { shouldStart: false, reason: null, note: null };
  }
  if (rec.priorityLevel === "p0") {
    return {
      shouldStart: true,
      reason: "queue_p0",
      note: "auto-started by queue policy",
    };
  }
  const refDelta = Number(rec.context?.referencePattern?.purchaseDeltaRate ?? 0);
  if (isPurchaseRecommendationLike(rec) && rec.priorityLevel === "p1" && refDelta >= 0.002) {
    return {
      shouldStart: true,
      reason: "purchase_pattern_fast_track",
      note: "auto-started by purchase pattern policy",
    };
  }
  return { shouldStart: false, reason: null, note: null };
}

function applyStalePriority(rec) {
  const baseScore = normalizeNumber(rec.priorityScore);
  const baseLevel = rec.priorityLevel ?? priorityLevel(baseScore);
  if (!rec.stale) {
    return {
      effectivePriorityScore: baseScore,
      effectivePriorityLevel: baseLevel,
      effectivePriorityReason: rec.priorityReason ?? null,
    };
  }

  const staleDays = normalizeNumber(rec.staleDays);
  const escalatedLevel = baseLevel === "p3" || baseLevel === "p2" ? "p1" : baseLevel;
  const minScoreForLevel = escalatedLevel === "p0" ? 2600 : escalatedLevel === "p1" ? 1900 : escalatedLevel === "p2" ? 1300 : 0;
  const effectivePriorityScore = Math.max(baseScore, minScoreForLevel) + staleDays * 10;
  const reasonPrefix = `stale ${staleDays}d`;
  return {
    effectivePriorityScore,
    effectivePriorityLevel: escalatedLevel,
    effectivePriorityReason: rec.priorityReason ? `${reasonPrefix} · ${rec.priorityReason}` : reasonPrefix,
  };
}

function priorityReason({ context }) {
  if (!context) return "no context";
  const views = normalizeNumber(context.snapshot.metrics.views);
  const cta = Math.round(context.snapshot.rates.ctaRate * 10000) / 100;
  const atc = Math.round(context.snapshot.rates.addToCartRate * 10000) / 100;
  const purchase = Math.round((context.snapshot.rates.purchaseRate ?? 0) * 10000) / 100;
  const referencePattern = context.referencePattern ?? null;
  const referenceNote = referencePattern
    ? `, ref purchase +${Math.round(Number(referencePattern.purchaseDeltaRate || 0) * 10000) / 100}pts`
    : "";
  if (context.delta) {
    const dCta = Math.round(context.delta.rates.ctaRate * 10000) / 100;
    const dAtc = Math.round(context.delta.rates.addToCartRate * 10000) / 100;
    const dPurchase = Math.round((context.delta.rates.purchaseRate ?? 0) * 10000) / 100;
    return `views ${views}, cta ${cta}%, atc ${atc}%, purchase ${purchase}%, delta cta ${dCta}pts, delta atc ${dAtc}pts, delta purchase ${dPurchase}pts${referenceNote}`;
  }
  return `views ${views}, cta ${cta}%, atc ${atc}%, purchase ${purchase}%${referenceNote}`;
}

function persist() {
  saveState({
    events,
    snapshots,
    recommendations,
    proposals,
    meta,
  });
}

function listDailyMonitoringSnapshots(limit = 14) {
  const normalizedLimit = Math.min(90, Math.max(1, Number(limit || 14)));
  return (Array.isArray(meta.dailyMonitoringSnapshots) ? meta.dailyMonitoringSnapshots : [])
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, normalizedLimit);
}

function upsertDailyMonitoringSnapshot(input = {}) {
  const date = String(input.date || "").trim();
  if (!date) return null;
  const next = {
    date,
    recordedAt: String(input.recordedAt || nowIso()),
    todaysBestBet: input.todaysBestBet && typeof input.todaysBestBet === "object" ? { ...input.todaysBestBet } : null,
    governanceOverview: input.governanceOverview && typeof input.governanceOverview === "object"
      ? {
          health: input.governanceOverview.health ?? "healthy",
          primaryLine: input.governanceOverview.primaryLine ?? "seo",
          headline: input.governanceOverview.headline ?? null,
        }
      : null,
    growthLoopOverview: input.growthLoopOverview && typeof input.growthLoopOverview === "object"
      ? {
          health: input.growthLoopOverview.health ?? "healthy",
          headline: input.growthLoopOverview.headline ?? null,
        }
      : null,
    geoOverview: input.geoOverview && typeof input.geoOverview === "object"
      ? {
          health: input.geoOverview.health ?? "healthy",
          headline: input.geoOverview.headline ?? null,
        }
      : null,
    growthExperimentOverview: input.growthExperimentOverview && typeof input.growthExperimentOverview === "object"
      ? {
          health: input.growthExperimentOverview.health ?? "healthy",
          headline: input.growthExperimentOverview.headline ?? null,
        }
      : null,
  };
  const items = Array.isArray(meta.dailyMonitoringSnapshots) ? meta.dailyMonitoringSnapshots : [];
  const idx = items.findIndex((item) => String(item?.date || "") === date);
  if (idx >= 0) items[idx] = next;
  else items.unshift(next);
  meta.dailyMonitoringSnapshots = items
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 30);
  persist();
  return next;
}

function mergeUniqueList(list, nextValue, limit = 20) {
  const items = Array.isArray(list) ? list.slice() : [];
  if (nextValue === undefined) return items.slice(0, limit);
  const value = nextValue ?? null;
  const exists = items.some((item) => (item ?? null) === value);
  const merged = exists ? items : [value, ...items];
  return merged.slice(0, limit);
}

function evaluateRules(snapshot) {
  const definitions = getAllRuleDefinitions();
  const hits = [];

  definitions.forEach((def) => {
    const evaluator = getRuleEvaluator(def);
    if (!evaluator) return;
    if (!evaluator.match(snapshot, def.params)) return;
    hits.push(evaluator.buildHit(snapshot, def.params));
  });

  return hits;
}

function trackEvent(input) {
  if (input?.dedupeKey) {
    const existing = events.find(
      (item) =>
        item.dedupeKey === input.dedupeKey &&
        item.targetType === input.targetType &&
        item.targetId === input.targetId &&
        item.eventType === input.eventType,
    );
    if (existing) return existing;
  }
  const record = {
    id: nextId("evt"),
    at: input.at ?? nowIso(),
    targetType: input.targetType,
    targetId: input.targetId,
    contentRef: input.contentRef ?? null,
    eventType: input.eventType,
    source: input.source ?? "web",
    dedupeKey: input.dedupeKey ?? null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : null,
  };
  events.unshift(record);
  persist();
  return record;
}

function aggregateMetricsFromEvents({ targetType, targetId, contentRef, windowDays, untilAt }) {
  const until = untilAt ? Date.parse(untilAt) : Date.now();
  const windowMs = Math.max(1, normalizeNumber(windowDays ?? 7)) * 24 * 60 * 60 * 1000;
  const since = until - windowMs;

  let views = 0;
  let ctaClicks = 0;
  let addToCart = 0;
  let purchases = 0;

  events.forEach((e) => {
    const t = Date.parse(e.at);
    if (!Number.isFinite(t) || t < since || t > until) return;
    if (e.targetType !== targetType) return;
    if (e.targetId !== targetId) return;
    if (contentRef !== undefined && (e.contentRef ?? null) !== (contentRef ?? null)) return;

    if (e.eventType === "view") views += 1;
    if (e.eventType === "cta") ctaClicks += 1;
    if (e.eventType === "add_to_cart") addToCart += 1;
    if (e.eventType === "purchase") purchases += 1;
  });

  return { views, ctaClicks, addToCart, purchases };
}

function createSnapshotFromEvents(input) {
  const metrics = aggregateMetricsFromEvents({
    targetType: input.targetType,
    targetId: input.targetId,
    contentRef: input.contentRef,
    windowDays: input.windowDays ?? 7,
    untilAt: input.untilAt,
  });

  return ingestSnapshot({
    targetType: input.targetType,
    targetId: input.targetId,
    contentRef: input.contentRef ?? null,
    windowDays: input.windowDays ?? 7,
    metrics,
    source: "aggregated",
  });
}

function ingestSnapshot(input) {
  const record = {
    id: nextId("sig"),
    capturedAt: input.capturedAt ?? nowIso(),
    windowDays: normalizeNumber(input.windowDays ?? 7),
    targetType: input.targetType,
    targetId: input.targetId,
    contentRef: input.contentRef ?? null,
    metrics: {
      views: normalizeNumber(input.metrics?.views),
      ctaClicks: normalizeNumber(input.metrics?.ctaClicks),
      addToCart: normalizeNumber(input.metrics?.addToCart),
      purchases: normalizeNumber(input.metrics?.purchases),
    },
    source: input.source ?? "manual",
  };

  snapshots.unshift(record);

  const newRecs = evaluateRules(record)
    .map((rec) => {
      const existingActive = recommendations.find(
        (item) =>
          ["open", "in_progress"].includes(item.status) &&
          item.targetType === record.targetType &&
          item.targetId === record.targetId &&
          item.ruleId === rec.ruleId,
      );

      const item = {
        id: existingActive?.id ?? nextId("rec"),
        status: existingActive?.status ?? "open",
        createdAt: existingActive?.createdAt ?? nowIso(),
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
        targetType: record.targetType,
        targetId: record.targetId,
        contentRef: record.contentRef,
        ...rec,
      };
      item.context = buildRecommendationContext({ snapshot: record, recommendation: item });
      item.priorityScore = computePriorityScore({ severity: item.severity, context: item.context, reason: item.reason });
      item.priorityLevel = priorityLevel(item.priorityScore);
      item.priorityReason = priorityReason({ context: item.context });
      item.updatedAt = nowIso();
      item.lastSeenAt = nowIso();
      item.occurrences = normalizeNumber(existingActive?.occurrences) + 1;
      item.contentRefsSeen = mergeUniqueList(existingActive?.contentRefsSeen, record.contentRef ?? null, 12);

      try {
        // 如果已有 preparedDraft，则复用；否则尝试自动准备
        item.preparedDraft = existingActive?.preparedDraft ?? prepareOpsDraftForRecommendation({
          recommendation: item,
          actor: "ai:recommendation",
        });
      } catch (error) {
        item.preparedDraft = null;
        item.preparedDraftError = error instanceof Error ? error.message : "Unknown draft preparation error";
      }

      const autoStart = autoStartDecision(item);
      if (autoStart.shouldStart) {
        item.status = "in_progress";
        item.startedAt = item.startedAt ?? nowIso();
        item.startedBy = item.startedBy ?? "ai:queue";
        item.startNote = item.startNote ?? autoStart.note;
        try {
          createOpsEvent({
            actor: "ai:queue",
            action: "auto_start_recommendation",
            target: { type: item.targetType, id: item.targetId },
            draftId: item.preparedDraft.draftId,
            note: `recommendation ${item.id} auto-started · ${autoStart.reason}`,
          });
        } catch {
          // non-blocking
        }
      }
      if (existingActive) {
        const idx = recommendations.findIndex((r) => r.id === existingActive.id);
        if (idx >= 0) {
          recommendations[idx] = { ...existingActive, ...item };
        }
        return null;
      }


      recommendations.unshift(item);
      return item;
    })
    .filter(Boolean);

  persist();

  const followupsCreated = syncPurchaseEffectFollowupsForTarget({
    targetType: record.targetType,
    targetId: record.targetId,
  });

  return { snapshot: record, recommendationsCreated: newRecs, followupsCreated };
}

function listSnapshots(filters = {}) {
  return snapshots.filter((item) => {
    if (filters.targetType && item.targetType !== filters.targetType) return false;
    if (filters.targetId && item.targetId !== filters.targetId) return false;
    return true;
  });
}

function getPurchaseDiagnostics({ targetType, targetId, windowDays } = {}) {
  const targetSnapshots = listSnapshots({ targetType, targetId });
  const anchorSnapshot = targetSnapshots[0] ?? null;
  const effectiveWindowDays = Math.max(1, normalizeNumber(windowDays ?? anchorSnapshot?.windowDays ?? 7));
  const untilAt = anchorSnapshot?.capturedAt ?? nowIso();
  const untilTs = Date.parse(untilAt);
  // Normalize the rolling window to start-of-day UTC so "windowDays" behaves like
  // "the last N calendar days" rather than being sensitive to the snapshot capture time.
  const rawSinceTs = untilTs - effectiveWindowDays * 24 * 60 * 60 * 1000;
  const sinceDate = new Date(rawSinceTs);
  sinceDate.setUTCHours(0, 0, 0, 0);
  const sinceTs = sinceDate.getTime();

  const filteredEvents = events.filter((item) => {
    if (targetType && item.targetType !== targetType) return false;
    if (targetId && item.targetId !== targetId) return false;
    if (item.eventType !== "purchase") return false;
    const ts = Date.parse(item.at);
    if (!Number.isFinite(ts) || ts < sinceTs || ts > untilTs) return false;
    return true;
  });

  const bySourceMap = new Map();
  filteredEvents.forEach((item) => {
    const source = item.source ?? "unknown";
    const existing = bySourceMap.get(source) ?? {
      source,
      count: 0,
      latestAt: null,
    };
    existing.count += 1;
    if (!existing.latestAt || String(item.at).localeCompare(String(existing.latestAt)) > 0) {
      existing.latestAt = item.at;
    }
    bySourceMap.set(source, existing);
  });

  const bySource = Array.from(bySourceMap.values()).sort((a, b) => b.count - a.count || String(b.latestAt || "").localeCompare(String(a.latestAt || "")));
  const eventPurchaseCount = filteredEvents.length;
  const snapshotPurchaseCount = normalizeNumber(anchorSnapshot?.metrics?.purchases);
  const gap = eventPurchaseCount - snapshotPurchaseCount;
  const status = !anchorSnapshot
    ? "missing_snapshot"
    : gap === 0
      ? "aligned"
      : gap > 0
        ? "snapshot_behind"
        : "snapshot_ahead";

  return {
    targetType: targetType ?? anchorSnapshot?.targetType ?? null,
    targetId: targetId ?? anchorSnapshot?.targetId ?? null,
    windowDays: effectiveWindowDays,
    untilAt,
    latestSnapshot: anchorSnapshot
      ? {
          id: anchorSnapshot.id,
          capturedAt: anchorSnapshot.capturedAt,
          source: anchorSnapshot.source,
          contentRef: anchorSnapshot.contentRef ?? null,
          purchases: snapshotPurchaseCount,
        }
      : null,
    eventPurchaseCount,
    snapshotPurchaseCount,
    gap,
    status,
    bySource,
    latestEventAt: filteredEvents[0]?.at ?? null,
  };
}

function listRecommendations(filters = {}) {
  const filtered = recommendations
    .filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.statuses && !filters.statuses.includes(item.status)) return false;
    if (filters.targetType && item.targetType !== filters.targetType) return false;
    if (filters.targetId && item.targetId !== filters.targetId) return false;
    return true;
    })
    .map((item) => {
      const meta = computeStaleMeta(item);
      const staleDecorated = {
        ...item,
        stale: meta.stale,
        staleDays: meta.staleDays,
      };
      const effective = applyStalePriority(staleDecorated);
      const withEffect = computeRecommendationEffect(staleDecorated);
      return {
        ...staleDecorated,
        ...effective,
        ...withEffect,
      };
    });
  return filtered.sort((a, b) => {
    const statusA = statusRank[a.status] ?? 99;
    const statusB = statusRank[b.status] ?? 99;
    if (statusA !== statusB) return statusA - statusB;

    // In in_progress: stale items should bubble up
    const staleA = a.stale ? 1 : 0;
    const staleB = b.stale ? 1 : 0;
    if (staleA !== staleB) return staleB - staleA;
    if (a.stale && b.stale) {
      const dA = normalizeNumber(a.staleDays);
      const dB = normalizeNumber(b.staleDays);
      if (dA !== dB) return dB - dA;
    }

    const sevA = severityRank[a.severity] ?? 0;
    const sevB = severityRank[b.severity] ?? 0;
    if (sevA !== sevB) return sevB - sevA;

    const priA = normalizeNumber(a.effectivePriorityScore ?? a.priorityScore);
    const priB = normalizeNumber(b.effectivePriorityScore ?? b.priorityScore);
    if (priA !== priB) return priB - priA;

    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function workflowForTargetType(targetType) {
  if (targetType === "product") return "product-rewrite";
  if (targetType === "collection") return "collection-rewrite";
  if (targetType === "faq") return "faq-expansion";
  if (targetType === "guide") return "guide-article";
  return "product-rewrite";
}

function createVerificationFollowupRecommendation(input = {}) {
  const targetType = input.targetType;
  const targetId = input.targetId;
  const level = input.level;
  if (!targetType || !targetId || !level || !["warning", "blocked"].includes(level)) {
    return null;
  }

  const ruleId = "publish-verification-followup";
  const severity = level === "blocked" ? "critical" : "warning";
  const reason =
    input.reason ||
    (level === "blocked"
      ? "Publish verification blocked: page unavailable or critical metadata missing."
      : "Publish verification warning: metadata/content does not fully match payload.");
  const verification = input.verification ?? null;
  const failedPaths = (verification?.results ?? [])
    .filter((item) => item.ok === false)
    .map((item) => item.path)
    .slice(0, 4);
  const reasonWithPaths = failedPaths.length ? `${reason} Failed paths: ${failedPaths.join(", ")}` : reason;

  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === targetType &&
      item.targetId === targetId,
  );

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType,
    targetId,
    contentRef: input.contentRef ?? null,
    ruleId,
    reason: reasonWithPaths,
    suggestedWorkflow: workflowForTargetType(targetType),
    severity,
    context: null,
    verificationContext: {
      source: "publish-verification",
      verificationLevel: level,
      verificationSummary: verification?.summary ?? null,
      failedPaths,
    },
    priorityScore: level === "blocked" ? 2800 : 1800,
    priorityLevel: level === "blocked" ? "p0" : "p1",
    priorityReason:
      level === "blocked"
        ? "verification blocked after publish; immediate follow-up required"
        : "repeated warning-level verification issue after publish",
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: mergeUniqueList(existingActive?.contentRefsSeen, input.contentRef ?? null, 12),
  };

  try {
    rec.preparedDraft = existingActive?.preparedDraft ?? prepareOpsDraftForRecommendation({
      recommendation: rec,
      actor: "ai:verification",
    });
  } catch (error) {
    rec.preparedDraft = null;
    rec.preparedDraftError = error instanceof Error ? error.message : "Unknown draft preparation error";
  }

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) {
      recommendations[idx] = {
        ...existingActive,
        ...rec,
      };
    }
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createPurchaseEffectFollowupRecommendation(input = {}) {
  const targetType = input.targetType;
  const targetId = input.targetId;
  const sourceRecommendationId = input.sourceRecommendationId;
  const outcome = input.outcome;
  if (!targetType || !targetId || !sourceRecommendationId || !["flat", "worsened"].includes(outcome)) {
    return null;
  }

  const ruleId = "purchase-effect-followup";
  const purchaseDeltaRate = Number(input.purchaseDeltaRate ?? 0);
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === targetType &&
      item.targetId === targetId &&
      item.followupContext?.sourceRecommendationId === sourceRecommendationId,
  );

  const reason =
    input.reason ||
    (outcome === "worsened"
      ? `Purchase rate fell by ${Math.round(Math.abs(purchaseDeltaRate) * 10000) / 100} pts after the rewrite.`
      : "Purchase rate stayed roughly flat after the rewrite.");

  const focusAreas = Array.isArray(input.focusAreas) && input.focusAreas.length > 0
    ? input.focusAreas
    : targetType === "product"
      ? ["selling_points", "pricing_offer", "trust_signals", "faq_coverage"]
      : ["hero_summary", "pricing_offer", "trust_signals", "internal_links"];
  const actionHints =
    Array.isArray(input.actionHints) && input.actionHints.length > 0
      ? input.actionHints
      : outcome === "worsened"
        ? [
            "re-check price framing and guarantee cues near conversion sections",
            "tighten objection-handling FAQ around shipping, privacy, and setup risk",
            "compare the applied copy against the previous version to isolate what added friction",
          ]
        : [
            "add clearer trust and guarantee cues closer to the buy decision",
            "strengthen value framing so users know why this option is worth purchasing now",
            "surface FAQ answers for the last-mile objections that remain after add-to-cart intent",
          ];

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType,
    targetId,
    contentRef: input.contentRef ?? null,
    ruleId,
    reason,
    suggestedWorkflow: workflowForTargetType(targetType),
    severity: outcome === "worsened" ? "critical" : "warning",
    context: {
      snapshot: input.snapshot ?? null,
      previous: input.previous ?? null,
      delta: input.delta ?? null,
      focusAreas,
      suggestedWorkflow: workflowForTargetType(targetType),
      optimizationGoal:
        "Run a follow-up conversion rewrite focused on price framing, trust signals, and purchase objections because the prior rewrite did not lift purchase conversion.",
      actionHints,
    },
    followupContext: {
      source: "purchase-effect-review",
      sourceRecommendationId,
      sourceRuleId: input.sourceRuleId ?? "low-purchase-rate",
      outcome,
      purchaseDeltaRate,
    },
    priorityScore: outcome === "worsened" ? 2500 : 1700,
    priorityLevel: outcome === "worsened" ? "p0" : "p1",
    priorityReason:
      outcome === "worsened"
        ? "purchase fell after rewrite; immediate conversion follow-up recommended"
        : "purchase stayed flat after rewrite; follow-up conversion pass recommended",
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: mergeUniqueList(existingActive?.contentRefsSeen, input.contentRef ?? null, 12),
  };

  try {
    rec.preparedDraft = existingActive?.preparedDraft ?? prepareOpsDraftForRecommendation({
      recommendation: rec,
      actor: "ai:purchase-followup",
    });
  } catch (error) {
    rec.preparedDraft = null;
    rec.preparedDraftError = error instanceof Error ? error.message : "Unknown draft preparation error";
  }

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) {
      recommendations[idx] = {
        ...existingActive,
        ...rec,
      };
    }
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createCommerceJourneyObservationFollowupRecommendation(input = {}) {
  const sourceProposalId = String(input.sourceProposalId || "").trim();
  if (!sourceProposalId) return null;
  const source = proposals.find((item) => item.id === sourceProposalId) ?? null;
  if (!source || source.type !== "incident_followup" || source.targetType !== "journey" || source.anomalyKind !== "checkout_completion_dropoff") {
    return null;
  }

  const enriched = enrichProposal(source);
  if (enriched?.status !== "applied" || enriched?.reviewSummary?.state !== "risk") return null;
  const effect = enriched?.postApplyEffect;
  if (!effect?.post || !effect?.delta) return null;

  const ruleId = "checkout-completion-observation-followup";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === "journey" &&
      item.targetId === source.targetId &&
      item.followupContext?.sourceProposalId === sourceProposalId,
  );

  const sourceKey = String(source.targetId || "unknown");
  const postRate = Number(effect?.post?.funnel?.checkoutCompletionRate ?? 0);
  const deltaRate = Number(effect?.delta?.checkoutCompletionRate ?? 0);
  const postStarts = normalizeNumber(effect?.post?.funnel?.checkoutStarts ?? 0);
  const postCompletes = normalizeNumber(effect?.post?.funnel?.checkoutCompletes ?? 0);
  const postDropoff = Math.max(0, postStarts - postCompletes);
  const reason =
    input.reason ||
    `After applying journey changes for ${sourceKey}, checkout completion is still weak at ${(postRate * 100).toFixed(1)}% with delta ${(deltaRate * 100).toFixed(1)} pts.`;
  const actionHints = [
    `compare ${sourceKey} against the strongest checkout source and isolate the handoff differences`,
    `tighten product-match, trust signals, and checkout expectations for ${sourceKey}`,
    `if the same source still underperforms, split by product / bundle path before sending more traffic`,
  ];
  const targetBreakdown = Array.isArray(input.targetBreakdown)
    ? input.targetBreakdown.slice(0, 3)
    : Array.isArray(source?.context?.targetBreakdown)
      ? source.context.targetBreakdown.slice(0, 3)
      : [];
  const weakestPath =
    (input.weakestPath && typeof input.weakestPath === "object" ? input.weakestPath : null) ||
    (source?.context?.weakestPath && typeof source.context.weakestPath === "object" ? source.context.weakestPath : null) ||
    targetBreakdown[0] ||
    null;

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType: "journey",
    targetId: sourceKey,
    contentRef: null,
    ruleId,
    reason,
    suggestedWorkflow: "journey-followup",
    severity: postRate < 0.25 ? "critical" : "warning",
    context: {
      source: "commerce-observation-review",
      sourceKey,
      parentProposalId: sourceProposalId,
      targetPath: source?.context?.targetPath ?? null,
      metricKey: "checkout_completion_rate",
      metricLabel: "Checkout completion (post-apply)",
      observedRate: postRate,
      threshold: 0.4,
      sampleSize: postStarts,
      checkoutStarts: postStarts,
      checkoutCompletes: postCompletes,
      checkoutDropoff: postDropoff,
      deltaCheckoutCompletionRate: deltaRate,
      targetBreakdown,
      weakestPath,
      actionHints,
      optimizationGoal: "Escalate a journey that stayed weak even after the first follow-up was applied, and focus the next step on narrower path diagnosis.",
    },
    followupContext: {
      source: "commerce-observation-review",
      sourceProposalId,
      sourceRecommendationId: source.linkedRecommendationId ?? null,
      outcome: enriched.reviewSummary?.state ?? "risk",
    },
    priorityScore: (postRate < 0.25 ? 2800 : 2300) + Math.min(300, postStarts * 25),
    priorityLevel: postRate < 0.25 ? "p0" : "p1",
    priorityReason: `journey ${sourceKey} remained weak after an applied fix and needs narrower follow-up`,
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: existingActive?.contentRefsSeen ?? [],
    preparedDraft: null,
    preparedDraftError: "This recommendation targets journey follow-up and path diagnosis, not a single CMS draft.",
  };

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) recommendations[idx] = { ...existingActive, ...rec };
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createAiConciergeFunnelRecommendation(input = {}) {
  const metricKey = input.metricKey;
  const observedRate = Number(input.observedRate ?? NaN);
  const threshold = Number(input.threshold ?? NaN);
  const sampleSize = normalizeNumber(input.sampleSize ?? 0);
  if (
    !metricKey ||
    !["entry_ctr", "result_ctr", "atc_view_rate", "purchase_view_rate"].includes(metricKey) ||
    !Number.isFinite(observedRate) ||
    !Number.isFinite(threshold) ||
    sampleSize < 1
  ) {
    return null;
  }

  const ruleId = "ai-concierge-funnel-dropoff";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === "collection" &&
      item.targetId === "ai-concierge" &&
      item.context?.metricKey === metricKey,
  );

  const reason =
    input.reason ||
    `${String(input.metricLabel || metricKey)} ${Math.round(observedRate * 10000) / 100}% is below ${Math.round(threshold * 10000) / 100}% with sample ${sampleSize}.`;
  const severity = metricKey === "purchase_view_rate" ? "critical" : "warning";
  const focusAreasByMetric = {
    entry_ctr: ["entry_copy", "placement", "audience_fit"],
    result_ctr: ["recommendation_reasoning", "top_pick_cta", "ranking_logic"],
    atc_view_rate: ["quiz_targeting", "offer_framing", "product_match"],
    purchase_view_rate: ["checkout_handoff", "trust_signals", "recommendation_quality"],
  };
  const actionHintsByMetric = {
    entry_ctr: [
      "test stronger quiz entry copy on shop and product pages",
      "move the AI concierge block closer to the first decision moment",
      "tighten audience framing so users know who the quiz is for",
    ],
    result_ctr: [
      "improve top-pick explanation and reason tags on the results page",
      "test stronger default CTA wording on result cards",
      "re-rank recommendations to prioritize higher-intent outcomes",
    ],
    atc_view_rate: [
      "tune quiz questions and scoring to improve product-fit quality",
      "strengthen price/value framing near the quiz result CTA",
      "reduce hesitation by clarifying what the top pick is best for",
    ],
    purchase_view_rate: [
      "audit cart and checkout friction for AI concierge traffic",
      "strengthen trust, shipping, and guarantee cues after quiz handoff",
      "compare purchase lift by bucket before changing quiz targeting thresholds",
    ],
  };

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType: "collection",
    targetId: "ai-concierge",
    contentRef: null,
    ruleId,
    reason,
    suggestedWorkflow: "rule-tuning",
    severity,
    context: {
      source: "ai-concierge-monitoring",
      metricKey,
      metricLabel: input.metricLabel || metricKey,
      observedRate,
      threshold,
      sampleSize,
      focusAreas: focusAreasByMetric[metricKey] ?? ["ranking_logic"],
      suggestedWorkflow: "rule-tuning",
      optimizationGoal:
        "Improve AI concierge funnel conversion by tuning entry placement, recommendation ranking, and purchase handoff instead of editing a single CMS target.",
      actionHints: actionHintsByMetric[metricKey] ?? [],
    },
    priorityScore: metricKey === "purchase_view_rate" ? 2100 : metricKey === "atc_view_rate" ? 1700 : 1500,
    priorityLevel: metricKey === "purchase_view_rate" ? "p1" : "p2",
    priorityReason:
      metricKey === "purchase_view_rate"
        ? "AI concierge traffic reaches product views but rarely converts to purchase"
        : "AI concierge funnel shows meaningful drop-off and needs tuning",
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: existingActive?.contentRefsSeen ?? [],
    preparedDraft: null,
    preparedDraftError: "This recommendation targets AI concierge strategy tuning, not a CMS content draft.",
  };

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) {
      recommendations[idx] = { ...existingActive, ...rec };
    }
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function finalizeContentRecommendation({ existingActive, recommendation, actor = "ai:seo" }) {
  const rec = {
    ...recommendation,
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: mergeUniqueList(existingActive?.contentRefsSeen, recommendation.contentRef ?? null, 12),
  };

  try {
    rec.preparedDraft = existingActive?.preparedDraft ?? prepareOpsDraftForRecommendation({
      recommendation: rec,
      actor,
    });
  } catch (error) {
    rec.preparedDraft = null;
    rec.preparedDraftError = error instanceof Error ? error.message : "Unknown draft preparation error";
  }

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) recommendations[idx] = { ...existingActive, ...rec };
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createContentGapRecommendation(input = {}) {
  const targetType = String(input.targetType || "").trim();
  const targetId = String(input.targetId || "").trim();
  const suggestedWorkflow = String(input.suggestedWorkflow || "").trim() || inferSuggestionWorkflow(targetType);
  if (!targetType || !targetId) return null;

  const ruleId = "content-gap";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === targetType &&
      item.targetId === targetId,
  );

  return finalizeContentRecommendation({
    existingActive,
    actor: "ai:seo_content_gap",
    recommendation: {
      targetType,
      targetId,
      contentRef: null,
      ruleId,
      reason:
        input.reason ||
        `${String(input.title || targetId)} is missing sufficient ${String(input.missingAssetType || "supporting content")} coverage for search and AI-answer intent.`,
      suggestedWorkflow,
      severity: input.severity || "warning",
      context: {
        source: "seo-geo-monitoring",
        gapKey: input.gapKey || "content_gap",
        gapType: "content_gap",
        targetPath: input.targetPath || null,
        metricKey: "coverage_count",
        metricLabel: "Coverage count",
        observedCount: normalizeNumber(input.observedCount ?? 0),
        threshold: normalizeNumber(input.threshold ?? 0),
        missingAssetType: input.missingAssetType || "faq_cluster",
        focusAreas: Array.isArray(input.focusAreas) ? input.focusAreas : ["faq_coverage", "search_intent", "answerability"],
        actionHints: Array.isArray(input.actionHints)
          ? input.actionHints
          : [
              "expand this target with more search-intent questions and direct answers",
              "cover beginner objections, comparison queries, and trust questions in a single cluster",
              "link the new content back into the main product or collection path",
            ],
        optimizationGoal:
          input.optimizationGoal ||
          "Cover missing search intent and AI-answer surfaces before sending more organic traffic into a shallow content cluster.",
      },
      priorityScore: normalizeNumber(input.priorityScore ?? 1450),
      priorityLevel: input.priorityLevel || "p2",
      priorityReason: input.priorityReason || "coverage is shallow for a target that should answer more search intent",
    },
  });
}

function createThinContentRecommendation(input = {}) {
  const targetType = String(input.targetType || "").trim();
  const targetId = String(input.targetId || "").trim();
  if (!targetType || !targetId) return null;
  const ruleId = "thin-content";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === targetType &&
      item.targetId === targetId,
  );

  return finalizeContentRecommendation({
    existingActive,
    actor: "ai:seo_thin_content",
    recommendation: {
      targetType,
      targetId,
      contentRef: input.contentRef ?? null,
      ruleId,
      reason:
        input.reason ||
        `${String(input.title || targetId)} looks thin for organic intent coverage and needs stronger explanation depth.`,
      suggestedWorkflow: input.suggestedWorkflow || inferSuggestionWorkflow(targetType),
      severity: input.severity || "warning",
      context: {
        source: "seo-geo-monitoring",
        gapKey: input.gapKey || "thin_content",
        gapType: "thin_content",
        targetPath: input.targetPath || null,
        metricKey: "content_depth",
        metricLabel: "Content depth",
        observedCount: normalizeNumber(input.observedCount ?? 0),
        threshold: normalizeNumber(input.threshold ?? 0),
        focusAreas: Array.isArray(input.focusAreas) ? input.focusAreas : ["content_depth", "decision_help", "answer_structure"],
        actionHints: Array.isArray(input.actionHints)
          ? input.actionHints
          : [
              "add stronger answer-first sections before feature detail",
              "expand scenarios, objections, and next-step internal links",
              "make the page easier to quote or summarize by search and AI engines",
            ],
        optimizationGoal:
          input.optimizationGoal ||
          "Increase explanatory depth so the page can rank for broader intent and be reused as a reliable answer source.",
      },
      priorityScore: normalizeNumber(input.priorityScore ?? 1380),
      priorityLevel: input.priorityLevel || "p2",
      priorityReason: input.priorityReason || "page depth is too shallow for sustainable SEO/GEO performance",
    },
  });
}

function createInternalLinkGapRecommendation(input = {}) {
  const targetType = String(input.targetType || "").trim();
  const targetId = String(input.targetId || "").trim();
  if (!targetType || !targetId) return null;
  const ruleId = "internal-link-gap";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === targetType &&
      item.targetId === targetId,
  );

  return finalizeContentRecommendation({
    existingActive,
    actor: "ai:seo_internal_link",
    recommendation: {
      targetType,
      targetId,
      contentRef: input.contentRef ?? null,
      ruleId,
      reason:
        input.reason ||
        `${String(input.title || targetId)} is not routing enough users into related guides, FAQs, or product decisions.`,
      suggestedWorkflow: input.suggestedWorkflow || inferSuggestionWorkflow(targetType),
      severity: input.severity || "warning",
      context: {
        source: "seo-geo-monitoring",
        gapKey: input.gapKey || "internal_link_gap",
        gapType: "internal_link_gap",
        targetPath: input.targetPath || null,
        metricKey: "internal_link_count",
        metricLabel: "Internal link count",
        observedCount: normalizeNumber(input.observedCount ?? 0),
        threshold: normalizeNumber(input.threshold ?? 0),
        focusAreas: Array.isArray(input.focusAreas) ? input.focusAreas : ["topic_cluster", "next_step_links", "hub_spoke"],
        actionHints: Array.isArray(input.actionHints)
          ? input.actionHints
          : [
              "add clearer next-step links to related product, guide, and FAQ destinations",
              "use the page as a hub that routes users into narrower decision pages",
              "reduce isolated content that explains but does not move the journey forward",
            ],
        optimizationGoal:
          input.optimizationGoal ||
          "Turn standalone content into a stronger topic cluster node that passes intent into the next relevant page.",
      },
      priorityScore: normalizeNumber(input.priorityScore ?? 1320),
      priorityLevel: input.priorityLevel || "p3",
      priorityReason: input.priorityReason || "internal linking is too weak for topic-cluster growth",
    },
  });
}

function seoActionHintsForTarget(targetType, kind) {
  if (kind === "low_ctr") {
    if (targetType === "product") {
      return [
        "重写 title / meta description，把适合谁、核心卖点和购买理由更前置，不要只写泛泛产品名。",
        "在首屏补一句 answer-first 摘要，并把 FAQ/信任点更靠近 buy zone，减少用户点进前的不确定感。",
        "确认 FAQPage / Product 相关 schema 与页面卖点一致，避免摘要和落地页承诺脱节。",
      ];
    }
    if (targetType === "collection") {
      return [
        "把集合页 title / description 改成更明确的场景词和筛选价值，而不是泛目录式命名。",
        "首屏先写“适合谁 / 如何快速缩小范围”，让搜索用户知道点进来后能马上得到什么。",
        "补 guide/FAQ/product 的下一步入口，避免 snippet 吸引点击后页面却不给明确去向。",
      ];
    }
    if (targetType === "guide") {
      return [
        "把标题改成更接近问题式搜索意图的表达，并在 meta description 里直接写出结论和适用人群。",
        "开头前两段保留 answer-first 摘要，让用户和答案引擎都能立刻抓到结论。",
        "补 HowTo / Breadcrumb 结构化数据，并把下一步推荐链接放在首屏后 1–2 屏内。",
      ];
    }
    if (targetType === "faq") {
      return [
        "把问题标题改成更接近用户真实搜索问法，而不是内部术语或过短问句。",
        "答案首句先给结论，再补 1 句下一步动作，提高摘要命中率和点击预期一致性。",
        "扩一组相邻问题，形成 FAQ cluster，减少只命中单个问题时的页面单薄感。",
      ];
    }
  }

  if (kind === "position_drop") {
    if (targetType === "product") {
      return [
        "刷新首屏价值主张、适合人群和差异化段落，避免产品页只剩规格信息却缺少购买判断内容。",
        "补用户最常见的疑虑 FAQ、清洁/噪音/连接说明，并把相关 guide 链回商品页。",
        "校验 Product / FAQ schema 仍与正文一致，避免旧结构化字段和新文案脱节。",
      ];
    }
    if (targetType === "collection") {
      return [
        "把集合页从“目录”刷新成“选择入口”：补判断路径、场景差异和 next-step links。",
        "强化 hub-spoke 内链，把高相关 guide、FAQ、商品卡稳定挂到集合页主区块里。",
        "检查集合页 intro 与结构化数据是否仍覆盖核心意图，避免排名下滑后页面还停留在旧主题。",
      ];
    }
    if (targetType === "guide") {
      return [
        "刷新前两屏内容，先给结论、适用人群和步骤，再补解释，避免 guide 过长却结论太晚出现。",
        "增加更新后的比较段或三步筛选法，让页面重新覆盖更强的问题式意图。",
        "从相关 collection / product / FAQ 增加回链，提升 guide 作为主题节点的权重。",
      ];
    }
    if (targetType === "faq") {
      return [
        "补足相邻问题和反向问题，让 FAQ 从单问答升级成更完整的意图覆盖页。",
        "把答案首句刷新成更明确的结论句，并在结尾增加下一步阅读或购买动作。",
        "检查 FAQPage schema 是否仍完整，问题文本是否和页面标题/摘要保持一致。",
      ];
    }
  }

  return kind === "low_ctr"
    ? [
        "收紧 title / meta description，让 snippet 更直接对应当前主搜索意图。",
        "在页面前部补 answer-first 摘要和更明确的下一步动作。",
        "检查结构化数据是否覆盖页面最核心的可摘要信息。",
      ]
    : [
        "刷新前部内容和主要意图覆盖，避免页面主题停留在旧版本。",
        "加强站内导流，让目标页重新成为 topic cluster 的有效节点。",
        "检查 schema 与正文一致性，避免结构化信息过期。",
      ];
}

function createSeoLowCtrRecommendation(input = {}) {
  const targetType = String(input.targetType || "").trim();
  const targetId = String(input.targetId || "").trim();
  if (!targetType || !targetId) return null;
  const ruleId = "seo-low-ctr";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === targetType &&
      item.targetId === targetId,
  );

  const impressions = normalizeNumber(input.impressions ?? 0);
  const ctr = normalizeNumber(input.ctr ?? 0);
  const threshold = normalizeNumber(input.threshold ?? 0.02);
  if (impressions < normalizeNumber(input.minImpressions ?? 80)) return null;
  if (ctr >= threshold) return null;

  return finalizeContentRecommendation({
    existingActive,
    actor: "ai:seo_low_ctr",
    recommendation: {
      targetType,
      targetId,
      contentRef: input.contentRef ?? null,
      ruleId,
      reason:
        input.reason ||
        `${String(input.title || targetId)} has organic impressions ${impressions} with CTR ${(ctr * 100).toFixed(2)}%, below ${(threshold * 100).toFixed(2)}%.`,
      suggestedWorkflow: input.suggestedWorkflow || inferSuggestionWorkflow(targetType),
      severity: input.severity || (ctr < threshold / 2 ? "critical" : "warning"),
      context: {
        source: "seo-metrics",
        metricKey: "ctr",
        metricLabel: "Organic CTR",
        windowDays: normalizeNumber(input.windowDays ?? 7),
        impressions,
        clicks: normalizeNumber(input.clicks ?? 0),
        observedRate: ctr,
        threshold,
        targetPath: input.targetPath || null,
        focusAreas: ["title_description", "snippet_quality", "intent_match", "structured_data"],
        actionHints: seoActionHintsForTarget(targetType, "low_ctr"),
      },
      priorityScore: normalizeNumber(input.priorityScore ?? 1500),
      priorityLevel: input.priorityLevel || "p2",
      priorityReason: input.priorityReason || "impressions exist but CTR is low, indicating snippet/intent mismatch",
    },
  });
}

function createSeoPositionDropRecommendation(input = {}) {
  const targetType = String(input.targetType || "").trim();
  const targetId = String(input.targetId || "").trim();
  if (!targetType || !targetId) return null;
  const ruleId = "seo-position-drop";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === targetType &&
      item.targetId === targetId,
  );

  const impressions = normalizeNumber(input.impressions ?? 0);
  const deltaPos = normalizeNumber(input.deltaPosition ?? 0);
  const threshold = normalizeNumber(input.threshold ?? 3);
  if (impressions < normalizeNumber(input.minImpressions ?? 50)) return null;
  if (deltaPos <= threshold) return null;

  return finalizeContentRecommendation({
    existingActive,
    actor: "ai:seo_position_drop",
    recommendation: {
      targetType,
      targetId,
      contentRef: input.contentRef ?? null,
      ruleId,
      reason:
        input.reason ||
        `${String(input.title || targetId)} average position worsened by ${deltaPos.toFixed(1)} over the last window.`,
      suggestedWorkflow: input.suggestedWorkflow || inferSuggestionWorkflow(targetType),
      severity: input.severity || (deltaPos > threshold * 2 ? "critical" : "warning"),
      context: {
        source: "seo-metrics",
        metricKey: "position",
        metricLabel: "Average position",
        windowDays: normalizeNumber(input.windowDays ?? 7),
        impressions,
        currentPosition: input.currentPosition ?? null,
        previousPosition: input.previousPosition ?? null,
        deltaPosition: deltaPos,
        threshold,
        targetPath: input.targetPath || null,
        focusAreas: ["content_depth", "internal_links", "schema", "freshness"],
        actionHints: seoActionHintsForTarget(targetType, "position_drop"),
      },
      priorityScore: normalizeNumber(input.priorityScore ?? 1550),
      priorityLevel: input.priorityLevel || "p2",
      priorityReason: input.priorityReason || "rank drop indicates competitiveness/freshness gap despite impressions",
    },
  });
}

function commerceSourceTargetPath(sourceKey) {
  const source = String(sourceKey || "").trim();
  if (source === "guide" || source === "guides") return "/guides";
  if (source === "ai_concierge") return "/quiz?src=ops";
  if (source === "app-control") return "/app-control";
  if (source === "bundles") return "/bundles";
  if (source === "quiz") return "/quiz";
  if (source === "shop" || source === "web") return "/shop";
  return "/shop";
}

function paymentRecoveryProfile(issueKey) {
  const key = String(issueKey || "").trim();
  if (key === "payment_failed") {
    return {
      recoveryLane: "provider_review",
      recoveryOwner: "ops",
      recoveryActions: [
        "inspect provider-side decline or failure reasons before pushing users to retry",
        "verify whether the failing path needs different payment messaging or a safer retry route",
      ],
    };
  }
  if (key === "payment_canceled") {
    return {
      recoveryLane: "customer_retry",
      recoveryOwner: "customer",
      recoveryActions: [
        "bring users back into a shorter retry flow with clearer expectations",
        "tighten redirect and return-path trust cues so fewer sessions are abandoned mid-payment",
      ],
    };
  }
  if (key === "payment_requires_action") {
    return {
      recoveryLane: "customer_action",
      recoveryOwner: "customer",
      recoveryActions: [
        "make the extra confirmation step explicit before users enter the payment handoff",
        "show a clearer instruction path for action-required orders so they can complete the final step",
      ],
    };
  }
  return {
    recoveryLane: "awaiting_result",
    recoveryOwner: "ops",
    recoveryActions: ["wait for more payment evidence before choosing a recovery lane"],
  };
}

function paymentReasonLabel(reasonKey) {
  const key = String(reasonKey || "").trim();
  if (key === "declined") return "declined";
  if (key === "timeout") return "timeout";
  if (key === "customer_abandon") return "customer abandon";
  if (key === "action_required") return "action required";
  if (key === "capture_pending") return "capture pending";
  if (key === "completed") return "completed";
  if (key === "pending_sync") return "pending sync";
  if (key === "provider_error") return "provider error";
  return "unknown";
}

function createFulfillmentBacklogRecommendation(input = {}) {
  const stageKey = String(input.stageKey || "").trim();
  const affectedOrders = normalizeNumber(input.affectedOrders ?? 0);
  if (stageKey !== "fulfillment_processing" || affectedOrders < 1) return null;

  const ruleId = "fulfillment-backlog";
  const targetId = "fulfillment_processing";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === "journey" &&
      item.targetId === targetId,
  );

  const targetBreakdown = Array.isArray(input.targetBreakdown) ? input.targetBreakdown.slice(0, 3) : [];
  const weakestPath = input.weakestPath && typeof input.weakestPath === "object" ? input.weakestPath : targetBreakdown[0] ?? null;
  const shippedCount = normalizeNumber(input.shippedCount ?? 0);
  const deliveredCount = normalizeNumber(input.deliveredCount ?? 0);

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType: "journey",
    targetId,
    contentRef: null,
    ruleId,
    reason:
      input.reason ||
      `Fulfillment processing backlog reached ${affectedOrders} order(s) in 24h while shipped ${shippedCount} and delivered ${deliveredCount} stayed low.`,
    suggestedWorkflow: "fulfillment-recovery",
    severity: affectedOrders >= 5 && shippedCount === 0 ? "critical" : "warning",
    context: {
      source: "fulfillment-monitoring",
      stageKey,
      metricKey: "fulfillment_processing",
      metricLabel: "Fulfillment processing backlog",
      observedCount: affectedOrders,
      processingCount: affectedOrders,
      shippedCount,
      deliveredCount,
      targetPath: "/ops/monitoring",
      targetBreakdown,
      weakestPath,
      recoveryLane: "ops_review",
      recoveryOwner: "ops",
      focusAreas: ["warehouse_backlog", "fulfillment_handoff", "shipment_creation", "post-payment_ops"],
      actionHints: [
        "check whether paid orders are entering processing but not being handed off to shipment creation",
        "inspect the top affected fulfillment paths before treating the issue as a global warehouse backlog",
        "verify whether webhook-to-fulfillment automation or ops handoff is stuck for recent orders",
      ],
      optimizationGoal: "Surface fulfillment-stage backlog early so post-payment orders do not stall silently after payment succeeds.",
    },
    priorityScore: (affectedOrders >= 5 ? 2200 : 1700) + Math.min(300, affectedOrders * 40),
    priorityLevel: affectedOrders >= 5 ? "p1" : "p2",
    priorityReason:
      affectedOrders >= 5
        ? "fulfillment backlog is growing and may delay shipment creation"
        : "fulfillment backlog is visible and should be reviewed before it grows",
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: existingActive?.contentRefsSeen ?? [],
    preparedDraft: null,
    preparedDraftError: "This recommendation targets fulfillment recovery, not a single CMS content draft.",
  };

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) recommendations[idx] = { ...existingActive, ...rec };
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createPaymentIssueRecommendation(input = {}) {
  const issueKey = String(input.issueKey || "").trim();
  const affectedOrders = normalizeNumber(input.affectedOrders ?? 0);
  const issueRate = Number(input.issueRate ?? NaN);
  if (!issueKey || !Number.isFinite(issueRate) || affectedOrders < 1) {
    return null;
  }

  const allowedIssues = new Set(["payment_failed", "payment_canceled", "payment_requires_action"]);
  if (!allowedIssues.has(issueKey)) return null;

  const ruleId = "payment-result-issue";
  const targetId = issueKey;
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === "journey" &&
      item.targetId === targetId,
  );

  const labelMap = {
    payment_failed: "Payment failed",
    payment_canceled: "Payment canceled",
    payment_requires_action: "Payment requires action",
  };
  const severity = issueKey === "payment_failed" || issueRate >= 0.4 ? "critical" : "warning";
  const recovery = paymentRecoveryProfile(issueKey);
  const dominantReason = input.dominantReason && typeof input.dominantReason === "object" ? input.dominantReason : null;
  const targetBreakdown = Array.isArray(input.targetBreakdown) ? input.targetBreakdown.slice(0, 3) : [];
  const weakestPath = input.weakestPath && typeof input.weakestPath === "object" ? input.weakestPath : targetBreakdown[0] ?? null;
  const actionHintsByIssue = {
    payment_failed: [
      "verify provider-side failures, decline reasons, and retry eligibility before treating this as a checkout copy problem",
      "compare failed orders by source-path to isolate whether one route sends lower-intent traffic into payment",
      "review last-mile trust and payment method messaging near the final confirmation step",
    ],
    payment_canceled: [
      "check whether users are abandoning because payment takes too long or the provider handoff feels uncertain",
      "tighten payment expectations, timing, and trust messaging before redirecting into the provider flow",
      "compare canceled orders by source-path to find routes with weaker intent or higher friction",
    ],
    payment_requires_action: [
      "review flows that trigger additional payment confirmation and make the extra step clearer before users reach it",
      "separate requires-action paths from true payment failures before changing checkout copy or offers",
      "inspect whether a specific product or source-path drives more action-required cases than the rest",
    ],
  };
  const reason =
    input.reason ||
    `${labelMap[issueKey]} affected ${affectedOrders} order(s) in 24h with issue rate ${(issueRate * 100).toFixed(1)}%.`;

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType: "journey",
    targetId,
    contentRef: null,
    ruleId,
    reason,
    suggestedWorkflow: "payment-recovery",
    severity,
    context: {
      source: "payment-monitoring",
      issueKey,
      metricKey: `${issueKey}_count`,
      metricLabel: labelMap[issueKey],
      observedCount: affectedOrders,
      issueRate,
      paidCount: normalizeNumber(input.paidCount ?? 0),
      authorizedCount: normalizeNumber(input.authorizedCount ?? 0),
      requiresActionCount: normalizeNumber(input.requiresActionCount ?? 0),
      failedCount: normalizeNumber(input.failedCount ?? 0),
      canceledCount: normalizeNumber(input.canceledCount ?? 0),
      recoveryLane: recovery.recoveryLane,
      recoveryOwner: recovery.recoveryOwner,
      paymentIssueReason: dominantReason?.reason ?? null,
      paymentIssueReasonLabel: dominantReason ? paymentReasonLabel(dominantReason.reason) : null,
      targetPath: "/ops/monitoring",
      targetBreakdown,
      weakestPath,
      focusAreas: ["payment_provider", "final_step_trust", "redirect_handoff", "retry_recovery"],
      suggestedWorkflow: "payment-recovery",
      optimizationGoal: "Separate payment-stage failures from checkout-stage friction so the team can fix provider, handoff, and retry problems without misdiagnosing them as pre-payment dropoff.",
      actionHints: [...(actionHintsByIssue[issueKey] ?? []), ...recovery.recoveryActions],
    },
    priorityScore: (severity === "critical" ? 2100 : 1600) + Math.min(400, affectedOrders * 60),
    priorityLevel: severity === "critical" ? "p1" : "p2",
    priorityReason:
      severity === "critical"
        ? `${issueKey} is accumulating and is likely blocking real payment completion`
        : `${issueKey} is visible in the latest window and should be reviewed before it grows`,
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: existingActive?.contentRefsSeen ?? [],
    preparedDraft: null,
    preparedDraftError: "This recommendation targets payment-stage recovery, not a single CMS content draft.",
  };

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) recommendations[idx] = { ...existingActive, ...rec };
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createPaymentObservationFollowupRecommendation(input = {}) {
  const sourceProposalId = String(input.sourceProposalId || "").trim();
  if (!sourceProposalId) return null;
  const source = proposals.find((item) => item.id === sourceProposalId) ?? null;
  if (!source || source.type !== "incident_followup" || source.targetType !== "journey" || source.anomalyKind !== "payment_result_issue") {
    return null;
  }

  const enriched = enrichProposal(source);
  if (enriched?.status !== "applied" || enriched?.reviewSummary?.state !== "risk") return null;
  const effect = enriched?.postApplyEffect;
  if (!effect?.post || !effect?.delta) return null;

  const ruleId = "payment-observation-followup";
  const issueKey = String(source?.context?.issueKey || source.targetId || "payment_issue");
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === "journey" &&
      item.targetId === issueKey &&
      item.followupContext?.sourceProposalId === sourceProposalId,
  );

  const postIssueRate = Number(effect?.post?.funnel?.targetedIssueRate ?? 0);
  const postPaidRate = Number(effect?.post?.funnel?.paidRate ?? 0);
  const deltaIssueRate = Number(effect?.delta?.targetedIssueRate ?? 0);
  const postAttempts = normalizeNumber(effect?.post?.funnel?.paymentAttempts ?? 0);
  const recovery = paymentRecoveryProfile(issueKey);
  const targetBreakdown = Array.isArray(source?.context?.targetBreakdown) ? source.context.targetBreakdown.slice(0, 3) : [];
  const weakestPath =
    (source?.context?.weakestPath && typeof source.context.weakestPath === "object" ? source.context.weakestPath : null) ||
    targetBreakdown[0] ||
    null;
  const actionHints = [
    `re-check provider and retry flow for ${issueKey} before treating this as solved`,
    `compare the post-apply payment outcomes by target to isolate whether one path still drives the issue`,
    `prepare a narrower payment recovery step focused on the remaining high-friction target or provider handoff`,
  ];

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType: "journey",
    targetId: issueKey,
    contentRef: null,
    ruleId,
    reason:
      input.reason ||
      `${issueKey} remained elevated after an applied payment recovery change. Post-apply issue rate ${(postIssueRate * 100).toFixed(1)}% with delta ${(deltaIssueRate * 100).toFixed(1)} pts still needs follow-up.`,
    suggestedWorkflow: "payment-followup",
    severity: postIssueRate >= 0.3 ? "critical" : "warning",
    context: {
      source: "payment-observation-review",
      issueKey,
      parentProposalId: sourceProposalId,
      targetPath: source?.context?.targetPath ?? "/ops/monitoring",
      metricKey: `${issueKey}_post_apply`,
      metricLabel: `${issueKey} (post-apply)`,
      observedCount: normalizeNumber(effect?.post?.funnel?.targetedIssueCount ?? 0),
      issueRate: postIssueRate,
      paidRate: postPaidRate,
      recoveryLane: recovery.recoveryLane,
      recoveryOwner: recovery.recoveryOwner,
      paymentIssueReason: source?.context?.paymentIssueReason ?? null,
      paymentIssueReasonLabel: source?.context?.paymentIssueReasonLabel ?? null,
      sampleSize: postAttempts,
      paymentAttempts: postAttempts,
      deltaTargetedIssueRate: deltaIssueRate,
      targetBreakdown,
      weakestPath,
      actionHints: [...actionHints, ...recovery.recoveryActions],
      optimizationGoal: "Escalate a payment issue that stayed risky after the first recovery attempt so the next step focuses on the remaining provider or target-level friction.",
    },
    followupContext: {
      source: "payment-observation-review",
      sourceProposalId,
      sourceRecommendationId: source.linkedRecommendationId ?? null,
      outcome: enriched.reviewSummary?.state ?? "risk",
    },
    priorityScore: (postIssueRate >= 0.3 ? 2900 : 2400) + Math.min(300, postAttempts * 20),
    priorityLevel: postIssueRate >= 0.3 ? "p0" : "p1",
    priorityReason: `${issueKey} remained risky after an applied payment recovery fix`,
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: existingActive?.contentRefsSeen ?? [],
    preparedDraft: null,
    preparedDraftError: "This recommendation targets payment follow-up recovery, not a single CMS content draft.",
  };

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) recommendations[idx] = { ...existingActive, ...rec };
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createFulfillmentObservationFollowupRecommendation(input = {}) {
  const sourceProposalId = String(input.sourceProposalId || "").trim();
  if (!sourceProposalId) return null;
  const source = proposals.find((item) => item.id === sourceProposalId) ?? null;
  if (!source || source.type !== "incident_followup" || source.targetType !== "journey" || source.anomalyKind !== "fulfillment_backlog") {
    return null;
  }

  const enriched = enrichProposal(source);
  if (enriched?.status !== "applied" || enriched?.reviewSummary?.state !== "risk") return null;
  const effect = enriched?.postApplyEffect;
  if (!effect?.post || !effect?.delta) return null;

  const ruleId = "fulfillment-observation-followup";
  const stageKey = String(source?.context?.stageKey || source.targetId || "fulfillment_processing");
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === "journey" &&
      item.targetId === stageKey &&
      item.followupContext?.sourceProposalId === sourceProposalId,
  );

  const postBacklogRate = Number(effect?.post?.funnel?.processingBacklogRate ?? 0);
  const postShippedRate = Number(effect?.post?.funnel?.shippedRate ?? 0);
  const postDeliveredRate = Number(effect?.post?.funnel?.deliveredRate ?? 0);
  const deltaBacklogRate = Number(effect?.delta?.processingBacklogRate ?? 0);
  const postTracked = normalizeNumber(effect?.post?.funnel?.totalTracked ?? 0);
  const postProcessing = normalizeNumber(effect?.post?.funnel?.fulfillmentProcessing ?? 0);
  const postShipped = normalizeNumber(effect?.post?.funnel?.fulfillmentShipped ?? 0);
  const postDelivered = normalizeNumber(effect?.post?.funnel?.fulfillmentDelivered ?? 0);
  const targetBreakdown = Array.isArray(source?.context?.targetBreakdown) ? source.context.targetBreakdown.slice(0, 3) : [];
  const weakestPath =
    (source?.context?.weakestPath && typeof source.context.weakestPath === "object" ? source.context.weakestPath : null) ||
    targetBreakdown[0] ||
    null;
  const actionHints = [
    "re-check warehouse handoff and shipment creation before treating this fulfillment backlog as resolved",
    "compare the post-apply fulfillment paths to isolate whether one product path still traps orders in processing",
    "prepare a narrower fulfillment recovery step focused on the remaining stalled path or ops handoff",
  ];

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType: "journey",
    targetId: stageKey,
    contentRef: null,
    ruleId,
    reason:
      input.reason ||
      `${stageKey} remained elevated after an applied fulfillment recovery change. Post-apply backlog rate ${(postBacklogRate * 100).toFixed(1)}% still needs follow-up.`,
    suggestedWorkflow: "fulfillment-followup",
    severity: postBacklogRate >= 0.6 ? "critical" : "warning",
    context: {
      source: "fulfillment-observation-review",
      parentProposalId: sourceProposalId,
      stageKey,
      metricKey: `${stageKey}_post_apply`,
      metricLabel: `${stageKey} (post-apply)`,
      observedCount: postProcessing,
      processingCount: postProcessing,
      shippedCount: postShipped,
      deliveredCount: postDelivered,
      sampleSize: postTracked,
      deltaProcessingBacklogRate: deltaBacklogRate,
      shippedRate: postShippedRate,
      deliveredRate: postDeliveredRate,
      recoveryLane: "ops_review",
      recoveryOwner: "ops",
      targetPath: source?.context?.targetPath ?? "/ops/monitoring",
      targetBreakdown,
      weakestPath,
      focusAreas: ["warehouse_backlog", "shipment_creation", "handoff_recheck", "post-payment_ops"],
      actionHints,
      optimizationGoal: "Escalate a fulfillment backlog that stayed risky after the first ops recovery attempt so the next step focuses on the remaining stalled path.",
    },
    followupContext: {
      source: "fulfillment-observation-review",
      sourceProposalId,
      sourceRecommendationId: source.linkedRecommendationId ?? null,
      outcome: enriched.reviewSummary?.state ?? "risk",
    },
    priorityScore: (postBacklogRate >= 0.6 ? 2600 : 2100) + Math.min(300, postTracked * 20),
    priorityLevel: postBacklogRate >= 0.6 ? "p1" : "p2",
    priorityReason: `${stageKey} remained risky after an applied fulfillment recovery fix`,
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: existingActive?.contentRefsSeen ?? [],
    preparedDraft: null,
    preparedDraftError: "This recommendation targets fulfillment follow-up recovery, not a single CMS content draft.",
  };

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) recommendations[idx] = { ...existingActive, ...rec };
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function createCheckoutCompletionRecommendation(input = {}) {
  const sourceKey = String(input.sourceKey || "").trim();
  const observedRate = Number(input.observedRate ?? NaN);
  const threshold = Number(input.threshold ?? NaN);
  const checkoutStarts = normalizeNumber(input.checkoutStarts ?? 0);
  const checkoutCompletes = normalizeNumber(input.checkoutCompletes ?? 0);
  const checkoutDropoff = normalizeNumber(input.checkoutDropoff ?? Math.max(0, checkoutStarts - checkoutCompletes));
  if (!sourceKey || !Number.isFinite(observedRate) || !Number.isFinite(threshold) || checkoutStarts < 1) {
    return null;
  }

  const ruleId = "checkout-completion-dropoff";
  const existingActive = recommendations.find(
    (item) =>
      ["open", "in_progress"].includes(item.status) &&
      item.ruleId === ruleId &&
      item.targetType === "journey" &&
      item.targetId === sourceKey,
  );

  const severity = observedRate < 0.25 ? "critical" : "warning";
  const targetPath = input.targetPath || commerceSourceTargetPath(sourceKey);
  const displaySource = sourceKey.replace(/[-_]/g, " ");
  const actionHints = [
    `review ${sourceKey} handoff copy and CTA wording before checkout`,
    `compare ${sourceKey} landing path against the top-performing source in the same 24h window`,
    `reduce pre-checkout friction for ${sourceKey} traffic by tightening product-match and trust cues`,
  ];
  const targetBreakdown = Array.isArray(input.targetBreakdown) ? input.targetBreakdown.slice(0, 3) : [];
  const weakestPath = input.weakestPath && typeof input.weakestPath === "object" ? input.weakestPath : targetBreakdown[0] ?? null;
  const reason =
    input.reason ||
    `Source ${displaySource} started checkout ${checkoutStarts} times in 24h, but only ${checkoutCompletes} reached order creation. Completion ${(observedRate * 100).toFixed(1)}% is below ${(threshold * 100).toFixed(1)}%.`;

  const rec = {
    id: existingActive?.id ?? nextId("rec"),
    status: existingActive?.status ?? "open",
    createdAt: existingActive?.createdAt ?? nowIso(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    targetType: "journey",
    targetId: sourceKey,
    contentRef: null,
    ruleId,
    reason,
    suggestedWorkflow: "journey-tuning",
    severity,
    context: {
      source: "commerce-monitoring",
      sourceKey,
      targetPath,
      metricKey: "checkout_completion_rate",
      metricLabel: "Checkout completion",
      observedRate,
      threshold,
      sampleSize: checkoutStarts,
      checkoutStarts,
      checkoutCompletes,
      checkoutDropoff,
      targetBreakdown,
      weakestPath,
      focusAreas: ["handoff_copy", "product_match", "trust_signals", "checkout_friction"],
      suggestedWorkflow: "journey-tuning",
      optimizationGoal: "Improve checkout completion for a specific acquisition or content source before expanding more traffic into that path.",
      actionHints,
    },
    priorityScore: (observedRate < 0.25 ? 2100 : 1700) + Math.min(400, checkoutStarts * 35),
    priorityLevel: observedRate < 0.25 ? "p1" : "p2",
    priorityReason:
      observedRate < 0.25
        ? `source ${sourceKey} drives checkout intent but loses most users before order creation`
        : `source ${sourceKey} shows meaningful checkout dropoff and needs journey tuning`,
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    contentRefsSeen: existingActive?.contentRefsSeen ?? [],
    preparedDraft: null,
    preparedDraftError: "This recommendation targets checkout journey tuning, not a single CMS content draft.",
  };

  if (existingActive) {
    const idx = recommendations.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) recommendations[idx] = { ...existingActive, ...rec };
  } else {
    recommendations.unshift(rec);
  }

  persist();
  return rec;
}

function buildAiConciergeStrategyProposalPayload(activeRecs = []) {
  const metricKeys = Array.from(new Set(activeRecs.map((item) => item?.context?.metricKey).filter(Boolean)));
  const metricLabels = Array.from(new Set(activeRecs.map((item) => item?.context?.metricLabel).filter(Boolean)));
  const currentConfig = {
    entryCtrThreshold: 0.05,
    resultCtrThreshold: 0.15,
    atcViewRateThreshold: 0.03,
    purchaseViewRateThreshold: 0.01,
    topPickCheckoutEnabled: true,
    quickAddEnabled: true,
    questionSet: ["firstTime", "wearable", "dual", "budget", "control"],
  };
  const suggestedConfig = {
    ...currentConfig,
    entryModuleVariant: metricKeys.includes("entry_ctr") ? "stronger_copy" : "default",
    resultReasoningVariant: metricKeys.includes("result_ctr") ? "expanded_reasons" : "default",
    emphasizeQuickAdd: metricKeys.includes("atc_view_rate") || metricKeys.includes("purchase_view_rate"),
    emphasizeCheckoutHandoff: metricKeys.includes("purchase_view_rate"),
    rankingTuningMode:
      metricKeys.includes("purchase_view_rate") || metricKeys.includes("atc_view_rate")
        ? "conversion_weighted"
        : "balanced",
  };
  const expectedImpactParts = [];
  if (metricKeys.includes("entry_ctr")) expectedImpactParts.push("improve entry click-through from shop/product surfaces");
  if (metricKeys.includes("result_ctr")) expectedImpactParts.push("improve results-page engagement and recommendation clicks");
  if (metricKeys.includes("atc_view_rate")) expectedImpactParts.push("increase add-to-cart rate from AI concierge traffic");
  if (metricKeys.includes("purchase_view_rate")) expectedImpactParts.push("improve purchase conversion after quiz handoff");

  return {
    metricKeys,
    metricLabels,
    currentConfig,
    suggestedConfig,
    expectedImpact:
      expectedImpactParts.length > 0
        ? `Tune AI concierge strategy to ${expectedImpactParts.join("; ")}.`
        : "Tune AI concierge strategy based on active funnel drop-off recommendations.",
  };
}

function buildAiConciergeRepoChangeDraft(proposal) {
  const metricLabels = Array.isArray(proposal?.context?.metricLabels) ? proposal.context.metricLabels : [];
  const sourceRecommendationIds = Array.isArray(proposal?.sourceRecommendationIds) ? proposal.sourceRecommendationIds : [];
  const parentProposalId = proposal?.context?.parentProposalId ? String(proposal.context.parentProposalId) : null;
  const followupSignals = Array.isArray(proposal?.context?.reviewSignals) ? proposal.context.reviewSignals : [];
  const isFollowup = proposal?.context?.source === "ai-concierge-followup";
  const title = isFollowup ? "AI concierge: conservative risk follow-up tuning" : "AI concierge: tune strategy for funnel drop-off";
  const checklist = [
    "Review current AI concierge entry module copy and placement.",
    "Validate result-page reasoning, top-pick CTA, and quick-add emphasis.",
    "Confirm whether ranking should stay balanced or move toward conversion-weighted.",
    "Record the shipped strategy config in the proposal after rollout.",
  ];
  const body = [
    "## Why",
    "",
    proposal?.suggestion || "Active AI concierge funnel issues need strategy tuning.",
    ...(isFollowup && parentProposalId
      ? ["", "## Parent proposal", "", `- \`${parentProposalId}\``]
      : []),
    "",
    "## Expected impact",
    "",
    proposal?.expectedImpact || "Improve AI concierge funnel performance.",
    "",
    "## Active signals",
    "",
    metricLabels.length ? metricLabels.map((item) => `- ${item}`).join("\n") : "- No metric labels recorded.",
    ...(isFollowup && followupSignals.length ? ["", "## Risk review signals", "", followupSignals.map((s) => `- ${s}`).join("\n")] : []),
    "",
    "## Proposed strategy changes",
    "",
    "```json",
    JSON.stringify(proposal?.suggestedConfig ?? {}, null, 2),
    "```",
    "",
    "## Checklist",
    "",
    checklist.map((item) => `- [ ] ${item}`).join("\n"),
    "",
    "## Source recommendations",
    "",
    sourceRecommendationIds.length ? sourceRecommendationIds.map((item) => `- \`${item}\``).join("\n") : "- none",
  ].join("\n");
  return { title, checklist, body };
}

function createAiConciergeRiskFollowupProposal({ sourceProposalId, actor = "ai:review" } = {}) {
  if (!sourceProposalId) return null;
  const source = proposals.find((item) => item.id === sourceProposalId) ?? null;
  if (!source || source.type !== "rule_tuning" || source.ruleId !== "ai-concierge-strategy") return null;

  const enrichedSource = enrichProposal(source);
  if (enrichedSource?.reviewSummary?.state !== "risk") return null;

  const existing = proposals.find(
    (item) =>
      item.type === "rule_tuning" &&
      item.ruleId === "ai-concierge-strategy" &&
      item.status === "draft" &&
      item.context?.source === "ai-concierge-followup" &&
      item.context?.parentProposalId === sourceProposalId,
  );

  const followupMetricLabels = Array.isArray(source.context?.metricLabels) ? source.context.metricLabels : [];
  const note = `Follow-up after risky AI concierge rollout ${sourceProposalId}`;
  const next = {
    id: existing?.id ?? nextId("prop"),
    type: "rule_tuning",
    status: existing?.status ?? "draft",
    createdAt: existing?.createdAt ?? nowIso(),
    createdBy: existing?.createdBy ?? actor,
    ruleId: "ai-concierge-strategy",
    targetType: "collection",
    targetId: "ai-concierge",
    sinceDays: source.sinceDays ?? 7,
    currentConfig: source.appliedConfig ?? source.suggestedConfig ?? source.currentConfig ?? null,
    suggestedConfig: {
      ...(source.appliedConfig ?? source.suggestedConfig ?? {}),
      emphasizeCheckoutHandoff: true,
      emphasizeQuickAdd: true,
      rankingTuningMode: "balanced",
      riskMitigationMode: "reduce_aggressive_changes",
    },
    expectedImpact: "Recover AI concierge funnel conversion after a risky rollout by dialing back aggressive strategy changes and re-checking checkout handoff.",
    applyHowTo:
      "Review the risky rollout, reduce the most aggressive strategy changes, then re-apply with a conservative config and monitor the next funnel window.",
    quality: "observe",
    suggestion: `Risk follow-up for AI concierge rollout ${sourceProposalId}${followupMetricLabels.length ? ` · metrics: ${followupMetricLabels.join(", ")}` : ""}.`,
    improvementRate: 0,
    worsenedRate: 0,
    evaluated: normalizeNumber(source.evaluated),
    lastSeenAt: nowIso(),
    note,
    approvedAt: null,
    approvedBy: null,
    approvalNote: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionNote: null,
    appliedAt: null,
    appliedBy: null,
    appliedNote: null,
    appliedConfig: null,
    sourceRecommendationIds: Array.isArray(source.sourceRecommendationIds) ? source.sourceRecommendationIds : [],
    context: {
      source: "ai-concierge-followup",
      parentProposalId: sourceProposalId,
      riskState: enrichedSource.reviewSummary?.state,
      reviewSignals: enrichedSource.reviewSummary?.signals ?? [],
      metricLabels: followupMetricLabels,
    },
  };

  if (existing) {
    const idx = proposals.findIndex((item) => item.id === existing.id);
    if (idx >= 0) proposals[idx] = { ...existing, ...next };
  } else {
    proposals.unshift(next);
    try {
      createOpsEvent({
        actor,
        action: "rule_tuning_proposal_followup",
        note: `follow-up proposal ${next.id} from ${sourceProposalId}`,
      });
    } catch {
      // non-blocking
    }
  }

  try {
    const repo = ensureAiConciergeRepoChangeForProposal({ proposalId: next.id, actor });
    if (repo?.repoChangeId) {
      const refreshedIdx = proposals.findIndex((item) => item.id === next.id);
      if (refreshedIdx >= 0) next.repoChangeId = proposals[refreshedIdx].repoChangeId;
    }
  } catch {
    // non-blocking
  }

  persist();
  return next;
}

function syncAiConciergeTuningProposal({ actor = "ai:monitoring", note } = {}) {
  const ruleId = "ai-concierge-strategy";
  const activeRecs = recommendations.filter(
    (item) =>
      item.ruleId === "ai-concierge-funnel-dropoff" &&
      ["open", "in_progress"].includes(item.status) &&
      item.targetType === "collection" &&
      item.targetId === "ai-concierge",
  );
  if (!activeRecs.length) return null;

  const payload = buildAiConciergeStrategyProposalPayload(activeRecs);
  const lastSeenAt = activeRecs
    .map((item) => item.lastSeenAt || item.updatedAt || item.createdAt || null)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? nowIso();
  const suggestion =
    payload.metricLabels.length > 0
      ? `Active AI concierge issues: ${payload.metricLabels.join(", ")}.`
      : "Active AI concierge funnel issues need strategy tuning.";

  const existingActive = proposals.find(
    (item) =>
      item.type === "rule_tuning" &&
      item.ruleId === ruleId &&
      item.targetType === "collection" &&
      item.targetId === "ai-concierge" &&
      ["draft", "approved"].includes(item.status),
  );

  const next = {
    id: existingActive?.id ?? nextId("prop"),
    type: "rule_tuning",
    status: existingActive?.status ?? "draft",
    createdAt: existingActive?.createdAt ?? nowIso(),
    createdBy: existingActive?.createdBy ?? actor,
    ruleId,
    targetType: "collection",
    targetId: "ai-concierge",
    sinceDays: 7,
    currentConfig: payload.currentConfig,
    suggestedConfig: payload.suggestedConfig,
    expectedImpact: payload.expectedImpact,
    applyHowTo:
      "Apply by tuning AI concierge quiz/scoring/CTA defaults in the web app, then mark the proposal as applied with the config you actually shipped.",
    quality: "observe",
    suggestion,
    improvementRate: 0,
    worsenedRate: 0,
    evaluated: activeRecs.length,
    lastSeenAt,
    note: note ?? existingActive?.note ?? null,
    approvedAt: existingActive?.approvedAt ?? null,
    approvedBy: existingActive?.approvedBy ?? null,
    approvalNote: existingActive?.approvalNote ?? null,
    rejectedAt: existingActive?.rejectedAt ?? null,
    rejectedBy: existingActive?.rejectedBy ?? null,
    rejectionNote: existingActive?.rejectionNote ?? null,
    appliedAt: existingActive?.appliedAt ?? null,
    appliedBy: existingActive?.appliedBy ?? null,
    appliedNote: existingActive?.appliedNote ?? null,
    appliedConfig: existingActive?.appliedConfig ?? null,
    sourceRecommendationIds: activeRecs.map((item) => item.id),
    context: {
      source: "ai-concierge-monitoring",
      metricKeys: payload.metricKeys,
      metricLabels: payload.metricLabels,
    },
  };

  if (existingActive) {
    const idx = proposals.findIndex((item) => item.id === existingActive.id);
    if (idx >= 0) proposals[idx] = { ...existingActive, ...next };
  } else {
    proposals.unshift(next);
    try {
      createOpsEvent({
        actor,
        action: "rule_tuning_proposal",
        note: `proposal ${next.id} for rule ${ruleId}`,
      });
    } catch {
      // non-blocking
    }
  }

  try {
    const repo = ensureAiConciergeRepoChangeForProposal({ proposalId: next.id, actor });
    if (repo?.repoChangeId) {
      const refreshedIdx = proposals.findIndex((item) => item.id === next.id);
      if (refreshedIdx >= 0) next.repoChangeId = proposals[refreshedIdx].repoChangeId;
    }
  } catch {
    // non-blocking
  }

  persist();
  return next;
}

function ensureAiConciergeRepoChangeForProposal({ proposalId, actor = "ai:proposal" } = {}) {
  if (!proposalId) return { status: "skipped", reason: "missing_proposal_id" };
  const idx = proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) return { status: "skipped", reason: "proposal_not_found" };
  const proposal = proposals[idx];
  if (!proposal || proposal.type !== "rule_tuning" || proposal.ruleId !== "ai-concierge-strategy") {
    return { status: "skipped", reason: "not_ai_concierge_strategy_proposal" };
  }
  if (proposal.repoChangeId) {
    return { status: "skipped", reason: "already_has_repo_change", repoChangeId: proposal.repoChangeId };
  }

  const existingRepo = listRepoChanges({ proposalId: proposal.id })[0] ?? null;
  const prDraft = buildAiConciergeRepoChangeDraft(proposal);
  const branchName =
    proposal?.context?.source === "ai-concierge-followup"
      ? `ai/concierge-strategy-followup-${proposal.id}`
      : "ai/concierge-strategy";
  const kind = proposal?.context?.source === "ai-concierge-followup" ? "ai_concierge_strategy_followup" : "ai_concierge_strategy";
  if (existingRepo) {
    updateRepoChange(existingRepo.id, {
      title: "Tune AI concierge strategy",
      summary: proposal.suggestion || proposal.expectedImpact || "Tune AI concierge funnel strategy based on active drop-off signals.",
      prDraft,
      branchName,
      kind,
    });
    proposals[idx] = { ...proposal, repoChangeId: existingRepo.id };
    persist();
    return { status: "linked", repoChangeId: existingRepo.id };
  }

  const repoChange = createRepoChange({
    actor,
    kind,
    proposalId: proposal.id,
    targetType: "collection",
    targetId: "ai-concierge",
    title: "Tune AI concierge strategy",
    summary: proposal.suggestion || proposal.expectedImpact || "Tune AI concierge funnel strategy based on active drop-off signals.",
    branchName,
    prUrl: null,
    commitSha: null,
    ciStatus: "not_started",
    trigger: "ai_concierge_strategy",
    prDraft,
  });
  proposals[idx] = { ...proposal, repoChangeId: repoChange.id };
  persist();
  return { status: "created", repoChangeId: repoChange.id };
}

async function maybeOpenAiConciergeDraftPullRequestForProposal({ proposalId, actor = "ai:proposal" } = {}) {
  if (!proposalId) return { status: "skipped", reason: "missing_proposal_id" };
  const proposal = proposals.find((item) => item.id === proposalId) ?? null;
  if (!proposal || proposal.type !== "rule_tuning" || proposal.ruleId !== "ai-concierge-strategy") {
    return { status: "skipped", reason: "not_ai_concierge_strategy_proposal" };
  }
  const allowDraftFollowup = proposal.status === "draft" && proposal.context?.source === "ai-concierge-followup";
  if (proposal.status !== "approved" && !allowDraftFollowup) {
    return { status: "skipped", reason: "proposal_not_approved" };
  }
  const repo = ensureAiConciergeRepoChangeForProposal({ proposalId, actor });
  const repoChangeId = repo?.repoChangeId ?? proposal.repoChangeId ?? null;
  if (!repoChangeId) return { status: "skipped", reason: "missing_repo_change" };
  const repoChange = listRepoChanges({ proposalId })[0] ?? null;
  if (repoChange?.prUrl) return { status: "skipped", reason: "pr_already_exists", repoChangeId, prUrl: repoChange.prUrl };

  const { createRepoChangePullRequest } = require("../ops/github");
  const result = await createRepoChangePullRequest({ id: repoChangeId, actor });
  return {
    status: result?.result?.status ?? "unknown",
    repoChangeId,
    prUrl: result?.repoChange?.prUrl ?? null,
    message: result?.result?.message ?? null,
  };
}

function syncPurchaseEffectFollowupsForTarget({ targetType, targetId }) {
  return recommendations
    .filter(
      (item) =>
        item.ruleId === "low-purchase-rate" &&
        ["resolved", "dismissed"].includes(item.status) &&
        item.targetType === targetType &&
        item.targetId === targetId,
    )
    .map((item) => {
      const withEffect = computeRecommendationEffect(item);
      const effect = withEffect.effect;
      if (!effect?.after || !effect?.delta) return null;
      const deltaPurchaseRate = Number(effect.delta.rates?.purchaseRate ?? 0);
      if (deltaPurchaseRate >= 0.001) return null;
      return createPurchaseEffectFollowupRecommendation({
        targetType: item.targetType,
        targetId: item.targetId,
        sourceRecommendationId: item.id,
        sourceRuleId: item.ruleId,
        outcome: deltaPurchaseRate <= -0.001 ? "worsened" : "flat",
        purchaseDeltaRate: deltaPurchaseRate,
        contentRef: effect.after.contentRef ?? item.contentRef ?? null,
        snapshot: item.context?.snapshot ?? null,
        previous: item.context?.previous ?? null,
        delta: item.context?.delta ?? null,
        focusAreas: item.context?.focusAreas ?? [],
        actionHints: item.context?.actionHints ?? [],
      });
    })
    .filter(Boolean);
}

function listRecommendationRuleStats(filters = {}) {
  const sinceDays = Number.isFinite(Number(filters.sinceDays)) ? Number(filters.sinceDays) : 30;
  const sinceMs = Math.max(0, sinceDays) * 24 * 60 * 60 * 1000;
  const sinceAt = sinceMs ? Date.now() - sinceMs : 0;

  const completed = listRecommendations({ statuses: ["resolved", "dismissed"] });
  const statsByRule = new Map();

  completed.forEach((rec) => {
    const at = Date.parse(rec.resolvedAt || rec.updatedAt || rec.createdAt || "");
    if (sinceAt && Number.isFinite(at) && at < sinceAt) return;

    const ruleId = rec.ruleId || "unknown-rule";
    if (!statsByRule.has(ruleId)) {
      statsByRule.set(ruleId, {
        ruleId,
        total: 0,
        evaluated: 0,
        improved: 0,
        neutral: 0,
        worsened: 0,
        unknown: 0,
        lastSeenAt: null,
      });
    }
    const item = statsByRule.get(ruleId);
    item.total += 1;

    const lastAt = rec.resolvedAt || rec.updatedAt || rec.createdAt || null;
    if (lastAt && (!item.lastSeenAt || String(lastAt).localeCompare(String(item.lastSeenAt)) > 0)) {
      item.lastSeenAt = lastAt;
    }

    const effect = rec.effect;
    if (!effect) {
      item.unknown += 1;
      return;
    }
    item.evaluated += 1;
    if (effect.status === "improved") item.improved += 1;
    else if (effect.status === "worsened") item.worsened += 1;
    else if (effect.status === "neutral") item.neutral += 1;
    else item.unknown += 1;
  });

  const items = Array.from(statsByRule.values()).map((row) => {
    const denom = row.improved + row.neutral + row.worsened;
    const improvementRate = denom ? row.improved / denom : 0;
    const worsenedRate = denom ? row.worsened / denom : 0;
    const def = getRuleDefinition(row.ruleId);
    const hasDefinition = !!def;
    const hasEvaluator = !!(def && getRuleEvaluator(def));
    const configWarnings = Array.isArray(def?.validation?.warnings) ? def.validation.warnings : [];
    let quality = "insufficient";
    let suggestion = "collect more data";
    if (denom >= 5) {
      if (improvementRate >= 0.5 && worsenedRate <= 0.2) {
        quality = "good";
        suggestion = "keep";
      } else if (worsenedRate >= 0.4) {
        quality = "risky";
        suggestion = "tighten threshold or add guardrails";
      } else if (improvementRate < 0.3) {
        quality = "weak";
        suggestion = "review rule signal and threshold";
      } else {
        quality = "ok";
        suggestion = "monitor";
      }
    }
    return {
      ...row,
      improvementRate,
      worsenedRate,
      quality,
      suggestion,
      hasDefinition,
      hasEvaluator,
      configWarnings,
      ruleMeta: buildRuleMeta(def),
    };
  });

  items.sort((a, b) => {
    if (a.total !== b.total) return b.total - a.total;
    if (a.improvementRate !== b.improvementRate) return b.improvementRate - a.improvementRate;
    return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
  });

  const totals = items.reduce(
    (acc, row) => {
      acc.total += row.total;
      acc.evaluated += row.evaluated;
      acc.improved += row.improved;
      acc.neutral += row.neutral;
      acc.worsened += row.worsened;
      acc.unknown += row.unknown;
      return acc;
    },
    { total: 0, evaluated: 0, improved: 0, neutral: 0, worsened: 0, unknown: 0 },
  );

  const denom = totals.improved + totals.neutral + totals.worsened;
  const improvementRate = denom ? totals.improved / denom : 0;
  const worsenedRate = denom ? totals.worsened / denom : 0;

  const suggestedRuleTuning = items
    .filter((row) => (row.quality === "risky" || row.quality === "weak") && row.evaluated >= 5)
    .slice(0, 5)
    .map((row) => ({
      ruleId: row.ruleId,
      quality: row.quality,
      suggestion: row.suggestion,
      improvementRate: row.improvementRate,
      worsenedRate: row.worsenedRate,
      evaluated: row.evaluated,
      lastSeenAt: row.lastSeenAt,
      hasDefinition: row.hasDefinition,
      hasEvaluator: row.hasEvaluator,
      configWarnings: row.configWarnings,
      ruleMeta: row.ruleMeta,
    }));

  const missingEvaluators = items
    .filter((row) => row.total > 0 && !row.hasEvaluator)
    .slice(0, 10)
    .map((row) => ({ ruleId: row.ruleId, total: row.total, lastSeenAt: row.lastSeenAt }));

  const ruleConfigWarnings = items
    .filter((row) => row.hasDefinition && row.configWarnings?.length)
    .slice(0, 10)
    .map((row) => ({
      ruleId: row.ruleId,
      warnings: row.configWarnings,
    }));

  return {
    sinceDays,
    totals: { ...totals, improvementRate, worsenedRate },
    missingEvaluators,
    ruleConfigWarnings,
    suggestedRuleTuning,
    items,
  };
}

function resolveRecommendation(id, actor, note, status = "resolved") {
  const idx = recommendations.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const existing = recommendations[idx];
  const next = { ...existing, status };

  if (status === "in_progress") {
    next.startedAt = existing.startedAt ?? nowIso();
    next.startedBy = existing.startedBy ?? actor;
    next.startNote = note ?? existing.startNote ?? null;
    next.resolvedAt = null;
    next.resolvedBy = null;
    next.resolutionNote = null;
  } else {
    next.resolvedAt = nowIso();
    next.resolvedBy = actor;
    next.resolutionNote = note ?? null;
  }

  recommendations[idx] = next;
  persist();
  if (["resolved", "dismissed"].includes(status)) {
    syncPurchaseEffectFollowupsForTarget({
      targetType: next.targetType,
      targetId: next.targetId,
    });
  }
  return next;
}

function recordBatchRun(input) {
  const record = {
    at: input.at ?? nowIso(),
    status: input.status ?? "success",
    windowDays: normalizeNumber(input.windowDays ?? 7),
    total: normalizeNumber(input.total ?? 0),
    items: Array.isArray(input.items) ? input.items : [],
    error: input.error ?? null,
  };

  meta.lastBatchRun = record;
  meta.batchRuns = [record, ...(Array.isArray(meta.batchRuns) ? meta.batchRuns : [])].slice(0, 20);
  meta.consecutiveBatchFailures =
    record.status === "error"
      ? normalizeNumber(meta.consecutiveBatchFailures) + 1
      : 0;
  persist();

  // 自动推进：当 batch 成功时，尝试把高优先级 publish verification follow-up recommendation 同步成 incident proposal。
  // 这个步骤是非阻断的：即使失败也不影响 batch 状态。
  try {
    if (record.status !== "error") {
      syncIncidentFollowupProposalsForRecommendations({ actor: "ai:batch", limit: 10 });
    }
  } catch {
    // non-blocking
  }
  return meta.lastBatchRun;
}

function getSignalsRuntimeStatus() {
  const consecutiveBatchFailures = normalizeNumber(meta.consecutiveBatchFailures);
  const health =
    consecutiveBatchFailures >= 3
      ? "critical"
      : consecutiveBatchFailures >= 1
        ? "degraded"
        : "healthy";
  return {
    storeFile: getFilePath(),
    health,
    counts: {
      events: events.length,
      snapshots: snapshots.length,
      recommendations: recommendations.length,
    },
    consecutiveBatchFailures,
    lastBatchRun: meta.lastBatchRun ?? null,
    recentBatchRuns: Array.isArray(meta.batchRuns) ? meta.batchRuns.slice(0, 10) : [],
  };
}

function compareSnapshots(current, previous) {
  if (!current) return null;
  const currentRates = computeRates(current.metrics);
  const previousRates = previous ? computeRates(previous.metrics) : null;

  return {
    current: {
      views: current.metrics.views,
      ctaRate: currentRates.ctaRate,
      addToCartRate: currentRates.addToCartRate,
      purchaseRate: currentRates.purchaseRate,
    },
    previous: previous
      ? {
          views: previous.metrics.views,
          ctaRate: previousRates.ctaRate,
          addToCartRate: previousRates.addToCartRate,
          purchaseRate: previousRates.purchaseRate,
        }
      : null,
    delta: previous
      ? {
          views: current.metrics.views - previous.metrics.views,
          ctaRate: currentRates.ctaRate - previousRates.ctaRate,
          addToCartRate: currentRates.addToCartRate - previousRates.addToCartRate,
          purchaseRate: currentRates.purchaseRate - previousRates.purchaseRate,
        }
      : null,
  };
}

function buildTargetSummary({ targetType, targetId }) {
  const target = listAllTargets().find((item) => item.type === targetType && item.id === targetId) ?? null;
  const targetSnapshots = listSnapshots({ targetType, targetId });
  const latestSnapshot = targetSnapshots[0] ?? null;
  let previousSnapshot = targetSnapshots[1] ?? null;

  if (latestSnapshot) {
    const previousDifferentContentRef = targetSnapshots.find(
      (item) => item.id !== latestSnapshot.id && (item.contentRef ?? null) !== (latestSnapshot.contentRef ?? null),
    );
    previousSnapshot = previousDifferentContentRef ?? previousSnapshot;
  }

  const activeRecommendations = listRecommendations({
    targetType,
    targetId,
    statuses: ["open", "in_progress"],
  });

  const maxSeverity = activeRecommendations.reduce((acc, item) => {
    if (!acc) return item.severity;
    return severityRank[item.severity] > severityRank[acc] ? item.severity : acc;
  }, null);

  return {
    target: target ?? {
      type: targetType,
      id: targetId,
      title: `${targetType}:${targetId}`,
      targetPath: null,
    },
    latestSnapshot,
    previousSnapshot,
    comparison: compareSnapshots(latestSnapshot, previousSnapshot),
    activeRecommendationsCount: activeRecommendations.length,
    maxSeverity,
    lastRecommendation: activeRecommendations[0] ?? null,
  };
}

function listTargetSummaries(filters = {}) {
  const keys = new Set();

  listAllTargets().forEach((target) => {
    if (target.type !== "product" && target.type !== "collection") return;
    if (filters.targetType && target.type !== filters.targetType) return;
    if (filters.targetId && target.id !== filters.targetId) return;
    keys.add(`${target.type}:${target.id}`);
  });

  snapshots.forEach((snapshot) => {
    if (filters.targetType && snapshot.targetType !== filters.targetType) return;
    if (filters.targetId && snapshot.targetId !== filters.targetId) return;
    if (snapshot.targetType !== "product" && snapshot.targetType !== "collection") return;
    keys.add(`${snapshot.targetType}:${snapshot.targetId}`);
  });

  recommendations.forEach((recommendation) => {
    if (filters.targetType && recommendation.targetType !== filters.targetType) return;
    if (filters.targetId && recommendation.targetId !== filters.targetId) return;
    if (recommendation.targetType !== "product" && recommendation.targetType !== "collection") return;
    keys.add(`${recommendation.targetType}:${recommendation.targetId}`);
  });

  return Array.from(keys)
    .map((key) => {
      const [targetType, targetId] = key.split(":");
      return buildTargetSummary({ targetType, targetId });
    })
    .sort((a, b) => {
      const severityA = severityRank[a.maxSeverity || "info"] || 0;
      const severityB = severityRank[b.maxSeverity || "info"] || 0;
      if (severityA !== severityB) return severityB - severityA;
      return (b.activeRecommendationsCount || 0) - (a.activeRecommendationsCount || 0);
    });
}

function createRuleTuningProposal({ ruleId, actor, note, sinceDays }) {
  const stats = listRecommendationRuleStats({ sinceDays });
  const row = stats.items.find((item) => item.ruleId === ruleId) ?? null;
  if (!row) return null;

  const definition = getRuleDefinition(ruleId);
  const currentConfig = definition ? { ...definition.params } : null;
  let suggestedConfig = null;
  let expectedImpact = "n/a";
  if (definition && currentConfig) {
    const strategy = getRuleStrategy(definition);
    if (strategy) {
      const proposalSuggestion = strategy.buildProposalSuggestion(currentConfig, row);
      suggestedConfig = proposalSuggestion?.suggestedConfig ?? currentConfig;
      expectedImpact = proposalSuggestion?.expectedImpact ?? expectedImpact;
    } else {
      suggestedConfig = currentConfig;
      expectedImpact = "Keep current threshold; monitor effect distribution and revisit with more samples.";
    }
  } else {
    expectedImpact = "Rule definition not found in code; proposal only records observed effectiveness stats.";
  }

  const proposal = {
    id: nextId("prop"),
    type: "rule_tuning",
    status: "draft",
    createdAt: nowIso(),
    createdBy: actor,
    ruleId,
    sinceDays: stats.sinceDays,
    currentConfig,
    suggestedConfig,
    expectedImpact,
    applyHowTo: definition
      ? "Apply by updating the signals rules config file for this ruleId, then mark the proposal as applied."
      : "Apply by adding this rule to the signals rules config file, then mark the proposal as applied.",
    quality: row.quality,
    suggestion: row.suggestion,
    improvementRate: row.improvementRate,
    worsenedRate: row.worsenedRate,
    evaluated: row.evaluated,
    lastSeenAt: row.lastSeenAt,
    note: note ?? null,
    approvedAt: null,
    approvedBy: null,
    approvalNote: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionNote: null,
    appliedAt: null,
    appliedBy: null,
    appliedNote: null,
    appliedConfig: null,
  };

  proposals.unshift(proposal);
  persist();

  try {
    createOpsEvent({
      actor,
      action: "rule_tuning_proposal",
      note: `proposal ${proposal.id} for rule ${ruleId}`,
    });
  } catch {
    // non-blocking
  }

  return proposal;
}

function createIncidentFollowupProposal(input = {}) {
  const targetType = input.targetType;
  const targetId = input.targetId;
  const anomalyKind = input.anomalyKind;
  if (!targetType || !targetId || !anomalyKind) return null;

  const existingActive = proposals.find(
    (item) =>
      item.type === "incident_followup" &&
      ["draft", "approved"].includes(item.status) &&
      item.targetType === targetType &&
      item.targetId === targetId &&
      item.anomalyKind === anomalyKind,
  );

  const proposal = {
    id: existingActive?.id ?? nextId("prop"),
    type: "incident_followup",
    status: existingActive?.status ?? "draft",
    createdAt: existingActive?.createdAt ?? nowIso(),
    createdBy: existingActive?.createdBy ?? (input.actor || "ai:proposal"),
    note: input.note ?? null,
    approvedAt: existingActive?.approvedAt ?? null,
    approvedBy: existingActive?.approvedBy ?? null,
    approvalNote: existingActive?.approvalNote ?? null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionNote: null,
    appliedAt: null,
    appliedBy: null,
    appliedNote: null,
    appliedConfig: null,
    targetType,
    targetId,
    anomalyKind,
    severity: input.severity ?? (anomalyKind === "auto_rollback" ? "critical" : "warning"),
    summary: input.summary ?? "Publishing anomaly requires follow-up proposal.",
    expectedImpact:
      input.expectedImpact ??
      "Stabilize publishing quality by reviewing rendering, SEO metadata, and rollback triggers before the next automated publish.",
    applyHowTo:
      input.applyHowTo ??
      "Review the linked draft/recommendation, adjust content or template logic, then republish after verification passes.",
    sourceEventId: input.sourceEventId ?? null,
    sourceDraftId: input.sourceDraftId ?? null,
    sourceContentRef: input.sourceContentRef ?? null,
    sourceRecommendationId: input.sourceRecommendationId ?? null,
    linkedRecommendationId: input.linkedRecommendationId ?? existingActive?.linkedRecommendationId ?? null,
    linkedDraftId: input.linkedDraftId ?? existingActive?.linkedDraftId ?? null,
    occurrences: normalizeNumber(existingActive?.occurrences) + 1,
    lastSeenAt: nowIso(),
    incidents: mergeUniqueList(existingActive?.incidents, input.sourceEventId ?? null, 10),
    context: {
      ...(existingActive?.context && typeof existingActive.context === "object" ? existingActive.context : {}),
      ...(input.context && typeof input.context === "object" ? input.context : {}),
    },
  };

  if (existingActive) {
    const idx = proposals.findIndex((item) => item.id === existingActive.id);
    proposals[idx] = {
      ...existingActive,
      ...proposal,
    };
  } else {
    proposals.unshift(proposal);
  }
  persist();

  try {
    createOpsEvent({
      actor: input.actor || "ai:proposal",
      action: "incident_followup_proposal",
      target: { type: targetType, id: targetId },
      draftId: proposal.linkedDraftId ?? undefined,
      note: `proposal ${proposal.id} created for ${anomalyKind}`,
    });
  } catch {
    // non-blocking
  }

  return proposal;
}

function ensureIncidentRepoChangeForProposal({ proposalId, actor = "ai:proposal" } = {}) {
  if (!proposalId) return { status: "skipped", reason: "missing_proposal_id" };
  const idx = proposals.findIndex((p) => p.id === proposalId);
  if (idx < 0) return { status: "skipped", reason: "proposal_not_found" };
  const proposal = proposals[idx];
  if (!proposal || proposal.type !== "incident_followup") return { status: "skipped", reason: "not_incident_proposal" };
  if (proposal.repoChangeId) return { status: "skipped", reason: "already_has_repo_change", repoChangeId: proposal.repoChangeId };
  if (!proposal.linkedDraftId) return { status: "skipped", reason: "missing_linked_draft" };

  const existingRepo = listRepoChanges({ proposalId: proposal.id })[0] ?? null;
  if (existingRepo) {
    proposals[idx] = { ...proposal, repoChangeId: existingRepo.id };
    persist();
    return { status: "linked", repoChangeId: existingRepo.id };
  }

  const branchName = `ai/${proposal.targetType}/${String(proposal.targetId).replace(/[:/]/g, "-")}`;
  const repoChange = createRepoChange({
    actor,
    kind: "incident_followup",
    proposalId: proposal.id,
    targetType: proposal.targetType,
    targetId: proposal.targetId,
    title: `Fix ${proposal.anomalyKind} for ${proposal.targetType}:${proposal.targetId}`,
    summary: proposal.summary,
    branchName,
    prUrl: null,
    commitSha: null,
    ciStatus: "not_started",
    linkedDraftId: proposal.linkedDraftId ?? null,
    linkedRecommendationId: proposal.linkedRecommendationId ?? null,
    trigger: proposal.anomalyKind,
  });
  proposals[idx] = { ...proposal, repoChangeId: repoChange.id };
  persist();
  return { status: "created", repoChangeId: repoChange.id };
}

function syncIncidentFollowupProposalsForRecommendations({ actor = "ai:proposal", limit = 10, dryRun = false } = {}) {
  const max = Math.min(50, Math.max(1, Number(limit ?? 10)));
  const active = listRecommendations({ statuses: ["open", "in_progress"] })
    .filter((rec) => rec.ruleId === "publish-verification-followup")
    .slice(0, max);

  const createdOrUpdated = [];
  const skipped = [];

  active.forEach((rec) => {
    const verificationLevel = rec?.verificationContext?.verificationLevel ?? rec?.context?.verificationLevel ?? null;
    let anomalyKind = null;

    if (verificationLevel === "blocked") {
      anomalyKind = "blocked_publish";
    } else if (verificationLevel === "warning" && normalizeNumber(rec.occurrences) >= 3) {
      anomalyKind = "warning_threshold";
    }

    if (!anomalyKind) {
      skipped.push({ recommendationId: rec.id, reason: "not_qualified" });
      return;
    }

    const existingActive = proposals.find(
      (item) =>
        item.type === "incident_followup" &&
        ["draft", "approved"].includes(item.status) &&
        item.targetType === rec.targetType &&
        item.targetId === rec.targetId &&
        item.anomalyKind === anomalyKind,
    );

    // 幂等：如果已经存在同一 anomalyKind 且已经绑定到该 recommendation，就不重复触发更新（避免 occurrences 无意义增长）。
    if (existingActive && existingActive.linkedRecommendationId === rec.id) {
      skipped.push({ recommendationId: rec.id, reason: "already_linked", proposalId: existingActive.id });
      return;
    }

    if (dryRun) {
      createdOrUpdated.push({
        dryRun: true,
        targetType: rec.targetType,
        targetId: rec.targetId,
        anomalyKind,
        linkedRecommendationId: rec.id,
      });
      return;
    }

    const proposal = createIncidentFollowupProposal({
      actor,
      targetType: rec.targetType,
      targetId: rec.targetId,
      anomalyKind,
      severity: "critical",
      summary:
        anomalyKind === "warning_threshold"
          ? "Repeated warning-level publish verification issues reached the follow-up threshold. A repair proposal should tighten content or template quality before the next publish."
          : "Publish verification reached blocked level. A repair proposal is required before republishing.",
      sourceRecommendationId: rec.id,
      linkedRecommendationId: rec.id,
      linkedDraftId: rec?.preparedDraft?.draftId ?? null,
      applyHowTo: rec?.preparedDraft?.draftId
        ? "Open the linked prepared draft, fix content or template issues, then republish after verification passes."
        : "Prepare a follow-up draft, fix the issue, then republish after verification passes.",
    });

    if (proposal) {
      const repo = ensureIncidentRepoChangeForProposal({ proposalId: proposal.id, actor });
      createdOrUpdated.push({ proposalId: proposal.id, recommendationId: rec.id, anomalyKind, repo });
    }
  });

  return {
    evaluated: active.length,
    createdOrUpdated,
    skipped,
  };
}

function formatRate(value) {
  return `${Math.round(Number(value || 0) * 10000) / 100}%`;
}

function formatRuleParameterSummary(def, params) {
  if (!def || !params) return "n/a";
  if (def.kind === "low-rate") {
    const label = def.rate === "atc" ? "ATC" : def.rate === "purchase" ? "PURCHASE" : "CTA";
    return `views ≥ ${normalizeNumber(params.minViews)} · ${label.toLowerCase()} < ${formatRate(params.maxRate)}`;
  }
  if (def.kind === "post-click-dropoff") {
    return `views ≥ ${normalizeNumber(params.minViews)} · CTA clicks ≥ ${normalizeNumber(params.minCtaClicks)} · post-click ATC < ${formatRate(params.maxPostClickAtcRate)}`;
  }
  return Object.entries(params)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(" · ");
}

function buildRuleMeta(def) {
  if (!def) return null;
  return {
    ruleId: def.ruleId,
    description: def.description,
    kind: def.kind ?? "unknown",
    rate: def.rate ?? null,
    severity: def.severity ?? "warning",
    targetTypes: Array.isArray(def.targetTypes) ? def.targetTypes : [],
    parameterSummary: formatRuleParameterSummary(def, def.params),
    validation: def.validation ?? { valid: true, warnings: [] },
  };
}

function buildProposalStatusTimeline(proposal) {
  const items = [
    { label: "created", at: proposal.createdAt, by: proposal.createdBy, note: proposal.note ?? null },
    proposal.approvedAt ? { label: "approved", at: proposal.approvedAt, by: proposal.approvedBy, note: proposal.approvalNote ?? null } : null,
    proposal.rejectedAt ? { label: "rejected", at: proposal.rejectedAt, by: proposal.rejectedBy, note: proposal.rejectionNote ?? null } : null,
    proposal.appliedAt ? { label: "applied", at: proposal.appliedAt, by: proposal.appliedBy, note: proposal.appliedNote ?? null } : null,
  ].filter(Boolean);
  return items;
}

function buildIncidentProposalReviewSummary(proposal) {
  const state =
    proposal.status === "rejected"
      ? "closed"
      : proposal.status === "approved"
        ? "observe"
        : proposal.severity === "critical"
          ? "risk"
          : "pending";
  return {
    state,
    headline:
      proposal.status === "rejected"
        ? "Follow-up proposal closed"
        : proposal.anomalyKind === "auto_rollback"
          ? "Automatic rollback indicates a repair proposal is needed"
          : proposal.anomalyKind === "warning_threshold"
            ? "Repeated warnings crossed the rollback threshold"
            : "Blocked publish requires a repair proposal",
    recommendation:
      proposal.linkedDraftId
        ? "Open the linked draft, correct the issue, then republish after verification passes."
        : "Create or prepare a fix draft, then republish after verification passes.",
    signals: [
      `target ${proposal.targetType}:${proposal.targetId}`,
      `severity ${proposal.severity}`,
      proposal.summary,
    ].filter(Boolean),
  };
}

function summarizeCommerceCheckoutFunnelFromEvents(eventsInput) {
  const items = Array.isArray(eventsInput) ? eventsInput : [];
  const starts = items.filter((item) => item.eventType === "checkout_start");
  const completes = items.filter((item) => item.eventType === "checkout_complete");
  const purchases = items.filter((item) => item.eventType === "purchase");
  const uniqueStarts = new Set(starts.map((item) => item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`));
  const uniqueCompletes = new Set(completes.map((item) => item.dedupeKey || `${item.targetType}:${item.targetId}:${item.at}`));
  const checkoutStarts = uniqueStarts.size;
  const checkoutCompletes = uniqueCompletes.size;
  const checkoutDropoff = Math.max(0, checkoutStarts - checkoutCompletes);
  const checkoutCompletionRate = checkoutStarts > 0 ? checkoutCompletes / checkoutStarts : 0;
  const purchaseRateFromCheckout = checkoutStarts > 0 ? purchases.length / checkoutStarts : 0;
  return {
    events: items.length,
    funnel: {
      checkoutStarts,
      checkoutCompletes,
      checkoutDropoff,
      checkoutCompletionRate,
      purchaseRateFromCheckout,
      purchases: purchases.length,
    },
  };
}

function computeCommerceJourneyObservationEffectFromAnchor({ anchorAt, lookbackDays, sourceKey }) {
  const normalizedSource = String(sourceKey || "").trim();
  if (!normalizedSource) return null;
  const effect = computeFunnelObservationEffectFromAnchor({
    anchorAt,
    lookbackDays: Math.max(1, normalizeNumber(lookbackDays || 7)),
    listEvents: ({ sinceAt }) => listTrackedEvents({ sinceAt }),
    eventFilter: (event) => String(event?.metadata?.attribution?.src || event?.source || "").trim() === normalizedSource,
    summarizeWindowEvents: summarizeCommerceCheckoutFunnelFromEvents,
    now: Date.now(),
  });
  const withDelta = attachFunnelRateDeltas(effect, ["checkoutCompletionRate", "purchaseRateFromCheckout"]);
  return withDelta ? { mode: "commerce_checkout_source", ...withDelta } : null;
}

function summarizePaymentIssueWindowFromEvents(eventsInput, issueKey) {
  const items = Array.isArray(eventsInput) ? eventsInput : [];
  const orderKey = (item) => String(item?.metadata?.orderId || item?.dedupeKey || `${item?.targetType || "unknown"}:${item?.targetId || "unknown"}:${item?.at || ""}`);
  const attempts = new Set();
  const paid = new Set();
  const authorized = new Set();
  const failed = new Set();
  const canceled = new Set();
  const requiresAction = new Set();

  items.forEach((item) => {
    const key = orderKey(item);
    attempts.add(key);
    if (item?.eventType === "payment_paid") paid.add(key);
    else if (item?.eventType === "payment_authorized") authorized.add(key);
    else if (item?.eventType === "payment_failed") failed.add(key);
    else if (item?.eventType === "payment_canceled") canceled.add(key);
    else if (item?.eventType === "payment_requires_action") requiresAction.add(key);
  });

  const issueMap = {
    payment_failed: failed,
    payment_canceled: canceled,
    payment_requires_action: requiresAction,
  };
  const targetIssues = issueMap[issueKey] ?? new Set();
  const paymentAttempts = attempts.size;
  const paidCount = paid.size;
  const failedCount = failed.size;
  const canceledCount = canceled.size;
  const requiresActionCount = requiresAction.size;
  const targetedIssueCount = targetIssues.size;
  const targetedIssueRate = paymentAttempts > 0 ? targetedIssueCount / paymentAttempts : 0;
  const paidRate = paymentAttempts > 0 ? paidCount / paymentAttempts : 0;

  return {
    events: items.length,
    funnel: {
      paymentAttempts,
      paidCount,
      authorizedCount: authorized.size,
      failedCount,
      canceledCount,
      requiresActionCount,
      targetedIssueCount,
      targetedIssueRate,
      paidRate,
    },
  };
}

function computePaymentIssueObservationEffectFromAnchor({ anchorAt, lookbackDays, issueKey }) {
  const normalizedIssue = String(issueKey || "").trim();
  if (!normalizedIssue) return null;
  const effect = computeFunnelObservationEffectFromAnchor({
    anchorAt,
    lookbackDays: Math.max(1, normalizeNumber(lookbackDays || 7)),
    listEvents: ({ sinceAt }) => listTrackedEvents({ sinceAt }),
    eventFilter: (event) =>
      [
        "payment_paid",
        "payment_authorized",
        "payment_failed",
        "payment_canceled",
        "payment_requires_action",
      ].includes(String(event?.eventType || "")),
    summarizeWindowEvents: (windowEvents) => summarizePaymentIssueWindowFromEvents(windowEvents, normalizedIssue),
    now: Date.now(),
  });
  const withDelta = attachFunnelRateDeltas(effect, ["targetedIssueRate", "paidRate"]);
  return withDelta ? { mode: "payment_issue_window", issueKey: normalizedIssue, ...withDelta } : null;
}

function summarizeFulfillmentBacklogWindowFromEvents(eventsInput) {
  const items = Array.isArray(eventsInput) ? eventsInput : [];
  const orderKey = (item) => String(item?.metadata?.orderId || item?.dedupeKey || `${item?.targetType || "unknown"}:${item?.targetId || "unknown"}:${item?.at || ""}`);
  const processing = new Set();
  const shipped = new Set();
  const delivered = new Set();

  items.forEach((item) => {
    const key = orderKey(item);
    if (item?.eventType === "fulfillment_processing") processing.add(key);
    else if (item?.eventType === "fulfillment_shipped") shipped.add(key);
    else if (item?.eventType === "fulfillment_delivered") delivered.add(key);
  });

  const total = processing.size + shipped.size + delivered.size;
  const processingBacklogRate = total > 0 ? processing.size / total : 0;
  const shippedRate = total > 0 ? shipped.size / total : 0;
  const deliveredRate = total > 0 ? delivered.size / total : 0;

  return {
    events: items.length,
    funnel: {
      fulfillmentProcessing: processing.size,
      fulfillmentShipped: shipped.size,
      fulfillmentDelivered: delivered.size,
      totalTracked: total,
      processingBacklogRate,
      shippedRate,
      deliveredRate,
    },
  };
}

function computeFulfillmentBacklogObservationEffectFromAnchor({ anchorAt, lookbackDays }) {
  const effect = computeFunnelObservationEffectFromAnchor({
    anchorAt,
    lookbackDays: Math.max(1, normalizeNumber(lookbackDays || 7)),
    listEvents: ({ sinceAt }) => listTrackedEvents({ sinceAt }),
    eventFilter: (event) =>
      ["fulfillment_processing", "fulfillment_shipped", "fulfillment_delivered"].includes(String(event?.eventType || "")),
    summarizeWindowEvents: summarizeFulfillmentBacklogWindowFromEvents,
    now: Date.now(),
  });
  const withDelta = attachFunnelRateDeltas(effect, ["processingBacklogRate", "shippedRate", "deliveredRate"]);
  return withDelta ? { mode: "fulfillment_backlog_window", ...withDelta } : null;
}

function buildProposalReviewSummary(proposal, appliedConfigCheck, postApplyEffect, followupExecution = null) {
  if (proposal?.context?.source === "ai-concierge-followup") {
    const signals = [];
    if (proposal?.context?.parentProposalId) signals.push(`parent proposal ${proposal.context.parentProposalId}`);
    if (Array.isArray(proposal?.context?.reviewSignals)) {
      signals.push(...proposal.context.reviewSignals.slice(0, 4));
    }
    if (followupExecution?.prUrl) signals.push(`follow-up PR ${followupExecution.prUrl}`);
    if (followupExecution?.ciStatus) signals.push(`CI ${followupExecution.ciStatus}`);
    if (followupExecution?.recommendedNextStep?.label) {
      signals.push(`next step ${followupExecution.recommendedNextStep.label}`);
    }
    if (followupExecution?.mergedAt) {
      signals.push(`merged at ${followupExecution.mergedAt}`);
    }

    if (!followupExecution) {
      return {
        state: proposal?.status === "rejected" ? "closed" : "pending",
        headline: proposal?.status === "rejected" ? "Follow-up proposal closed" : "Follow-up proposal is ready to start execution",
        recommendation:
          proposal?.status === "rejected"
            ? "Re-open a follow-up path only if the risky rollout is still unresolved."
            : "Create or sync the conservative follow-up repo change, then open a draft PR for manual review.",
        signals,
      };
    }

    if (followupExecution.state === "repo_ci_failed") {
      return {
        state: "risk",
        headline: "Follow-up execution is blocked by CI",
        recommendation: "Fix CI failures before asking reviewers to inspect this risk follow-up.",
        signals,
      };
    }
    if (followupExecution.state === "repo_merged") {
      if (postApplyEffect?.mode === "ai_concierge_followup_observation") {
        const pre = postApplyEffect.pre?.funnel ?? {};
        const post = postApplyEffect.post?.funnel ?? {};
        const delta = postApplyEffect.delta ?? {};
        signals.push(`Entry CTR: pre ${formatRate(pre.entryCtr)} · post ${formatRate(post.entryCtr)} · delta ${formatRate(delta.entryCtr)}`);
        signals.push(`Result CTR: pre ${formatRate(pre.resultCtr)} · post ${formatRate(post.resultCtr)} · delta ${formatRate(delta.resultCtr)}`);
        signals.push(`ATC/view: pre ${formatRate(pre.atcRate)} · post ${formatRate(post.atcRate)} · delta ${formatRate(delta.atcRate)}`);
        signals.push(
          `Purchase/view: pre ${formatRate(pre.purchaseRateFromView)} · post ${formatRate(post.purchaseRateFromView)} · delta ${formatRate(delta.purchaseRateFromView)}`,
        );
        const observationJudgement = judgeRateDeltaWindow({
          effect: postApplyEffect,
          minSampleSize: 50,
          sampleField: "attributedProductViews",
          positiveThresholds: { purchaseRateFromView: 0.002, atcRate: 0.01 },
          negativeThresholds: { purchaseRateFromView: 0.002, atcRate: 0.01 },
        });
        if (observationJudgement?.disposition === "observe" && observationJudgement?.reason === "window_running") {
          return {
            state: "observe",
            headline: "Follow-up change has shipped; observation window is running",
            recommendation: "Wait for the observation window to complete before judging whether the conservative fix stabilized AI concierge conversion.",
            signals,
          };
        }
        if (observationJudgement?.disposition === "observe" && observationJudgement?.reason === "low_volume") {
          return {
            state: "observe",
            headline: "Follow-up merged, but post-fix volume is still low",
            recommendation: "Keep monitoring until AI concierge follow-up traffic is large enough to judge the correction.",
            signals,
          };
        }
        if (observationJudgement?.disposition === "success") {
          return {
            state: "success",
            headline: "Follow-up change appears to have stabilized AI concierge conversion",
            recommendation: "Keep the conservative correction and use it as the safer fallback path for future AI concierge tuning.",
            signals,
          };
        }
        if (observationJudgement?.disposition === "risk") {
          return {
            state: "risk",
            headline: "Follow-up change still looks risky after the observation window",
            recommendation: "Escalate for deeper investigation; a conservative correction alone did not recover the funnel.",
            signals,
          };
        }
        return {
          state: "steady",
          headline: "Follow-up change is stable but not clearly improved",
          recommendation: "Keep monitoring and decide whether another targeted tuning round is worth the extra complexity.",
          signals,
        };
      }
      return {
        state: "observe",
        headline: "Follow-up change has shipped; observe the next funnel window",
        recommendation: "Keep monitoring AI concierge conversion to verify that the conservative correction actually stabilized the funnel.",
        signals,
      };
    }
    if (followupExecution.state === "repo_review") {
      return {
        state: "steady",
        headline: "Follow-up PR is in manual review",
        recommendation: "Collect reviewer feedback and only ship after the risk rationale has been checked.",
        signals,
      };
    }
    if (followupExecution.state === "repo_ci_running") {
      return {
        state: "observe",
        headline: "Follow-up PR is waiting for CI before manual review",
        recommendation: "Wait for CI to finish, then keep the PR in draft until someone reviews the risk correction.",
        signals,
      };
    }
    if (followupExecution.state === "repo_draft") {
      return {
        state: "pending",
        headline: "Follow-up PR is open and waiting for manual review",
        recommendation: "Keep the PR in draft, verify the conservative config, and move to review only after the risk mitigation looks safe.",
        signals,
      };
    }
    return {
      state: "pending",
      headline: followupExecution.headline || "Follow-up execution is being prepared",
      recommendation: followupExecution.detail || "Continue the conservative follow-up execution path.",
      signals,
    };
  }

  if (!proposal?.appliedAt) {
    return {
      state: proposal?.status === "rejected" ? "closed" : "pending",
      headline: proposal?.status === "rejected" ? "Proposal closed without application" : "Awaiting application and post-apply review",
      recommendation:
        proposal?.status === "approved"
          ? "Apply the config change and record appliedConfig to start post-apply review."
          : "Complete approval and application before reviewing outcomes.",
      signals: [],
    };
  }

  const signals = [];
  let positive = 0;
  let negative = 0;

  if (appliedConfigCheck?.status === "match") {
    signals.push("Applied config matches current rules config.");
    positive += 1;
  } else if (appliedConfigCheck?.status === "mismatch") {
    signals.push("Applied config does not match current rules config.");
    negative += 2;
  } else if (appliedConfigCheck?.status === "missing") {
    signals.push("Applied config record is missing.");
    negative += 2;
  } else if (appliedConfigCheck?.status === "unknown") {
    signals.push("Rule definition is unavailable, so config alignment cannot be verified.");
    negative += 1;
  }

  if (!postApplyEffect) {
    signals.push("No post-apply data yet.");
    return {
      state: negative >= 2 ? "risk" : "pending",
      headline: negative >= 2 ? "Applied, but configuration follow-through needs attention" : "Applied, waiting for post-apply evidence",
      recommendation:
        negative >= 2
          ? "Fix config alignment first, then continue observing post-apply metrics."
          : "Wait for more post-apply observations before drawing a conclusion.",
      signals,
    };
  }

  if (postApplyEffect?.mode === "ai_concierge_funnel") {
    if (!postApplyEffect.coverage.postWindowComplete) {
      signals.push(`Post-apply window is still partial (${postApplyEffect.coverage.postObservedDays}d observed).`);
    } else {
      signals.push("Post-apply window is complete.");
    }

    const pre = postApplyEffect.pre?.funnel ?? {};
    const post = postApplyEffect.post?.funnel ?? {};
    const delta = postApplyEffect.delta ?? {};

    const preViews = normalizeNumber(pre.attributedProductViews);
    const postViews = normalizeNumber(post.attributedProductViews);
    const preEntryViews = normalizeNumber(pre.entryViews);
    const postEntryViews = normalizeNumber(post.entryViews);
    signals.push(`Entry CTR: pre ${formatRate(pre.entryCtr)} · post ${formatRate(post.entryCtr)} · delta ${formatRate(delta.entryCtr)}`);
    signals.push(`Result CTR: pre ${formatRate(pre.resultCtr)} · post ${formatRate(post.resultCtr)} · delta ${formatRate(delta.resultCtr)}`);
    signals.push(
      `ATC/view: pre ${formatRate(pre.atcRate)} · post ${formatRate(post.atcRate)} · delta ${formatRate(delta.atcRate)} (views pre ${preViews} · post ${postViews})`,
    );
    signals.push(
      `Purchase/view: pre ${formatRate(pre.purchaseRateFromView)} · post ${formatRate(post.purchaseRateFromView)} · delta ${formatRate(delta.purchaseRateFromView)}`,
    );

    // Heuristic conclusion (volume gated).
    if (preEntryViews + postEntryViews < 50 && preViews + postViews < 50) {
      return {
        state: "observe",
        headline: "Applied, but AI concierge post-apply volume is still low",
        recommendation: "Wait for more AI concierge traffic before drawing a conclusion. Keep monitoring funnel rates and bucket splits.",
        signals,
      };
    }

    const purchaseDelta = Number(delta.purchaseRateFromView ?? 0);
    const atcDelta = Number(delta.atcRate ?? 0);
    positive += purchaseDelta > 0.002 ? 2 : purchaseDelta > 0 ? 1 : 0;
    negative += purchaseDelta < -0.002 ? 2 : purchaseDelta < 0 ? 1 : 0;
    positive += atcDelta > 0.01 ? 1 : 0;
    negative += atcDelta < -0.01 ? 1 : 0;

    if (negative >= 2 && positive === 0) {
      return {
        state: "risk",
        headline: "AI concierge conversion appears worse after applying this strategy",
        recommendation: "Review checkout handoff and ranking/CTA changes; consider reverting the most aggressive adjustments.",
        signals,
      };
    }
    if (positive >= 2 && negative === 0 && postApplyEffect.coverage.postWindowComplete) {
      return {
        state: "success",
        headline: "AI concierge conversion improved after applying this strategy",
        recommendation: "Keep the strategy and use this proposal as a template for future funnel tuning.",
        signals,
      };
    }
    return {
      state: postApplyEffect.coverage.postWindowComplete ? "steady" : "observe",
      headline: postApplyEffect.coverage.postWindowComplete ? "AI concierge tuning is directionally healthy" : "Early AI concierge signals are mixed",
      recommendation: postApplyEffect.coverage.postWindowComplete
        ? "Keep monitoring for at least one more window to confirm stability across buckets."
        : "Wait for more post-apply data before finalizing the conclusion.",
      signals,
    };
  }

  if (!postApplyEffect.coverage.postWindowComplete) {
    signals.push(`Post-apply window is still partial (${postApplyEffect.coverage.postObservedDays}d observed).`);
  } else {
    signals.push("Post-apply window is complete.");
  }

  const effectDelta = Number(postApplyEffect.delta?.improvementRate ?? 0);
  if (effectDelta >= 0.05) {
    signals.push(`Effectiveness improved by ${Math.round(effectDelta * 10000) / 100} pts.`);
    positive += 2;
  } else if (effectDelta <= -0.05) {
    signals.push(`Effectiveness worsened by ${Math.round(Math.abs(effectDelta) * 10000) / 100} pts.`);
    negative += 2;
  } else {
    signals.push("Effectiveness is roughly flat so far.");
  }

  const purchaseDelta = Number(postApplyEffect.delta?.purchaseRate ?? 0);
  if (purchaseDelta >= 0.001) {
    signals.push(`Purchase rate improved by ${Math.round(purchaseDelta * 10000) / 100} pts after apply.`);
    positive += 1;
  } else if (purchaseDelta <= -0.001) {
    signals.push(`Purchase rate worsened by ${Math.round(Math.abs(purchaseDelta) * 10000) / 100} pts after apply.`);
    negative += 1;
  } else {
    signals.push("Purchase rate is roughly flat so far.");
  }

  const triggerDelta = Number(postApplyEffect.triggerDelta?.triggerRate ?? 0);
  if (triggerDelta <= -0.05) {
    signals.push(`Trigger rate dropped by ${Math.round(Math.abs(triggerDelta) * 10000) / 100} pts, suggesting reduced noise.`);
    positive += 1;
  } else if (triggerDelta >= 0.05) {
    signals.push(`Trigger rate increased by ${Math.round(triggerDelta * 10000) / 100} pts, suggesting more noise or broader coverage.`);
    negative += 1;
  } else {
    signals.push("Trigger rate change is modest.");
  }

  let state = "observe";
  let headline = "Review in progress";
  let recommendation = "Keep observing until the post-apply window is complete.";

  if (negative >= 2 && positive === 0) {
    state = "risk";
    headline = "This tuning likely needs correction or rollback review";
    recommendation = "Check config alignment and consider reverting or loosening thresholds if the negative trend persists.";
  } else if (positive >= 2 && negative === 0 && postApplyEffect.coverage.postWindowComplete) {
    state = "success";
    headline = "This tuning looks successful";
    recommendation = "Keep the current config and use this proposal as a reference for similar rules.";
  } else if (positive >= 1 && negative <= 1) {
    state = postApplyEffect.coverage.postWindowComplete ? "steady" : "observe";
    headline = postApplyEffect.coverage.postWindowComplete ? "This tuning is directionally healthy" : "Early signals are encouraging";
    recommendation = postApplyEffect.coverage.postWindowComplete
      ? "Keep the config and continue periodic monitoring."
      : "Wait for a fuller post-apply window before finalizing the conclusion.";
  }

  return {
    state,
    headline,
    recommendation,
    signals,
  };
}

function summarizeGenericConfig(input) {
  if (!input || typeof input !== "object") return "n/a";
  try {
    return JSON.stringify(input);
  } catch {
    return "n/a";
  }
}

function buildFollowupExecutionSummary(proposal) {
  if (!proposal || proposal.type !== "rule_tuning") return null;
  if (proposal.context?.source !== "ai-concierge-followup") return null;
  const repoChange =
    (proposal.repoChangeId ? listRepoChanges({ proposalId: proposal.id })[0] : null) ||
    listRepoChanges({ proposalId: proposal.id })[0] ||
    null;
  if (!repoChange) {
    return {
      state: "pending_repo_change",
      headline: "Follow-up proposal exists but repo execution has not started",
      detail: "No repo change candidate is linked yet.",
      repoChangeId: proposal.repoChangeId ?? null,
      prUrl: null,
      prIsDraft: null,
      ciStatus: null,
      prLabels: [],
      recommendedNextStep: null,
      autoMergeAllowed: false,
      autoMergeReasons: ["repo change missing"],
    };
  }

  const nextStep = repoChange.recommendedNextStep ?? null;
  const prLabels = Array.isArray(repoChange.prLabels) ? repoChange.prLabels : [];
  const autoMergeAllowed = Boolean(repoChange.autoActionGate?.autoMerge?.allowed);
  const autoMergeReasons = Array.isArray(repoChange.autoActionGate?.autoMerge?.reasons)
    ? repoChange.autoActionGate.autoMerge.reasons
    : [];
  const mergedAt = repoChange.mergedAt ?? null;
  const observationDays = Math.max(1, normalizeNumber(proposal.sinceDays || 7));
  const mergedAtTs = Date.parse(String(mergedAt || ""));
  const plannedObservationEnd =
    Number.isFinite(mergedAtTs) ? new Date(mergedAtTs + observationDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const observationObservedDays =
    Number.isFinite(mergedAtTs) ? Math.round((Math.max(0, Date.now() - mergedAtTs) / (24 * 60 * 60 * 1000)) * 10) / 10 : 0;
  const observationComplete = Boolean(plannedObservationEnd && Date.now() >= Date.parse(plannedObservationEnd));

  let state = "repo_draft";
  let headline = "Follow-up PR is waiting in draft";
  let detail = "Manual review is required before this conservative risk follow-up can move forward.";
  if (repoChange.status === "merged") {
    state = "repo_merged";
    headline = "Follow-up PR has been merged";
    detail = "The conservative follow-up has shipped. Continue monitoring the next funnel window.";
  } else if (repoChange.status === "ci_running") {
    state = "repo_ci_running";
    headline = "Follow-up PR is waiting for CI";
    detail = "Keep the PR in draft until CI completes and manual review can begin.";
  } else if (repoChange.ciStatus === "failure") {
    state = "repo_ci_failed";
    headline = "Follow-up PR hit CI issues";
    detail = "Fix CI before asking for manual review.";
  } else if (repoChange.prUrl && repoChange.prIsDraft === false) {
    state = "repo_review";
    headline = "Follow-up PR is open for review";
    detail = "The follow-up PR left draft state and is waiting for manual reviewer attention.";
  } else if (!repoChange.prUrl) {
    state = "repo_pending_pr";
    headline = "Follow-up repo change exists but draft PR is not open yet";
    detail = "Open or sync the draft PR to continue manual review.";
  }

  return {
    state,
    headline,
    detail,
    repoChangeId: repoChange.id ?? null,
    prUrl: repoChange.prUrl ?? null,
    prIsDraft: typeof repoChange.prIsDraft === "boolean" ? repoChange.prIsDraft : null,
    ciStatus: repoChange.ciStatus ?? null,
    prLabels,
    recommendedNextStep: nextStep,
    autoMergeAllowed,
    autoMergeReasons,
    mergedAt,
    observationStartAt: mergedAt,
    plannedObservationEnd,
    observationObservedDays,
    observationComplete,
  };
}

function enrichRuleTuningProposal(proposal) {
  const customAiMeta =
    proposal.ruleId === "ai-concierge-strategy"
      ? {
          ruleId: "ai-concierge-strategy",
          description: "AI concierge strategy tuning proposal",
          kind: "strategy",
          rate: "funnel",
          severity: "warning",
          targetTypes: ["collection"],
          validation: { warnings: [] },
        }
      : null;
  const def = getRuleDefinition(proposal.ruleId) || customAiMeta;
  const currentConfig = proposal.currentConfig ?? null;
  const suggestedConfig = proposal.suggestedConfig ?? null;
  const appliedConfig = proposal.appliedConfig ?? null;
  const appliedConfigCheck = computeAppliedConfigCheck(proposal);
  const followupExecution = buildFollowupExecutionSummary(proposal);
  const followupObservationEffect =
    proposal.context?.source === "ai-concierge-followup" && followupExecution?.mergedAt
      ? computeAiConciergeObservationEffectFromAnchor({
          anchorAt: followupExecution.mergedAt,
          lookbackDays: proposal.sinceDays || 7,
        })
      : null;
  const postApplyEffect =
    computeProposalPostApplyEffect(proposal) ??
    (followupObservationEffect ? { mode: "ai_concierge_followup_observation", ...followupObservationEffect } : null);
  return {
    ...proposal,
    ruleMeta: buildRuleMeta(def),
    currentConfigSummary:
      def && !customAiMeta && currentConfig
        ? formatRuleParameterSummary(def, normalizeRuleConfig(def, currentConfig))
        : summarizeGenericConfig(currentConfig),
    suggestedConfigSummary:
      def && !customAiMeta && suggestedConfig
        ? formatRuleParameterSummary(def, normalizeRuleConfig(def, suggestedConfig))
        : summarizeGenericConfig(suggestedConfig),
    appliedConfigSummary:
      def && !customAiMeta && appliedConfig
        ? formatRuleParameterSummary(def, normalizeRuleConfig(def, appliedConfig))
        : appliedConfig
          ? summarizeGenericConfig(appliedConfig)
          : null,
    followupExecution,
    statusTimeline: buildProposalStatusTimeline(proposal),
    appliedConfigCheck,
    postApplyEffect,
    reviewSummary: buildProposalReviewSummary(proposal, appliedConfigCheck, postApplyEffect, followupExecution),
  };
}

function buildCommerceJourneyProposalReviewSummary(proposal, postApplyEffect) {
  const sourceKey = proposal?.targetId ?? "unknown";
  const signals = [
    `target ${proposal?.targetType}:${proposal?.targetId}`,
    `severity ${proposal?.severity ?? "warning"}`,
    proposal?.summary,
  ].filter(Boolean);

  if (!postApplyEffect) {
    return {
      state:
        proposal?.status === "rejected"
          ? "closed"
          : proposal?.status === "applied"
            ? "observe"
            : proposal?.status === "approved"
              ? "observe"
              : "pending",
      headline:
        proposal?.status === "rejected"
          ? "Journey follow-up proposal closed"
          : proposal?.status === "applied"
            ? "Journey fix has been marked applied, waiting for observation window"
            : "Checkout journey dropoff needs a focused follow-up",
      recommendation:
        proposal?.status === "applied"
          ? "Wait for the post-apply window to gather enough checkout data before judging the result."
          : "Approve and apply the journey fix, then compare the next checkout window against the previous one.",
      signals,
    };
  }

  const preRate = Number(postApplyEffect?.pre?.funnel?.checkoutCompletionRate ?? 0);
  const postRate = Number(postApplyEffect?.post?.funnel?.checkoutCompletionRate ?? 0);
  const delta = Number(postApplyEffect?.delta?.checkoutCompletionRate ?? 0);
  const preStarts = Number(postApplyEffect?.pre?.funnel?.checkoutStarts ?? 0);
  const postStarts = Number(postApplyEffect?.post?.funnel?.checkoutStarts ?? 0);
  const postComplete = Boolean(postApplyEffect?.coverage?.postWindowComplete);

  signals.push(
    `checkout completion pre ${(preRate * 100).toFixed(1)}% → post ${(postRate * 100).toFixed(1)}%`,
    `checkout starts pre ${preStarts} → post ${postStarts}`,
    `observation ${postComplete ? "complete" : `running (${postApplyEffect?.coverage?.postObservedDays ?? 0}d observed)`}`,
  );

  if (delta >= 0.05 && postRate >= 0.4) {
    return {
      state: postComplete ? "success" : "steady",
      headline: postComplete ? `Checkout completion recovered for ${sourceKey}` : `Early recovery signals look positive for ${sourceKey}`,
      recommendation: postComplete
        ? "Keep the journey changes and use this source as a reference for other weak checkout paths."
        : "Keep observing until the post-apply window completes before locking the conclusion.",
      signals,
    };
  }
  if (delta <= -0.03 && postStarts >= 3) {
    return {
      state: "risk",
      headline: `Checkout completion is still weak for ${sourceKey}`,
      recommendation: "Re-check source handoff, product-match, and trust cues before scaling more traffic into this path.",
      signals,
    };
  }
  return {
    state: postComplete ? "steady" : "observe",
    headline: postComplete ? `Checkout completion is mixed but stable for ${sourceKey}` : `Observation is still running for ${sourceKey}`,
    recommendation: postComplete
      ? "Keep monitoring and compare this source against a healthier source before the next round of changes."
      : "Wait for a fuller post-apply window before deciding whether another follow-up is needed.",
    signals,
  };
}

function buildPaymentIssueProposalReviewSummary(proposal, postApplyEffect) {
  const issueKey = proposal?.context?.issueKey ?? proposal?.targetId ?? "payment_issue";
  const labelMap = {
    payment_failed: "payment failed",
    payment_canceled: "payment canceled",
    payment_requires_action: "payment requires action",
  };
  const issueLabel = labelMap[issueKey] ?? issueKey;
  const signals = [
    `target ${proposal?.targetType}:${proposal?.targetId}`,
    `severity ${proposal?.severity ?? "warning"}`,
    proposal?.summary,
  ].filter(Boolean);

  if (!postApplyEffect) {
    return {
      state:
        proposal?.status === "rejected"
          ? "closed"
          : proposal?.status === "applied"
            ? "observe"
            : proposal?.status === "approved"
              ? "observe"
              : "pending",
      headline:
        proposal?.status === "rejected"
          ? "Payment follow-up proposal closed"
          : proposal?.status === "applied"
            ? "Payment recovery fix has been marked applied, waiting for observation window"
            : `${issueLabel} needs a focused recovery proposal`,
      recommendation:
        proposal?.status === "applied"
          ? "Wait for the post-apply payment window to gather enough result signals before judging the recovery."
          : "Approve and apply the payment recovery fix, then compare the next payment result window against the previous one.",
      signals,
    };
  }

  const preRate = Number(postApplyEffect?.pre?.funnel?.targetedIssueRate ?? 0);
  const postRate = Number(postApplyEffect?.post?.funnel?.targetedIssueRate ?? 0);
  const paidPre = Number(postApplyEffect?.pre?.funnel?.paidRate ?? 0);
  const paidPost = Number(postApplyEffect?.post?.funnel?.paidRate ?? 0);
  const delta = Number(postApplyEffect?.delta?.targetedIssueRate ?? 0);
  const preAttempts = Number(postApplyEffect?.pre?.funnel?.paymentAttempts ?? 0);
  const postAttempts = Number(postApplyEffect?.post?.funnel?.paymentAttempts ?? 0);
  const postComplete = Boolean(postApplyEffect?.coverage?.postWindowComplete);

  signals.push(
    `${issueLabel} rate pre ${(preRate * 100).toFixed(1)}% → post ${(postRate * 100).toFixed(1)}%`,
    `paid rate pre ${(paidPre * 100).toFixed(1)}% → post ${(paidPost * 100).toFixed(1)}%`,
    `payment attempts pre ${preAttempts} → post ${postAttempts}`,
    `observation ${postComplete ? "complete" : `running (${postApplyEffect?.coverage?.postObservedDays ?? 0}d observed)`}`,
  );

  if (preAttempts + postAttempts < 4) {
    return {
      state: "observe",
      headline: `Payment observation is still low-volume for ${issueLabel}`,
      recommendation: "Wait for more payment attempts before deciding whether the recovery actually changed the outcome mix.",
      signals,
    };
  }

  if (delta <= -0.08 && paidPost >= paidPre) {
    return {
      state: postComplete ? "success" : "steady",
      headline: postComplete ? `${issueLabel} improved after the payment recovery change` : `Early payment recovery signals look positive for ${issueLabel}`,
      recommendation: postComplete
        ? "Keep the payment recovery change and use it as a template for similar payment-stage issues."
        : "Keep observing until the post-apply payment window completes before locking the conclusion.",
      signals,
    };
  }
  if (delta >= 0.03 && postAttempts >= 2) {
    return {
      state: "risk",
      headline: `${issueLabel} is still elevated after the payment recovery change`,
      recommendation: "Re-check provider behavior, action-required messaging, and retry recovery before routing more users into the same payment path.",
      signals,
    };
  }
  return {
    state: postComplete ? "steady" : "observe",
    headline: postComplete ? `Payment recovery is mixed but stable for ${issueLabel}` : `Payment observation is still running for ${issueLabel}`,
    recommendation: postComplete
      ? "Keep monitoring the next payment window and compare the issue mix before starting another recovery round."
      : "Wait for a fuller payment observation window before deciding whether another follow-up is needed.",
    signals,
  };
}

function buildFulfillmentBacklogProposalReviewSummary(proposal, postApplyEffect) {
  const stageKey = proposal?.context?.stageKey ?? proposal?.targetId ?? "fulfillment_processing";
  const stageLabel = stageKey === "fulfillment_processing" ? "fulfillment processing backlog" : stageKey;
  const signals = [
    `target ${proposal?.targetType}:${proposal?.targetId}`,
    `severity ${proposal?.severity ?? "warning"}`,
    proposal?.summary,
  ].filter(Boolean);

  if (!postApplyEffect) {
    return {
      state:
        proposal?.status === "rejected"
          ? "closed"
          : proposal?.status === "applied"
            ? "observe"
            : proposal?.status === "approved"
              ? "observe"
              : "pending",
      headline:
        proposal?.status === "rejected"
          ? "Fulfillment follow-up proposal closed"
          : proposal?.status === "applied"
            ? "Fulfillment backlog fix has been marked applied, waiting for observation window"
            : `${stageLabel} needs a focused ops proposal`,
      recommendation:
        proposal?.status === "applied"
          ? "Wait for the post-apply fulfillment window to gather enough shipped or delivered evidence before judging the recovery."
          : "Approve and apply the fulfillment recovery fix, then compare the next fulfillment window against the previous one.",
      signals,
    };
  }

  const preBacklog = Number(postApplyEffect?.pre?.funnel?.processingBacklogRate ?? 0);
  const postBacklog = Number(postApplyEffect?.post?.funnel?.processingBacklogRate ?? 0);
  const backlogDelta = Number(postApplyEffect?.delta?.processingBacklogRate ?? 0);
  const preShipped = Number(postApplyEffect?.pre?.funnel?.shippedRate ?? 0);
  const postShipped = Number(postApplyEffect?.post?.funnel?.shippedRate ?? 0);
  const preDelivered = Number(postApplyEffect?.pre?.funnel?.deliveredRate ?? 0);
  const postDelivered = Number(postApplyEffect?.post?.funnel?.deliveredRate ?? 0);
  const preTotal = Number(postApplyEffect?.pre?.funnel?.totalTracked ?? 0);
  const postTotal = Number(postApplyEffect?.post?.funnel?.totalTracked ?? 0);
  const postComplete = Boolean(postApplyEffect?.coverage?.postWindowComplete);

  signals.push(
    `backlog rate pre ${(preBacklog * 100).toFixed(1)}% → post ${(postBacklog * 100).toFixed(1)}%`,
    `shipped rate pre ${(preShipped * 100).toFixed(1)}% → post ${(postShipped * 100).toFixed(1)}%`,
    `delivered rate pre ${(preDelivered * 100).toFixed(1)}% → post ${(postDelivered * 100).toFixed(1)}%`,
    `tracked fulfillment events pre ${preTotal} → post ${postTotal}`,
    `observation ${postComplete ? "complete" : `running (${postApplyEffect?.coverage?.postObservedDays ?? 0}d observed)`}`,
  );

  if (preTotal + postTotal < 4) {
    return {
      state: "observe",
      headline: `Fulfillment observation is still low-volume for ${stageLabel}`,
      recommendation: "Wait for more fulfillment events before deciding whether the recovery actually reduced the backlog.",
      signals,
    };
  }

  if (backlogDelta <= -0.2 && (postShipped > preShipped || postDelivered > preDelivered)) {
    return {
      state: postComplete ? "success" : "steady",
      headline: postComplete ? `${stageLabel} improved after the ops change` : `Early fulfillment recovery signals look positive for ${stageLabel}`,
      recommendation: postComplete
        ? "Keep the fulfillment change and use it as a template for other stalled fulfillment paths."
        : "Keep observing until the post-apply fulfillment window completes before locking the conclusion.",
      signals,
    };
  }
  if ((backlogDelta >= 0.05 || postBacklog >= 0.6) && postTotal >= 2) {
    return {
      state: "risk",
      headline: `${stageLabel} is still elevated after the ops change`,
      recommendation: "Re-check warehouse handoff, shipment creation, and post-payment ops routing before more orders enter the same processing queue.",
      signals,
    };
  }
  return {
    state: postComplete ? "steady" : "observe",
    headline: postComplete ? `Fulfillment recovery is mixed but stable for ${stageLabel}` : `Fulfillment observation is still running for ${stageLabel}`,
    recommendation: postComplete
      ? "Keep monitoring the next fulfillment window and compare the queue mix before another recovery round."
      : "Wait for a fuller fulfillment observation window before deciding whether another follow-up is needed.",
    signals,
  };
}

function enrichIncidentFollowupProposal(proposal) {
  const postApplyEffect =
    proposal?.anomalyKind === "checkout_completion_dropoff" &&
    proposal?.targetType === "journey" &&
    proposal?.status === "applied" &&
    proposal?.appliedAt
      ? computeCommerceJourneyObservationEffectFromAnchor({
          anchorAt: proposal.appliedAt,
          lookbackDays: proposal?.context?.lookbackDays || 7,
          sourceKey: proposal?.targetId,
        })
      : proposal?.anomalyKind === "payment_result_issue" &&
          proposal?.targetType === "journey" &&
          proposal?.status === "applied" &&
          proposal?.appliedAt
        ? computePaymentIssueObservationEffectFromAnchor({
            anchorAt: proposal.appliedAt,
            lookbackDays: proposal?.context?.lookbackDays || 7,
            issueKey: proposal?.context?.issueKey ?? proposal?.targetId,
          })
      : proposal?.anomalyKind === "fulfillment_backlog" &&
          proposal?.targetType === "journey" &&
          proposal?.status === "applied" &&
          proposal?.appliedAt
        ? computeFulfillmentBacklogObservationEffectFromAnchor({
            anchorAt: proposal.appliedAt,
            lookbackDays: proposal?.context?.lookbackDays || 7,
          })
      : null;
  const reviewSummary =
    proposal?.anomalyKind === "checkout_completion_dropoff" && proposal?.targetType === "journey"
      ? buildCommerceJourneyProposalReviewSummary(proposal, postApplyEffect)
      : proposal?.anomalyKind === "payment_result_issue" && proposal?.targetType === "journey"
        ? buildPaymentIssueProposalReviewSummary(proposal, postApplyEffect)
        : proposal?.anomalyKind === "fulfillment_backlog" && proposal?.targetType === "journey"
          ? buildFulfillmentBacklogProposalReviewSummary(proposal, postApplyEffect)
      : buildIncidentProposalReviewSummary(proposal);
  return {
    ...proposal,
    statusTimeline: buildProposalStatusTimeline(proposal),
    reviewSummary,
    currentConfigSummary: "n/a",
    suggestedConfigSummary: proposal.linkedDraftId ? `draft:${proposal.linkedDraftId}` : "prepare draft from linked recommendation",
    appliedConfigSummary: null,
    appliedConfigCheck: null,
    postApplyEffect,
    ruleMeta: null,
    suggestion: proposal.summary,
    improvementRate: 0,
    worsenedRate: 0,
    evaluated: proposal.occurrences ?? 1,
  };
}

function enrichProposal(proposal) {
  if (!proposal) return null;
  if (proposal.type === "incident_followup") return enrichIncidentFollowupProposal(proposal);
  return enrichRuleTuningProposal(proposal);
}

function listRuleTuningProposals(filters = {}) {
  const limit = Math.min(50, Math.max(1, Number(filters.limit ?? 10)));
  const items = proposals
    .filter((p) => (filters.ruleId ? p.ruleId === filters.ruleId : true))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit)
    .map((p) => enrichProposal(p));
  return { items, total: items.length };
}

function getRuleTuningProposal(id) {
  const proposal = proposals.find((p) => p.id === id) ?? null;
  if (!proposal) return null;
  const enriched = enrichProposal(proposal);
  if (enriched?.ruleId === "ai-concierge-strategy" && enriched?.status === "applied" && enriched?.reviewSummary?.state === "risk") {
    createAiConciergeRiskFollowupProposal({ sourceProposalId: enriched.id, actor: "ai:review" });
  }
  if (
    enriched?.type === "incident_followup" &&
    enriched?.targetType === "journey" &&
    enriched?.anomalyKind === "checkout_completion_dropoff" &&
    enriched?.status === "applied" &&
    enriched?.reviewSummary?.state === "risk"
  ) {
    createCommerceJourneyObservationFollowupRecommendation({ sourceProposalId: enriched.id });
  }
  if (
    enriched?.type === "incident_followup" &&
    enriched?.targetType === "journey" &&
    enriched?.anomalyKind === "payment_result_issue" &&
    enriched?.status === "applied" &&
    enriched?.reviewSummary?.state === "risk"
  ) {
    createPaymentObservationFollowupRecommendation({ sourceProposalId: enriched.id });
  }
  if (
    enriched?.type === "incident_followup" &&
    enriched?.targetType === "journey" &&
    enriched?.anomalyKind === "fulfillment_backlog" &&
    enriched?.status === "applied" &&
    enriched?.reviewSummary?.state === "risk"
  ) {
    createFulfillmentObservationFollowupRecommendation({ sourceProposalId: enriched.id });
  }
  const refreshed = proposals.find((p) => p.id === id) ?? proposal;
  return enrichProposal(refreshed);
}

function computeAppliedConfigCheck(proposal) {
  if (!proposal || proposal.type !== "rule_tuning") return null;
  if (proposal.status !== "applied") return null;

  const applied = proposal.appliedConfig;
  if (!applied || typeof applied !== "object") {
    return { status: "missing", reason: "no appliedConfig recorded", diff: null };
  }

  const def = getRuleDefinition(proposal.ruleId);
  if (!def || !def.params) {
    return { status: "unknown", reason: "rule definition not found", diff: null };
  }

  const current = normalizeRuleConfig(def, def.params);
  const normalizedApplied = normalizeRuleConfig(def, applied);
  const mismatched = {};
  const missingKeys = [];
  const extraKeys = [];

  Object.keys(normalizedApplied).forEach((key) => {
    if (!(key in current)) {
      extraKeys.push(key);
      return;
    }
    const a = normalizedApplied[key];
    const c = current[key];
    if (JSON.stringify(a) !== JSON.stringify(c)) {
      mismatched[key] = { applied: a, current: c };
    }
  });

  Object.keys(current).forEach((key) => {
    if (!(key in normalizedApplied)) {
      missingKeys.push(key);
    }
  });

  const hasMismatch = Object.keys(mismatched).length > 0 || missingKeys.length > 0 || extraKeys.length > 0;
  if (!hasMismatch) {
    return { status: "match", reason: "appliedConfig matches current rules config", diff: null };
  }
  return {
    status: "mismatch",
    reason: "appliedConfig differs from current rules config",
    diff: {
      missingKeys,
      extraKeys,
      mismatched,
    },
  };
}

function summarizeEffectCounts(recs) {
  const totals = {
    total: 0,
    evaluated: 0,
    improved: 0,
    neutral: 0,
    worsened: 0,
    unknown: 0,
    improvementRate: 0,
    purchaseBaselineRate: 0,
    purchaseAfterRate: 0,
    purchaseDeltaRate: 0,
  };
  let purchaseBaselineSum = 0;
  let purchaseAfterSum = 0;
  let purchaseDeltaSum = 0;
  let purchaseSamples = 0;
  recs.forEach((rec) => {
    totals.total += 1;
    const effect = rec.effect;
    if (!effect) {
      totals.unknown += 1;
      return;
    }
    if (effect.status === "unknown") {
      totals.unknown += 1;
      return;
    }
    totals.evaluated += 1;
    if (effect.status === "improved") totals.improved += 1;
    else if (effect.status === "worsened") totals.worsened += 1;
    else totals.neutral += 1;
    if (
      typeof effect?.baseline?.rates?.purchaseRate === "number" &&
      typeof effect?.after?.rates?.purchaseRate === "number" &&
      typeof effect?.delta?.rates?.purchaseRate === "number"
    ) {
      purchaseBaselineSum += effect.baseline.rates.purchaseRate;
      purchaseAfterSum += effect.after.rates.purchaseRate;
      purchaseDeltaSum += effect.delta.rates.purchaseRate;
      purchaseSamples += 1;
    }
  });
  const denom = totals.improved + totals.neutral + totals.worsened;
  totals.improvementRate = denom ? totals.improved / denom : 0;
  totals.purchaseBaselineRate = purchaseSamples ? purchaseBaselineSum / purchaseSamples : 0;
  totals.purchaseAfterRate = purchaseSamples ? purchaseAfterSum / purchaseSamples : 0;
  totals.purchaseDeltaRate = purchaseSamples ? purchaseDeltaSum / purchaseSamples : 0;
  return totals;
}

function normalizeRuleConfig(def, input) {
  if (!input || typeof input !== "object") return {};
  if (!def || !def.kind) return { ...input };
  if (def.kind === "low-rate") {
    const minViews = normalizeNumber(input.minViews);
    let maxRate = Number(input.maxRate ?? NaN);
    if (!Number.isFinite(maxRate)) {
      if (def.rate === "cta") maxRate = Number(input.maxCtaRate ?? NaN);
      if (def.rate === "atc") maxRate = Number(input.maxAddToCartRate ?? NaN);
    }
    if (!Number.isFinite(maxRate)) maxRate = 0;
    return { minViews, maxRate };
  }
  if (def.kind === "post-click-dropoff") {
    const minViews = normalizeNumber(input.minViews);
    const minCtaClicks = normalizeNumber(input.minCtaClicks);
    let maxPostClickAtcRate = Number(input.maxPostClickAtcRate ?? NaN);
    if (!Number.isFinite(maxPostClickAtcRate)) maxPostClickAtcRate = 0;
    return { minViews, minCtaClicks, maxPostClickAtcRate };
  }
  return { ...input };
}

function wouldTriggerRule({ ruleId, snapshot, config }) {
  if (!snapshot || !config) return false;
  const def = getRuleDefinition(ruleId);
  if (!def) return false;
  const evaluator = getRuleEvaluator(def);
  if (!evaluator) return false;
  return evaluator.match(snapshot, normalizeRuleConfig(def, config));
}

function simulateTriggersForWindow({ ruleId, startAtTs, endAtTs, config }) {
  const start = Number(startAtTs);
  const end = Number(endAtTs);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { snapshots: 0, triggers: 0, triggerRate: 0 };
  const windowSnapshots = snapshots.filter((s) => {
    const t = Date.parse(s.capturedAt || "");
    return Number.isFinite(t) && t >= start && t < end;
  });
  const triggers = windowSnapshots.reduce((acc, s) => acc + (wouldTriggerRule({ ruleId, snapshot: s, config }) ? 1 : 0), 0);
  const denom = Math.max(1, windowSnapshots.length);
  return { snapshots: windowSnapshots.length, triggers, triggerRate: triggers / denom };
}

function summarizeAiConciergeFunnelFromEvents(eventsInput) {
  const eventsList = Array.isArray(eventsInput) ? eventsInput : [];
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

  eventsList.forEach((event) => {
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
    events: eventsList.length,
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

function computeAiConciergeObservationEffectFromAnchor({ anchorAt, lookbackDays }) {
  const effect = computeFunnelObservationEffectFromAnchor({
    anchorAt,
    lookbackDays: Math.max(1, normalizeNumber(lookbackDays || 7)),
    listEvents: ({ sinceAt }) => listTrackedEvents({ sinceAt }),
    eventFilter: (event) => event.source === "ai_concierge" || event?.metadata?.attribution?.src === "ai_concierge",
    summarizeWindowEvents: summarizeAiConciergeFunnelFromEvents,
    now: Date.now(),
  });
  return attachFunnelRateDeltas(effect, ["entryCtr", "resultCtr", "atcRate", "purchaseRateFromAtc", "purchaseRateFromView"]);
}

function computeProposalPostApplyEffect(proposal) {
  if (!proposal || proposal.type !== "rule_tuning") return null;
  if (proposal.status !== "applied") return null;
  if (!proposal.appliedAt) return null;

  const appliedAtTs = Date.parse(proposal.appliedAt);
  if (!Number.isFinite(appliedAtTs)) return null;

  // Use a symmetric window: lookbackDays is the proposal's sinceDays (fallback 30)
  const lookbackDays = Math.max(1, normalizeNumber(proposal.sinceDays || 30));
  const windowMs = lookbackDays * 24 * 60 * 60 * 1000;
  const preStart = appliedAtTs - windowMs;
  const plannedPostEnd = appliedAtTs + windowMs;
  const nowTs = Date.now();
  const postEnd = Math.min(plannedPostEnd, nowTs);
  const postObservedDays = Math.max(0, (postEnd - appliedAtTs) / (24 * 60 * 60 * 1000));
  const postWindowComplete = nowTs >= plannedPostEnd;

  if (proposal.ruleId === "ai-concierge-strategy") {
    const effect = computeAiConciergeObservationEffectFromAnchor({ anchorAt: proposal.appliedAt, lookbackDays });
    return effect ? { mode: "ai_concierge_funnel", ...effect } : null;
  }

  const completed = listRecommendations({ statuses: ["resolved", "dismissed"] }).filter((rec) => rec.ruleId === proposal.ruleId);

  const pre = completed.filter((rec) => {
    const t = Date.parse(rec.resolvedAt || rec.updatedAt || rec.createdAt || "");
    return Number.isFinite(t) && t >= preStart && t < appliedAtTs;
  });

  const post = completed.filter((rec) => {
    const t = Date.parse(rec.resolvedAt || rec.updatedAt || rec.createdAt || "");
    return Number.isFinite(t) && t >= appliedAtTs && t <= postEnd;
  });

  const preStats = summarizeEffectCounts(pre);
  const postStats = summarizeEffectCounts(post);
  const deltaImprovementRate = postStats.improvementRate - preStats.improvementRate;
  const deltaPurchaseRate = postStats.purchaseAfterRate - preStats.purchaseAfterRate;

  const beforeConfig = proposal.currentConfig && typeof proposal.currentConfig === "object" ? proposal.currentConfig : null;
  const afterConfig = proposal.appliedConfig && typeof proposal.appliedConfig === "object" ? proposal.appliedConfig : null;

  const triggerSim =
    beforeConfig && afterConfig
      ? {
          pre: simulateTriggersForWindow({ ruleId: proposal.ruleId, startAtTs: preStart, endAtTs: appliedAtTs, config: beforeConfig }),
          post: simulateTriggersForWindow({ ruleId: proposal.ruleId, startAtTs: appliedAtTs, endAtTs: postEnd, config: afterConfig }),
        }
      : null;

  const triggerDelta = triggerSim
    ? {
        triggers: triggerSim.post.triggers - triggerSim.pre.triggers,
        triggerRate: triggerSim.post.triggerRate - triggerSim.pre.triggerRate,
      }
    : null;

  return {
    computedAt: nowIso(),
    windowDays: lookbackDays,
    appliedAt: proposal.appliedAt,
    window: {
      preStart: new Date(preStart).toISOString(),
      preEnd: proposal.appliedAt,
      postStart: proposal.appliedAt,
      postEnd: new Date(postEnd).toISOString(),
    },
    coverage: {
      plannedPostEnd: new Date(plannedPostEnd).toISOString(),
      postObservedDays: Math.round(postObservedDays * 10) / 10,
      postWindowComplete,
    },
    triggerSim,
    triggerDelta,
    pre: preStats,
    post: postStats,
    delta: {
      improvementRate: deltaImprovementRate,
      purchaseRate: deltaPurchaseRate,
    },
  };
}

function transitionRuleTuningProposal({ id, actor, nextStatus, note, appliedConfig }) {
  const idx = proposals.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const existing = proposals[idx];
  if (!existing?.type) return null;

  const now = nowIso();
  const next = { ...existing };

  if (existing.type === "incident_followup") {
    if (nextStatus === "approved") {
      if (existing.status !== "draft") return { status: "blocked", message: "Only draft proposals can be approved" };
      next.status = "approved";
      next.approvedAt = now;
      next.approvedBy = actor;
      next.approvalNote = note ?? null;
    } else if (nextStatus === "rejected") {
      if (!["draft", "approved"].includes(existing.status))
        return { status: "blocked", message: "Only draft/approved proposals can be rejected" };
      next.status = "rejected";
      next.rejectedAt = now;
      next.rejectedBy = actor;
      next.rejectionNote = note ?? null;
    } else if (nextStatus === "applied") {
      const isSupportedJourneyProposal =
        existing.targetType === "journey" &&
        ["checkout_completion_dropoff", "payment_result_issue", "fulfillment_backlog"].includes(String(existing.anomalyKind || ""));
      if (!isSupportedJourneyProposal) {
        return { status: "blocked", message: "Only supported journey incident proposals can be marked applied" };
      }
      if (existing.status !== "approved") {
        return { status: "blocked", message: "Only approved proposals can be marked applied" };
      }
      next.status = "applied";
      next.appliedAt = now;
      next.appliedBy = actor;
      next.appliedNote = note ?? null;
      next.appliedConfig =
        appliedConfig && typeof appliedConfig === "object"
          ? appliedConfig
          : existing.anomalyKind === "payment_result_issue"
            ? {
                mode: "payment_recovery",
                issueKey: existing.context?.issueKey ?? existing.targetId,
              }
            : existing.anomalyKind === "fulfillment_backlog"
              ? {
                  mode: "fulfillment_recovery",
                  stageKey: existing.context?.stageKey ?? existing.targetId,
                }
            : {
                mode: "journey_tuning",
                sourceKey: existing.targetId,
              };
    } else {
      return { status: "blocked", message: "Incident follow-up proposals only support approve/reject/applied for supported journeys" };
    }

    proposals[idx] = next;
    persist();
    let repoChange = null;
    if (nextStatus === "approved") {
      try {
        const existingRepo = listRepoChanges({ proposalId: existing.id })[0] ?? null;
        repoChange =
          existingRepo ??
          createRepoChange({
            actor,
            kind: "incident_followup",
            proposalId: existing.id,
            targetType: existing.targetType,
            targetId: existing.targetId,
            title: `Fix ${existing.anomalyKind} for ${existing.targetType}:${existing.targetId}`,
            summary: existing.summary,
            branchName: `ai/${existing.targetType}/${String(existing.targetId).replace(/[:/]/g, "-")}`,
            prUrl: null,
            commitSha: null,
            ciStatus: "not_started",
            linkedDraftId: existing.linkedDraftId ?? null,
            linkedRecommendationId: existing.linkedRecommendationId ?? null,
            trigger: existing.anomalyKind,
          });
        if (repoChange?.id) {
          next.repoChangeId = repoChange.id;
          proposals[idx] = next;
          persist();
        }
      } catch {
        // non-blocking
      }
    }
    try {
      createOpsEvent({
        actor,
        action: "incident_followup_proposal_transition",
        target: { type: existing.targetType, id: existing.targetId },
        draftId: existing.linkedDraftId ?? undefined,
        note: `proposal ${id} -> ${nextStatus}${repoChange ? ` · repo change ${repoChange.id}` : ""}${note ? ` · ${note}` : ""}`,
      });
    } catch {
      // non-blocking
    }

    return { status: "ok", proposal: next };
  }

  if (nextStatus === "approved") {
    if (existing.status !== "draft") return { status: "blocked", message: "Only draft proposals can be approved" };
    next.status = "approved";
    next.approvedAt = now;
    next.approvedBy = actor;
    next.approvalNote = note ?? null;
  } else if (nextStatus === "rejected") {
    if (!["draft", "approved"].includes(existing.status))
      return { status: "blocked", message: "Only draft/approved proposals can be rejected" };
    next.status = "rejected";
    next.rejectedAt = now;
    next.rejectedBy = actor;
    next.rejectionNote = note ?? null;
  } else if (nextStatus === "applied") {
    if (existing.status !== "approved") return { status: "blocked", message: "Only approved proposals can be marked applied" };
    if (!appliedConfig || typeof appliedConfig !== "object") {
      return { status: "blocked", message: "Mark applied requires appliedConfig JSON" };
    }
    next.status = "applied";
    next.appliedAt = now;
    next.appliedBy = actor;
    next.appliedNote = note ?? null;
    next.appliedConfig = appliedConfig;
  } else {
    return { status: "blocked", message: "Invalid status transition" };
  }

  proposals[idx] = next;
  persist();

  let repoChange = null;
  if (nextStatus === "approved" && existing.ruleId === "ai-concierge-strategy") {
    try {
      const repo = ensureAiConciergeRepoChangeForProposal({ proposalId: existing.id, actor });
      if (repo?.repoChangeId) {
        repoChange = listRepoChanges({ proposalId: existing.id })[0] ?? null;
        const refreshed = proposals.find((item) => item.id === existing.id);
        if (refreshed?.repoChangeId) {
          next.repoChangeId = refreshed.repoChangeId;
        }
      }
    } catch {
      // non-blocking
    }
  }

  try {
    createOpsEvent({
      actor,
      action: "rule_tuning_proposal_transition",
      note: `proposal ${id} -> ${nextStatus}${repoChange ? ` · repo change ${repoChange.id}` : ""}${note ? ` · ${note}` : ""}`,
    });
  } catch {
    // non-blocking
  }

  return { status: "ok", proposal: next };
}

module.exports = {
  computeRates,
  compareSnapshots,
  buildTargetSummary,
  listTargetSummaries,
  getSignalsRuntimeStatus,
  recordBatchRun,
  trackEvent,
  aggregateMetricsFromEvents,
  createSnapshotFromEvents,
  ingestSnapshot,
  listSnapshots,
  getPurchaseDiagnostics,
  listRecommendations,
  listTrackedEvents,
  createVerificationFollowupRecommendation,
  createContentGapRecommendation,
  createThinContentRecommendation,
  createInternalLinkGapRecommendation,
  createSeoLowCtrRecommendation,
  createSeoPositionDropRecommendation,
  createAiConciergeFunnelRecommendation,
  createFulfillmentBacklogRecommendation,
  createFulfillmentObservationFollowupRecommendation,
  createPaymentIssueRecommendation,
  createPaymentObservationFollowupRecommendation,
  createCheckoutCompletionRecommendation,
  createCommerceJourneyObservationFollowupRecommendation,
  syncAiConciergeTuningProposal,
  createIncidentFollowupProposal,
  createAiConciergeRiskFollowupProposal,
  ensureAiConciergeRepoChangeForProposal,
  maybeOpenAiConciergeDraftPullRequestForProposal,
  ensureIncidentRepoChangeForProposal,
  syncIncidentFollowupProposalsForRecommendations,
  listRecommendationRuleStats,
  resolveRecommendation,
  createRuleTuningProposal,
  listDailyMonitoringSnapshots,
  upsertDailyMonitoringSnapshot,
  getRuleTuningProposal,
  listRuleTuningProposals,
  transitionRuleTuningProposal,
};
