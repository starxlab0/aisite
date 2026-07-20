const { collectionTargets, faqTargets, guideTargets, productTargets } = require("../data/bootstrap-content");

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

  Object.values(guideTargets).forEach((t) => {
    items.push({
      type: "guide",
      id: t.targetId,
      title: t.title,
      targetPath: t.targetPath,
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

  if (type === "guide") {
    const t = guideTargets[`guide:${id}`];
    if (!t) return null;
    return {
      type: "guide",
      id: t.targetId,
      title: t.title,
      targetPath: t.targetPath,
    };
  }

  return null;
}

module.exports = {
  listAllTargets,
  findTarget,
};
