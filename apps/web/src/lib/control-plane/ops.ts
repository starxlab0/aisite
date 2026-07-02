import "server-only";

import { envServer } from "@/lib/env/server";

type OpsEnvelope<T> = {
  service: "control-plane";
  status: string;
  cmsAdapter?: string;
  message?: string;
  data?: T;
  result?: unknown;
};

function getBaseUrl() {
  if (!envServer.controlPlaneUrl) {
    throw new Error("CONTROL_PLANE_URL is not configured");
  }
  return envServer.controlPlaneUrl.replace(/\/$/, "");
}

function getAdminHeaders() {
  if (!envServer.opsAdminToken) {
    throw new Error("OPS_ADMIN_TOKEN is not configured");
  }
  return {
    "x-ops-admin-token": envServer.opsAdminToken,
  };
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await res.json()) as T;
  if (!res.ok) {
    const msg = (json as any)?.message ?? `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export type OpsTarget = {
  type: "product" | "collection" | "faq";
  id: string;
  title: string;
  targetPath: string;
  faqTargetType?: string;
  faqTargetId?: string;
};

export type OpsDraftRecord = {
  id: string;
  status: string;
  type: "product" | "collection" | "faq";
  targetType: string;
  targetId: string;
  targetPath: string;
  schemaType: string;
  entityType: string;
  payload: any;
  review?: {
    decision: string;
    note?: string | null;
    at: string;
    actor: string;
  } | null;
  published?: {
    at: string;
    contentRef: string;
    linkedDocuments?: Array<{ id: string; type: string; targetId: string; mode: string }>;
    revalidate?: {
      ok: boolean;
      skipped?: boolean;
      requested?: string[];
      revalidated?: string[];
      reason?: string;
    } | null;
    verification?: {
      ok: boolean;
      skipped?: boolean;
      level?: "pass" | "warning" | "blocked" | "skipped";
      summary?: string;
      reason?: string;
      requested?: string[];
      results?: Array<{
        path: string;
        ok: boolean;
        statusCode: number;
        title?: string;
        description?: string;
        checks?: Record<string, boolean>;
      }>;
    } | null;
    snapshotBeforeIds?: string[];
    autoRollback?: {
      status: string;
      rollbackFromRef?: string | null;
      rollbackToRef?: string | null;
      publishedRef?: string | null;
      trigger?: "auto" | "manual";
      triggerReason?: string | null;
    } | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type PublishedDraftRecord = {
  id: string;
  schemaType: string;
  entityType: string;
  targetType: string;
  targetId: string;
  targetPath: string;
  contentRef: string;
  status: string;
  payload: any;
  meta?: Record<string, unknown>;
  linkedDocuments?: Array<{ id: string; type: string; targetId: string; mode: string }>;
  createdAt: string;
  updatedAt: string;
};

export type OpsEventRecord = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target?: {
    type: string;
    id: string;
  };
  draftId?: string;
  previewUrl?: string;
  linkedDocuments?: Array<{ id: string; type: string; targetId: string; mode?: string }>;
  revalidate?: {
    ok: boolean;
    skipped?: boolean;
    requested?: string[];
    revalidated?: string[];
    reason?: string;
  } | null;
  verification?: {
    ok: boolean;
    skipped?: boolean;
    level?: "pass" | "warning" | "blocked" | "skipped";
    summary?: string;
    reason?: string;
    requested?: string[];
    results?: Array<{
      path: string;
      ok: boolean;
      statusCode: number;
      title?: string;
      description?: string;
      checks?: Record<string, boolean>;
    }>;
  } | null;
  trigger?: "auto" | "manual";
  triggerReason?: string | null;
  sourceDraftId?: string | null;
  sourceContentRef?: string | null;
  note?: string;
};

export type OpsPreviewTokenRecord = {
  token: string;
  draftId: string;
  targetPath: string;
  createdAt: string;
  expiresAt: number;
  revokedAt: string | null;
};

export async function listOpsTargets(params?: { type?: string; q?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/targets`);
  if (params?.type) url.searchParams.set("type", params.type);
  if (params?.q) url.searchParams.set("q", params.q);
  const res = await fetchJson<OpsEnvelope<{ items: OpsTarget[]; total: number }>>(url);
  return res.data ?? { items: [], total: 0 };
}

export async function getOpsAuthStatus() {
  const url = `${getBaseUrl()}/ops/auth/status`;
  const res = await fetchJson<
    OpsEnvelope<{
      role: "viewer" | "editor" | "reviewer" | "publisher" | "admin";
      capabilities: string[];
    }>
  >(url, {
    headers: getAdminHeaders(),
  });
  return res.data!;
}

export async function getOpsTargetDetail(type: string, id: string) {
  const url =
    type === "faq" && id.includes(":")
      ? `${getBaseUrl()}/ops/targets/faq/${encodeURIComponent(id.split(":")[0])}/${encodeURIComponent(
          id.split(":")[1],
        )}`
      : `${getBaseUrl()}/ops/targets/${type}/${encodeURIComponent(id)}`;
  const res = await fetchJson<
    OpsEnvelope<{
      target: OpsTarget;
      opsDrafts: OpsDraftRecord[];
      publishedDrafts: PublishedDraftRecord[];
      previewTokens: OpsPreviewTokenRecord[];
      events: OpsEventRecord[];
    }>
  >(url);
  return res.data!;
}

export async function getOpsEvents(params?: {
  targetType?: string;
  targetId?: string;
  action?: string;
  actor?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const url = new URL(`${getBaseUrl()}/ops/events`);
  if (params?.targetType) url.searchParams.set("targetType", params.targetType);
  if (params?.targetId) url.searchParams.set("targetId", params.targetId);
  if (params?.action) url.searchParams.set("action", params.action);
  if (params?.actor) url.searchParams.set("actor", params.actor);
  if (params?.q) url.searchParams.set("q", params.q);
  if (typeof params?.limit === "number") url.searchParams.set("limit", String(params.limit));
  if (typeof params?.offset === "number") url.searchParams.set("offset", String(params.offset));
  const res = await fetchJson<OpsEnvelope<{ items: OpsEventRecord[]; total: number; limit?: number; offset?: number }>>(
    url,
  );
  return res.data ?? { items: [], total: 0 };
}

export async function generateOpsDraft(type: string, id: string) {
  const url =
    type === "faq" && id.includes(":")
      ? `${getBaseUrl()}/ops/targets/faq/${encodeURIComponent(id.split(":")[0])}/${encodeURIComponent(
          id.split(":")[1],
        )}/generate`
      : `${getBaseUrl()}/ops/targets/${type}/${encodeURIComponent(id)}/generate`;
  const res = await fetchJson<OpsEnvelope<{ draft: any }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!.draft;
}

export async function submitOpsDraft(draftId: string) {
  const url = `${getBaseUrl()}/ops/drafts/${draftId}/submit`;
  const res = await fetchJson<OpsEnvelope<{ draft: any }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!.draft;
}

export async function reviewOpsDraft(draftId: string, input: { decision: "approve" | "request_changes"; note?: string }) {
  const url = `${getBaseUrl()}/ops/drafts/${draftId}/review`;
  const res = await fetchJson<OpsEnvelope<{ draft: any }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!.draft;
}

export async function publishOpsDraft(draftId: string, input: { reason: string; confirmed: true }) {
  const url = `${getBaseUrl()}/ops/drafts/${draftId}/publish`;
  const res = await fetchJson<OpsEnvelope<any>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return (res as any).result ?? res.data;
}

export async function createPreview(draftId: string, ttlSeconds = 3600) {
  const url = `${getBaseUrl()}/ops/drafts/${draftId}/preview`;
  const res = await fetchJson<OpsEnvelope<{ previewToken: string; previewUrl: string; expiresAt: string }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ ttlSeconds }),
  });
  return res.data!;
}

export async function revokePreview(token: string) {
  const url = `${getBaseUrl()}/ops/previews/revoke`;
  const res = await fetchJson<OpsEnvelope<{ token: string; revokedAt: string }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ token }),
  });
  return res.data!;
}

export async function updateOpsDraft(draftId: string, patch: Record<string, unknown>) {
  const url = `${getBaseUrl()}/ops/drafts/${draftId}`;
  const res = await fetchJson<OpsEnvelope<{ draft: OpsDraftRecord }>>(url, {
    method: "PUT",
    headers: getAdminHeaders(),
    body: JSON.stringify({ patch }),
  });
  return res.data!.draft;
}

export async function rollbackOpsTarget(type: string, id: string, input: { reason: string; confirmed: true }) {
  const url =
    type === "faq" && id.includes(":")
      ? `${getBaseUrl()}/ops/targets/faq/${encodeURIComponent(id.split(":")[0])}/${encodeURIComponent(
          id.split(":")[1],
        )}/rollback`
      : `${getBaseUrl()}/ops/targets/${type}/${encodeURIComponent(id)}/rollback`;
  const res = await fetchJson<OpsEnvelope<any>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return (res as any).result ?? res.data;
}

export type PreviewResolveResult = {
  token: string;
  expiresAt: string;
  draft: {
    id: string;
    type: string;
    targetType: string;
    targetId: string;
    targetPath: string;
    schemaType: string;
    entityType: string;
    payload: any;
  };
};

export async function resolvePreviewToken(token: string): Promise<PreviewResolveResult | null> {
  const url = new URL(`${getBaseUrl()}/ops/previews/resolve`);
  url.searchParams.set("token", token);
  try {
    const res = await fetchJson<OpsEnvelope<PreviewResolveResult>>(url);
    return res.data ?? null;
  } catch {
    return null;
  }
}

export type SignalSnapshot = {
  id: string;
  capturedAt: string;
  windowDays: number;
  targetType: string;
  targetId: string;
  contentRef: string | null;
  metrics: {
    views: number;
    ctaClicks: number;
    addToCart: number;
  };
  source: string;
};

export type Recommendation = {
  id: string;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  targetType: string;
  targetId: string;
  contentRef: string | null;
  ruleId: string;
  reason: string;
  suggestedWorkflow: string;
  severity: string;
  priorityScore?: number;
  priorityLevel?: "p0" | "p1" | "p2" | "p3";
  priorityReason?: string;
  occurrences?: number;
  lastSeenAt?: string;
  updatedAt?: string;
  contentRefsSeen?: Array<string | null>;
  startedAt?: string | null;
  startedBy?: string | null;
  startNote?: string | null;
  stale?: boolean;
  staleDays?: number;
  effectivePriorityScore?: number;
  effectivePriorityLevel?: "p0" | "p1" | "p2" | "p3";
  effectivePriorityReason?: string | null;
  effect?: {
    status: "unknown" | "improved" | "neutral" | "worsened";
    summary: string;
    baseline: null | {
      contentRef: string | null;
      capturedAt: string;
      metrics: { views: number; ctaClicks: number; addToCart: number };
      rates: { ctaRate: number; addToCartRate: number };
    };
    after: null | {
      contentRef: string | null;
      capturedAt: string;
      metrics: { views: number; ctaClicks: number; addToCart: number };
      rates: { ctaRate: number; addToCartRate: number };
    };
    delta: null | {
      rates: { ctaRate: number; addToCartRate: number };
    };
  } | null;
  preparedDraft?: {
    draftId: string;
    status: string;
    preparedAt: string;
    reused: boolean;
    targetPath: string;
  } | null;
  preparedDraftError?: string | null;
  context?: {
    snapshot: {
      id: string;
      capturedAt: string;
      windowDays: number;
      contentRef: string | null;
      metrics: { views: number; ctaClicks: number; addToCart: number };
      rates: { ctaRate: number; addToCartRate: number };
    };
    previous:
      | {
          id: string;
          capturedAt: string;
          contentRef: string | null;
          metrics: { views: number; ctaClicks: number; addToCart: number };
          rates: { ctaRate: number; addToCartRate: number };
        }
      | null;
    delta:
      | {
          metrics: { views: number; ctaClicks: number; addToCart: number };
          rates: { ctaRate: number; addToCartRate: number };
        }
      | null;
    focusAreas: string[];
    suggestedWorkflow: string;
  };
};

export async function getSignals(params: { targetType: string; targetId: string }) {
  const url = new URL(`${getBaseUrl()}/signals`);
  url.searchParams.set("targetType", params.targetType);
  url.searchParams.set("targetId", params.targetId);
  const res = await fetchJson<OpsEnvelope<{ items: SignalSnapshot[]; total: number }>>(url);
  return res.data ?? { items: [], total: 0 };
}

export async function getRecommendations(params: { status?: string; targetType?: string; targetId?: string }) {
  const url = new URL(`${getBaseUrl()}/recommendations`);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.targetType) url.searchParams.set("targetType", params.targetType);
  if (params.targetId) url.searchParams.set("targetId", params.targetId);
  const res = await fetchJson<OpsEnvelope<{ items: Recommendation[]; total: number }>>(url);
  return res.data ?? { items: [], total: 0 };
}

export async function resolveRecommendation(id: string, input: { status: "in_progress" | "resolved" | "dismissed"; note?: string }) {
  const url = `${getBaseUrl()}/recommendations/${id}/resolve`;
  const res = await fetchJson<OpsEnvelope<{ recommendation: Recommendation }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!.recommendation;
}

export type RecommendationRuleStats = {
  sinceDays: number;
  totals: {
    total: number;
    evaluated: number;
    improved: number;
    neutral: number;
    worsened: number;
    unknown: number;
    improvementRate: number;
    worsenedRate: number;
  };
  missingEvaluators: Array<{ ruleId: string; total: number; lastSeenAt: string | null }>;
  ruleConfigWarnings: Array<{ ruleId: string; warnings: string[] }>;
  suggestedRuleTuning: Array<{
    ruleId: string;
    quality: "risky" | "weak" | "ok" | "good" | "insufficient";
    suggestion: string;
    improvementRate: number;
    worsenedRate: number;
    evaluated: number;
    lastSeenAt: string | null;
    hasDefinition?: boolean;
    hasEvaluator?: boolean;
    configWarnings?: string[];
    ruleMeta?: RuleMeta | null;
  }>;
  items: Array<{
    ruleId: string;
    total: number;
    evaluated: number;
    improved: number;
    neutral: number;
    worsened: number;
    unknown: number;
    improvementRate: number;
    worsenedRate: number;
    quality: "risky" | "weak" | "ok" | "good" | "insufficient";
    suggestion: string;
    hasDefinition?: boolean;
    hasEvaluator?: boolean;
    configWarnings?: string[];
    ruleMeta?: RuleMeta | null;
    lastSeenAt: string | null;
  }>;
};

export type RuleMeta = {
  ruleId: string;
  description: string;
  kind: string;
  rate: string | null;
  severity: string;
  targetTypes: string[];
  parameterSummary: string;
  validation: {
    valid: boolean;
    warnings: string[];
  };
};

export async function getRecommendationRuleStats(params?: { sinceDays?: number }) {
  const url = new URL(`${getBaseUrl()}/recommendations/rules`);
  if (typeof params?.sinceDays === "number") url.searchParams.set("sinceDays", String(params.sinceDays));
  const res = await fetchJson<OpsEnvelope<RecommendationRuleStats>>(url);
  return res.data!;
}

export type RuleTuningProposal = {
  id: string;
  type: "rule_tuning" | "incident_followup";
  status: "draft" | "approved" | "rejected" | "applied";
  createdAt: string;
  createdBy: string;
  ruleId?: string;
  sinceDays?: number;
  currentConfig: Record<string, any> | null;
  suggestedConfig: Record<string, any> | null;
  expectedImpact: string;
  applyHowTo?: string;
  quality?: string;
  suggestion: string;
  improvementRate: number;
  worsenedRate: number;
  evaluated: number;
  lastSeenAt: string | null;
  note: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalNote: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionNote: string | null;
  appliedAt: string | null;
  appliedBy: string | null;
  appliedNote: string | null;
  appliedConfig?: Record<string, any> | null;
  targetType?: string;
  targetId?: string;
  anomalyKind?: "blocked_publish" | "auto_rollback" | "warning_threshold";
  severity?: "warning" | "critical";
  summary?: string;
  linkedRecommendationId?: string | null;
  linkedDraftId?: string | null;
  sourceDraftId?: string | null;
  sourceContentRef?: string | null;
  ruleMeta?: RuleMeta | null;
  currentConfigSummary?: string;
  suggestedConfigSummary?: string;
  appliedConfigSummary?: string | null;
  statusTimeline?: Array<{ label: string; at: string; by: string | null; note: string | null }>;
  reviewSummary?: {
    state: "pending" | "closed" | "observe" | "steady" | "success" | "risk";
    headline: string;
    recommendation: string;
    signals: string[];
  };
  appliedConfigCheck?: {
    status: "match" | "mismatch" | "missing" | "unknown";
    reason: string;
    diff: null | {
      missingKeys: string[];
      extraKeys: string[];
      mismatched: Record<string, { applied: any; current: any }>;
    };
  } | null;
  postApplyEffect?: null | {
    computedAt: string;
    windowDays: number;
    appliedAt: string;
    window: {
      preStart: string;
      preEnd: string;
      postStart: string;
      postEnd: string;
    };
    coverage: {
      plannedPostEnd: string;
      postObservedDays: number;
      postWindowComplete: boolean;
    };
    triggerSim: null | {
      pre: { snapshots: number; triggers: number; triggerRate: number };
      post: { snapshots: number; triggers: number; triggerRate: number };
    };
    triggerDelta: null | {
      triggers: number;
      triggerRate: number;
    };
    pre: {
      total: number;
      evaluated: number;
      improved: number;
      neutral: number;
      worsened: number;
      unknown: number;
      improvementRate: number;
    };
    post: {
      total: number;
      evaluated: number;
      improved: number;
      neutral: number;
      worsened: number;
      unknown: number;
      improvementRate: number;
    };
    delta: {
      improvementRate: number;
    };
  };
};

export async function listRuleTuningProposals(params?: { limit?: number; ruleId?: string }) {
  const url = new URL(`${getBaseUrl()}/recommendations/rules/proposals`);
  if (typeof params?.limit === "number") url.searchParams.set("limit", String(params.limit));
  if (params?.ruleId) url.searchParams.set("ruleId", params.ruleId);
  const res = await fetchJson<OpsEnvelope<{ items: RuleTuningProposal[]; total: number }>>(url);
  return res.data ?? { items: [], total: 0 };
}

export async function getRuleTuningProposal(id: string) {
  const url = `${getBaseUrl()}/recommendations/rules/proposals/${id}`;
  const res = await fetchJson<OpsEnvelope<{ proposal: RuleTuningProposal }>>(url);
  return res.data!.proposal;
}

export async function createRuleTuningProposal(input: { ruleId: string; sinceDays?: number; note?: string }) {
  const url = `${getBaseUrl()}/recommendations/rules/proposals`;
  const res = await fetchJson<OpsEnvelope<{ proposal: RuleTuningProposal }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!.proposal;
}

export async function transitionRuleTuningProposal(
  id: string,
  input: { status: "approved" | "rejected" | "applied"; note?: string; appliedConfig?: any },
) {
  const url = `${getBaseUrl()}/recommendations/rules/proposals/${id}/transition`;
  const res = await fetchJson<OpsEnvelope<{ proposal: RuleTuningProposal }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!.proposal;
}

export type SignalOverviewItem = {
  target: {
    type: "product" | "collection" | "faq";
    id: string;
    title: string;
    targetPath: string | null;
    faqTargetType?: string;
    faqTargetId?: string;
  };
  latestSnapshot: SignalSnapshot | null;
  previousSnapshot: SignalSnapshot | null;
  comparison: {
    current: {
      views: number;
      ctaRate: number;
      addToCartRate: number;
    };
    previous: {
      views: number;
      ctaRate: number;
      addToCartRate: number;
    } | null;
    delta: {
      views: number;
      ctaRate: number;
      addToCartRate: number;
    } | null;
  } | null;
  activeRecommendationsCount: number;
  maxSeverity: "info" | "warning" | "critical" | null;
  lastRecommendation: Recommendation | null;
};

export async function getSignalsOverview(params?: { targetType?: string; targetId?: string }) {
  const url = new URL(`${getBaseUrl()}/signals/overview`);
  if (params?.targetType) url.searchParams.set("targetType", params.targetType);
  if (params?.targetId) url.searchParams.set("targetId", params.targetId);
  const res = await fetchJson<
    OpsEnvelope<{
      items?: SignalOverviewItem[];
      item?: SignalOverviewItem;
      stats?: {
        total: number;
        needsAttention: number;
        critical: number;
        warning: number;
        info: number;
      };
    }>
  >(url);

  if (params?.targetType && params?.targetId) {
    return res.data?.item ?? null;
  }

  return res.data ?? {
    items: [],
    stats: {
      total: 0,
      needsAttention: 0,
      critical: 0,
      warning: 0,
      info: 0,
    },
  };
}

export async function getSignalOverviewForTarget(targetType: string, targetId: string) {
  const result = await getSignalsOverview({ targetType, targetId });
  return result as SignalOverviewItem | null;
}

export async function getSignalsStatus() {
  const url = `${getBaseUrl()}/signals/status`;
  const res = await fetchJson<
    OpsEnvelope<{
      storeFile: string;
      health: "healthy" | "degraded" | "critical";
      counts: {
        events: number;
        snapshots: number;
        recommendations: number;
      };
      consecutiveBatchFailures: number;
      lastBatchRun: {
        at: string;
        status: string;
        windowDays: number;
        total: number;
        items: Array<{
          targetType: string;
          targetId: string;
          contentRef: string | null;
          snapshotId: string;
          recommendationsCreated: number;
          metrics: {
            views: number;
            ctaClicks: number;
            addToCart: number;
          };
        }>;
        error: string | null;
      } | null;
      recentBatchRuns: Array<{
        at: string;
        status: string;
        windowDays: number;
        total: number;
        items: Array<{
          targetType: string;
          targetId: string;
          contentRef: string | null;
          snapshotId: string;
          recommendationsCreated: number;
          metrics: {
            views: number;
            ctaClicks: number;
            addToCart: number;
          };
        }>;
        error: string | null;
      }>;
    }>
  >(url);
  return res.data!;
}

export async function createSnapshotFromEvents(input: {
  targetType: string;
  targetId: string;
  contentRef?: string | null;
  windowDays?: number;
}) {
  const url = `${getBaseUrl()}/signals/snapshot`;
  const res = await fetchJson<OpsEnvelope<any>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data;
}
