const { getOpsAuthContext, listCapabilitiesForRole, requireOpsCapability } = require("./auth");
const { readJsonBody, sendJson } = require("./json");
const { listAllTargets, findTarget } = require("./targets");
const { listDrafts } = require("../cms-adapters");
const {
  generateOpsDraft,
  getOpsDraft,
  listOpsDrafts,
  publishOpsDraft,
  reviewOpsDraft,
  rollbackTarget,
  submitOpsDraft,
  updateOpsDraftPayload,
} = require("./drafts");
const {
  createPreviewToken,
  createEvent,
  getOpsDraft: getDraft,
  listEvents,
  listPreviewTokens,
  resolvePreviewToken,
  revokePreviewToken,
} = require("./store");

function actorFromReq(req) {
  const auth = getOpsAuthContext(req);
  if (!auth.ok || !auth.token) return "anonymous";
  return `${auth.role}:token:${String(auth.token).slice(0, 4)}…`;
}

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

function detailTargetKey(type, id) {
  return type === "faq" ? id : undefined;
}

async function handleOpsRoute(req, res, url, cmsAdapter) {
  if (!url.pathname.startsWith("/ops")) return false;

  const actor = actorFromReq(req);

  if (url.pathname === "/ops/auth/status" && req.method === "GET") {
    const auth = getOpsAuthContext(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    sendJson(
      res,
      200,
      okEnvelope(
        {
          role: auth.role,
          capabilities: listCapabilitiesForRole(auth.role),
        },
        { cmsAdapter },
      ),
    );
    return true;
  }

  if (url.pathname === "/ops/targets" && req.method === "GET") {
    const type = url.searchParams.get("type") || undefined;
    const q = url.searchParams.get("q") || "";
    const items = listAllTargets()
      .filter((item) => (type ? item.type === type : true))
      .filter((item) =>
        q
          ? item.id.includes(q) ||
            item.title.toLowerCase().includes(q.toLowerCase()) ||
            item.targetPath.includes(q)
          : true,
      );

    sendJson(res, 200, okEnvelope({ items, total: items.length }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/targets/") && req.method === "GET") {
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[2];
    const id = type === "faq" ? `${parts[3]}:${parts[4]}` : parts[3];
    const target = findTarget(type, id);
    if (!target) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Target not found" });
      return true;
    }

    const drafts = listOpsDrafts({
      targetType: type === "faq" ? undefined : type,
      targetId: type === "faq" ? undefined : id,
    }).filter((d) => {
      if (type === "faq") {
        return d.type === "faq" && `${d.targetType}:${d.targetId}` === id;
      }
      return d.type === type && d.targetId === id;
    });

    const previewTokens = listPreviewTokens({
      draftIds: drafts.map((d) => d.id),
    });

    const events = listEvents({
      targetType: type,
      targetId: detailTargetKey(type, id) ?? id,
    });

    let publishedDrafts = [];
    if (type === "product") {
      publishedDrafts = await listDrafts({
        entityType: "product-content",
        targetId: id,
        status: "published",
      });
    } else if (type === "collection") {
      publishedDrafts = await listDrafts({
        entityType: "collection-page",
        targetId: id,
        status: "published",
      });
    } else if (type === "faq") {
      const [, faqTargetId] = id.split(":");
      publishedDrafts = await listDrafts({
        entityType: "faq",
        targetId: faqTargetId,
        status: "published",
      });
    }

    sendJson(
      res,
      200,
      okEnvelope(
        {
          target,
          opsDrafts: drafts,
          publishedDrafts,
          previewTokens,
          events,
        },
        { cmsAdapter },
      ),
    );
    return true;
  }

  if (url.pathname.startsWith("/ops/targets/") && url.pathname.endsWith("/generate") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[2];
    const id = type === "faq" ? `${parts[3]}:${parts[4]}` : parts[3];
    const draft = await generateOpsDraft({ type, id, actor });
    if (!draft) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Cannot generate draft" });
      return true;
    }
    sendJson(res, 200, okEnvelope({ draft }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/drafts/") && req.method === "PUT") {
    const auth = requireOpsCapability(req, "manage_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const draftId = url.pathname.split("/").pop();
    const body = (await readJsonBody(req)) ?? {};
    const patch = body.patch ?? {};
    const updated = await updateOpsDraftPayload({ draftId, patch, actor });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Draft not found" });
      return true;
    }

    sendJson(res, 200, okEnvelope({ draft: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/drafts/") && url.pathname.endsWith("/submit") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const draftId = url.pathname.split("/").slice(-2)[0];
    const updated = await submitOpsDraft({ draftId, actor });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Draft not found" });
      return true;
    }
    sendJson(res, 200, okEnvelope({ draft: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/drafts/") && url.pathname.endsWith("/review") && req.method === "POST") {
    const auth = requireOpsCapability(req, "review_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const draftId = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const decision = body.decision;
    const note = body.note;
    if (decision !== "approve" && decision !== "request_changes") {
      sendJson(res, 400, errorEnvelope("Invalid decision", { cmsAdapter }));
      return true;
    }

    const updated = await reviewOpsDraft({ draftId, decision: decision === "approve" ? "approve" : "request_changes", note, actor });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Draft not found" });
      return true;
    }

    sendJson(res, 200, okEnvelope({ draft: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/drafts/") && url.pathname.endsWith("/publish") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const draftId = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const reason = body.reason;
    const confirmed = body.confirmed === true;
    if (!reason || !confirmed) {
      sendJson(res, 400, errorEnvelope("Publish requires a reason and confirmation", { cmsAdapter }));
      return true;
    }
    const result = await publishOpsDraft({ draftId, actor, reason });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Draft not found" });
      return true;
    }
    if (result.status === "blocked") {
      sendJson(res, 409, { service: "control-plane", status: "blocked", message: result.message, cmsAdapter });
      return true;
    }
    sendJson(res, 200, { service: "control-plane", status: "published", cmsAdapter, result });
    return true;
  }

  if (url.pathname.startsWith("/ops/drafts/") && url.pathname.endsWith("/preview") && req.method === "POST") {
    const auth = requireOpsCapability(req, "preview_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const draftId = url.pathname.split("/").slice(-2)[0];
    const draft = getDraft(draftId);
    if (!draft) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Draft not found" });
      return true;
    }

    const body = (await readJsonBody(req)) ?? {};
    const ttlSeconds = body.ttlSeconds ?? 3600;
    const preview = createPreviewToken({ draftId, targetPath: draft.targetPath, ttlSeconds });
    const previewUrl = `${draft.targetPath}?preview=${preview.token}`;

    createEvent({
      actor,
      action: "preview_token",
      target: { type: draft.type, id: draft.type === "faq" ? `${draft.targetType}:${draft.targetId}` : draft.targetId },
      draftId,
      previewUrl,
    });

    sendJson(res, 200, okEnvelope({ previewToken: preview.token, previewUrl, expiresAt: new Date(preview.expiresAt).toISOString() }, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/previews/resolve" && req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    const resolved = resolvePreviewToken(token);
    if (!resolved) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Preview token not found" });
      return true;
    }

    const draft = getDraft(resolved.draftId);
    if (!draft) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Draft not found" });
      return true;
    }

    sendJson(
      res,
      200,
      okEnvelope(
        {
          token,
          expiresAt: new Date(resolved.expiresAt).toISOString(),
          draft: {
            id: draft.id,
            type: draft.type,
            targetType: draft.targetType,
            targetId: draft.targetId,
            targetPath: draft.targetPath,
            schemaType: draft.schemaType,
            entityType: draft.entityType,
            payload: draft.payload,
          },
        },
        { cmsAdapter },
      ),
    );
    return true;
  }

  if (url.pathname === "/ops/previews/revoke" && req.method === "POST") {
    const auth = requireOpsCapability(req, "preview_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const token = body.token;
    if (!token) {
      sendJson(res, 400, errorEnvelope("Missing token", { cmsAdapter }));
      return true;
    }
    const revoked = revokePreviewToken(token);
    if (!revoked) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Preview token not found" });
      return true;
    }
    createEvent({
      actor,
      action: "revoke_preview",
      draftId: revoked.draftId,
      note: `token:${token}`,
    });
    sendJson(res, 200, okEnvelope({ token, revokedAt: revoked.revokedAt }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/targets/") && url.pathname.endsWith("/rollback") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[2];
    const id = type === "faq" ? `${parts[3]}:${parts[4]}` : parts[3];
    const body = (await readJsonBody(req)) ?? {};
    const reason = body.reason;
    const confirmed = body.confirmed === true;
    if (!reason || !confirmed) {
      sendJson(res, 400, errorEnvelope("Rollback requires a reason and confirmation", { cmsAdapter }));
      return true;
    }
    const result = await rollbackTarget({ type, id, actor, reason });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Target not found" });
      return true;
    }
    if (result.status === "blocked") {
      sendJson(res, 409, { service: "control-plane", status: "blocked", message: result.message, cmsAdapter });
      return true;
    }
    sendJson(res, 200, { service: "control-plane", status: "rolled_back", cmsAdapter, result });
    return true;
  }

  if (url.pathname === "/ops/events" && req.method === "GET") {
    // NOTE: 事件数据目前不分页，MVP 用于调试与审计界面。
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const action = url.searchParams.get("action") || undefined;
    const actor = url.searchParams.get("actor") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

    const filtered = listEvents({ targetType, targetId, action, actor, q });
    const items = filtered.slice(offset, offset + limit);
    sendJson(res, 200, okEnvelope({ items, total: filtered.length, limit, offset }, { cmsAdapter }));
    return true;
  }

  // Unknown /ops route
  sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Unknown ops route" });
  return true;
}

module.exports = {
  handleOpsRoute,
};
