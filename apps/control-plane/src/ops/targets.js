const { collectionTargets, faqTargets, productTargets } = require("../data/bootstrap-content");

function listAllTargets() {
  const items = [];

  Object.values(productTargets).forEach((t) => {
    items.push({
      type: "product",
      id: t.targetId,
      title: t.title,
      targetPath: t.targetPath,
    });
  });

  Object.values(collectionTargets).forEach((t) => {
    items.push({
      type: "collection",
      id: t.targetId,
      title: t.title,
      targetPath: t.targetPath,
    });
  });

  Object.values(faqTargets).forEach((t) => {
    items.push({
      type: "faq",
      id: `${t.targetType}:${t.targetId}`,
      title: t.title,
      targetPath: t.targetPath,
      faqTargetType: t.targetType,
      faqTargetId: t.targetId,
    });
  });

  return items;
}

function findTarget(type, id) {
  if (type === "product") {
    const t = productTargets[`product:${id}`];
    if (!t) return null;
    return {
      type: "product",
      id: t.targetId,
      title: t.title,
      targetPath: t.targetPath,
    };
  }

  if (type === "collection") {
    const t = collectionTargets[`collection:${id}`];
    if (!t) return null;
    return {
      type: "collection",
      id: t.targetId,
      title: t.title,
      targetPath: t.targetPath,
    };
  }

  if (type === "faq") {
    const [targetType, targetId] = id.split(":");
    const t = faqTargets[`${targetType}:${targetId}`];
    if (!t) return null;
    return {
      type: "faq",
      id: `${t.targetType}:${t.targetId}`,
      title: t.title,
      targetPath: t.targetPath,
      faqTargetType: t.targetType,
      faqTargetId: t.targetId,
    };
  }

  return null;
}

module.exports = {
  listAllTargets,
  findTarget,
};

