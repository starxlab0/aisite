const crypto = require("crypto");
const { listAllTargets } = require("../ops/targets");
const { loadState, saveState, getFilePath } = require("./persistence");
const { prepareOpsDraftForRecommendation } = require("../ops/drafts");
const { createEvent: createOpsEvent } = require("../ops/store");
const { ensureRulesFileExists, getAllRuleDefinitions, getRuleDefinition } = require("./rules-config");
const { getRuleEvaluator } = require("./rules-evaluators");
const { getRuleStrategy } = require("./rules-strategies");

const persisted = loadState();
const snapshots = Array.isArray(persisted.snapshots) ? persisted.snapshots : [];
const recommendations = Array.isArray(persisted.recommendations) ? persisted.recommendations : [];
const proposals = Array.isArray(persisted.proposals) ? persisted.proposals : [];
const events = Array.isArray(persisted.events) ? persisted.events : [];
const meta = persisted.meta && typeof persisted.meta === "object"
  ? persisted.meta
  : { lastBatchRun: null, batchRuns: [], consecutiveBatchFailures: 0 };
const { computeRates, normalizeNumber } = require("./metrics");

// Ensure default rules file exists so proposals can reference an explicit config location.
ensureRulesFileExists();

function nowIso() {
  return new Date().toISOString();
}

function nextId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
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

function buildRecommendationContext({ snapshot, recommendation }) {
  const previous = findPreviousSnapshotForComparison(snapshot);
  const currentRates = computeRates(snapshot.metrics);
  const previousRates = previous ? computeRates(previous.metrics) : null;

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
          },
          rates: {
            ctaRate: currentRates.ctaRate - previousRates.ctaRate,
            addToCartRate: currentRates.addToCartRate - previousRates.addToCartRate,
          },
        }
      : null,
    focusAreas: focusAreasForTarget(snapshot.targetType),
    suggestedWorkflow: recommendation.suggestedWorkflow,
  };
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

  // thresholds in "rate" units (0.005 = +0.5pts)
  const improve = deltaCta >= 0.005 || deltaAtc >= 0.002;
  const worsen = deltaCta <= -0.005 || deltaAtc <= -0.002;

  if (improve) return { status: "improved", summary: `cta ${Math.round(deltaCta * 10000) / 100}pts, atc ${Math.round(deltaAtc * 10000) / 100}pts` };
  if (worsen) return { status: "worsened", summary: `cta ${Math.round(deltaCta * 10000) / 100}pts, atc ${Math.round(deltaAtc * 10000) / 100}pts` };
  return { status: "neutral", summary: `cta ${Math.round(deltaCta * 10000) / 100}pts, atc ${Math.round(deltaAtc * 10000) / 100}pts` };
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
    snapshots.find((s) => {
      if (s.targetType !== rec.targetType) return false;
      if (s.targetId !== rec.targetId) return false;
      if (Date.parse(s.capturedAt) <= Date.parse(anchorAt)) return false;
      // Prefer a different contentRef to represent "after change"
      if ((s.contentRef ?? null) === (baselineContentRef ?? null)) return false;
      return true;
    }) ?? null;

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
  return {
    effect: {
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
        },
      },
    },
  };
}

function computePriorityScore({ severity, context, reason }) {
  const base = (severityRank[severity] ?? 0) * 1000;
  const views = normalizeNumber(context?.snapshot?.metrics?.views);
  const ctaRate = Number(context?.snapshot?.rates?.ctaRate ?? 0);
  const atcRate = Number(context?.snapshot?.rates?.addToCartRate ?? 0);
  const deltaCta = Number(context?.delta?.rates?.ctaRate ?? 0);
  const deltaAtc = Number(context?.delta?.rates?.addToCartRate ?? 0);

  // traffic weight: higher traffic = higher priority (cap to avoid runaway)
  const traffic = Math.min(800, views);

  // performance drop weight: focus on negative deltas
  const dropCta = Math.max(0, -deltaCta) * 10000; // points
  const dropAtc = Math.max(0, -deltaAtc) * 10000;

  // absolute under-performance weight
  const lowCta = Math.max(0, 0.02 - ctaRate) * 10000; // how far under 2%
  const lowAtc = Math.max(0, 0.01 - atcRate) * 10000; // under 1%

  // small boost if the rule reason indicates hard threshold breach
  const thresholdBoost = typeof reason === "string" && reason.includes("below") ? 50 : 0;

  const score = Math.round(base + traffic + dropCta + dropAtc + lowCta + lowAtc + thresholdBoost);
  return Math.max(0, score);
}

function priorityLevel(score) {
  if (score >= 2600) return "p0";
  if (score >= 1900) return "p1";
  if (score >= 1300) return "p2";
  return "p3";
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
  if (context.delta) {
    const dCta = Math.round(context.delta.rates.ctaRate * 10000) / 100;
    const dAtc = Math.round(context.delta.rates.addToCartRate * 10000) / 100;
    return `views ${views}, cta ${cta}%, atc ${atc}%, delta cta ${dCta}pts, delta atc ${dAtc}pts`;
  }
  return `views ${views}, cta ${cta}%, atc ${atc}%`;
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
  const record = {
    id: nextId("evt"),
    at: input.at ?? nowIso(),
    targetType: input.targetType,
    targetId: input.targetId,
    contentRef: input.contentRef ?? null,
    eventType: input.eventType,
    source: input.source ?? "web",
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

  events.forEach((e) => {
    const t = Date.parse(e.at);
    if (!Number.isFinite(t) || t < since || t > until) return;
    if (e.targetType !== targetType) return;
    if (e.targetId !== targetId) return;
    if (contentRef !== undefined && (e.contentRef ?? null) !== (contentRef ?? null)) return;

    if (e.eventType === "view") views += 1;
    if (e.eventType === "cta") ctaClicks += 1;
    if (e.eventType === "add_to_cart") addToCart += 1;
  });

  return { views, ctaClicks, addToCart };
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

      // 队列自动推进：P0 且已准备好 draft 的 recommendation，自动进入 in_progress
      if (item.status === "open" && item.priorityLevel === "p0" && item.preparedDraft?.draftId) {
        item.status = "in_progress";
        item.startedAt = item.startedAt ?? nowIso();
        item.startedBy = item.startedBy ?? "ai:queue";
        item.startNote = item.startNote ?? "auto-started by queue policy";
        try {
          createOpsEvent({
            actor: "ai:queue",
            action: "auto_start_recommendation",
            target: { type: item.targetType, id: item.targetId },
            draftId: item.preparedDraft.draftId,
            note: `recommendation ${item.id} auto-started`,
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

  return { snapshot: record, recommendationsCreated: newRecs };
}

function listSnapshots(filters = {}) {
  return snapshots.filter((item) => {
    if (filters.targetType && item.targetType !== filters.targetType) return false;
    if (filters.targetId && item.targetId !== filters.targetId) return false;
    return true;
  });
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
    },
    previous: previous
      ? {
          views: previous.metrics.views,
          ctaRate: previousRates.ctaRate,
          addToCartRate: previousRates.addToCartRate,
        }
      : null,
    delta: previous
      ? {
          views: current.metrics.views - previous.metrics.views,
          ctaRate: currentRates.ctaRate - previousRates.ctaRate,
          addToCartRate: currentRates.addToCartRate - previousRates.addToCartRate,
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

function formatRate(value) {
  return `${Math.round(Number(value || 0) * 10000) / 100}%`;
}

function formatRuleParameterSummary(def, params) {
  if (!def || !params) return "n/a";
  if (def.kind === "low-rate") {
    const label = def.rate === "atc" ? "ATC" : "CTA";
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

function buildProposalReviewSummary(proposal, appliedConfigCheck, postApplyEffect) {
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

function enrichRuleTuningProposal(proposal) {
  const def = getRuleDefinition(proposal.ruleId);
  const currentConfig = proposal.currentConfig ?? null;
  const suggestedConfig = proposal.suggestedConfig ?? null;
  const appliedConfig = proposal.appliedConfig ?? null;
  const appliedConfigCheck = computeAppliedConfigCheck(proposal);
  const postApplyEffect = computeProposalPostApplyEffect(proposal);
  return {
    ...proposal,
    ruleMeta: buildRuleMeta(def),
    currentConfigSummary: def && currentConfig ? formatRuleParameterSummary(def, normalizeRuleConfig(def, currentConfig)) : "n/a",
    suggestedConfigSummary: def && suggestedConfig ? formatRuleParameterSummary(def, normalizeRuleConfig(def, suggestedConfig)) : "n/a",
    appliedConfigSummary: def && appliedConfig ? formatRuleParameterSummary(def, normalizeRuleConfig(def, appliedConfig)) : null,
    statusTimeline: buildProposalStatusTimeline(proposal),
    appliedConfigCheck,
    postApplyEffect,
    reviewSummary: buildProposalReviewSummary(proposal, appliedConfigCheck, postApplyEffect),
  };
}

function enrichIncidentFollowupProposal(proposal) {
  return {
    ...proposal,
    statusTimeline: buildProposalStatusTimeline(proposal),
    reviewSummary: buildIncidentProposalReviewSummary(proposal),
    currentConfigSummary: "n/a",
    suggestedConfigSummary: proposal.linkedDraftId ? `draft:${proposal.linkedDraftId}` : "prepare draft from linked recommendation",
    appliedConfigSummary: null,
    appliedConfigCheck: null,
    postApplyEffect: null,
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
  return enrichProposal(proposal);
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
  const totals = { total: 0, evaluated: 0, improved: 0, neutral: 0, worsened: 0, unknown: 0, improvementRate: 0 };
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
  });
  const denom = totals.improved + totals.neutral + totals.worsened;
  totals.improvementRate = denom ? totals.improved / denom : 0;
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
    } else {
      return { status: "blocked", message: "Incident follow-up proposals only support approve/reject" };
    }

    proposals[idx] = next;
    persist();
    try {
      createOpsEvent({
        actor,
        action: "incident_followup_proposal_transition",
        target: { type: existing.targetType, id: existing.targetId },
        draftId: existing.linkedDraftId ?? undefined,
        note: `proposal ${id} -> ${nextStatus}${note ? ` · ${note}` : ""}`,
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

  try {
    createOpsEvent({
      actor,
      action: "rule_tuning_proposal_transition",
      note: `proposal ${id} -> ${nextStatus}${note ? ` · ${note}` : ""}`,
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
  listRecommendations,
  createVerificationFollowupRecommendation,
  createIncidentFollowupProposal,
  listRecommendationRuleStats,
  resolveRecommendation,
  createRuleTuningProposal,
  getRuleTuningProposal,
  listRuleTuningProposals,
  transitionRuleTuningProposal,
};
