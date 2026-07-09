function rateLabel(def) {
  return def?.rate === "atc" ? "ATC" : def?.rate === "purchase" ? "PURCHASE" : "CTA";
}

function lowRateStrategy(def, currentConfig, ruleStats) {
  const base = { ...(currentConfig ?? {}) };
  const quality = ruleStats?.quality ?? "insufficient";
  const label = rateLabel(def);

  if (quality === "risky") {
    const maxRateStep = def?.rate === "atc" ? 0.001 : def?.rate === "purchase" ? 0.001 : 0.002;
    return {
      suggestedConfig: {
        ...base,
        minViews: Math.max(Number(base.minViews ?? 0), 200),
        maxRate: Math.max(0, Number(base.maxRate ?? 0) - maxRateStep),
      },
      expectedImpact: `Reduce weak ${label.toLowerCase()}-trigger noise and focus on higher-confidence underperformance cases.`,
    };
  }

  if (quality === "weak") {
    return {
      suggestedConfig: {
        ...base,
        minViews: Math.max(Number(base.minViews ?? 0), 150),
      },
      expectedImpact: `Reduce low-signal ${label.toLowerCase()} alerts while preserving coverage for meaningful issues.`,
    };
  }

  if (quality === "good") {
    return {
      suggestedConfig: base,
      expectedImpact: `Keep current ${label.toLowerCase()} threshold; the rule is performing well.`,
    };
  }

  return {
    suggestedConfig: base,
    expectedImpact: "Keep current threshold; monitor effect distribution and revisit with more samples.",
  };
}

function postClickDropoffStrategy(currentConfig, ruleStats) {
  const base = { ...(currentConfig ?? {}) };
  const quality = ruleStats?.quality ?? "insufficient";

  if (quality === "risky") {
    return {
      suggestedConfig: {
        ...base,
        minViews: Math.max(Number(base.minViews ?? 0), 150),
        minCtaClicks: Math.max(Number(base.minCtaClicks ?? 0), 30),
        maxPostClickAtcRate: Math.max(0, Number(base.maxPostClickAtcRate ?? 0) - 0.03),
      },
      expectedImpact: "Reduce false-positive post-click friction alerts and focus on deeper funnel drop-off with stronger click volume.",
    };
  }

  if (quality === "weak") {
    return {
      suggestedConfig: {
        ...base,
        minCtaClicks: Math.max(Number(base.minCtaClicks ?? 0), 25),
      },
      expectedImpact: "Reduce low-signal post-click alerts while keeping coverage on pages with meaningful CTA traffic.",
    };
  }

  if (quality === "good") {
    return {
      suggestedConfig: base,
      expectedImpact: "Keep current post-click threshold; the rule is effectively surfacing downstream friction.",
    };
  }

  return {
    suggestedConfig: base,
    expectedImpact: "Keep current threshold; monitor post-click conversion after more samples accumulate.",
  };
}

const customStrategyFactories = {};

function registerRuleStrategy(ruleId, strategyFactory) {
  if (!ruleId || typeof ruleId !== "string") return false;
  if (typeof strategyFactory !== "function") return false;
  customStrategyFactories[ruleId] = strategyFactory;
  return true;
}

function createCustomStrategy(ruleId, def) {
  const factory = customStrategyFactories[ruleId];
  if (!factory) return null;
  return factory(def);
}

function getRuleStrategy(def) {
  if (!def) return null;
  const custom = createCustomStrategy(def.ruleId, def);
  if (custom) return custom;
  if (def.kind === "low-rate" && (def.rate === "cta" || def.rate === "atc" || def.rate === "purchase")) {
    return {
      buildProposalSuggestion(currentConfig, ruleStats) {
        return lowRateStrategy(def, currentConfig, ruleStats);
      },
    };
  }
  return null;
}

registerRuleStrategy("weak-post-click-conversion", (def) => {
  if (!def || def.kind !== "post-click-dropoff") return null;
  return {
    buildProposalSuggestion(currentConfig, ruleStats) {
      return postClickDropoffStrategy(currentConfig, ruleStats);
    },
  };
});

module.exports = {
  registerRuleStrategy,
  getRuleStrategy,
};
