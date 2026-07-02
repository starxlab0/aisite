const crypto = require("crypto");
const { loadState, saveState } = require("./persistence");

const persisted = loadState();
const opsDrafts = new Map(
  (Array.isArray(persisted.drafts) ? persisted.drafts : []).map((item) => [item.id, item]),
);
const opsEvents = Array.isArray(persisted.events) ? persisted.events : [];
const previewTokens = new Map(
  (Array.isArray(persisted.previewTokens) ? persisted.previewTokens : []).map((item) => [item.token, item]),
);

function now() {
  return new Date().toISOString();
}

function nextId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function persist() {
  saveState({
    drafts: Array.from(opsDrafts.values()),
    events: opsEvents,
    previewTokens: Array.from(previewTokens.values()),
  });
}

function createEvent(event) {
  const record = {
    id: nextId("evt"),
    at: now(),
    ...event,
  };
  opsEvents.unshift(record);
  persist();
  return record;
}

function listEvents(filters = {}) {
  const q = typeof filters.q === "string" ? filters.q.trim().toLowerCase() : "";
  return opsEvents.filter((event) => {
    if (filters.targetType && event.target?.type !== filters.targetType) return false;
    if (filters.targetId && event.target?.id !== filters.targetId) return false;
    if (filters.action && event.action !== filters.action) return false;
    if (filters.actor && String(event.actor || "").toLowerCase() !== String(filters.actor).toLowerCase()) return false;
    if (q) {
      const hay = [
        event.action,
        event.actor,
        event.target?.type,
        event.target?.id,
        event.draftId,
        event.note,
        event.previewUrl,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function createOpsDraft(input) {
  const record = {
    id: nextId("draft"),
    status: "draft_generated",
    createdAt: now(),
    updatedAt: now(),
    review: null,
    ...input,
  };
  opsDrafts.set(record.id, record);
  persist();
  return record;
}

function updateOpsDraft(draftId, patch) {
  const existing = opsDrafts.get(draftId);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };
  opsDrafts.set(draftId, next);
  persist();
  return next;
}

function getOpsDraft(draftId) {
  return opsDrafts.get(draftId) ?? null;
}

function listOpsDrafts(filters = {}) {
  const items = Array.from(opsDrafts.values());
  return items.filter((draft) => {
    if (filters.targetType && draft.targetType !== filters.targetType) return false;
    if (filters.targetId && draft.targetId !== filters.targetId) return false;
    if (filters.status && draft.status !== filters.status) return false;
    return true;
  });
}

function createPreviewToken({ draftId, targetPath, ttlSeconds }) {
  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = Date.now() + Math.max(60, ttlSeconds ?? 3600) * 1000;
  const record = {
    token,
    draftId,
    targetPath,
    createdAt: now(),
    expiresAt,
    revokedAt: null,
  };
  previewTokens.set(token, record);
  persist();
  return record;
}

function listPreviewTokens(filters = {}) {
  const items = Array.from(previewTokens.values()).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
  return items.filter((token) => {
    if (filters.draftId && token.draftId !== filters.draftId) return false;
    if (filters.draftIds && !filters.draftIds.includes(token.draftId)) return false;
    return true;
  });
}

function revokePreviewToken(token) {
  const existing = previewTokens.get(token);
  if (!existing) return null;
  const next = {
    ...existing,
    revokedAt: now(),
  };
  previewTokens.set(token, next);
  persist();
  return next;
}

function resolvePreviewToken(token) {
  const record = previewTokens.get(token);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (Date.now() > record.expiresAt) return null;
  return record;
}

module.exports = {
  createEvent,
  listEvents,
  createOpsDraft,
  getOpsDraft,
  listOpsDrafts,
  updateOpsDraft,
  createPreviewToken,
  listPreviewTokens,
  revokePreviewToken,
  resolvePreviewToken,
  now,
};
