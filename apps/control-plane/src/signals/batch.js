const { listAllTargets } = require("../ops/targets");
const { listDrafts } = require("../cms-adapters");
const { createSnapshotFromEvents, recordBatchRun } = require("./store");

async function latestPublishedContentRefForTarget(target) {
  if (target.type === "product") {
    const drafts = await listDrafts({
      entityType: "product-content",
      targetId: target.id,
      status: "published",
    });
    return drafts[0]?.contentRef ?? null;
  }

  if (target.type === "collection") {
    const drafts = await listDrafts({
      entityType: "collection-page",
      targetId: target.id,
      status: "published",
    });
    return drafts[0]?.contentRef ?? null;
  }

  return null;
}

async function resolveBatchTargets(filters = {}) {
  const targets = listAllTargets().filter((target) => target.type === "product" || target.type === "collection");
  return targets.filter((target) => {
    if (filters.targetType && target.type !== filters.targetType) return false;
    if (filters.targetId && target.id !== filters.targetId) return false;
    return true;
  });
}

async function runBatchSnapshots(filters = {}) {
  try {
    const targets = await resolveBatchTargets(filters);
    const results = [];

    for (const target of targets) {
      const contentRef = await latestPublishedContentRefForTarget(target);
      const result = createSnapshotFromEvents({
        targetType: target.type,
        targetId: target.id,
        contentRef,
        windowDays: filters.windowDays ?? 7,
      });

      results.push({
        targetType: target.type,
        targetId: target.id,
        contentRef,
        snapshotId: result.snapshot.id,
        recommendationsCreated: result.recommendationsCreated.length,
        metrics: result.snapshot.metrics,
      });
    }

    const summary = {
      total: results.length,
      items: results,
    };
    recordBatchRun({
      status: "success",
      windowDays: filters.windowDays ?? 7,
      total: summary.total,
      items: summary.items,
    });
    return summary;
  } catch (error) {
    recordBatchRun({
      status: "error",
      windowDays: filters.windowDays ?? 7,
      total: 0,
      items: [],
      error: error instanceof Error ? error.message : "Unknown batch error",
    });
    throw error;
  }
}

module.exports = {
  runBatchSnapshots,
};
