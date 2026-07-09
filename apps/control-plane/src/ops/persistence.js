const fs = require("fs");
const path = require("path");

const defaultFilePath = path.resolve(__dirname, "../../.data/ops-state.json");

function getFilePath() {
  return process.env.OPS_STATE_FILE || defaultFilePath;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyState() {
  return {
    drafts: [],
    events: [],
    previewTokens: [],
    repoChanges: [],
    alerts: [],
    customerNotifications: [],
    supportCases: [],
    seoMetrics: [],
  };
}

function loadState() {
  const filePath = getFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return emptyState();
    }
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return emptyState();
    }
    const parsed = JSON.parse(raw);
    return {
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      previewTokens: Array.isArray(parsed.previewTokens) ? parsed.previewTokens : [],
      repoChanges: Array.isArray(parsed.repoChanges) ? parsed.repoChanges : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      customerNotifications: Array.isArray(parsed.customerNotifications) ? parsed.customerNotifications : [],
      supportCases: Array.isArray(parsed.supportCases) ? parsed.supportCases : [],
      seoMetrics: Array.isArray(parsed.seoMetrics) ? parsed.seoMetrics : [],
    };
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  const filePath = getFilePath();
  ensureParentDir(filePath);
  let existing = {};
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      existing = raw && raw.trim() ? JSON.parse(raw) : {};
    }
  } catch {
    existing = {};
  }
  const merged = { ...existing, ...state };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  return filePath;
}

module.exports = {
  getFilePath,
  loadState,
  saveState,
};
