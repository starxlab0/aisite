function getSanityConfig() {
  const projectId =
    process.env.SANITY_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset =
    process.env.SANITY_DATASET || process.env.NEXT_PUBLIC_SANITY_DATASET;
  const token = process.env.SANITY_API_TOKEN;

  return {
    projectId,
    dataset,
    token,
    apiVersion: "2026-01-01",
  };
}

function assertSanityConfig(config, methodName) {
  const missing = [];
  if (!config.projectId) missing.push("SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_PROJECT_ID");
  if (!config.dataset) missing.push("SANITY_DATASET or NEXT_PUBLIC_SANITY_DATASET");
  if (!config.token) missing.push("SANITY_API_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `CMS adapter "sanity" cannot call ${methodName}(): missing env ${missing.join(", ")}`,
    );
  }
}

function getSanityClient(methodName) {
  const { createClient } = require("@sanity/client");
  const config = getSanityConfig();
  assertSanityConfig(config, methodName);

  return createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: config.apiVersion,
    token: config.token,
    useCdn: false,
  });
}

module.exports = {
  getSanityClient,
  getSanityConfig,
};
