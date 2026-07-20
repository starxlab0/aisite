function defaultRateDelta(field, post, pre) {
  return (post?.funnel?.[field] ?? 0) - (pre?.funnel?.[field] ?? 0);
}

function computeFunnelObservationEffectFromAnchor({
  anchorAt,
  lookbackDays,
  listEvents,
  eventFilter,
  summarizeWindowEvents,
  now,
}) {
  const anchorTs = Date.parse(String(anchorAt || ""));
  if (!Number.isFinite(anchorTs)) return null;
  const normalizedDays = Math.max(1, Number(lookbackDays || 7));
  const windowMs = normalizedDays * 24 * 60 * 60 * 1000;
  const preStart = anchorTs - windowMs;
  const plannedPostEnd = anchorTs + windowMs;
  const nowTs = Number(now || Date.now());
  const postEnd = Math.min(plannedPostEnd, nowTs);
  const postObservedDays = Math.max(0, (postEnd - anchorTs) / (24 * 60 * 60 * 1000));
  const postWindowComplete = nowTs >= plannedPostEnd;

  const sinceAt = new Date(preStart).toISOString();
  const windowEvents = (typeof listEvents === "function" ? listEvents({ sinceAt }) : []).filter((event) => {
    const t = Date.parse(String(event?.at || ""));
    if (!Number.isFinite(t)) return false;
    if (t < preStart || t > postEnd) return false;
    return typeof eventFilter === "function" ? eventFilter(event) : true;
  });

  const preEvents = windowEvents.filter((event) => {
    const t = Date.parse(String(event?.at || ""));
    return Number.isFinite(t) && t >= preStart && t < anchorTs;
  });
  const postEvents = windowEvents.filter((event) => {
    const t = Date.parse(String(event?.at || ""));
    return Number.isFinite(t) && t >= anchorTs && t <= postEnd;
  });

  const pre = summarizeWindowEvents(preEvents);
  const post = summarizeWindowEvents(postEvents);
  return {
    computedAt: new Date(nowTs).toISOString(),
    windowDays: normalizedDays,
    appliedAt: new Date(anchorTs).toISOString(),
    window: {
      preStart: new Date(preStart).toISOString(),
      preEnd: new Date(anchorTs).toISOString(),
      postStart: new Date(anchorTs).toISOString(),
      postEnd: new Date(postEnd).toISOString(),
    },
    coverage: {
      plannedPostEnd: new Date(plannedPostEnd).toISOString(),
      postObservedDays: Math.round(postObservedDays * 10) / 10,
      postWindowComplete,
    },
    pre,
    post,
  };
}

function attachFunnelRateDeltas(effect, fields = []) {
  if (!effect) return null;
  return {
    ...effect,
    delta: fields.reduce((acc, field) => {
      acc[field] = defaultRateDelta(field, effect.post, effect.pre);
      return acc;
    }, {}),
  };
}

function judgeRateDeltaWindow({
  effect,
  minSampleSize = 50,
  sampleField = "attributedProductViews",
  positiveThresholds = {},
  negativeThresholds = {},
}) {
  if (!effect) return null;
  const preSample = Number(effect?.pre?.funnel?.[sampleField] ?? 0);
  const postSample = Number(effect?.post?.funnel?.[sampleField] ?? 0);
  if (preSample + postSample < minSampleSize) {
    return { disposition: "observe", reason: "low_volume" };
  }

  let positive = 0;
  let negative = 0;
  Object.entries(positiveThresholds).forEach(([field, threshold]) => {
    const value = Number(effect?.delta?.[field] ?? 0);
    if (value > Number(threshold)) positive += 1;
  });
  Object.entries(negativeThresholds).forEach(([field, threshold]) => {
    const value = Number(effect?.delta?.[field] ?? 0);
    if (value < -Math.abs(Number(threshold))) negative += 1;
  });

  if (!effect.coverage?.postWindowComplete) return { disposition: "observe", reason: "window_running", positive, negative };
  if (negative > 0 && positive === 0) return { disposition: "risk", reason: "negative_delta", positive, negative };
  if (positive > 0 && negative === 0) return { disposition: "success", reason: "positive_delta", positive, negative };
  return { disposition: "steady", reason: "mixed_or_flat", positive, negative };
}

module.exports = {
  computeFunnelObservationEffectFromAnchor,
  attachFunnelRateDeltas,
  judgeRateDeltaWindow,
};
