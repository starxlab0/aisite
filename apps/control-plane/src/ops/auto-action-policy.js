const fs = require("fs");
const path = require("path");

const defaultPolicyFilePath = path.resolve(__dirname, "../../.data/ops-auto-action-policy.json");
const allowedTargetTypes = ["product", "collection", "faq", "guide"];

function getPolicyFilePath() {
  return process.env.OPS_AUTO_ACTION_POLICY_FILE || defaultPolicyFilePath;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function defaultPolicy() {
  return {
    autoMerge: {
      enabled: true,
      allowedTargetTypes: ["product", "collection"],
      allowedTriggers: ["incident_followup", "blocked_publish", "warning_threshold", "auto_rollback"],
      allowedTargetIds: [],
    },
    autoRevert: {
      enabled: true,
      allowedTargetTypes: ["product", "collection"],
      allowedTriggers: ["incident_followup", "blocked_publish", "warning_threshold", "auto_rollback"],
      allowedTargetIds: [],
      minRiskCount: 2,
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

function savePolicy(policy) {
  const filePath = getPolicyFilePath();
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(policy, null, 2));
  return filePath;
}

function normalizeStringList(input, fallback = []) {
  if (!Array.isArray(input)) return fallback;
  return input
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeActionPolicy(input = {}, base = {}) {
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : typeof base.enabled === "boolean" ? base.enabled : false,
    allowedTargetTypes: normalizeStringList(input.allowedTargetTypes, normalizeStringList(base.allowedTargetTypes)).filter((item) =>
      allowedTargetTypes.includes(item),
    ),
    allowedTriggers: normalizeStringList(input.allowedTriggers, normalizeStringList(base.allowedTriggers)),
    allowedTargetIds: normalizeStringList(input.allowedTargetIds, normalizeStringList(base.allowedTargetIds)),
    minRiskCount:
      Number.isFinite(Number(input.minRiskCount)) && Number(input.minRiskCount) >= 1
        ? Number(input.minRiskCount)
        : Number.isFinite(Number(base.minRiskCount)) && Number(base.minRiskCount) >= 1
          ? Number(base.minRiskCount)
          : 2,
  };
}

function getAutoActionPolicy() {
  const defaults = defaultPolicy();
  const overrides = loadPolicyFromFile() || {};
  ensurePolicyFileExists();
  return {
    autoMerge: normalizeActionPolicy(overrides.autoMerge, defaults.autoMerge),
    autoRevert: normalizeActionPolicy(overrides.autoRevert, defaults.autoRevert),
  };
}

function matchesActionPolicy(actionPolicy, change) {
  if (!actionPolicy?.enabled) return false;
  const targetType = String(change?.targetType || "");
  if (actionPolicy.allowedTargetTypes.length && !actionPolicy.allowedTargetTypes.includes(targetType)) return false;
  const trigger = String(change?.trigger || change?.kind || "");
  if (actionPolicy.allowedTriggers.length && !actionPolicy.allowedTriggers.includes(trigger)) return false;
  const targetId = String(change?.targetId || "");
  if (actionPolicy.allowedTargetIds.length && !actionPolicy.allowedTargetIds.includes(targetId)) return false;
  return true;
}

function evaluateActionPolicy(actionPolicy, change) {
  if (!actionPolicy?.enabled) {
    return { allowed: false, reasons: ["disabled"] };
  }
  const reasons = [];
  const targetType = String(change?.targetType || "");
  const trigger = String(change?.trigger || change?.kind || "");
  const targetId = String(change?.targetId || "");

  if (actionPolicy.allowedTargetTypes.length && !actionPolicy.allowedTargetTypes.includes(targetType)) {
    reasons.push(`targetType:${targetType || "unknown"} blocked`);
  }
  if (actionPolicy.allowedTriggers.length && !actionPolicy.allowedTriggers.includes(trigger)) {
    reasons.push(`trigger:${trigger || "unknown"} blocked`);
  }
  if (actionPolicy.allowedTargetIds.length && !actionPolicy.allowedTargetIds.includes(targetId)) {
    reasons.push(`targetId:${targetId || "unknown"} blocked`);
  }

  return {
    allowed: reasons.length === 0,
    reasons: reasons.length ? reasons : ["policy matched"],
  };
}

function updateAutoActionPolicy(patch = {}) {
  const current = getAutoActionPolicy();
  const next = {
    autoMerge: normalizeActionPolicy(patch.autoMerge, current.autoMerge),
    autoRevert: normalizeActionPolicy(patch.autoRevert, current.autoRevert),
  };
  savePolicy(next);
  return next;
}

module.exports = {
  defaultPolicy,
  ensurePolicyFileExists,
  evaluateActionPolicy,
  getAutoActionPolicy,
  matchesActionPolicy,
  updateAutoActionPolicy,
};
