function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computeRates(metrics) {
  const views = Math.max(1, normalizeNumber(metrics?.views));
  const ctaClicks = normalizeNumber(metrics?.ctaClicks);
  const addToCart = normalizeNumber(metrics?.addToCart);
  return {
    ctaRate: ctaClicks / views,
    addToCartRate: addToCart / views,
    postClickAtcRate: addToCart / Math.max(1, ctaClicks),
  };
}

module.exports = {
  normalizeNumber,
  computeRates,
};
