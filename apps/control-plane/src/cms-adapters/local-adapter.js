const {
  createContentDraft,
  getDraftById,
  listDrafts,
  recordRollback,
} = require("../drafts/repository");
const { buildMirroredDocuments } = require("./schema-documents");
const { validateDocuments } = require("../publish/validators");
const { buildRevalidatePaths } = require("../publish/p0-assets");
const { verifyPublishedDocuments } = require("../publish/verify");

function linkedDocumentsWithMode(documents, mode) {
  return documents.map((item) => ({
    id: item.id,
    type: item.type,
    targetId: item.targetId,
    mode,
  }));
}

module.exports = {
  adapterName: "local",
  async createContentDraft(...args) {
    const record = createContentDraft(...args);
    const mirroredDocuments = buildMirroredDocuments(record);
    const validation = validateDocuments(mirroredDocuments.map((item) => item.document));
    if (!validation.ok) {
      const error = new Error("local publish validation failed");
      error.details = validation.issues;
      throw error;
    }
    return {
      ...record,
      linkedDocuments: linkedDocumentsWithMode(mirroredDocuments, "virtual"),
      revalidate: {
        ok: true,
        skipped: true,
        requested: buildRevalidatePaths(mirroredDocuments.map((item) => item.document)),
        revalidated: [],
      },
      verification: {
        ok: false,
        skipped: true,
        reason: "local-adapter",
        level: "skipped",
        summary: "verification skipped in local adapter",
        requested: buildRevalidatePaths(mirroredDocuments.map((item) => item.document)),
        results: [],
      },
    };
  },
  async getDraftById(...args) {
    return getDraftById(...args);
  },
  async listDrafts(...args) {
    return listDrafts(...args);
  },
  async recordRollback(...args) {
    const record = recordRollback(...args);
    const mirroredDocuments = buildMirroredDocuments(record);
    return {
      ...record,
      linkedDocuments: linkedDocumentsWithMode(mirroredDocuments, "virtual"),
      revalidate: {
        ok: true,
        skipped: true,
        requested: buildRevalidatePaths(mirroredDocuments.map((item) => item.document)),
        revalidated: [],
      },
      verification: {
        ok: false,
        skipped: true,
        reason: "local-adapter",
        level: "skipped",
        summary: "verification skipped in local adapter",
        requested: buildRevalidatePaths(mirroredDocuments.map((item) => item.document)),
        results: [],
      },
    };
  },
  async restorePublishedDocuments({ rollbackRecord, snapshotBefore = [], currentDocuments = [] }) {
    const persistedRollbackRecord = recordRollback(rollbackRecord);
    const requested = buildRevalidatePaths([
      ...snapshotBefore,
      ...currentDocuments.map((item) => item.document ?? item).filter(Boolean),
    ]);
    return {
      rollbackRecord: {
        ...persistedRollbackRecord,
        linkedDocuments: linkedDocumentsWithMode(currentDocuments, "rollback-restored-virtual"),
      },
      restoredDocuments: snapshotBefore.map((document) => ({
        id: document._id,
        type: document._type,
        mode: "restored-virtual",
      })),
      deletedDocumentIds: currentDocuments
        .map((item) => item.id ?? item._id)
        .filter((id) => id && !snapshotBefore.some((document) => document._id === id)),
      revalidate: {
        ok: true,
        skipped: true,
        requested,
        revalidated: [],
      },
      verification: {
        ok: false,
        skipped: true,
        reason: "local-adapter",
        level: "skipped",
        summary: "verification skipped in local adapter",
        requested,
        results: [],
      },
    };
  },
};
