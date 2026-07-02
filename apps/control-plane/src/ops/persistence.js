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
    };
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  const filePath = getFilePath();
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return filePath;
}

module.exports = {
  getFilePath,
  loadState,
  saveState,
};
