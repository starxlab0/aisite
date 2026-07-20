const crypto = require("crypto");
const { loadState, saveState } = require("./persistence");
const { createCommerceDomain } = require("./commerce-domain");
const { createSeoDomain } = require("./seo-domain");

const persisted = loadState();
const opsDrafts = new Map(
  (Array.isArray(persisted.drafts) ? persisted.drafts : []).map((item) => [item.id, item]),
);
const opsEvents = Array.isArray(persisted.events) ? persisted.events : [];
const opsPlaybooks = new Map(
  (Array.isArray(persisted.playbooks) ? persisted.playbooks : []).map((item) => [item.id, item]),
);
const repoChanges = new Map(
  (Array.isArray(persisted.repoChanges) ? persisted.repoChanges : []).map((item) => [item.id, item]),
);
const previewTokens = new Map(
  (Array.isArray(persisted.previewTokens) ? persisted.previewTokens : []).map((item) => [item.token, item]),
);
const opsAlerts = Array.isArray(persisted.alerts) ? persisted.alerts : [];
const customerNotifications = Array.isArray(persisted.customerNotifications) ? persisted.customerNotifications : [];
const supportCases = Array.isArray(persisted.supportCases) ? persisted.supportCases : [];
const seoMetrics = Array.isArray(persisted.seoMetrics) ? persisted.seoMetrics : [];
const seoImportRuns = Array.isArray(persisted.seoImportRuns) ? persisted.seoImportRuns : [];
let seoImportReplay = persisted.seoImportReplay ?? null;
let seoSyncStatus = persisted.seoSyncStatus ?? null;

function now() {
  return new Date().toISOString();
}

function nextId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function getSeoSyncStatus() {
  return seoSyncStatus
    ? {
        ...seoSyncStatus,
        recentRuns: Array.isArray(seoSyncStatus.recentRuns) ? seoSyncStatus.recentRuns.slice(0, 20) : [],
      }
    : {
        lastRunStatus: null,
        lastRunAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastSkippedAt: null,
        consecutiveFailures: 0,
        lastError: null,
        lastErrorCategory: null,
        lastErrorCode: null,
        lastErrorRetryable: null,
        recoveryHint: null,
        lastFetchedRows: 0,
        lastIngestedRows: 0,
        lastRequest: null,
        lastActor: null,
        nextAllowedRunAt: null,
        backoffMinutes: 0,
        paused: false,
        pausedAt: null,
        pausedBy: null,
        recentRuns: [],
        source: "search_console_api",
      };
}

function recordSeoSyncRun({
  status,
  actor,
  request,
  fetchedRows = 0,
  ingestedRows = 0,
  error = null,
  errorCategory = null,
  errorCode = null,
  errorRetryable = null,
  recoveryHint = null,
  source = "search_console_api",
  nextAllowedRunAt = null,
  backoffMinutes = 0,
  reason = null,
} = {}) {
  const previous = getSeoSyncStatus();
  const runAt = now();
  const normalizedStatus = status === "success" ? "success" : status === "skipped" ? "skipped" : "failure";
  const recentRuns = [
    {
      status: normalizedStatus,
      at: runAt,
      actor: actor || null,
      fetchedRows: normalizedStatus === "success" ? fetchedRows : 0,
      ingestedRows: normalizedStatus === "success" ? ingestedRows : 0,
      error: normalizedStatus === "failure" ? String(error || "search_console_sync_failed") : null,
      errorCategory: normalizedStatus === "failure" ? String(errorCategory || "unknown") : null,
      errorCode: normalizedStatus === "failure" ? String(errorCode || "unknown") : null,
      errorRetryable: normalizedStatus === "failure" ? Boolean(errorRetryable) : null,
      recoveryHint: normalizedStatus === "failure" ? String(recoveryHint || "") || null : null,
      reason: normalizedStatus === "skipped" ? String(reason || "search_console_sync_skipped") : null,
      request: request
        ? {
            siteUrl: request.siteUrl ?? null,
            startDate: request.startDate ?? null,
            endDate: request.endDate ?? null,
          }
        : null,
    },
    ...(Array.isArray(previous.recentRuns) ? previous.recentRuns : []),
  ].slice(0, 20);
  seoSyncStatus = {
    source,
    lastRunStatus: normalizedStatus,
    lastRunAt: runAt,
    lastSuccessAt: normalizedStatus === "success" ? runAt : previous.lastSuccessAt,
    lastFailureAt: normalizedStatus === "failure" ? runAt : previous.lastFailureAt,
    lastSkippedAt: normalizedStatus === "skipped" ? runAt : previous.lastSkippedAt,
    consecutiveFailures: normalizedStatus === "success" ? 0 : normalizedStatus === "failure" ? (previous.consecutiveFailures || 0) + 1 : previous.consecutiveFailures || 0,
    lastError: normalizedStatus === "failure" ? String(error || "search_console_sync_failed") : normalizedStatus === "success" ? null : previous.lastError ?? null,
    lastErrorCategory: normalizedStatus === "failure" ? String(errorCategory || "unknown") : normalizedStatus === "success" ? null : previous.lastErrorCategory ?? null,
    lastErrorCode: normalizedStatus === "failure" ? String(errorCode || "unknown") : normalizedStatus === "success" ? null : previous.lastErrorCode ?? null,
    lastErrorRetryable:
      normalizedStatus === "failure" ? Boolean(errorRetryable) : normalizedStatus === "success" ? null : previous.lastErrorRetryable ?? null,
    recoveryHint:
      normalizedStatus === "failure" ? String(recoveryHint || "") || null : normalizedStatus === "success" ? null : previous.recoveryHint ?? null,
    lastFetchedRows: normalizedStatus === "success" ? fetchedRows : previous.lastFetchedRows || 0,
    lastIngestedRows: normalizedStatus === "success" ? ingestedRows : previous.lastIngestedRows || 0,
    lastRequest: request
      ? {
          siteUrl: request.siteUrl ?? null,
          startDate: request.startDate ?? null,
          endDate: request.endDate ?? null,
          rowLimit: request.rowLimit ?? null,
          searchType: request.searchType ?? null,
          dataState: request.dataState ?? null,
          aggregationType: request.aggregationType ?? null,
          dimensions: Array.isArray(request.dimensions) ? request.dimensions.slice(0, 5) : [],
        }
      : previous.lastRequest ?? null,
    lastActor: actor || null,
    nextAllowedRunAt: normalizedStatus === "failure" ? nextAllowedRunAt || null : normalizedStatus === "success" ? null : previous.nextAllowedRunAt ?? null,
    backoffMinutes: normalizedStatus === "failure" ? backoffMinutes || 0 : normalizedStatus === "success" ? 0 : previous.backoffMinutes || 0,
    paused: previous.paused || false,
    pausedAt: previous.pausedAt || null,
    pausedBy: previous.pausedBy || null,
    recentRuns,
  };
  persist();
  return getSeoSyncStatus();
}

function setSeoSyncPaused({ paused, actor } = {}) {
  const previous = getSeoSyncStatus();
  seoSyncStatus = {
    ...previous,
    paused: Boolean(paused),
    pausedAt: paused ? now() : null,
    pausedBy: paused ? actor || null : null,
  };
  persist();
  return getSeoSyncStatus();
}

function clearSeoSyncBackoff({ actor } = {}) {
  const previous = getSeoSyncStatus();
  seoSyncStatus = {
    ...previous,
    nextAllowedRunAt: null,
    backoffMinutes: 0,
    lastActor: actor || previous.lastActor || null,
  };
  persist();
  return getSeoSyncStatus();
}

function persist() {
  saveState({
    drafts: Array.from(opsDrafts.values()),
    events: opsEvents,
    playbooks: Array.from(opsPlaybooks.values()),
    previewTokens: Array.from(previewTokens.values()),
    repoChanges: Array.from(repoChanges.values()),
    alerts: opsAlerts,
    customerNotifications,
    supportCases,
    seoMetrics,
    seoImportRuns,
    seoImportReplay,
    seoSyncStatus,
  });
}

function playbookIdForKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return nextId("pb");
  const digest = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 16);
  return `pb_${digest}`;
}

function findPlaybookByKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return null;
  for (const item of opsPlaybooks.values()) {
    if (String(item?.key || "") === normalized) return item;
  }
  return null;
}

function upsertPlaybook({
  key,
  title,
  source,
  targetType,
  steps,
  observationWindow,
  observationMetrics,
  examples,
  actor = "system",
} = {}) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return null;
  const existing = findPlaybookByKey(normalizedKey);
  const nowAt = now();
  const record = existing ?? {
    id: playbookIdForKey(normalizedKey),
    key: normalizedKey,
    status: "draft",
    createdAt: nowAt,
    createdBy: actor,
  };
  record.title = String(title || record.title || `Playbook: ${normalizedKey}`).slice(0, 120);
  record.source = String(source || record.source || "");
  record.targetType = String(targetType || record.targetType || "");
  record.steps = Array.isArray(steps) ? steps.slice(0, 10) : Array.isArray(record.steps) ? record.steps : [];
  record.observationWindow = String(observationWindow || record.observationWindow || "next 24-72h");
  record.observationMetrics = Array.isArray(observationMetrics)
    ? observationMetrics.slice(0, 8)
    : Array.isArray(record.observationMetrics)
      ? record.observationMetrics
      : [];
  record.examples = Array.isArray(examples) ? examples.slice(0, 5) : Array.isArray(record.examples) ? record.examples : [];
  record.applications = Array.isArray(record.applications) ? record.applications : [];
  record.updatedAt = nowAt;
  record.updatedBy = actor;

  opsPlaybooks.set(record.id, record);
  persist();
  return record;
}

function getPlaybook(id) {
  if (!id) return null;
  return opsPlaybooks.get(String(id)) ?? null;
}

function listPlaybooks({ limit = 50 } = {}) {
  const items = Array.from(opsPlaybooks.values())
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, Math.min(100, Math.max(1, Number(limit || 50))));
  return { items, total: opsPlaybooks.size };
}

function targetOpsPath(targetType, targetId) {
  const type = String(targetType || "");
  const id = targetId == null ? "" : String(targetId);
  if (type === "product" && id) return `/ops/product/${id}`;
  if (type === "collection" && id) return `/ops/collection/${id}`;
  if (type === "faq" && id.includes(":")) {
    const [faqType, faqId] = id.split(":");
    return `/ops/faq/${faqType}/${faqId}`;
  }
  if (type === "guide" && id) return `/ops?type=guide&q=${encodeURIComponent(id)}`;
  if (type) return `/ops/monitoring?type=${encodeURIComponent(type)}`;
  return "/ops/monitoring";
}

function buildPlaybookApplicationNextAction({ playbook, targetType, targetId, targetLabel } = {}) {
  const path = targetOpsPath(targetType || playbook?.targetType, targetId);
  const label = String(targetLabel || targetId || targetType || playbook?.title || "this application");
  return {
    code: targetId ? "open_target_workspace" : "review_monitoring_lane",
    actionPath: path,
    actionLabel: targetId ? "Open target workspace" : "Review monitoring lane",
    description: targetId
      ? `Continue ${label} in the target workspace and decide whether to draft, promote, or transition next.`
      : `Review the monitoring lane for ${label} and choose the next draft or transition step.`,
  };
}

function applyPlaybook({
  id,
  actor = "system",
  targetType,
  targetId,
  targetLabel,
  source,
  note,
} = {}) {
  const playbook = getPlaybook(id);
  if (!playbook) return null;
  const application = {
    id: nextId("pba"),
    status: "draft",
    createdAt: now(),
    updatedAt: now(),
    actor,
    source: String(source || playbook.source || ""),
    targetType: String(targetType || playbook.targetType || ""),
    targetId: targetId == null ? null : String(targetId),
    targetLabel: String(targetLabel || ""),
    note: note ? String(note).slice(0, 500) : null,
    steps: Array.isArray(playbook.steps) ? playbook.steps.slice(0, 10) : [],
    observationWindow: String(playbook.observationWindow || "next 24-72h"),
    observationMetrics: Array.isArray(playbook.observationMetrics) ? playbook.observationMetrics.slice(0, 8) : [],
  };
  application.nextAction = buildPlaybookApplicationNextAction({
    playbook,
    targetType: application.targetType,
    targetId: application.targetId,
    targetLabel: application.targetLabel,
  });
  playbook.applications = [application, ...(Array.isArray(playbook.applications) ? playbook.applications : [])].slice(0, 20);
  playbook.updatedAt = now();
  playbook.updatedBy = actor;
  opsPlaybooks.set(playbook.id, playbook);
  persist();
  return { playbook, application };
}

function transitionPlaybookApplication({
  playbookId,
  applicationId,
  actor = "system",
  nextStatus,
  note,
} = {}) {
  const playbook = getPlaybook(playbookId);
  if (!playbook) return null;
  const apps = Array.isArray(playbook.applications) ? playbook.applications : [];
  const index = apps.findIndex((item) => String(item?.id || "") === String(applicationId || ""));
  if (index < 0) return null;

  const allowed = {
    draft: ["in_review", "cancelled"],
    in_review: ["executed", "cancelled"],
    executed: ["observing", "cancelled"],
    observing: ["succeeded", "regressed", "cancelled"],
    regressed: ["in_review", "cancelled"],
    succeeded: ["cancelled"],
    cancelled: [],
  };
  const current = apps[index];
  const from = String(current.status || "draft");
  const to = String(nextStatus || "");
  if (!to) return { playbook, application: current, blocked: true, message: "missing_next_status" };
  if (!Array.isArray(allowed[from]) || !allowed[from].includes(to)) {
    return { playbook, application: current, blocked: true, message: `invalid_transition:${from}->${to}` };
  }

  const updatedAt = now();
  const next = {
    ...current,
    status: to,
    updatedAt,
    updatedBy: actor,
    lastNote: note ? String(note).slice(0, 500) : null,
  };
  next.transitions = Array.isArray(current.transitions) ? current.transitions : [];
  next.transitions = [
    {
      at: updatedAt,
      actor,
      from,
      to,
      note: note ? String(note).slice(0, 500) : null,
    },
    ...next.transitions,
  ].slice(0, 20);
  next.nextAction = buildPlaybookApplicationNextAction({
    playbook,
    targetType: next.targetType,
    targetId: next.targetId,
    targetLabel: next.targetLabel,
  });

  apps[index] = next;
  playbook.applications = apps;
  playbook.updatedAt = updatedAt;
  playbook.updatedBy = actor;
  opsPlaybooks.set(playbook.id, playbook);
  persist();

  return { playbook, application: next };
}

function createEvent(event) {
  const record = {
    id: nextId("evt"),
    at: now(),
    ...event,
  };
  opsEvents.unshift(record);
  persist();
  return record;
}

function eventMatchesCategory(event, category) {
  if (!category) return true;
  const action = String(event?.action || "");
  if (category === "auto-action") {
    return (
      action === "auto_action_policy_update" ||
      action.startsWith("auto_merge_gate_") ||
      action.startsWith("auto_revert_gate_") ||
      action === "repo_change_auto_merge_candidate" ||
      action === "repo_change_auto_merged" ||
      action === "repo_change_ready_for_review" ||
      action === "repo_change_revert_candidate"
    );
  }
  if (category === "gate") {
    return action.startsWith("auto_merge_gate_") || action.startsWith("auto_revert_gate_");
  }
  if (category === "repo-publish") {
    return action.startsWith("repo_change_");
  }
  return true;
}

function normalizeLevel(level) {
  const v = String(level || "warning");
  if (v === "critical") return "critical";
  if (v === "warning") return "warning";
  return "warning";
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRate(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (raw.endsWith("%")) {
    const parsedPct = Number(raw.slice(0, -1));
    return Number.isFinite(parsedPct) ? parsedPct / 100 : fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed > 1 ? parsed / 100 : parsed;
}

function alertKey({ source, level, title, targetType, targetId }) {
  const parts = [normalizeString(source || "monitoring"), normalizeLevel(level), normalizeString(title)];
  if (targetType && targetId) parts.push(`${targetType}:${targetId}`);
  return parts.filter(Boolean).join("|");
}

function alertEmailRecipients() {
  return String(process.env.OPS_ALERT_EMAIL_TO || process.env.ALERT_EMAIL_TO || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function alertEmailFrom() {
  return process.env.OPS_ALERT_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || "Ops Alerts <alerts@example.com>";
}

function customerEmailFrom() {
  return process.env.CUSTOMER_NOTIFY_EMAIL_FROM || process.env.OPS_CUSTOMER_EMAIL_FROM || "Support <support@example.com>";
}

function customerNotificationKey({ kind, orderId }) {
  return [normalizeString(kind || "unknown"), normalizeString(orderId || "unknown")].filter(Boolean).join("|");
}

function withinMs(isoString, windowMs) {
  const ts = Date.parse(String(isoString || ""));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= windowMs;
}

function hasRecentCustomerNotificationSend({ key, cooldownMs }) {
  if (!key) return false;
  const windowMs = Math.max(0, Number(cooldownMs || 0));
  if (!windowMs) return false;
  return customerNotifications.some((n) => n.key === key && n.notify?.sentAt && withinMs(n.notify.sentAt, windowMs));
}

function customerNotificationPriority(kind) {
  const key = normalizeString(kind);
  if (key === "payment_requires_action") return 30;
  if (key === "payment_failed") return 20;
  if (key === "payment_canceled") return 10;
  if (key === "fulfillment_delay") return 5;
  if (key === "refund_backlog") return 5;
  return 0;
}

function getRecentCustomerNotificationPriorityForOrder({ orderId, cooldownMs }) {
  const windowMs = Math.max(0, Number(cooldownMs || 0));
  if (!orderId || !windowMs) return null;
  let best = null;
  customerNotifications.forEach((n) => {
    if (n.orderId !== orderId) return;
    const sentAt = n.notify?.sentAt;
    if (!sentAt || !withinMs(sentAt, windowMs)) return;
    const prio = customerNotificationPriority(n.kind);
    best = best === null ? prio : Math.max(best, prio);
  });
  return best;
}

function parseBooleanEnv(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function customerNotificationEmailDomain(email) {
  const normalized = normalizeString(email).toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return "";
  return normalized.slice(at + 1);
}

function getCustomerNotificationAutoSendPolicy() {
  return {
    enabled: parseBooleanEnv(process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_ENABLED || process.env.CUSTOMER_NOTIFY_AUTO_SEND_ENABLED),
    kinds: parseCsvEnv(process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_KINDS || process.env.CUSTOMER_NOTIFY_AUTO_SEND_KINDS),
    emailDomains: parseCsvEnv(process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_EMAIL_DOMAINS || process.env.CUSTOMER_NOTIFY_AUTO_SEND_EMAIL_DOMAINS),
  };
}

function shouldAutoSendCustomerNotification(notification) {
  if (!notification) return { ok: false, reason: "missing_notification" };
  const policy = getCustomerNotificationAutoSendPolicy();
  if (!policy.enabled) return { ok: false, reason: "auto_send_disabled" };
  if (notification.status !== "open") return { ok: false, reason: "notification_not_open" };
  if (notification.notify?.sentAt) return { ok: false, reason: "already_sent" };
  const kind = normalizeString(notification.kind).toLowerCase();
  if (policy.kinds.length && !policy.kinds.includes(kind)) {
    return { ok: false, reason: "kind_not_whitelisted" };
  }
  const domain = customerNotificationEmailDomain(notification.to);
  if (policy.emailDomains.length && !policy.emailDomains.includes("*") && !policy.emailDomains.includes(domain)) {
    return { ok: false, reason: "email_domain_not_whitelisted" };
  }
  return { ok: true, reason: "eligible" };
}

function supportCaseKey({ kind, targetType, targetId }) {
  return [normalizeString(kind || "unknown"), normalizeString(targetType || "unknown"), normalizeString(targetId || "unknown")]
    .filter(Boolean)
    .join("|");
}

function supportCaseSlaHours(item) {
  const kind = normalizeString(item?.kind);
  const severity = normalizeString(item?.severity);
  if (severity === "critical") return 4;
  if (kind === "payment_recovery_review") return 6;
  if (kind === "refund_backlog_review") return 8;
  if (kind === "fulfillment_followup_review") return 12;
  return 24;
}

function withSupportCaseComputedFields(item) {
  if (!item) return item;
  const slaHours = supportCaseSlaHours(item);
  const createdTs = Date.parse(String(item.createdAt || ""));
  const dueAt = Number.isFinite(createdTs) ? new Date(createdTs + slaHours * 60 * 60 * 1000).toISOString() : null;
  const overdue = item.status !== "resolved" && Boolean(dueAt) && Date.now() > Date.parse(String(dueAt));
  return {
    ...item,
    owner: item.owner || null,
    assignedAt: item.assignedAt || null,
    assignedBy: item.assignedBy || null,
    sla: {
      hours: slaHours,
      dueAt,
      overdue,
    },
  };
}

function supportCaseSeverityScore(severity) {
  const key = normalizeString(severity);
  if (key === "critical") return 30;
  if (key === "warning") return 20;
  if (key === "info") return 10;
  return 0;
}

function supportCaseStatusScore(status) {
  const key = normalizeString(status);
  if (key === "open") return 20;
  if (key === "acked") return 10;
  return 0;
}

function compareSupportCasesByUrgency(a, b) {
  const overdueDiff = Number(Boolean(b?.sla?.overdue)) - Number(Boolean(a?.sla?.overdue));
  if (overdueDiff) return overdueDiff;
  const statusDiff = supportCaseStatusScore(b?.status) - supportCaseStatusScore(a?.status);
  if (statusDiff) return statusDiff;
  const severityDiff = supportCaseSeverityScore(b?.severity) - supportCaseSeverityScore(a?.severity);
  if (severityDiff) return severityDiff;
  const dueAtA = Date.parse(String(a?.sla?.dueAt || ""));
  const dueAtB = Date.parse(String(b?.sla?.dueAt || ""));
  if (Number.isFinite(dueAtA) && Number.isFinite(dueAtB) && dueAtA !== dueAtB) return dueAtA - dueAtB;
  const createdAtA = Date.parse(String(a?.createdAt || ""));
  const createdAtB = Date.parse(String(b?.createdAt || ""));
  if (Number.isFinite(createdAtA) && Number.isFinite(createdAtB) && createdAtA !== createdAtB) return createdAtA - createdAtB;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function getSupportOwnerCandidates(items = []) {
  const envOwners = parseCsvEnv(process.env.OPS_SUPPORT_OWNERS || process.env.SUPPORT_CASE_OWNERS || "");
  const existingOwners = Array.isArray(items)
    ? items
        .map((item) => normalizeString(item?.owner || "").toLowerCase())
        .filter(Boolean)
    : [];
  return Array.from(new Set([...envOwners, ...existingOwners])).sort();
}

function buildSupportOwnerLoad(items = [], candidates = []) {
  const load = new Map();
  candidates.forEach((owner) => load.set(owner, 0));
  items.forEach((item) => {
    if (item.status === "resolved") return;
    const owner = normalizeString(item.owner || "").toLowerCase();
    if (!owner) return;
    load.set(owner, Number(load.get(owner) || 0) + 1);
  });
  return load;
}

function suggestSupportCaseOwner(item, loadMap) {
  if (!item || item.owner || !(loadMap instanceof Map) || !loadMap.size) return null;
  const ranked = Array.from(loadMap.entries()).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? null;
}

async function sendCustomerEmail(notification) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const to = normalizeString(notification?.to || "");
  if (!apiKey) return { ok: false, reason: "missing_resend_api_key" };
  if (!to) return { ok: false, reason: "missing_customer_email_to" };

  const subject = normalizeString(notification?.title || "Order update");
  const detailHtml = String(notification?.detail || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p style="margin:0 0 16px">${part}</p>`)
    .join("");
  const ctaLabel = normalizeString(notification?.ctaLabel || "Open order");
  const html = [
    `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">`,
    `<h2 style="margin:0 0 12px">${subject}</h2>`,
    detailHtml || `<p style="margin:0 0 16px">${normalizeString(notification?.detail || "")}</p>`,
    notification?.actionUrl
      ? `<p style="margin:0 0 16px"><a href="${notification.actionUrl}">${ctaLabel}</a></p>`
      : "",
    `<p style="margin:0;color:#6b7280;font-size:12px">order ${normalizeString(notification?.orderId || "n/a")}</p>`,
    `</div>`,
  ].join("");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: customerEmailFrom(),
      to: [to],
      subject,
      html,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, reason: "resend_error", error: json?.message || `HTTP ${res.status}` };
  }
  return { ok: true, messageId: json?.id || null, to: [to] };
}

async function notifyCustomer(notification, { actor = "system", force = false } = {}) {
  if (!notification) return { status: "skipped", reason: "missing_notification" };
  if (!force && notification.notify?.sentAt) return { status: "skipped", reason: "already_sent" };

  const nowAt = now();
  const attempts = Number(notification.notify?.attempts || 0) + 1;
  const result = await sendCustomerEmail(notification);
  if (result.ok) {
    notification.notify = {
      channel: "email",
      status: "sent",
      attempts,
      lastAttemptAt: nowAt,
      sentAt: nowAt,
      lastError: null,
      messageId: result.messageId ?? null,
      to: result.to ?? [],
    };
    persist();
    try {
      createEvent({
        actor,
        action: "customer_notify_sent",
        target: notification.target ?? undefined,
        note: `customer notification ${notification.id} emailed`,
      });
    } catch {
      // non-blocking
    }
    return { status: "sent", notificationId: notification.id, messageId: result.messageId ?? null };
  }

  notification.notify = {
    channel: "email",
    status: result.reason === "missing_resend_api_key" ? "skipped" : "failed",
    attempts,
    lastAttemptAt: nowAt,
    sentAt: notification.notify?.sentAt ?? null,
    lastError: result.error ?? result.reason ?? "unknown_error",
    messageId: notification.notify?.messageId ?? null,
    to: notification.notify?.to ?? [],
  };
  persist();
  try {
    createEvent({
      actor,
      action: "customer_notify_failed",
      target: notification.target ?? undefined,
      note: `customer notification ${notification.id} notify ${notification.notify.status}${notification.notify.lastError ? ` · ${notification.notify.lastError}` : ""}`,
    });
  } catch {
    // non-blocking
  }
  return { status: notification.notify.status, notificationId: notification.id, reason: result.reason ?? "unknown_error" };
}

function upsertCustomerNotificationsFromMonitoring({ notifications, actor = "system", source = "monitoring" } = {}) {
  const items = Array.isArray(notifications) ? notifications : [];
  const nowAt = now();
  const createdOrUpdated = [];
  const skipped = [];
  const cooldownMs = 60 * 60 * 1000;

  items.forEach((raw) => {
    const orderId = normalizeString(raw.orderId);
    const kind = normalizeString(raw.kind);
    const to = normalizeString(raw.to);
    if (!orderId || !kind || !to) {
      skipped.push({ reason: "missing_fields", orderId, kind });
      return;
    }
    const key = customerNotificationKey({ kind, orderId });
    if (hasRecentCustomerNotificationSend({ key, cooldownMs })) {
      skipped.push({ reason: "cooldown_recently_sent", orderId, kind });
      return;
    }
    const orderRecentPriority = getRecentCustomerNotificationPriorityForOrder({ orderId, cooldownMs });
    const nextPriority = customerNotificationPriority(kind);
    if (orderRecentPriority !== null && orderRecentPriority >= nextPriority) {
      skipped.push({ reason: "cooldown_order_recently_sent", orderId, kind });
      return;
    }
    const existingOpen = customerNotifications.find((n) => n.key === key && n.status === "open") ?? null;
    const patch = {
      kind,
      orderId,
      title: normalizeString(raw.title),
      detail: normalizeString(raw.detail),
      ctaLabel: normalizeString(raw.ctaLabel || ""),
      to,
      actionUrl: normalizeString(raw.actionUrl || ""),
      source,
      target: { type: "order", id: orderId },
    };
    if (existingOpen) {
      existingOpen.title = patch.title || existingOpen.title;
      existingOpen.detail = patch.detail || existingOpen.detail;
      existingOpen.ctaLabel = patch.ctaLabel || existingOpen.ctaLabel || "";
      existingOpen.to = patch.to || existingOpen.to;
      existingOpen.actionUrl = patch.actionUrl || existingOpen.actionUrl;
      existingOpen.lastSeenAt = nowAt;
      existingOpen.seenCount = Number(existingOpen.seenCount || 0) + 1;
      existingOpen.updatedAt = nowAt;
      createdOrUpdated.push({ id: existingOpen.id, key, action: "updated" });
      return;
    }

    const openSameOrder = customerNotifications.filter((n) => n.orderId === orderId && n.status === "open" && n.key !== key);
    if (openSameOrder.length) {
      openSameOrder.forEach((n) => {
        n.status = "acked";
        n.ackAt = nowAt;
        n.ackBy = actor;
        n.ackNote = `superseded by ${kind}`;
        n.updatedAt = nowAt;
      });
    }

    const next = {
      id: nextId("cnot"),
      key,
      status: "open",
      kind: patch.kind,
      orderId: patch.orderId,
      title: patch.title,
      detail: patch.detail,
      ctaLabel: patch.ctaLabel,
      to: patch.to,
      actionUrl: patch.actionUrl,
      source,
      target: patch.target,
      firstSeenAt: nowAt,
      lastSeenAt: nowAt,
      seenCount: 1,
      createdAt: nowAt,
      createdBy: actor,
      updatedAt: nowAt,
      ackAt: null,
      ackBy: null,
      ackNote: null,
      notify: {
        channel: "email",
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        sentAt: null,
        lastError: null,
        messageId: null,
        to: [],
      },
    };
    customerNotifications.unshift(next);
    createdOrUpdated.push({ id: next.id, key, action: "created" });
  });

  if (createdOrUpdated.length) persist();
  return { createdOrUpdated, skipped, total: items.length };
}

function listCustomerNotifications(filters = {}) {
  const status = typeof filters.status === "string" ? filters.status : undefined;
  const query = normalizeString(filters.q || "").toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(filters.limit ?? 50)));
  const filtered = customerNotifications
    .filter((n) => (status ? n.status === status : true))
    .filter((n) => {
      if (!query) return true;
      const haystack = [n.kind, n.orderId, n.to, n.title, n.detail, n.actionUrl, n.source]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  const items = filtered.slice(0, limit);
  return { items, total: filtered.length };
}

function ackCustomerNotification({ id, actor, note } = {}) {
  const item = customerNotifications.find((n) => n.id === id) ?? null;
  if (!item) return null;
  if (item.status !== "open") return item;
  item.status = "acked";
  item.ackAt = now();
  item.ackBy = actor || "anonymous";
  item.ackNote = note ? String(note).slice(0, 500) : null;
  item.updatedAt = now();
  persist();
  return item;
}

async function sendCustomerNotification({ id, actor } = {}) {
  const item = customerNotifications.find((n) => n.id === id) ?? null;
  if (!item) return null;
  return notifyCustomer(item, { actor, force: true });
}

async function autoSendEligibleCustomerNotifications({ actor = "system", limit = 20 } = {}) {
  const candidates = customerNotifications
    .filter((item) => item.status === "open" && !item.notify?.sentAt)
    .slice(0, Math.max(1, Number(limit || 20)));
  const attempted = [];
  const skipped = [];

  for (const item of candidates) {
    const gate = shouldAutoSendCustomerNotification(item);
    if (!gate.ok) {
      skipped.push({ id: item.id, reason: gate.reason });
      continue;
    }
    const result = await notifyCustomer(item, { actor, force: false });
    attempted.push({ id: item.id, status: result?.status ?? "unknown" });
  }

  return { attempted, skipped, total: candidates.length };
}

function upsertSupportCasesFromMonitoring({ cases, actor = "system", source = "monitoring" } = {}) {
  const items = Array.isArray(cases) ? cases : [];
  const nowAt = now();
  const createdOrUpdated = [];
  const skipped = [];

  items.forEach((raw) => {
    const kind = normalizeString(raw.kind);
    const targetType = normalizeString(raw?.target?.type);
    const targetId = normalizeString(raw?.target?.id);
    if (!kind || !targetType || !targetId) {
      skipped.push({ reason: "missing_fields", kind, targetType, targetId });
      return;
    }
    const key = supportCaseKey({ kind, targetType, targetId });
    const existingOpen = supportCases.find((item) => item.key === key && ["open", "acked"].includes(item.status)) ?? null;
    const patch = {
      kind,
      severity: normalizeString(raw.severity || "warning"),
      title: normalizeString(raw.title),
      detail: normalizeString(raw.detail),
      source,
      target: { type: targetType, id: targetId },
      targetPath: normalizeString(raw.targetPath || ""),
      context: raw.context && typeof raw.context === "object" ? raw.context : {},
    };
    if (existingOpen) {
      existingOpen.severity = patch.severity || existingOpen.severity;
      existingOpen.title = patch.title || existingOpen.title;
      existingOpen.detail = patch.detail || existingOpen.detail;
      existingOpen.source = patch.source || existingOpen.source;
      existingOpen.targetPath = patch.targetPath || existingOpen.targetPath || "";
      existingOpen.context = { ...(existingOpen.context || {}), ...(patch.context || {}) };
      existingOpen.lastSeenAt = nowAt;
      existingOpen.seenCount = Number(existingOpen.seenCount || 0) + 1;
      existingOpen.updatedAt = nowAt;
      createdOrUpdated.push({ id: existingOpen.id, key, action: "updated" });
      return;
    }

    const next = {
      id: nextId("scase"),
      key,
      status: "open",
      kind: patch.kind,
      severity: patch.severity || "warning",
      title: patch.title,
      detail: patch.detail,
      source,
      target: patch.target,
      targetPath: patch.targetPath || "",
      context: patch.context || {},
      firstSeenAt: nowAt,
      lastSeenAt: nowAt,
      seenCount: 1,
      createdAt: nowAt,
      createdBy: actor,
      updatedAt: nowAt,
      owner: normalizeString(raw.owner || "") || null,
      assignedAt: raw.owner ? nowAt : null,
      assignedBy: raw.owner ? actor : null,
      ackAt: null,
      ackBy: null,
      ackNote: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    };
    supportCases.unshift(next);
    createdOrUpdated.push({ id: next.id, key, action: "created" });
  });

  if (createdOrUpdated.length) persist();
  return { createdOrUpdated, skipped, total: items.length };
}

function listSupportCases(filters = {}) {
  const status = typeof filters.status === "string" ? filters.status : undefined;
  const owner = normalizeString(filters.owner || "").toLowerCase();
  const kind = normalizeString(filters.kind || "").toLowerCase();
  const severity = normalizeString(filters.severity || "").toLowerCase();
  const query = normalizeString(filters.q || "").toLowerCase();
  const overdue = typeof filters.overdue === "boolean" ? filters.overdue : String(filters.overdue || "") === "true";
  const limit = Math.min(200, Math.max(1, Number(filters.limit ?? 50)));
  const computedItems = supportCases.map((item) => withSupportCaseComputedFields(item));
  const ownerCandidates = getSupportOwnerCandidates(computedItems);
  const ownerLoad = buildSupportOwnerLoad(computedItems, ownerCandidates);
  const filteredItems = computedItems
    .filter((item) => (status ? item.status === status : true))
    .filter((item) => {
      if (!owner) return true;
      if (owner === "unassigned") return !item.owner;
      return String(item.owner || "").toLowerCase() === owner;
    })
    .filter((item) => (kind ? String(item.kind || "").toLowerCase() === kind : true))
    .filter((item) => (severity ? String(item.severity || "").toLowerCase() === severity : true))
    .filter((item) => (overdue ? Boolean(item.sla?.overdue) : true))
    .filter((item) => {
      if (!query) return true;
      const haystack = [
        item.title,
        item.detail,
        item.kind,
        item.severity,
        item.owner,
        item.target?.type,
        item.target?.id,
        item.targetPath,
        item.context?.orderId,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    })
    .map((item) => ({
      ...item,
      suggestedOwner: suggestSupportCaseOwner(item, ownerLoad),
    }))
    .sort(compareSupportCasesByUrgency);
  const items = filteredItems.slice(0, limit);

  const byOwnerMap = new Map();
  filteredItems.forEach((item) => {
    const ownerKey = normalizeString(item.owner || "") || "unassigned";
    byOwnerMap.set(ownerKey, Number(byOwnerMap.get(ownerKey) || 0) + 1);
  });

  const summary = {
    total: filteredItems.length,
    overdue: filteredItems.filter((item) => Boolean(item.sla?.overdue)).length,
    unassigned: filteredItems.filter((item) => !item.owner).length,
    critical: filteredItems.filter((item) => item.severity === "critical").length,
    byOwner: Array.from(byOwnerMap.entries())
      .map(([ownerKey, count]) => ({ owner: ownerKey === "unassigned" ? null : ownerKey, count }))
      .sort((a, b) => b.count - a.count || String(a.owner || "").localeCompare(String(b.owner || "")))
      .slice(0, 8),
  };

  return { items, total: filteredItems.length, summary };
}

function assignSupportCase({ id, actor, owner, note } = {}) {
  const item = supportCases.find((n) => n.id === id) ?? null;
  if (!item) return null;
  const nextOwner = normalizeString(owner || "");
  item.owner = nextOwner || null;
  item.assignedAt = nextOwner ? now() : null;
  item.assignedBy = nextOwner ? actor || "anonymous" : null;
  item.updatedAt = now();
  if (note) {
    item.ackNote = String(note).slice(0, 500);
  }
  persist();
  return withSupportCaseComputedFields(item);
}

function ackSupportCase({ id, actor, note } = {}) {
  const item = supportCases.find((n) => n.id === id) ?? null;
  if (!item) return null;
  if (item.status !== "open") return item;
  item.status = "acked";
  item.ackAt = now();
  item.ackBy = actor || "anonymous";
  item.ackNote = note ? String(note).slice(0, 500) : null;
  item.updatedAt = now();
  persist();
  return withSupportCaseComputedFields(item);
}

function resolveSupportCase({ id, actor, note } = {}) {
  const item = supportCases.find((n) => n.id === id) ?? null;
  if (!item) return null;
  item.status = "resolved";
  item.resolvedAt = now();
  item.resolvedBy = actor || "anonymous";
  item.resolutionNote = note ? String(note).slice(0, 500) : null;
  item.updatedAt = now();
  persist();
  return withSupportCaseComputedFields(item);
}

async function sendAlertEmail(alert) {
  const apiKey = process.env.RESEND_API_KEY || "";
  const to = alertEmailRecipients();
  if (!apiKey) {
    return { ok: false, reason: "missing_resend_api_key" };
  }
  if (!to.length) {
    return { ok: false, reason: "missing_alert_email_to" };
  }

  const subject = `[${String(alert.level).toUpperCase()}] ${alert.title}`;
  const targetLine = alert.target?.type && alert.target?.id ? `${alert.target.type}:${alert.target.id}` : "n/a";
  const html = [
    `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">`,
    `<h2 style="margin:0 0 12px">${subject}</h2>`,
    `<p style="margin:0 0 8px"><strong>Source:</strong> ${alert.source}</p>`,
    `<p style="margin:0 0 8px"><strong>Target:</strong> ${targetLine}</p>`,
    `<p style="margin:0 0 8px"><strong>First seen:</strong> ${alert.firstSeenAt}</p>`,
    `<p style="margin:0 0 8px"><strong>Last seen:</strong> ${alert.lastSeenAt}</p>`,
    `<p style="margin:0 0 16px"><strong>Seen count:</strong> ${alert.seenCount}</p>`,
    `<p style="margin:0 0 16px">${alert.detail}</p>`,
    `</div>`,
  ].join("");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: alertEmailFrom(),
      to,
      subject,
      html,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      reason: "resend_error",
      error: json?.message || `HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    messageId: json?.id || null,
    to,
  };
}

async function notifyAlert(alert, { actor = "system", force = false } = {}) {
  if (!alert) return { status: "skipped", reason: "missing_alert" };
  if (!force && alert.notify?.sentAt) return { status: "skipped", reason: "already_sent" };

  const nowAt = now();
  const attempts = Number(alert.notify?.attempts || 0) + 1;
  const result = await sendAlertEmail(alert);
  if (result.ok) {
    alert.notify = {
      channel: "email",
      status: "sent",
      attempts,
      lastAttemptAt: nowAt,
      sentAt: nowAt,
      lastError: null,
      messageId: result.messageId ?? null,
      to: result.to ?? [],
    };
    persist();
    try {
      createEvent({
        actor,
        action: "alert_notify_sent",
        target: alert.target ?? undefined,
        note: `alert ${alert.id} emailed`,
      });
    } catch {
      // non-blocking
    }
    return { status: "sent", alertId: alert.id, messageId: result.messageId ?? null };
  }

  alert.notify = {
    channel: "email",
    status: result.reason === "missing_resend_api_key" || result.reason === "missing_alert_email_to" ? "skipped" : "failed",
    attempts,
    lastAttemptAt: nowAt,
    sentAt: alert.notify?.sentAt ?? null,
    lastError: result.error ?? result.reason ?? "unknown_error",
    messageId: alert.notify?.messageId ?? null,
    to: alert.notify?.to ?? [],
  };
  persist();
  try {
    createEvent({
      actor,
      action: "alert_notify_failed",
      target: alert.target ?? undefined,
      note: `alert ${alert.id} notify ${alert.notify.status}${alert.notify.lastError ? ` · ${alert.notify.lastError}` : ""}`,
    });
  } catch {
    // non-blocking
  }
  return { status: alert.notify.status, alertId: alert.id, reason: result.reason ?? "unknown_error" };
}

function upsertAlertsFromMonitoring({ alerts, actor = "system", source = "monitoring" } = {}) {
  const items = Array.isArray(alerts) ? alerts : [];
  const nowAt = now();
  const createdOrUpdated = [];
  const skipped = [];
  const notifyCandidates = [];

  items.forEach((raw) => {
    if (!raw?.title) {
      skipped.push({ reason: "missing_title" });
      return;
    }
    const recordPatch = {
      level: normalizeLevel(raw.level),
      title: normalizeString(raw.title),
      detail: normalizeString(raw.detail),
      source,
      target: raw.target && raw.target.type && raw.target.id ? { type: raw.target.type, id: raw.target.id } : null,
    };
    const key = alertKey({
      source,
      level: recordPatch.level,
      title: recordPatch.title,
      targetType: recordPatch.target?.type,
      targetId: recordPatch.target?.id,
    });

    const existingOpen = opsAlerts.find((a) => a.key === key && a.status === "open") ?? null;
    if (existingOpen) {
      existingOpen.level = recordPatch.level;
      existingOpen.detail = recordPatch.detail || existingOpen.detail;
      existingOpen.lastSeenAt = nowAt;
      existingOpen.seenCount = Number(existingOpen.seenCount || 0) + 1;
      existingOpen.target = recordPatch.target ?? existingOpen.target ?? null;
      existingOpen.updatedAt = nowAt;
      createdOrUpdated.push({ id: existingOpen.id, key, action: "updated" });
      if (!existingOpen.notify?.sentAt && !existingOpen.notify?.lastAttemptAt) {
        notifyCandidates.push(existingOpen);
      }
      return;
    }

    const next = {
      id: nextId("alrt"),
      key,
      status: "open",
      level: recordPatch.level,
      title: recordPatch.title,
      detail: recordPatch.detail,
      source,
      target: recordPatch.target,
      firstSeenAt: nowAt,
      lastSeenAt: nowAt,
      seenCount: 1,
      createdAt: nowAt,
      createdBy: actor,
      updatedAt: nowAt,
      ackAt: null,
      ackBy: null,
      ackNote: null,
      notify: {
        channel: "email",
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        sentAt: null,
        lastError: null,
        messageId: null,
        to: [],
      },
    };
    opsAlerts.unshift(next);
    createdOrUpdated.push({ id: next.id, key, action: "created" });
    notifyCandidates.push(next);
  });

  if (createdOrUpdated.length) persist();
  notifyCandidates.forEach((alert) => {
    notifyAlert(alert, { actor }).catch(() => {});
  });
  return { createdOrUpdated, skipped, total: items.length };
}

function listAlerts(filters = {}) {
  const status = typeof filters.status === "string" ? filters.status : undefined;
  const limit = Math.min(200, Math.max(1, Number(filters.limit ?? 50)));
  const items = opsAlerts
    .filter((a) => (status ? a.status === status : true))
    .slice(0, limit);
  return { items, total: items.length };
}

function ackAlert({ id, actor, note } = {}) {
  const alert = opsAlerts.find((a) => a.id === id) ?? null;
  if (!alert) return null;
  if (alert.status !== "open") return alert;
  alert.status = "acked";
  alert.ackAt = now();
  alert.ackBy = actor || "anonymous";
  alert.ackNote = note ? String(note).slice(0, 500) : null;
  alert.updatedAt = now();
  persist();
  return alert;
}

async function resendAlertNotification({ id, actor } = {}) {
  const alert = opsAlerts.find((a) => a.id === id) ?? null;
  if (!alert) return null;
  return notifyAlert(alert, { actor, force: true });
}

function listEvents(filters = {}) {
  const q = typeof filters.q === "string" ? filters.q.trim().toLowerCase() : "";
  return opsEvents.filter((event) => {
    if (!eventMatchesCategory(event, filters.category)) return false;
    if (filters.targetType && event.target?.type !== filters.targetType) return false;
    if (filters.targetId && event.target?.id !== filters.targetId) return false;
    if (filters.action && event.action !== filters.action) return false;
    if (filters.actionPrefix && !String(event.action || "").startsWith(String(filters.actionPrefix))) return false;
    if (filters.actor && String(event.actor || "").toLowerCase() !== String(filters.actor).toLowerCase()) return false;
    if (q) {
      const hay = [
        event.action,
        event.actor,
        event.target?.type,
        event.target?.id,
        event.draftId,
        event.note,
        event.previewUrl,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function createOpsDraft(input) {
  const record = {
    id: nextId("draft"),
    status: "draft_generated",
    createdAt: now(),
    updatedAt: now(),
    review: null,
    ...input,
  };
  opsDrafts.set(record.id, record);
  persist();
  return record;
}

function updateOpsDraft(draftId, patch) {
  const existing = opsDrafts.get(draftId);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };
  opsDrafts.set(draftId, next);
  persist();
  return next;
}

function getOpsDraft(draftId) {
  return opsDrafts.get(draftId) ?? null;
}

function listOpsDrafts(filters = {}) {
  const items = Array.from(opsDrafts.values());
  return items.filter((draft) => {
    if (filters.targetType && draft.targetType !== filters.targetType) return false;
    if (filters.targetId && draft.targetId !== filters.targetId) return false;
    if (filters.status && draft.status !== filters.status) return false;
    return true;
  });
}

function createPreviewToken({ draftId, targetPath, ttlSeconds }) {
  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = Date.now() + Math.max(60, ttlSeconds ?? 3600) * 1000;
  const record = {
    token,
    draftId,
    targetPath,
    createdAt: now(),
    expiresAt,
    revokedAt: null,
  };
  previewTokens.set(token, record);
  persist();
  return record;
}

function listPreviewTokens(filters = {}) {
  const items = Array.from(previewTokens.values()).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
  return items.filter((token) => {
    if (filters.draftId && token.draftId !== filters.draftId) return false;
    if (filters.draftIds && !filters.draftIds.includes(token.draftId)) return false;
    return true;
  });
}

function revokePreviewToken(token) {
  const existing = previewTokens.get(token);
  if (!existing) return null;
  const next = {
    ...existing,
    revokedAt: now(),
  };
  previewTokens.set(token, next);
  persist();
  return next;
}

function resolvePreviewToken(token) {
  const record = previewTokens.get(token);
  if (!record) return null;
  if (record.revokedAt) return null;
  if (Date.now() > record.expiresAt) return null;
  return record;
}

function createRepoChange(input) {
  const record = {
    id: nextId("repo"),
    status: "draft",
    createdAt: now(),
    updatedAt: now(),
    transitions: [],
    ...input,
  };
  repoChanges.set(record.id, record);
  persist();
  return record;
}

function getRepoChange(id) {
  return repoChanges.get(id) ?? null;
}

function listRepoChanges(filters = {}) {
  const items = Array.from(repoChanges.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.targetType && item.targetType !== filters.targetType) return false;
    if (filters.targetId && item.targetId !== filters.targetId) return false;
    if (filters.proposalId && item.proposalId !== filters.proposalId) return false;
    return true;
  });
}

function findSeoTargetRegistryRepoChange({ targetType, targetId } = {}) {
  return (
    listRepoChanges({ targetType, targetId }).find(
      (item) => item.kind === "seo_target_registry" && item.status !== "cancelled" && item.status !== "reverted",
    ) ?? null
  );
}

function updateRepoChange(id, patch = {}) {
  const existing = repoChanges.get(id);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };
  repoChanges.set(id, next);
  persist();
  return next;
}

function transitionRepoChange({ id, actor, nextStatus, note, patch } = {}) {
  const existing = repoChanges.get(id);
  if (!existing) return null;

  const allowed = {
    draft: ["pr_opened", "cancelled"],
    pr_opened: ["ci_running", "ci_passed", "ci_failed", "merged", "cancelled"],
    ci_running: ["ci_passed", "ci_failed", "merged", "cancelled"],
    ci_passed: ["merge_candidate", "merged", "cancelled"],
    merge_candidate: ["ci_running", "ci_failed", "auto_merge_candidate", "merged", "cancelled"],
    auto_merge_candidate: ["ci_running", "ci_failed", "merged", "cancelled"],
    ci_failed: ["pr_opened", "ci_running", "ci_passed", "merged", "cancelled"],
    merged: ["revert_candidate", "reverted"],
    revert_candidate: ["reverted", "cancelled"],
    reverted: [],
    cancelled: [],
  };

  if (!allowed[existing.status]?.includes(nextStatus)) {
    return { status: "blocked", message: `Cannot transition repo change from ${existing.status} to ${nextStatus}` };
  }

  const transition = {
    at: now(),
    actor,
    from: existing.status,
    to: nextStatus,
    note: note ?? null,
  };

  const next = {
    ...existing,
    ...patch,
    status: nextStatus,
    updatedAt: now(),
    transitions: [transition, ...(existing.transitions ?? [])],
  };
  repoChanges.set(id, next);
  persist();
  return next;
}

const SEO_OPS_CONTRACT_METHODS = Object.freeze([
  "ingestSeoMetrics",
  "importSeoMetricsFromSearchConsole",
  "replayLatestSeoImport",
  "listSeoMetrics",
  "getSeoMetricsWindowSummary",
  "getSeoMetricsFreshnessSummary",
  "getSeoImportDiagnostics",
  "getSeoGeoRecommendationSummary",
  "getSeoMonitoringSnapshot",
  "findSeoTargetRegistryRepoChange",
]);

const SEO_OPS_COMPAT_EXPORTS = Object.freeze([
  "ingestSeoMetrics",
  "importSeoMetricsFromSearchConsole",
  "replayLatestSeoImport",
  "listSeoMetrics",
  "getSeoMetricsWindowSummary",
  "getSeoMetricsFreshnessSummary",
  "getSeoImportDiagnostics",
  "getSeoGeoRecommendationSummary",
  "getSeoMonitoringSnapshot",
  "findSeoTargetRegistryRepoChange",
]);

const seoOps = Object.freeze({
  ...createSeoDomain({
    seoMetrics,
    seoImportRuns,
    getSeoImportReplay: () => seoImportReplay,
    setSeoImportReplayState: (next) => {
      seoImportReplay = next;
    },
    getRepoChanges: () => Array.from(repoChanges.values()),
    findSeoTargetRegistryRepoChange,
    persist,
    nextId,
    now,
    normalizeString,
    normalizeNumber,
  }),
  findSeoTargetRegistryRepoChange,
});

const seoOpsContract = Object.freeze({
  entry: "seoOps",
  methods: SEO_OPS_CONTRACT_METHODS,
  compatExports: SEO_OPS_COMPAT_EXPORTS,
});

const COMMERCE_OPS_CONTRACT_METHODS = Object.freeze([
  "summarizeCommerceCheckout",
  "getPurchaseMonitoringSnapshot",
  "getCommerceCheckoutSnapshot",
  "getCommerceProposalSnapshot",
  "getCommerceMonitoringSnapshot",
]);

const COMMERCE_OPS_COMPAT_EXPORTS = Object.freeze([
  "summarizeCommerceCheckout",
  "getPurchaseMonitoringSnapshot",
  "getCommerceCheckoutSnapshot",
  "getCommerceProposalSnapshot",
  "getCommerceMonitoringSnapshot",
]);

function getCommerceDomain() {
  const { listTargetSummaries, getPurchaseDiagnostics, listTrackedEvents, listRecommendations, listRuleTuningProposals } = require("../signals/store");
  return createCommerceDomain({
    listTargetSummaries,
    getPurchaseDiagnostics,
    listTrackedEvents,
    listRecommendations,
    listRuleTuningProposals,
  });
}

const commerceOps = Object.freeze({
  summarizeCommerceCheckout(...args) {
    return getCommerceDomain().summarizeCommerceCheckout(...args);
  },
  getPurchaseMonitoringSnapshot(...args) {
    return getCommerceDomain().getPurchaseMonitoringSnapshot(...args);
  },
  getCommerceCheckoutSnapshot(...args) {
    return getCommerceDomain().getCommerceCheckoutSnapshot(...args);
  },
  getCommerceProposalSnapshot(...args) {
    return getCommerceDomain().getCommerceProposalSnapshot(...args);
  },
  getCommerceMonitoringSnapshot(...args) {
    return getCommerceDomain().getCommerceMonitoringSnapshot(...args);
  },
});

const commerceOpsContract = Object.freeze({
  entry: "commerceOps",
  methods: COMMERCE_OPS_CONTRACT_METHODS,
  compatExports: COMMERCE_OPS_COMPAT_EXPORTS,
});

const RESULT_GOVERNANCE_OPS_CONTRACT_METHODS = Object.freeze([
  "summarizePaymentResults",
  "summarizeFulfillmentResults",
  "summarizeRefundResults",
  "buildPaymentRecommendationCandidates",
  "buildFulfillmentRecommendationCandidates",
  "buildResultGovernanceAlerts",
  "buildPaymentProposalCandidates",
  "buildFulfillmentProposalCandidates",
  "buildPaymentObservationFollowupCandidates",
  "buildFulfillmentObservationFollowupCandidates",
  "getResultGovernanceProposalSnapshot",
  "getResultGovernanceWorkflowSnapshot",
  "getResultGovernanceMonitoringSnapshot",
]);

const RESULT_GOVERNANCE_OPS_COMPAT_EXPORTS = Object.freeze([
  "summarizePaymentResults",
  "summarizeFulfillmentResults",
  "summarizeRefundResults",
  "buildPaymentRecommendationCandidates",
  "buildFulfillmentRecommendationCandidates",
  "buildResultGovernanceAlerts",
  "buildPaymentProposalCandidates",
  "buildFulfillmentProposalCandidates",
  "buildPaymentObservationFollowupCandidates",
  "buildFulfillmentObservationFollowupCandidates",
  "getResultGovernanceProposalSnapshot",
  "getResultGovernanceWorkflowSnapshot",
  "getResultGovernanceMonitoringSnapshot",
]);

function getResultGovernanceDomain() {
  const { createResultGovernanceDomain } = require("./result-governance-domain");
  const { listRecommendations, listRuleTuningProposals } = require("../signals/store");
  return createResultGovernanceDomain({
    listRecommendations,
    listRuleTuningProposals,
  });
}

const resultGovernanceOps = Object.freeze({
  summarizePaymentResults(...args) {
    return getResultGovernanceDomain().summarizePaymentResults(...args);
  },
  summarizeFulfillmentResults(...args) {
    return getResultGovernanceDomain().summarizeFulfillmentResults(...args);
  },
  summarizeRefundResults(...args) {
    return getResultGovernanceDomain().summarizeRefundResults(...args);
  },
  buildPaymentRecommendationCandidates(...args) {
    return getResultGovernanceDomain().buildPaymentRecommendationCandidates(...args);
  },
  buildFulfillmentRecommendationCandidates(...args) {
    return getResultGovernanceDomain().buildFulfillmentRecommendationCandidates(...args);
  },
  buildResultGovernanceAlerts(...args) {
    return getResultGovernanceDomain().buildResultGovernanceAlerts(...args);
  },
  buildPaymentProposalCandidates(...args) {
    return getResultGovernanceDomain().buildPaymentProposalCandidates(...args);
  },
  buildFulfillmentProposalCandidates(...args) {
    return getResultGovernanceDomain().buildFulfillmentProposalCandidates(...args);
  },
  buildPaymentObservationFollowupCandidates(...args) {
    return getResultGovernanceDomain().buildPaymentObservationFollowupCandidates(...args);
  },
  buildFulfillmentObservationFollowupCandidates(...args) {
    return getResultGovernanceDomain().buildFulfillmentObservationFollowupCandidates(...args);
  },
  getResultGovernanceProposalSnapshot(...args) {
    return getResultGovernanceDomain().getResultGovernanceProposalSnapshot(...args);
  },
  getResultGovernanceWorkflowSnapshot(...args) {
    return getResultGovernanceDomain().getResultGovernanceWorkflowSnapshot(...args);
  },
  getResultGovernanceMonitoringSnapshot(...args) {
    return getResultGovernanceDomain().getResultGovernanceMonitoringSnapshot(...args);
  },
});

const resultGovernanceOpsContract = Object.freeze({
  entry: "resultGovernanceOps",
  methods: RESULT_GOVERNANCE_OPS_CONTRACT_METHODS,
  compatExports: RESULT_GOVERNANCE_OPS_COMPAT_EXPORTS,
});

const {
  ingestSeoMetrics,
  importSeoMetricsFromSearchConsole,
  replayLatestSeoImport,
  listSeoMetrics,
  getSeoMetricsWindowSummary,
  getSeoMetricsFreshnessSummary,
  getSeoImportDiagnostics,
  getSeoGeoRecommendationSummary,
  getSeoMonitoringSnapshot,
} = seoOps;

const {
  summarizeCommerceCheckout,
  getPurchaseMonitoringSnapshot,
  getCommerceCheckoutSnapshot,
  getCommerceProposalSnapshot,
  getCommerceMonitoringSnapshot,
} = commerceOps;

const {
  summarizePaymentResults,
  summarizeFulfillmentResults,
  summarizeRefundResults,
  buildPaymentRecommendationCandidates,
  buildFulfillmentRecommendationCandidates,
  buildResultGovernanceAlerts,
  buildPaymentProposalCandidates,
  buildFulfillmentProposalCandidates,
  buildPaymentObservationFollowupCandidates,
  buildFulfillmentObservationFollowupCandidates,
  getResultGovernanceProposalSnapshot,
  getResultGovernanceWorkflowSnapshot,
  getResultGovernanceMonitoringSnapshot,
} = resultGovernanceOps;

module.exports = {
  createEvent,
  listEvents,
  listPlaybooks,
  getPlaybook,
  findPlaybookByKey,
  upsertPlaybook,
  applyPlaybook,
  transitionPlaybookApplication,
  upsertAlertsFromMonitoring,
  upsertCustomerNotificationsFromMonitoring,
  listAlerts,
  ackAlert,
  resendAlertNotification,
  listCustomerNotifications,
  ackCustomerNotification,
  sendCustomerNotification,
  autoSendEligibleCustomerNotifications,
  upsertSupportCasesFromMonitoring,
  listSupportCases,
  assignSupportCase,
  ackSupportCase,
  resolveSupportCase,
  createOpsDraft,
  getOpsDraft,
  listOpsDrafts,
  updateOpsDraft,
  createPreviewToken,
  listPreviewTokens,
  revokePreviewToken,
  resolvePreviewToken,
  createRepoChange,
  getRepoChange,
  listRepoChanges,
  findSeoTargetRegistryRepoChange,
  getSeoSyncStatus,
  recordSeoSyncRun,
  setSeoSyncPaused,
  clearSeoSyncBackoff,
  seoOps,
  seoOpsContract,
  commerceOps,
  commerceOpsContract,
  resultGovernanceOps,
  resultGovernanceOpsContract,
  updateRepoChange,
  transitionRepoChange,
  // 兼容层：新代码应优先通过 `seoOps` facade 调用 SEO 相关能力。
  ingestSeoMetrics,
  importSeoMetricsFromSearchConsole,
  replayLatestSeoImport,
  listSeoMetrics,
  getSeoMetricsWindowSummary,
  getSeoMetricsFreshnessSummary,
  getSeoImportDiagnostics,
  getSeoGeoRecommendationSummary,
  getSeoMonitoringSnapshot,
  // 兼容层：新代码应优先通过 `commerceOps` facade 调用 commerce 相关能力。
  summarizeCommerceCheckout,
  getPurchaseMonitoringSnapshot,
  getCommerceCheckoutSnapshot,
  getCommerceProposalSnapshot,
  getCommerceMonitoringSnapshot,
  // 兼容层：新代码应优先通过 `resultGovernanceOps` facade 调用 result governance 相关能力。
  summarizePaymentResults,
  summarizeFulfillmentResults,
  summarizeRefundResults,
  buildPaymentRecommendationCandidates,
  buildFulfillmentRecommendationCandidates,
  buildResultGovernanceAlerts,
  buildPaymentProposalCandidates,
  buildFulfillmentProposalCandidates,
  buildPaymentObservationFollowupCandidates,
  buildFulfillmentObservationFollowupCandidates,
  getResultGovernanceProposalSnapshot,
  getResultGovernanceWorkflowSnapshot,
  getResultGovernanceMonitoringSnapshot,
  now,
};
