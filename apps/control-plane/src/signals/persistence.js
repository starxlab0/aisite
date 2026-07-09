const fs = require("fs");
const path = require("path");

const defaultFilePath = path.resolve(__dirname, "../../.data/signals-state.json");

function getFilePath() {
  return process.env.SIGNALS_STATE_FILE || defaultFilePath;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function emptyState() {
  return {
    events: [],
    snapshots: [],
    recommendations: [],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
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
      events: Array.isArray(parsed.events) ? parsed.events : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      meta: parsed.meta && typeof parsed.meta === "object"
        ? {
            lastBatchRun: parsed.meta.lastBatchRun ?? null,
            batchRuns: Array.isArray(parsed.meta.batchRuns) ? parsed.meta.batchRuns : [],
            consecutiveBatchFailures:
              Number.isFinite(Number(parsed.meta.consecutiveBatchFailures))
                ? Number(parsed.meta.consecutiveBatchFailures)
                : 0,
          }
        : {
            lastBatchRun: null,
            batchRuns: [],
            consecutiveBatchFailures: 0,
          },
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
