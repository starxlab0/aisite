const { getAssetConfig } = require("./p0-assets");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getByPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function pathAllowed(path, allowed) {
  return allowed.some((entry) => path === entry || path.startsWith(`${entry}.`));
}

function collectLeafPaths(value, prefix = "") {
  if (Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  if (!isPlainObject(value)) {
    return prefix ? [prefix] : [];
  }
  const entries = Object.entries(value);
  if (!entries.length) {
    return prefix ? [prefix] : [];
  }
  return entries.flatMap(([key, child]) =>
    collectLeafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function validateDocumentShape(document) {
  const config = getAssetConfig(document?._type);
  if (!config) {
    return { ok: true, errors: [] };
  }

  const errors = [];
  config.required.forEach((fieldPath) => {
    const value = getByPath(document, fieldPath);
    const missing =
      value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (missing) {
      errors.push(`missing required field: ${fieldPath}`);
    }
  });

  collectLeafPaths(document)
    .filter((path) => !path.startsWith("_"))
    .forEach((fieldPath) => {
      if (!pathAllowed(fieldPath, config.allowed)) {
        errors.push(`field not allowed for ${document._type}: ${fieldPath}`);
      }
    });

  if (document?._type === "faqItem" && String(document.answer || "").length > 1500) {
    errors.push("faqItem.answer exceeds 1500 characters");
  }

  if (document?._type === "productContent" && Array.isArray(document.hero?.media) && document.hero.media.length > 12) {
    errors.push("productContent.hero.media exceeds 12 items");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function validateDocuments(documents = []) {
  const issues = documents.flatMap((document) => {
    const result = validateDocumentShape(document);
    return result.errors.map((error) => ({
      documentId: document?._id ?? "unknown",
      documentType: document?._type ?? "unknown",
      error,
    }));
  });

  return {
    ok: issues.length === 0,
    issues,
  };
}

module.exports = {
  validateDocumentShape,
  validateDocuments,
};

