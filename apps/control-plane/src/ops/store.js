const crypto = require("crypto");
const { loadState, saveState } = require("./persistence");

const persisted = loadState();
const opsDrafts = new Map(
  (Array.isArray(persisted.drafts) ? persisted.drafts : []).map((item) => [item.id, item]),
);
const opsEvents = Array.isArray(persisted.events) ? persisted.events : [];
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

function now() {
  return new Date().toISOString();
}

function nextId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function persist() {
  saveState({
    drafts: Array.from(opsDrafts.values()),
    events: opsEvents,
    previewTokens: Array.from(previewTokens.values()),
    repoChanges: Array.from(repoChanges.values()),
    alerts: opsAlerts,
    customerNotifications,
    supportCases,
    seoMetrics,
  });
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

function normalizeDateKey(value) {
  const raw = normalizeString(value);
  if (!raw) return "";
  if (raw.length >= 10) return raw.slice(0, 10);
  return raw;
}

function seoMetricKey({ date, targetType, targetId, pagePath, query } = {}) {
  const d = normalizeDateKey(date);
  const parts = [d, normalizeString(targetType), normalizeString(targetId), normalizeString(pagePath), normalizeString(query)];
  return parts.join("|");
}

function upsertSeoMetricRow({ actor, row, source } = {}) {
  if (!row) return null;
  const date = normalizeDateKey(row.date || row.day || row.at);
  const targetType = normalizeString(row.targetType);
  const targetId = normalizeString(row.targetId);
  if (!date || !targetType || !targetId) return null;
  const pagePath = normalizeString(row.pagePath || row.page || "");
  const query = normalizeString(row.query || "");
  const impressions = Math.max(0, normalizeNumber(row.impressions));
  const clicks = Math.max(0, normalizeNumber(row.clicks));
  const ctr = row.ctr != null ? Math.max(0, normalizeNumber(row.ctr)) : impressions > 0 ? clicks / impressions : 0;
  const position = row.position != null ? normalizeNumber(row.position, null) : null;

  const key = seoMetricKey({ date, targetType, targetId, pagePath, query });
  const existingIdx = seoMetrics.findIndex((item) => item.key === key);
  const record = {
    id: existingIdx >= 0 ? seoMetrics[existingIdx].id : nextId("seo"),
    key,
    date,
    targetType,
    targetId,
    pagePath: pagePath || null,
    query: query || null,
    impressions,
    clicks,
    ctr,
    position,
    source: normalizeString(source || row.source || "manual"),
    ingestedBy: actor || "anonymous",
    updatedAt: now(),
    createdAt: existingIdx >= 0 ? seoMetrics[existingIdx].createdAt : now(),
  };
  if (existingIdx >= 0) seoMetrics[existingIdx] = record;
  else seoMetrics.unshift(record);
  return record;
}

function ingestSeoMetrics({ actor, rows, source } = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const created = [];
  items.forEach((row) => {
    const saved = upsertSeoMetricRow({ actor, row, source });
    if (saved) created.push(saved);
  });
  if (created.length) persist();
  return { ingested: created.length };
}

function listSeoMetrics(filters = {}) {
  const targetType = normalizeString(filters.targetType);
  const targetId = normalizeString(filters.targetId);
  const sinceDays = normalizeNumber(filters.sinceDays, 30);
  const untilTs = Date.now();
  const sinceTs = untilTs - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000;
  const limit = Math.min(500, Math.max(1, normalizeNumber(filters.limit, 200)));

  const items = seoMetrics
    .filter((row) => (targetType ? row.targetType === targetType : true))
    .filter((row) => (targetId ? row.targetId === targetId : true))
    .filter((row) => {
      const ts = Date.parse(String(row.date || ""));
      return Number.isFinite(ts) ? ts >= sinceTs && ts <= untilTs : true;
    })
    .slice(0, limit);
  return { items, total: items.length };
}

function aggregateSeoWindow({ targetType, targetId, sinceTs, untilTs } = {}) {
  let impressions = 0;
  let clicks = 0;
  let weightedPosition = 0;
  let positionWeight = 0;
  seoMetrics.forEach((row) => {
    const ts = Date.parse(String(row.date || ""));
    if (!Number.isFinite(ts) || ts < sinceTs || ts > untilTs) return;
    if (row.targetType !== targetType || row.targetId !== targetId) return;
    impressions += row.impressions || 0;
    clicks += row.clicks || 0;
    if (row.position != null && row.impressions) {
      weightedPosition += row.position * row.impressions;
      positionWeight += row.impressions;
    }
  });
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const position = positionWeight > 0 ? weightedPosition / positionWeight : null;
  return { impressions, clicks, ctr, position };
}

function getSeoMetricsWindowSummary({ targetType, targetId, windowDays } = {}) {
  const w = Math.max(1, normalizeNumber(windowDays, 7));
  const untilTs = Date.now();
  const windowMs = w * 24 * 60 * 60 * 1000;
  const current = aggregateSeoWindow({ targetType, targetId, sinceTs: untilTs - windowMs, untilTs });
  const previous = aggregateSeoWindow({ targetType, targetId, sinceTs: untilTs - windowMs * 2, untilTs: untilTs - windowMs });
  return {
    windowDays: w,
    current,
    previous,
    delta: {
      impressions: current.impressions - previous.impressions,
      clicks: current.clicks - previous.clicks,
      ctr: current.ctr - previous.ctr,
      position: current.position != null && previous.position != null ? current.position - previous.position : null,
    },
  };
}

module.exports = {
  createEvent,
  listEvents,
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
  updateRepoChange,
  transitionRepoChange,
  ingestSeoMetrics,
  listSeoMetrics,
  getSeoMetricsWindowSummary,
  now,
};
