function resolveCmsAdapter() {
  const adapterName = process.env.CMS_ADAPTER || "local";

  if (adapterName === "sanity") {
    return require("./sanity-adapter");
  }

  return require("./local-adapter");
}

const cmsAdapter = resolveCmsAdapter();

module.exports = {
  cmsAdapter,
  adapterName: cmsAdapter.adapterName,
  createContentDraft: (...args) => cmsAdapter.createContentDraft(...args),
  getDraftById: (...args) => cmsAdapter.getDraftById(...args),
  listDrafts: (...args) => cmsAdapter.listDrafts(...args),
  recordRollback: (...args) => cmsAdapter.recordRollback(...args),
  restorePublishedDocuments: (...args) => cmsAdapter.restorePublishedDocuments(...args),
};
