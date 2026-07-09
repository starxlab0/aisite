const { readJsonBody, sendJson } = require("../ops/json");
const { requireSignalsIngest } = require("./auth");
const { runBatchSnapshots } = require("./batch");
const {
  buildTargetSummary,
  getSignalsRuntimeStatus,
  listTargetSummaries,
  trackEvent,
  createSnapshotFromEvents,
  ingestSnapshot,
  listSnapshots,
  getPurchaseDiagnostics,
  listRecommendations,
  listRecommendationRuleStats,
  resolveRecommendation,
  createRuleTuningProposal,
  getRuleTuningProposal,
  listRuleTuningProposals,
  transitionRuleTuningProposal,
  syncIncidentFollowupProposalsForRecommendations,
  maybeOpenAiConciergeDraftPullRequestForProposal,
} = require("./store");
const { getOpsAuthContext, requireOpsAdmin, requireOpsCapability } = require("../ops/auth");

function okEnvelope(data, extra = {}) {
  return {
    service: "control-plane",
    status: "ok",
    ...extra,
    data,
  };
}

function errorEnvelope(message, extra = {}) {
  return {
    service: "control-plane",
    status: "error",
    message,
    ...extra,
  };
}

function actorFromReq(req) {
  const auth = getOpsAuthContext(req);
  if (auth.ok && auth.token) {
    return `${auth.role}:token:${String(auth.token).slice(0, 4)}…`;
  }
  const token = req.headers["x-signals-token"];
  if (!token) return "anonymous";
  return `signals:${String(token).slice(0, 4)}…`;
}

async function handleSignalsRoute(req, res, url) {
  if (!url.pathname.startsWith("/signals") && !url.pathname.startsWith("/recommendations")) return false;

  // POST /signals/track
  if (url.pathname === "/signals/track" && req.method === "POST") {
    const auth = requireSignalsIngest(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }

    const body = (await readJsonBody(req)) ?? {};
    const targetType = body.targetType;
    const targetId = body.targetId;
    const eventType = body.eventType;
    if (!targetType || !targetId || !eventType) {
      sendJson(res, 400, errorEnvelope("targetType, targetId and eventType are required"));
      return true;
    }

    if (!["view", "cta", "add_to_cart", "purchase"].includes(eventType)) {
      sendJson(res, 400, errorEnvelope("Invalid eventType"));
      return true;
    }

    const record = trackEvent(body);
    sendJson(res, 200, okEnvelope({ event: record }));
    return true;
  }

  // POST /signals/snapshot
  if (url.pathname === "/signals/snapshot" && req.method === "POST") {
    const auth = requireOpsCapability(req, "capture_signals_snapshot");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }

    const body = (await readJsonBody(req)) ?? {};
    const targetType = body.targetType;
    const targetId = body.targetId;
    if (!targetType || !targetId) {
      sendJson(res, 400, errorEnvelope("targetType and targetId are required"));
      return true;
    }

    const result = createSnapshotFromEvents(body);
    sendJson(res, 200, okEnvelope(result));
    return true;
  }

  // POST /signals/snapshot/run
  if (url.pathname === "/signals/snapshot/run" && req.method === "POST") {
    const auth = requireOpsAdmin(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }

    const body = (await readJsonBody(req)) ?? {};
    const result = await runBatchSnapshots({
      targetType: body.targetType,
      targetId: body.targetId,
      windowDays: body.windowDays,
    });
    sendJson(res, 200, okEnvelope(result));
    return true;
  }

  // POST /signals/ingest
  if (url.pathname === "/signals/ingest" && req.method === "POST") {
    const auth = requireSignalsIngest(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }

    const body = (await readJsonBody(req)) ?? {};
    const targetType = body.targetType;
    const targetId = body.targetId;
    if (!targetType || !targetId) {
      sendJson(res, 400, errorEnvelope("targetType and targetId are required"));
      return true;
    }

    const result = ingestSnapshot(body);
    sendJson(res, 200, okEnvelope(result));
    return true;
  }

  // GET /signals?targetType=&targetId=
  if (url.pathname === "/signals" && req.method === "GET") {
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const items = listSnapshots({ targetType, targetId });
    sendJson(res, 200, okEnvelope({ items, total: items.length }));
    return true;
  }

  // GET /signals/status
  if (url.pathname === "/signals/status" && req.method === "GET") {
    const status = getSignalsRuntimeStatus();
    sendJson(res, 200, okEnvelope(status));
    return true;
  }

  // GET /signals/overview?targetType=&targetId=
  if (url.pathname === "/signals/overview" && req.method === "GET") {
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;

    if (targetType && targetId) {
      const item = buildTargetSummary({ targetType, targetId });
      sendJson(res, 200, okEnvelope({ item }));
      return true;
    }

    const items = listTargetSummaries({ targetType, targetId });
    const stats = {
      total: items.length,
      needsAttention: items.filter((item) => item.activeRecommendationsCount > 0).length,
      critical: items.filter((item) => item.maxSeverity === "critical").length,
      warning: items.filter((item) => item.maxSeverity === "warning").length,
      info: items.filter((item) => item.maxSeverity === "info").length,
    };

    sendJson(res, 200, okEnvelope({ items, stats }));
    return true;
  }

  // GET /signals/purchase-diagnostics?targetType=&targetId=&windowDays=
  if (url.pathname === "/signals/purchase-diagnostics" && req.method === "GET") {
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const windowDays = url.searchParams.get("windowDays") || undefined;
    const data = getPurchaseDiagnostics({ targetType, targetId, windowDays });
    sendJson(res, 200, okEnvelope(data));
    return true;
  }

  // GET /recommendations?status=&targetType=&targetId=
  if (url.pathname === "/recommendations" && req.method === "GET") {
    const statusParam = url.searchParams.get("status") || undefined;
    const status =
      statusParam && !statusParam.includes(",") ? statusParam : undefined;
    const statuses =
      statusParam && statusParam.includes(",")
        ? statusParam.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined;
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const items = listRecommendations({ status, statuses, targetType, targetId });
    sendJson(res, 200, okEnvelope({ items, total: items.length }));
    return true;
  }

  // GET /recommendations/rules?sinceDays=
  if (url.pathname === "/recommendations/rules" && req.method === "GET") {
    const sinceDays = url.searchParams.get("sinceDays");
    const data = listRecommendationRuleStats({ sinceDays });
    sendJson(res, 200, okEnvelope(data));
    return true;
  }

  // GET /recommendations/rules/proposals?limit=&ruleId=
  if (url.pathname === "/recommendations/rules/proposals" && req.method === "GET") {
    const limit = url.searchParams.get("limit");
    const ruleId = url.searchParams.get("ruleId") || undefined;
    const data = listRuleTuningProposals({ limit, ruleId });
    sendJson(res, 200, okEnvelope(data));
    return true;
  }

  // GET /recommendations/rules/proposals/:id
  if (url.pathname.startsWith("/recommendations/rules/proposals/") && !url.pathname.endsWith("/transition") && req.method === "GET") {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[3];
    const proposal = getRuleTuningProposal(id);
    if (!proposal) {
      sendJson(res, 404, errorEnvelope("proposal not found"));
      return true;
    }
    sendJson(res, 200, okEnvelope({ proposal }));
    return true;
  }

  // POST /recommendations/rules/proposals (create)
  if (url.pathname === "/recommendations/rules/proposals" && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const ruleId = body.ruleId;
    const note = body.note;
    const sinceDays = body.sinceDays;
    if (!ruleId) {
      sendJson(res, 400, errorEnvelope("ruleId is required"));
      return true;
    }
    const proposal = createRuleTuningProposal({ ruleId, actor: actorFromReq(req), note, sinceDays });
    if (!proposal) {
      sendJson(res, 404, errorEnvelope("rule not found or insufficient data"));
      return true;
    }
    sendJson(res, 200, okEnvelope({ proposal }));
    return true;
  }

  // POST /recommendations/rules/proposals/:id/transition
  if (url.pathname.startsWith("/recommendations/rules/proposals/") && url.pathname.endsWith("/transition") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[3];
    const body = (await readJsonBody(req)) ?? {};
    const nextStatus = body.status;
    const note = body.note;
    const appliedConfig = body.appliedConfig;
    if (!nextStatus) {
      sendJson(res, 400, errorEnvelope("status is required"));
      return true;
    }
    const result = transitionRuleTuningProposal({ id, actor: actorFromReq(req), nextStatus, note, appliedConfig });
    if (!result) {
      sendJson(res, 404, errorEnvelope("proposal not found"));
      return true;
    }
    if (result.status === "blocked") {
      sendJson(res, 409, errorEnvelope(result.message));
      return true;
    }
    if (result?.proposal?.ruleId === "ai-concierge-strategy" && result?.proposal?.status === "approved") {
      try {
        await maybeOpenAiConciergeDraftPullRequestForProposal({
          proposalId: result.proposal.id,
          actor: actorFromReq(req),
        });
      } catch {
        // non-blocking
      }
    }
    sendJson(res, 200, okEnvelope({ proposal: result.proposal }));
    return true;
  }

  // POST /recommendations/incidents/sync
  // 用于把高优先级的 publish verification follow-up recommendation 自动推进成 incident follow-up proposal（幂等）。
  if (url.pathname === "/recommendations/incidents/sync" && req.method === "POST") {
    const auth = requireOpsAdmin(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const limit = body.limit ?? 10;
    const dryRun = Boolean(body.dryRun);
    const result = syncIncidentFollowupProposalsForRecommendations({ actor: actorFromReq(req), limit, dryRun });
    sendJson(res, 200, okEnvelope(result));
    return true;
  }

  // POST /recommendations/:id/resolve
  if (url.pathname.startsWith("/recommendations/") && url.pathname.endsWith("/resolve") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message));
      return true;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[1];
    const body = (await readJsonBody(req)) ?? {};
    const note = body.note;
    const status = body.status || "resolved";
    const updated = resolveRecommendation(id, actorFromReq(req), note, status);
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Recommendation not found" });
      return true;
    }
    sendJson(res, 200, okEnvelope({ recommendation: updated }));
    return true;
  }

  sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Unknown signals route" });
  return true;
}

module.exports = {
  handleSignalsRoute,
};
