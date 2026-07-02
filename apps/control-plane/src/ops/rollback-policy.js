const fs = require("fs");
const path = require("path");
const { listEvents } = require("./store");

const defaultPolicyFilePath = path.resolve(__dirname, "../../.data/ops-rollback-policy.json");
const allowedTargetTypes = ["product", "collection", "faq", "guide"];

function getPolicyFilePath() {
  return process.env.OPS_ROLLBACK_POLICY_FILE || defaultPolicyFilePath;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function defaultPolicy() {
  return {
    product: {
      blocked: { enabled: true },
      warning: { enabled: true, threshold: 2 },
    },
    collection: {
      blocked: { enabled: true },
      warning: { enabled: true, threshold: 2 },
    },
    faq: {
      blocked: { enabled: false },
      warning: { enabled: false, threshold: 0 },
    },
    guide: {
      blocked: { enabled: false },
      warning: { enabled: false, threshold: 0 },
    },
  };
}

function loadPolicyFromFile() {
  const filePath = getPolicyFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function ensurePolicyFileExists() {
  const filePath = getPolicyFilePath();
  if (fs.existsSync(filePath)) return filePath;
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(defaultPolicy(), null, 2));
  return filePath;
}

function envEnabled(targetType, level) {
  const key = `OPS_ROLLBACK_${targetType.toUpperCase()}_${level.toUpperCase()}_ENABLED`;
  const value = process.env[key];
  if (value == null) return null;
  return String(value).toLowerCase() === "true";
}

function envThreshold(targetType) {
  const key = `OPS_ROLLBACK_${targetType.toUpperCase()}_WARNING_THRESHOLD`;
  const value = process.env[key];
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeTargetPolicy(targetType, input = {}, base = {}) {
  const warnings = [];

  const blockedEnabled =
    envEnabled(targetType, "blocked") ??
    (typeof input?.blocked?.enabled === "boolean"
      ? input.blocked.enabled
      : typeof base?.blocked?.enabled === "boolean"
        ? base.blocked.enabled
        : false);

  const warningEnabled =
    envEnabled(targetType, "warning") ??
    (typeof input?.warning?.enabled === "boolean"
      ? input.warning.enabled
      : typeof base?.warning?.enabled === "boolean"
        ? base.warning.enabled
        : false);

  let warningThreshold =
    envThreshold(targetType) ??
    (Number.isFinite(Number(input?.warning?.threshold))
      ? Number(input.warning.threshold)
      : Number.isFinite(Number(base?.warning?.threshold))
        ? Number(base.warning.threshold)
        : 0);

  if (warningThreshold < 0) {
    warningThreshold = 0;
    warnings.push("negative warning threshold; clamped to 0");
  }

  if (warningEnabled && warningThreshold < 1) {
    warningThreshold = 1;
    warnings.push("warning rollback enabled without valid threshold; fallback to 1");
  }

  return {
    blocked: {
      enabled: blockedEnabled,
    },
    warning: {
      enabled: warningEnabled,
      threshold: warningThreshold,
    },
    validation: {
      valid: warnings.length === 0,
      warnings,
    },
  };
}

function getRollbackPolicy(targetType) {
  const defaults = defaultPolicy();
  const overrides = loadPolicyFromFile() || {};
  if (!allowedTargetTypes.includes(targetType)) return null;
  ensurePolicyFileExists();
  return normalizeTargetPolicy(targetType, overrides?.[targetType], defaults[targetType]);
}

function countConsecutiveWarningPublishes(targetType, targetId) {
  const events = listEvents({ targetType, targetId, action: "publish" });
  let count = 0;
  for (const event of events) {
    const level = event?.verification?.level;
    if (level === "warning") {
      count += 1;
      continue;
    }
    if (level === "pass" || level === "blocked" || level === "skipped") {
      break;
    }
  }
  return count;
}

function evaluateRollbackPolicy({ targetType, targetId, verification }) {
  if (!verification?.level) {
    return {
      shouldRollback: false,
      reason: null,
      policy: getRollbackPolicy(targetType),
    };
  }

  const policy = getRollbackPolicy(targetType);
  if (!policy) {
    return {
      shouldRollback: false,
      reason: null,
      policy: null,
    };
  }

  if (verification.level === "blocked" && policy.blocked.enabled) {
    return {
      shouldRollback: true,
      reason: "verification-blocked",
      policy,
    };
  }

  if (verification.level === "warning" && policy.warning.enabled) {
    const consecutiveWarnings = countConsecutiveWarningPublishes(targetType, targetId);
    if (consecutiveWarnings >= policy.warning.threshold) {
      return {
        shouldRollback: true,
        reason: "verification-warning-threshold",
        policy,
        consecutiveWarnings,
      };
    }
    return {
      shouldRollback: false,
      reason: null,
      policy,
      consecutiveWarnings,
    };
  }

  return {
    shouldRollback: false,
    reason: null,
    policy,
  };
}

module.exports = {
  defaultPolicy,
  ensurePolicyFileExists,
  getRollbackPolicy,
  countConsecutiveWarningPublishes,
  evaluateRollbackPolicy,
};

