const { buildRevalidatePaths, getAssetConfig, P0_ASSET_CONFIG } = require("./p0-assets");
const { validateDocumentShape, validateDocuments } = require("./validators");
const { triggerRevalidate } = require("./revalidate");
const { buildDocumentExpectations, classifyVerification, verifyPublishedDocuments } = require("./verify");

module.exports = {
  P0_ASSET_CONFIG,
  getAssetConfig,
  buildRevalidatePaths,
  validateDocumentShape,
  validateDocuments,
  triggerRevalidate,
  buildDocumentExpectations,
  classifyVerification,
  verifyPublishedDocuments,
};
