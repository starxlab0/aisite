const { getSanityClient } = require("./sanity-client");
const { buildMirroredDocuments } = require("./schema-documents");
const { validateDocuments } = require("../publish/validators");
const { buildRevalidatePaths } = require("../publish/p0-assets");
const { triggerRevalidate } = require("../publish/revalidate");
const { verifyPublishedDocuments } = require("../publish/verify");

const CONTENT_DRAFT_TYPE = "contentDraft";

function toSanityDocument(record) {
  return {
    _id: record.id,
    _type: CONTENT_DRAFT_TYPE,
    schemaType: record.schemaType,
    entityType: record.entityType,
    targetType: record.targetType,
    targetId: record.targetId,
    targetPath: record.targetPath,
    contentRef: record.contentRef,
    status: record.status,
    payload: record.payload,
    meta: record.meta ?? {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromSanityDocument(doc) {
  if (!doc) return null;

  return {
    id: doc._id,
    schemaType: doc.schemaType,
    entityType: doc.entityType,
    targetType: doc.targetType,
    targetId: doc.targetId,
    targetPath: doc.targetPath,
    contentRef: doc.contentRef,
    status: doc.status,
    payload: doc.payload,
    meta: doc.meta ?? {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function now() {
  return "2026-06-28T00:00:00.000Z";
}

async function createContentDraft(input) {
  const client = getSanityClient("createContentDraft");
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

  const mirroredDocuments = buildMirroredDocuments(record);
  const validation = validateDocuments(mirroredDocuments.map((item) => item.document));
  if (!validation.ok) {
    const error = new Error("sanity publish validation failed");
    error.details = validation.issues;
    throw error;
  }

  const snapshotBefore = mirroredDocuments.length
    ? await client.fetch(`*[_id in $ids]{..., _id, _type}`, {
        ids: mirroredDocuments.map((item) => item.id),
      })
    : [];
  const tx = client.transaction().createOrReplace(toSanityDocument(record));
  mirroredDocuments.forEach((item) => {
    tx.createOrReplace(item.document);
  });

  await tx.commit();
  const requestedPaths = buildRevalidatePaths(mirroredDocuments.map((item) => item.document));
  const revalidate = await triggerRevalidate(requestedPaths);
  const verification = await verifyPublishedDocuments(
    mirroredDocuments.map((item) => item.document),
    requestedPaths,
  );

  return {
    ...record,
    linkedDocuments: mirroredDocuments.map((item) => ({
      id: item.id,
      type: item.type,
      targetId: item.targetId,
      mode: "published",
    })),
    snapshotBefore,
    revalidate,
    verification,
  };
}

async function recordRollback(input) {
  const client = getSanityClient("recordRollback");
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

  const result = await client.createOrReplace(toSanityDocument(record));
  const mirroredDocuments = buildMirroredDocuments(record);
  const requestedPaths = buildRevalidatePaths(mirroredDocuments.map((item) => item.document));
  const revalidate = await triggerRevalidate(requestedPaths);
  const verification = await verifyPublishedDocuments(
    mirroredDocuments.map((item) => item.document),
    requestedPaths,
  );
  return {
    ...fromSanityDocument(result),
    linkedDocuments: mirroredDocuments.map((item) => ({
      id: item.id,
      type: item.type,
      targetId: item.targetId,
      mode: "rollback-reference",
    })),
    revalidate,
    verification,
  };
}

async function restorePublishedDocuments({ rollbackRecord, snapshotBefore = [], currentDocuments = [] }) {
  const client = getSanityClient("restorePublishedDocuments");
  const tx = client.transaction().createOrReplace(toSanityDocument(rollbackRecord));

  const snapshotIds = new Set();
  snapshotBefore.forEach((document) => {
    if (!document?._id || !document?._type) return;
    snapshotIds.add(document._id);
    tx.createOrReplace(document);
  });

  const deleteIds = currentDocuments
    .map((item) => item.id ?? item._id)
    .filter((id) => id && !snapshotIds.has(id));
  deleteIds.forEach((id) => tx.delete(id));

  await tx.commit();

  const requestedPaths = buildRevalidatePaths([
    ...snapshotBefore,
    ...currentDocuments.map((item) => item.document ?? item).filter(Boolean),
  ]);
  const revalidate = await triggerRevalidate(requestedPaths);
  const verification = await verifyPublishedDocuments(snapshotBefore, requestedPaths);

  return {
    rollbackRecord: {
      ...rollbackRecord,
      linkedDocuments: currentDocuments.map((item) => ({
        id: item.id ?? item._id,
        type: item.type ?? item._type,
        targetId: item.targetId ?? item.document?.targetId,
        mode: "rollback-restored",
      })),
    },
    restoredDocuments: snapshotBefore.map((document) => ({
      id: document._id,
      type: document._type,
      mode: "restored",
    })),
    deletedDocumentIds: deleteIds,
    revalidate,
    verification,
  };
}

async function getDraftById(id) {
  const client = getSanityClient("getDraftById");
  const query = `*[_type == "${CONTENT_DRAFT_TYPE}" && _id == $id][0]`;
  const result = await client.fetch(query, { id });
  return fromSanityDocument(result);
}

async function listDrafts(filters = {}) {
  const client = getSanityClient("listDrafts");
  const query = `*[
    _type == "${CONTENT_DRAFT_TYPE}"
    && (!defined($entityType) || entityType == $entityType)
    && (!defined($targetId) || targetId == $targetId)
    && (!defined($status) || status == $status)
  ] | order(updatedAt desc)`;

  const results = await client.fetch(query, {
    entityType: filters.entityType ?? null,
    targetId: filters.targetId ?? null,
    status: filters.status ?? null,
  });

  return results.map(fromSanityDocument);
}

module.exports = {
  adapterName: "sanity",
  createContentDraft,
  getDraftById,
  listDrafts,
  recordRollback,
  restorePublishedDocuments,
};
