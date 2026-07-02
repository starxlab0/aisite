const { createContentDraft, listDrafts, restorePublishedDocuments } = require("../cms-adapters");
const { buildMirroredDocuments } = require("../cms-adapters/schema-documents");

function nowIso() {
  return "2026-06-28T00:00:00.000Z";
}

function summarizeDraftRecord(draftRecord) {
  return {
    id: draftRecord.id,
    schemaType: draftRecord.schemaType,
    status: draftRecord.status,
    revalidate: draftRecord.revalidate ?? null,
  };
}

function buildPublishedResponse({
  workflow,
  target,
  targetPath,
  publishRef,
  publishedAt,
  checksum,
  previousRef,
  summary,
  draftRecord,
  nextAction = null,
  extra = {},
}) {
  return {
    workflow,
    status: "published",
    target,
    publishPayload: {
      targetPath,
      contentRef: publishRef,
      publishedAt,
      checksum,
    },
    publishedSnapshot: {
      ref: publishRef,
      previousRef,
      publishedAt,
      summary,
    },
    draftRecord: summarizeDraftRecord(draftRecord),
    linkedDocuments: draftRecord.linkedDocuments ?? [],
    revalidate: draftRecord.revalidate ?? null,
    ...extra,
    ...(nextAction ? { nextAction } : {}),
  };
}

async function publishWorkflowDraft({
  workflow,
  schemaType,
  entityType,
  target,
  publishRef,
  payload,
  summary,
  nextAction = null,
  meta = {},
  extra = {},
}) {
  const publishedAt = nowIso();
  const draftRecord = await createContentDraft({
    id: `draft-${publishRef}`,
    schemaType,
    entityType,
    targetType: target.type,
    targetId: target.id,
    targetPath: target.path,
    contentRef: publishRef,
    status: "published",
    payload,
    meta: {
      workflow,
      ...meta,
    },
  });

  return buildPublishedResponse({
    workflow,
    target,
    targetPath: target.path,
    publishRef,
    publishedAt,
    checksum: extra.checksum ?? `${target.id}-${publishRef}`,
    previousRef: meta.previousRef ?? null,
    summary,
    draftRecord,
    nextAction,
    extra,
  });
}

async function findPublishedDraftByRef({ targetId, entityType, contentRef }) {
  const drafts = await listDrafts({ targetId, status: "published" });
  return drafts.find(
    (draft) =>
      draft.entityType === entityType &&
      (!contentRef || draft.contentRef === contentRef),
  ) ?? null;
}

async function rollbackWorkflowDraft({
  workflow,
  schemaType,
  entityType,
  target,
  rollbackToRef,
  reason,
  previousPublishedSnapshot = null,
}) {
  const drafts = await listDrafts({ targetId: target.id, status: "published" });
  const rollbackSource =
    drafts.find((draft) => draft.entityType === entityType && draft.contentRef === rollbackToRef) ?? null;
  const currentPublished =
    drafts.find((draft) => draft.entityType === entityType) ?? null;

  if (!rollbackSource) {
    return {
      workflow,
      status: "blocked",
      reason: `rollback source not found for ${rollbackToRef}`,
      target,
    };
  }

  const rollbackRecord = {
    id: `draft-rollback-${workflow}-${target.id}-${rollbackToRef ?? "current"}`,
    schemaType,
    entityType,
    targetType: target.type,
    targetId: target.id,
    targetPath: target.path,
    contentRef: rollbackToRef,
    payload: {
      action: "rollback",
      rollbackToRef,
    },
    meta: {
      workflow,
      restoredFrom: rollbackToRef,
    },
  };

  const restored = await restorePublishedDocuments({
    rollbackRecord,
    snapshotBefore: buildMirroredDocuments(rollbackSource).map((item) => item.document),
    currentDocuments: currentPublished ? buildMirroredDocuments(currentPublished) : [],
  });

  return {
    workflow,
    status: "rolled_back",
    target,
    rollbackPayload: {
      targetPath: target.path,
      rollbackToRef,
      rolledBackAt: nowIso(),
      reason,
    },
    previousPublishedSnapshot,
    draftRecord: summarizeDraftRecord(restored.rollbackRecord),
    linkedDocuments: restored.rollbackRecord.linkedDocuments ?? [],
    restoredDocuments: restored.restoredDocuments ?? [],
    deletedDocumentIds: restored.deletedDocumentIds ?? [],
    revalidate: restored.revalidate ?? null,
  };
}

module.exports = {
  buildPublishedResponse,
  publishWorkflowDraft,
  findPublishedDraftByRef,
  rollbackWorkflowDraft,
};

