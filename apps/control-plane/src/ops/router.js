const { getOpsAuthContext, listCapabilitiesForRole, requireOpsAdmin, requireOpsCapability } = require("./auth");
const { getAutoActionPolicy, updateAutoActionPolicy } = require("./auto-action-policy");
const { createRepoChangePullRequest, createRepoChangeRevertPullRequest, syncActiveRepoChangesFromGitHub, syncRepoChangeFromGitHub } = require("./github");
const { readJsonBody, sendJson } = require("./json");
const { buildMonitoringSummary } = require("./monitoring");
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
  createRepoChange,
  deleteEventsByIds,
  listPlaybooks,
  getPlaybook,
  applyPlaybook,
  transitionPlaybookApplication,
  seoOps,
  getOpsDraft: getDraft,
  listEvents,
  listPreviewTokens,
  listRepoChanges,
  transitionRepoChange,
  resolvePreviewToken,
  revokePreviewToken,
} = require("./store");

function actorFromReq(req) {
  const auth = getOpsAuthContext(req);
  if (!auth.ok || !auth.token) return "anonymous";
  return `${auth.role}:token:${String(auth.token).slice(0, 4)}â€¦`;
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

  if (url.pathname === "/ops/events/feedback" && req.method === "POST") {
    const auth = getOpsAuthContext(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const category = String(body.category || "").trim();
    const mostBlockedStep = String(body.mostBlockedStep || "").trim();
    const easiestToMisclick = String(body.easiestToMisclick || "").trim();
    const mostUnclearNextStep = String(body.mostUnclearNextStep || "").trim();
    const note = String(body.note || "").trim();
    const page = String(body.page || "").trim();
    if (!category || !mostBlockedStep || !easiestToMisclick || !mostUnclearNextStep) {
      sendJson(res, 400, errorEnvelope("Feedback requires category, mostBlockedStep, easiestToMisclick, and mostUnclearNextStep", { cmsAdapter }));
      return true;
    }
    const event = createEvent({
      actor,
      action: "trial_feedback",
      note: [
        `category=${category}`,
        page ? `page=${page}` : null,
        `blocked=${mostBlockedStep}`,
        `misclick=${easiestToMisclick}`,
        `unclear_next=${mostUnclearNextStep}`,
        note ? `note=${note}` : null,
      ]
        .filter(Boolean)
        .join(" Â· "),
    });
    sendJson(res, 200, okEnvelope({ event }, { cmsAdapter }));
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

  if (url.pathname === "/ops/repo-changes" && req.method === "GET") {
    const status = url.searchParams.get("status") || undefined;
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 10)));
    const items = listRepoChanges({ status, targetType, targetId }).slice(0, limit);
    sendJson(res, 200, okEnvelope({ items, total: items.length }, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/playbooks" && req.method === "GET") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20)));
    const result = listPlaybooks({ limit });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/playbooks/") && req.method === "GET") {
    const id = url.pathname.split("/").slice(-1)[0];
    const playbook = getPlaybook(id);
    if (!playbook) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Playbook not found" });
      return true;
    }
    sendJson(res, 200, okEnvelope({ playbook }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/playbooks/") && url.pathname.endsWith("/apply") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const result = applyPlaybook({
      id,
      actor,
      source: body.source,
      targetType: body.targetType,
      targetId: body.targetId,
      targetLabel: body.targetLabel,
      note: body.note,
    });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Playbook not found" });
      return true;
    }
    createEvent({
      actor,
      action: "playbook_apply",
      target: result.application.targetType && result.application.targetId ? { type: result.application.targetType, id: result.application.targetId } : undefined,
      note: `playbook ${id} applied to ${result.application.targetLabel || result.application.targetType}`,
    });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname.includes("/ops/playbooks/") && url.pathname.includes("/applications/") && url.pathname.endsWith("/transition") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const playbookId = parts[parts.indexOf("playbooks") + 1];
    const applicationId = parts[parts.indexOf("applications") + 1];
    const body = (await readJsonBody(req)) ?? {};
    const nextStatus = body.status;
    const note = body.note;
    const result = transitionPlaybookApplication({ playbookId, applicationId, actor, nextStatus, note });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Playbook application not found" });
      return true;
    }
    if (result.blocked) {
      sendJson(res, 409, { service: "control-plane", status: "blocked", message: result.message, cmsAdapter });
      return true;
    }
    createEvent({
      actor,
      action: "playbook_application_transition",
      target: result.application.targetType && result.application.targetId ? { type: result.application.targetType, id: result.application.targetId } : undefined,
      note: `playbook application ${applicationId} -> ${nextStatus}${note ? ` Â· ${note}` : ""}`,
    });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/auto-action-policy" && req.method === "GET") {
    const policy = getAutoActionPolicy();
    sendJson(res, 200, okEnvelope({ policy }, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/auto-action-policy" && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const policy = updateAutoActionPolicy(body.policy ?? {});
    createEvent({
      actor,
      action: "auto_action_policy_update",
      note: "updated auto-action policy",
    });
    sendJson(res, 200, okEnvelope({ policy }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/repo-changes/") && url.pathname.endsWith("/transition") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const nextStatus = body.status;
    const note = body.note;
    const patch = body.patch ?? {};
    if (!nextStatus) {
      sendJson(res, 400, errorEnvelope("Repo change transition requires status", { cmsAdapter }));
      return true;
    }
    const updated = transitionRepoChange({ id, actor, nextStatus, note, patch });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Repo change not found" });
      return true;
    }
    if (updated.status === "blocked") {
      sendJson(res, 409, { service: "control-plane", status: "blocked", message: updated.message, cmsAdapter });
      return true;
    }
    createEvent({
      actor,
      action: "repo_change_transition",
      target: updated.targetType && updated.targetId ? { type: updated.targetType, id: updated.targetId } : undefined,
      note: `repo change ${id} -> ${nextStatus}${note ? ` Â· ${note}` : ""}`,
    });
    sendJson(res, 200, okEnvelope({ repoChange: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/repo-changes/sync" && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const limit = body.limit ?? 5;
    const targetType = body.targetType ?? undefined;
    const targetId = body.targetId ?? undefined;
    const result = await syncActiveRepoChangesFromGitHub({ actor, limit, targetType, targetId });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/repo-changes/") && url.pathname.endsWith("/sync") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const result = await syncRepoChangeFromGitHub({ id, actor });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Repo change not found" });
      return true;
    }
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/repo-changes/") && url.pathname.endsWith("/open-pr") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const result = await createRepoChangePullRequest({ id, actor });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Repo change not found" });
      return true;
    }
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/repo-changes/") && url.pathname.endsWith("/revert-pr") && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const result = await createRepoChangeRevertPullRequest({ id, actor });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Repo change not found" });
      return true;
    }
    if (result.result?.status === "blocked") {
      sendJson(res, 409, okEnvelope(result, { cmsAdapter }));
      return true;
    }
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/seo-targets/register" && req.method === "POST") {
    const auth = requireOpsCapability(req, "publish_content");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const targetType = String(body.targetType || "").trim();
    const targetId = String(body.targetId || "").trim();
    const targetPath = String(body.targetPath || body.pagePath || "").trim();
    const title = String(body.title || targetId || "").trim() || targetId;

    if (!["product", "collection", "guide"].includes(targetType) || !targetId || !targetPath) {
      sendJson(res, 400, errorEnvelope("Invalid target registration payload.", { cmsAdapter }));
      return true;
    }

    const existing = seoOps.findSeoTargetRegistryRepoChange({ targetType, targetId });
    if (existing?.prUrl || existing?.prNumber || existing?.status === "merged") {
      sendJson(
        res,
        200,
        okEnvelope(
          {
            repoChange: existing,
            result: {
              status: "exists",
              message:
                existing.status === "merged"
                  ? "SEO target is already registered through an existing merged repo change."
                  : "Draft PR already exists for this SEO target registration.",
            },
          },
          { cmsAdapter },
        ),
      );
      return true;
    }

    if (existing) {
      const reused = await createRepoChangePullRequest({ id: existing.id, actor });
      sendJson(res, 200, okEnvelope(reused, { cmsAdapter }));
      return true;
    }

    const branchName = `ai/seo-target/${targetType}-${targetId}`;
    const change = createRepoChange({
      kind: "seo_target_registry",
      title: `Register SEO target ${targetType}:${targetId}`,
      summary: `Register a new SEO target so Search Console imports can map ${targetPath} to ${targetType}:${targetId}.`,
      trigger: "seo_import_unmapped",
      branchName,
      targetType,
      targetId,
      registryTarget: {
        targetType,
        targetId,
        title,
        targetPath,
      },
      prDraft: {
        title: `chore(seo): register ${targetType}:${targetId}`,
        checklist: ["ç¡®è®¤ targetPath ä¸Žç«™ç‚¹è·¯ç”±ä¸€è‡´", "è¡¥é½å¿…è¦å­—æ®µï¼ˆæ ‡é¢˜/æ‘˜è¦/æ¨¡å—ï¼‰", "å¯¼å…¥åŽæ£€æŸ¥ SEO freshness ä¸Ž top issues"],
      },
    });

    const result = await createRepoChangePullRequest({ id: change.id, actor });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/seo-metrics/replay-latest" && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const result = seoOps.replayLatestSeoImport({ actor });
    if (result.status === "missing_replay") {
      sendJson(res, 409, okEnvelope(result, { cmsAdapter }));
      return true;
    }
    createEvent({
      actor,
      action: "seo_metrics_replay",
      note: `replayed latest seo import ${result.ingested}/${result.parsedRows} rows`,
    });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
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
    // NOTE: äº‹ä»¶æ•°æ®ç›®å‰ä¸åˆ†é¡µï¼ŒMVP ç”¨äºŽè°ƒè¯•ä¸Žå®¡è®¡ç•Œé¢ã€‚
    const category = url.searchParams.get("category") || undefined;
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const action = url.searchParams.get("action") || undefined;
    const actionPrefix = url.searchParams.get("actionPrefix") || undefined;
    const actor = url.searchParams.get("actor") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

    const filtered = listEvents({ category, targetType, targetId, action, actionPrefix, actor, q });
    const items = filtered.slice(offset, offset + limit);
    sendJson(res, 200, okEnvelope({ items, total: filtered.length, limit, offset }, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/events/delete" && req.method === "POST") {
    const auth = requireOpsAdmin(req);
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }

    const body = (await readJsonBody(req)) ?? {};
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) {
      sendJson(res, 400, errorEnvelope("Event delete requires at least one id.", { cmsAdapter }));
      return true;
    }

    const result = deleteEventsByIds(ids);
    sendJson(
      res,
      200,
      okEnvelope(
        {
          deleted: result.deleted,
          deletedCount: result.deleted.length,
          total: result.total,
        },
        { cmsAdapter },
      ),
    );
    return true;
  }

  if (url.pathname === "/ops/monitoring-summary" && req.method === "GET") {
    const targetType = url.searchParams.get("targetType") || undefined;
    const data = await buildMonitoringSummary({ targetType, actor });
    sendJson(res, 200, okEnvelope(data, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/alerts" && req.method === "GET") {
    const status = url.searchParams.get("status") || undefined;
    const limit = url.searchParams.get("limit") || undefined;
    const { listAlerts } = require("./store");
    const data = listAlerts({ status, limit });
    sendJson(res, 200, okEnvelope(data, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/customer-notifications" && req.method === "GET") {
    const status = url.searchParams.get("status") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const limit = url.searchParams.get("limit") || undefined;
    const { listCustomerNotifications } = require("./store");
    const data = listCustomerNotifications({ status, q, limit });
    sendJson(res, 200, okEnvelope(data, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/support-cases" && req.method === "GET") {
    const status = url.searchParams.get("status") || undefined;
    const owner = url.searchParams.get("owner") || undefined;
    const kind = url.searchParams.get("kind") || undefined;
    const severity = url.searchParams.get("severity") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const overdue = url.searchParams.get("overdue") || undefined;
    const limit = url.searchParams.get("limit") || undefined;
    const { listSupportCases } = require("./store");
    const data = listSupportCases({ status, owner, kind, severity, q, overdue, limit });
    sendJson(res, 200, okEnvelope(data, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/seo-metrics" && req.method === "GET") {
    const targetType = url.searchParams.get("targetType") || undefined;
    const targetId = url.searchParams.get("targetId") || undefined;
    const sinceDays = url.searchParams.get("sinceDays") || undefined;
    const limit = url.searchParams.get("limit") || undefined;
    const windowDays = url.searchParams.get("windowDays") || undefined;
    const data = seoOps.listSeoMetrics({ targetType, targetId, sinceDays, limit });
    const summary =
      targetType && targetId
        ? seoOps.getSeoMetricsWindowSummary({ targetType, targetId, windowDays: windowDays || 7 })
        : null;
    sendJson(res, 200, okEnvelope({ ...data, summary }, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/seo-metrics/ingest" && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const source = body.source ?? "manual";
    const { ingestSeoMetrics } = require("./store");
    const result = ingestSeoMetrics({ actor, rows, source });
    createEvent({ actor, action: "seo_metrics_ingest", note: `ingested seo metrics rows ${result.ingested}` });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/seo-metrics/import" && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const csvText = typeof body.csvText === "string" ? body.csvText : "";
    const importDate = body.importDate ?? body.date ?? null;
    const source = body.source ?? "search_console";
    const result = seoOps.importSeoMetricsFromSearchConsole({ actor, rows, csvText, importDate, source });
    createEvent({
      actor,
      action: "seo_metrics_import",
      note: `imported seo metrics ${result.ingested}/${result.parsedRows} rows from ${source}`,
    });
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname === "/ops/seo-metrics/sync-search-console" && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    try {
      const { syncSeoMetricsFromSearchConsole } = require("./seo-search-console-sync");
      const result = await syncSeoMetricsFromSearchConsole({
        actor,
        requestOverrides: {
          siteUrl: body.siteUrl,
          startDate: body.startDate,
          endDate: body.endDate,
          dimensions: body.dimensions,
          rowLimit: body.rowLimit,
          searchType: body.searchType,
          dataState: body.dataState,
          aggregationType: body.aggregationType,
          rangeDays: body.rangeDays,
          dataLagDays: body.dataLagDays,
        },
      });
      sendJson(
        res,
        200,
        okEnvelope(
          {
            ...result,
          },
          { cmsAdapter },
        ),
      );
      return true;
    } catch (error) {
      sendJson(res, 400, errorEnvelope(error?.message || "Search Console sync failed.", { cmsAdapter }));
      return true;
    }
  }

  if (url.pathname === "/ops/seo-metrics/sync-search-console/control" && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const body = (await readJsonBody(req)) ?? {};
    const action = String(body.action || "").trim();
    try {
      const { syncSeoMetricsFromSearchConsole } = require("./seo-search-console-sync");
      const { setSeoSyncPaused, clearSeoSyncBackoff, getSeoSyncStatus } = require("./store");
      if (action === "retry_now") {
        createEvent({
          actor,
          action: "seo_metrics_sync_search_console_retry_now",
          note: "triggered Search Console sync manual retry",
        });
        const result = await syncSeoMetricsFromSearchConsole({ actor, automated: false });
        sendJson(res, 200, okEnvelope({ action, result, seoSyncStatus: getSeoSyncStatus() }, { cmsAdapter }));
        return true;
      }
      if (action === "clear_backoff") {
        const seoSyncStatus = clearSeoSyncBackoff({ actor });
        createEvent({
          actor,
          action: "seo_metrics_sync_search_console_clear_backoff",
          note: "cleared Search Console sync backoff window",
        });
        sendJson(res, 200, okEnvelope({ action, seoSyncStatus }, { cmsAdapter }));
        return true;
      }
      if (action === "pause") {
        const seoSyncStatus = setSeoSyncPaused({ paused: true, actor });
        createEvent({
          actor,
          action: "seo_metrics_sync_search_console_pause",
          note: "paused Search Console sync automation",
        });
        sendJson(res, 200, okEnvelope({ action, seoSyncStatus }, { cmsAdapter }));
        return true;
      }
      if (action === "resume") {
        const seoSyncStatus = setSeoSyncPaused({ paused: false, actor });
        createEvent({
          actor,
          action: "seo_metrics_sync_search_console_resume",
          note: "resumed Search Console sync automation",
        });
        sendJson(res, 200, okEnvelope({ action, seoSyncStatus }, { cmsAdapter }));
        return true;
      }
      sendJson(res, 400, errorEnvelope("Unknown Search Console sync control action.", { cmsAdapter }));
      return true;
    } catch (error) {
      sendJson(res, 400, errorEnvelope(error?.message || "Search Console sync control failed.", { cmsAdapter }));
      return true;
    }
  }

  if (url.pathname.startsWith("/ops/support-cases/") && url.pathname.endsWith("/assign") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const owner = body.owner ?? null;
    const note = body.note ?? null;
    const { assignSupportCase } = require("./store");
    const updated = assignSupportCase({ id, actor, owner, note });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Support case not found" });
      return true;
    }
    createEvent({
      actor,
      action: "support_case_assign",
      target: updated.target ?? undefined,
      note: `support case ${id} assigned to ${owner || "unassigned"}${note ? ` Â· ${note}` : ""}`,
    });
    sendJson(res, 200, okEnvelope({ supportCase: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/support-cases/") && url.pathname.endsWith("/ack") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const note = body.note ?? null;
    const { ackSupportCase } = require("./store");
    const updated = ackSupportCase({ id, actor, note });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Support case not found" });
      return true;
    }
    createEvent({
      actor,
      action: "support_case_ack",
      target: updated.target ?? undefined,
      note: `support case ${id} acked${note ? ` Â· ${note}` : ""}`,
    });
    sendJson(res, 200, okEnvelope({ supportCase: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/support-cases/") && url.pathname.endsWith("/resolve") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const note = body.note ?? null;
    const { resolveSupportCase } = require("./store");
    const updated = resolveSupportCase({ id, actor, note });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Support case not found" });
      return true;
    }
    createEvent({
      actor,
      action: "support_case_resolved",
      target: updated.target ?? undefined,
      note: `support case ${id} resolved${note ? ` Â· ${note}` : ""}`,
    });
    sendJson(res, 200, okEnvelope({ supportCase: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/customer-notifications/") && url.pathname.endsWith("/ack") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const note = body.note ?? null;
    const { ackCustomerNotification } = require("./store");
    const updated = ackCustomerNotification({ id, actor, note });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Notification not found" });
      return true;
    }
    createEvent({
      actor,
      action: "customer_notify_ack",
      note: `customer notification ${id} acked${note ? ` Â· ${note}` : ""}`,
    });
    sendJson(res, 200, okEnvelope({ notification: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/customer-notifications/") && url.pathname.endsWith("/send") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const { sendCustomerNotification } = require("./store");
    const result = await sendCustomerNotification({ id, actor });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Notification not found" });
      return true;
    }
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/alerts/") && url.pathname.endsWith("/ack") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const body = (await readJsonBody(req)) ?? {};
    const note = body.note ?? null;
    const { ackAlert } = require("./store");
    const updated = ackAlert({ id, actor, note });
    if (!updated) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Alert not found" });
      return true;
    }
    createEvent({
      actor,
      action: "alert_ack",
      note: `alert ${id} acked${note ? ` Â· ${note}` : ""}`,
    });
    sendJson(res, 200, okEnvelope({ alert: updated }, { cmsAdapter }));
    return true;
  }

  if (url.pathname.startsWith("/ops/alerts/") && url.pathname.endsWith("/resend") && req.method === "POST") {
    const auth = requireOpsCapability(req, "manage_recommendations");
    if (!auth.ok) {
      sendJson(res, auth.statusCode, errorEnvelope(auth.message, { cmsAdapter }));
      return true;
    }
    const id = url.pathname.split("/").slice(-2)[0];
    const { resendAlertNotification } = require("./store");
    const result = await resendAlertNotification({ id, actor });
    if (!result) {
      sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Alert not found" });
      return true;
    }
    sendJson(res, 200, okEnvelope(result, { cmsAdapter }));
    return true;
  }

  // Unknown /ops route
  sendJson(res, 404, { service: "control-plane", status: "not_found", message: "Unknown ops route" });
  return true;
}

module.exports = {
  handleOpsRoute,
};
