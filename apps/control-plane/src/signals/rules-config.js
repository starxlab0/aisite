const fs = require("fs");
const path = require("path");

const defaultRulesFilePath = path.resolve(__dirname, "../../.data/signals-rules.json");
const allowedTargetTypes = ["product", "collection", "faq"];
const allowedSeverities = ["info", "warning", "critical"];

function getRulesFilePath() {
  return process.env.SIGNALS_RULES_FILE || defaultRulesFilePath;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function defaultRules() {
  return {
    "low-cta-rate": {
      description: "Low CTA rate suggests copy/structure rewrite",
      kind: "low-rate",
      rate: "cta",
      severity: "warning",
      targetTypes: ["product", "collection", "faq"],
      workflows: {
        product: "product-rewrite",
        collection: "collection-rewrite",
        faq: "faq-expansion",
      },
      params: {
        minViews: 100,
        maxRate: 0.02,
      },
    },
    "low-atc-rate": {
      description: "Low add-to-cart rate suggests stronger product merchandising/copy",
      kind: "low-rate",
      rate: "atc",
      severity: "warning",
      targetTypes: ["product", "collection", "faq"],
      workflows: {
        product: "product-rewrite",
        collection: "collection-rewrite",
        faq: "faq-expansion",
      },
      params: {
        minViews: 100,
        maxRate: 0.005,
      },
    },
    "weak-post-click-conversion": {
      description: "Low add-to-cart conversion after CTA clicks suggests post-click friction or merchandising mismatch",
      kind: "post-click-dropoff",
      severity: "warning",
      targetTypes: ["product", "collection"],
      workflows: {
        product: "product-rewrite",
        collection: "collection-rewrite",
      },
      params: {
        minViews: 100,
        minCtaClicks: 20,
        maxPostClickAtcRate: 0.15,
      },
    },
  };
}

function loadRulesFromFile() {
  const filePath = getRulesFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function ensureRulesFileExists() {
  const filePath = getRulesFilePath();
  if (fs.existsSync(filePath)) return filePath;
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(defaultRules(), null, 2));
  return filePath;
}

function normalizeParams(ruleId, params) {
  if (!params || typeof params !== "object") return params;
  // Optional env overrides for quick tuning
  if (ruleId === "low-cta-rate") {
    const minViewsEnv = process.env.SIGNALS_RULE_LOW_CTA_MIN_VIEWS;
    const maxCtaEnv = process.env.SIGNALS_RULE_LOW_CTA_MAX_CTA_RATE || process.env.SIGNALS_RULE_LOW_CTA_MAX_RATE;
    return {
      ...params,
      minViews: minViewsEnv ? Number(minViewsEnv) : params.minViews,
      maxRate: maxCtaEnv ? Number(maxCtaEnv) : params.maxRate ?? params.maxCtaRate,
    };
  }
  if (ruleId === "low-atc-rate") {
    const minViewsEnv = process.env.SIGNALS_RULE_LOW_ATC_MIN_VIEWS;
    const maxAtcEnv = process.env.SIGNALS_RULE_LOW_ATC_MAX_RATE || process.env.SIGNALS_RULE_LOW_ATC_MAX_ATC_RATE;
    return {
      ...params,
      minViews: minViewsEnv ? Number(minViewsEnv) : params.minViews,
      maxRate: maxAtcEnv ? Number(maxAtcEnv) : params.maxRate ?? params.maxAddToCartRate,
    };
  }
  if (ruleId === "weak-post-click-conversion") {
    const minViewsEnv = process.env.SIGNALS_RULE_POST_CLICK_MIN_VIEWS;
    const minClicksEnv = process.env.SIGNALS_RULE_POST_CLICK_MIN_CTA_CLICKS;
    const maxPostClickEnv = process.env.SIGNALS_RULE_POST_CLICK_MAX_ATC_RATE;
    return {
      ...params,
      minViews: minViewsEnv ? Number(minViewsEnv) : params.minViews,
      minCtaClicks: minClicksEnv ? Number(minClicksEnv) : params.minCtaClicks,
      maxPostClickAtcRate: maxPostClickEnv ? Number(maxPostClickEnv) : params.maxPostClickAtcRate,
    };
  }
  return params;
}

function defaultWorkflowForTarget(targetType) {
  if (targetType === "product") return "product-rewrite";
  if (targetType === "collection") return "collection-rewrite";
  return "faq-expansion";
}

function normalizeRuleDefinition(ruleId, input, base) {
  const warnings = [];
  const description = typeof input?.description === "string" && input.description.trim() ? input.description : ruleId;
  if (description === ruleId) warnings.push("missing description; fallback to ruleId");

  let kind = input?.kind ?? base?.kind ?? null;
  let rate = input?.rate ?? base?.rate ?? null;
  if (!kind && (rate === "cta" || rate === "atc")) {
    kind = "low-rate";
    warnings.push("missing kind; inferred low-rate from rate");
  }

  let severity = input?.severity ?? base?.severity ?? "warning";
  if (!allowedSeverities.includes(severity)) {
    warnings.push(`invalid severity '${severity}'; fallback warning`);
    severity = "warning";
  }

  const rawTargetTypes = Array.isArray(input?.targetTypes) ? input.targetTypes : Array.isArray(base?.targetTypes) ? base.targetTypes : allowedTargetTypes;
  const targetTypes = rawTargetTypes.filter((t) => allowedTargetTypes.includes(t));
  if (!targetTypes.length) {
    warnings.push("missing/invalid targetTypes; fallback to all");
    targetTypes.push(...allowedTargetTypes);
  } else if (targetTypes.length !== rawTargetTypes.length) {
    warnings.push("some targetTypes are invalid and were removed");
  }

  const workflows = { ...(base?.workflows ?? {}), ...(input?.workflows ?? {}) };
  targetTypes.forEach((targetType) => {
    if (!workflows[targetType]) {
      workflows[targetType] = defaultWorkflowForTarget(targetType);
      warnings.push(`missing workflow for ${targetType}; fallback applied`);
    }
  });

  let params = normalizeParams(ruleId, input?.params ?? {});
  if (kind === "low-rate") {
    const minViews = Number(params?.minViews);
    const safeMinViews = Number.isFinite(minViews) && minViews >= 1 ? minViews : Number(base?.params?.minViews ?? 100);
    if (!(Number.isFinite(minViews) && minViews >= 1)) warnings.push("invalid minViews; fallback applied");

    let maxRate = Number(params?.maxRate);
    if (!Number.isFinite(maxRate)) {
      maxRate = Number(base?.params?.maxRate ?? 0);
      warnings.push("missing/invalid maxRate; fallback applied");
    }
    if (maxRate < 0) {
      maxRate = 0;
      warnings.push("negative maxRate; clamped to 0");
    }
    if (maxRate > 1) {
      maxRate = 1;
      warnings.push("maxRate > 1; clamped to 1");
    }
    params = { ...params, minViews: safeMinViews, maxRate };

    if (!(rate === "cta" || rate === "atc")) {
      rate = base?.rate ?? "cta";
      warnings.push("invalid/missing rate; fallback applied");
    }
  }

  if (kind === "post-click-dropoff") {
    const minViews = Number(params?.minViews);
    const safeMinViews = Number.isFinite(minViews) && minViews >= 1 ? minViews : Number(base?.params?.minViews ?? 100);
    if (!(Number.isFinite(minViews) && minViews >= 1)) warnings.push("invalid minViews; fallback applied");

    const minCtaClicks = Number(params?.minCtaClicks);
    const safeMinCtaClicks =
      Number.isFinite(minCtaClicks) && minCtaClicks >= 1 ? minCtaClicks : Number(base?.params?.minCtaClicks ?? 20);
    if (!(Number.isFinite(minCtaClicks) && minCtaClicks >= 1)) warnings.push("invalid minCtaClicks; fallback applied");

    let maxPostClickAtcRate = Number(params?.maxPostClickAtcRate);
    if (!Number.isFinite(maxPostClickAtcRate)) {
      maxPostClickAtcRate = Number(base?.params?.maxPostClickAtcRate ?? 0.15);
      warnings.push("missing/invalid maxPostClickAtcRate; fallback applied");
    }
    if (maxPostClickAtcRate < 0) {
      maxPostClickAtcRate = 0;
      warnings.push("negative maxPostClickAtcRate; clamped to 0");
    }
    if (maxPostClickAtcRate > 1) {
      maxPostClickAtcRate = 1;
      warnings.push("maxPostClickAtcRate > 1; clamped to 1");
    }

    params = {
      ...params,
      minViews: safeMinViews,
      minCtaClicks: safeMinCtaClicks,
      maxPostClickAtcRate,
    };
  }

  return {
    ruleId,
    description,
    kind,
    rate,
    severity,
    targetTypes,
    workflows,
    params,
    validation: {
      valid: warnings.length === 0,
      warnings,
    },
  };
}

function getRuleDefinition(ruleId) {
  const base = defaultRules()[ruleId];
  const overrides = loadRulesFromFile()?.[ruleId];
  if (!base && !overrides) return null;
  const merged = {
    ...base,
    ...overrides,
    params: {
      ...(base?.params ?? {}),
      ...(overrides?.params ?? {}),
    },
    workflows: {
      ...(base?.workflows ?? {}),
      ...(overrides?.workflows ?? {}),
    },
  };
  return normalizeRuleDefinition(ruleId, merged, base);
}

function listRuleIds() {
  const defaults = Object.keys(defaultRules());
  const overrides = Object.keys(loadRulesFromFile() ?? {});
  return Array.from(new Set([...defaults, ...overrides])).sort();
}

function getAllRuleDefinitions() {
  return listRuleIds()
    .map((ruleId) => getRuleDefinition(ruleId))
    .filter(Boolean);
}

module.exports = {
  getRulesFilePath,
  ensureRulesFileExists,
  getRuleDefinition,
  listRuleIds,
  getAllRuleDefinitions,
};
