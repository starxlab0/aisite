/**
 * A rule evaluator provides two things:
 * 1) match(snapshot, params): boolean
 * 2) buildHit(snapshot, params): { ruleId, reason, suggestedWorkflow, severity }
 *
 * Trigger simulation reuses match().
 */
const { computeRates, normalizeNumber } = require("./metrics");

function normalizeLowRateConfig(def, params) {
  // canonical: { minViews, maxRate }
  const minViews = normalizeNumber(params?.minViews);
  let maxRate = Number(params?.maxRate ?? NaN);
  if (!Number.isFinite(maxRate)) {
    if (def?.rate === "cta") maxRate = Number(params?.maxCtaRate ?? NaN);
    if (def?.rate === "atc") maxRate = Number(params?.maxAddToCartRate ?? NaN);
    if (def?.rate === "purchase") maxRate = Number(params?.maxPurchaseRate ?? NaN);
  }
  if (!Number.isFinite(maxRate)) maxRate = 0;
  return { minViews, maxRate };
}

function lowRateEvaluator(def) {
  return {
    ruleId: def.ruleId,
    match(snapshot, params) {
      if (Array.isArray(def.targetTypes) && def.targetTypes.length > 0) {
        if (!def.targetTypes.includes(snapshot?.targetType)) return false;
      }
      const metrics = snapshot?.metrics ?? {};
      const views = normalizeNumber(metrics.views);
      const rates = computeRates(metrics);
      const cfg = normalizeLowRateConfig(def, params);
      const rateValue =
        def.rate === "atc" ? rates.addToCartRate : def.rate === "purchase" ? rates.purchaseRate : rates.ctaRate;
      return views >= cfg.minViews && rateValue < cfg.maxRate;
    },
    buildHit(snapshot, params) {
      const metrics = snapshot?.metrics ?? {};
      const views = normalizeNumber(metrics.views);
      const rates = computeRates(metrics);
      const cfg = normalizeLowRateConfig(def, params);
      const rateValue =
        def.rate === "atc" ? rates.addToCartRate : def.rate === "purchase" ? rates.purchaseRate : rates.ctaRate;
      const label = def.rate === "atc" ? "ATC" : def.rate === "purchase" ? "PURCHASE" : "CTA";
      const suggestedWorkflow =
        (def.workflows && def.workflows[snapshot.targetType]) ||
        (snapshot.targetType === "product"
          ? "product-rewrite"
          : snapshot.targetType === "collection"
            ? "collection-rewrite"
            : "faq-expansion");
      const purchaseFocusAreas =
        snapshot.targetType === "product"
          ? ["selling_points", "pricing_offer", "trust_signals", "faq_coverage"]
          : ["hero_summary", "pricing_offer", "trust_signals", "internal_links"];
      const purchaseActionHints =
        snapshot.targetType === "product"
          ? [
              "clarify value proposition and who-it-is-for near the buy zone",
              "add pricing, guarantee, and shipping trust cues around conversion sections",
              "expand FAQ coverage for objections that may block purchase after add-to-cart intent",
            ]
          : [
              "tighten collection hero promise around shopping intent and price/value framing",
              "surface trust, shipping, and guarantee cues earlier in the collection journey",
              "improve internal links toward high-converting products and proof-oriented content",
            ];
      return {
        ruleId: def.ruleId,
        reason: `${label} rate ${Math.round(rateValue * 10000) / 100}% is below ${Math.round(cfg.maxRate * 10000) / 100}% with ${views} views`,
        suggestedWorkflow,
        severity: def.severity || "warning",
        ...(def.rate === "purchase"
          ? {
              focusAreas: purchaseFocusAreas,
              optimizationGoal: "Improve purchase conversion by reducing price/trust friction and strengthening pre-purchase confidence.",
              actionHints: purchaseActionHints,
            }
          : null),
      };
    },
  };
}

function postClickDropoffEvaluator(def) {
  return {
    ruleId: def.ruleId,
    match(snapshot, params) {
      if (Array.isArray(def.targetTypes) && def.targetTypes.length > 0) {
        if (!def.targetTypes.includes(snapshot?.targetType)) return false;
      }
      const metrics = snapshot?.metrics ?? {};
      const views = normalizeNumber(metrics.views);
      const ctaClicks = normalizeNumber(metrics.ctaClicks);
      const { postClickAtcRate } = computeRates(metrics);
      const minViews = normalizeNumber(params?.minViews);
      const minCtaClicks = normalizeNumber(params?.minCtaClicks);
      const maxPostClickAtcRate = Number(params?.maxPostClickAtcRate ?? 0);
      return views >= minViews && ctaClicks >= minCtaClicks && postClickAtcRate < maxPostClickAtcRate;
    },
    buildHit(snapshot, params) {
      const metrics = snapshot?.metrics ?? {};
      const views = normalizeNumber(metrics.views);
      const ctaClicks = normalizeNumber(metrics.ctaClicks);
      const { postClickAtcRate } = computeRates(metrics);
      const maxPostClickAtcRate = Number(params?.maxPostClickAtcRate ?? 0);
      const suggestedWorkflow =
        (def.workflows && def.workflows[snapshot.targetType]) ||
        (snapshot.targetType === "product" ? "product-rewrite" : "collection-rewrite");
      return {
        ruleId: def.ruleId,
        reason: `Post-click ATC ${Math.round(postClickAtcRate * 10000) / 100}% is below ${Math.round(maxPostClickAtcRate * 10000) / 100}% with ${ctaClicks} CTA clicks and ${views} views`,
        suggestedWorkflow,
        severity: def.severity || "warning",
      };
    },
  };
}

const customEvaluatorFactories = {};

function registerRuleEvaluator(ruleId, evaluatorFactory) {
  if (!ruleId || typeof ruleId !== "string") return false;
  if (typeof evaluatorFactory !== "function") return false;
  customEvaluatorFactories[ruleId] = evaluatorFactory;
  return true;
}

function createCustomEvaluator(ruleId, def) {
  const factory = customEvaluatorFactories[ruleId];
  if (!factory) return null;
  return factory(def);
}

function getRuleEvaluator(defOrRuleId) {
  if (!defOrRuleId) return null;
  const ruleId = typeof defOrRuleId === "string" ? defOrRuleId : defOrRuleId.ruleId;
  const def = typeof defOrRuleId === "string" ? null : defOrRuleId;
  const custom = createCustomEvaluator(ruleId, def);
  if (custom) return custom;
  if (def && def.kind === "low-rate" && (def.rate === "cta" || def.rate === "atc" || def.rate === "purchase")) {
    return lowRateEvaluator(def);
  }
  return null;
}

registerRuleEvaluator("weak-post-click-conversion", (def) => {
  if (!def || def.kind !== "post-click-dropoff") return null;
  return postClickDropoffEvaluator(def);
});

module.exports = {
  registerRuleEvaluator,
  getRuleEvaluator,
};
