const draftRecords = [];

function now() {
  return "2026-06-28T00:00:00.000Z";
}

function upsertDraft(record) {
  const existingIndex = draftRecords.findIndex((item) => item.id === record.id);
  const nextRecord = {
    ...record,
    updatedAt: now(),
  };

  if (existingIndex >= 0) {
    draftRecords[existingIndex] = nextRecord;
  } else {
    draftRecords.unshift({
      ...nextRecord,
      createdAt: record.createdAt ?? now(),
    });
  }

  return nextRecord;
}

function createContentDraft(input) {
  const record = {
    id: input.id,
    schemaType: input.schemaType,
    entityType: input.entityType,
    targetType: input.targetType,
    targetId: input.targetId,
    targetPath: input.targetPath,
    contentRef: input.contentRef,
    status: input.status ?? "published",
    payload: input.payload,
    meta: input.meta ?? {},
    createdAt: now(),
    updatedAt: now(),
  };

  return upsertDraft(record);
}

function recordRollback(input) {
  const record = {
    id: input.id,
    schemaType: input.schemaType,
    entityType: input.entityType,
    targetType: input.targetType,
    targetId: input.targetId,
    targetPath: input.targetPath,
    contentRef: input.contentRef,
    status: "rolled_back",
    payload: input.payload,
    meta: input.meta ?? {},
    createdAt: now(),
    updatedAt: now(),
  };

  return upsertDraft(record);
}

function listDrafts(filters = {}) {
  return draftRecords.filter((record) => {
    if (filters.entityType && record.entityType !== filters.entityType) return false;
    if (filters.targetId && record.targetId !== filters.targetId) return false;
    if (filters.status && record.status !== filters.status) return false;
    return true;
  });
}

function getDraftById(id) {
  return draftRecords.find((record) => record.id === id);
}

module.exports = {
  createContentDraft,
  getDraftById,
  listDrafts,
  recordRollback,
};

