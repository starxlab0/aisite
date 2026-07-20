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

export type RepoChangeRecord = {
  id: string;
  status:
    | "draft"
    | "pr_opened"
    | "ci_running"
    | "ci_passed"
    | "merge_candidate"
    | "auto_merge_candidate"
    | "ci_failed"
    | "merged"
    | "revert_candidate"
    | "reverted"
    | "cancelled";
  createdAt: string;
  updatedAt: string;
  actor?: string;
  kind?: string;
  proposalId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  title?: string | null;
  summary?: string | null;
  branchName?: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
  prState?: string | null;
  prIsDraft?: boolean | null;
  prLabels?: string[];
  mergedAt?: string | null;
  revertedAt?: string | null;
  readyForReviewAt?: string | null;
  autoMergeCandidateAt?: string | null;
  autoMergedAt?: string | null;
  mergeMethod?: string | null;
  mergeCommitSha?: string | null;
  postMergeRiskAt?: string | null;
  postMergeRiskSummary?: string | null;
  postMergeRecommendationIds?: string[];
  postMergeRiskCount?: number | null;
  autoActionGate?: {
    autoMerge: {
      allowed: boolean;
      reasons: string[];
      snapshot?: {
        policy: { ok: boolean; label: string; detail: string };
        ci: { ok: boolean; label: string; detail: string };
        labels: { ok: boolean; label: string; detail: string };
      };
    };
    autoRevert: {
      allowed: boolean;
      reasons: string[];
      snapshot?: {
        policy: { ok: boolean; label: string; detail: string };
        risk: { ok: boolean; label: string; detail: string };
        execution: { ok: boolean; label: string; detail: string };
      };
    };
  } | null;
  recommendedNextStep?: {
    code: string;
    label: string;
    tone: string;
  } | null;
  commitSha?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
  repoUrl?: string | null;
  ciStatus?: "not_started" | "queued" | "in_progress" | "success" | "failure" | null;
  ciConclusion?: string | null;
  checks?: Array<{
    name: string;
    status: string;
    conclusion?: string | null;
  }>;
  workflowRunId?: number | null;
  workflowRunUrl?: string | null;
  workflowName?: string | null;
  workflowStatus?: string | null;
  workflowConclusion?: string | null;
  workflowUpdatedAt?: string | null;
  failedJobs?: Array<{
    name: string;
    status: string;
    conclusion?: string | null;
    htmlUrl?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }>;
  workflowJobs?: Array<{
    name: string;
    status: string;
    conclusion?: string | null;
    htmlUrl?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }>;
  lastSyncedAt?: string | null;
  syncState?: "ok" | "error" | "unconfigured" | null;
  syncMessage?: string | null;
  revertBranchName?: string | null;
  revertPrUrl?: string | null;
  revertPrNumber?: number | null;
  revertPrState?: string | null;
  revertPrMergedAt?: string | null;
  revertCommitSha?: string | null;
  linkedDraftId?: string | null;
  linkedRecommendationId?: string | null;
  trigger?: string | null;
  transitions?: Array<{
    at: string;
    actor: string;
    from: string;
    to: string;
    note?: string | null;
  }>;
};

export type AutoActionPolicy = {
  autoMerge: {
    enabled: boolean;
    allowedTargetTypes: string[];
    allowedTriggers: string[];
    allowedTargetIds: string[];
    minRiskCount?: number;
  };
  autoRevert: {
    enabled: boolean;
    allowedTargetTypes: string[];
    allowedTriggers: string[];
    allowedTargetIds: string[];
    minRiskCount: number;
  };
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

export async function listOpsPlaybooks(params?: { limit?: number }) {
  const url = new URL(`${getBaseUrl()}/ops/playbooks`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  const res = await fetchJson<OpsEnvelope<{ items: any[]; total: number }>>(url, {
    headers: getAdminHeaders(),
  });
  return res.data ?? { items: [], total: 0 };
}

export async function getOpsPlaybook(id: string) {
  const url = `${getBaseUrl()}/ops/playbooks/${encodeURIComponent(id)}`;
  const res = await fetchJson<
    OpsEnvelope<{
      playbook: {
        id: string;
        key: string;
        status: string;
        title: string;
        source?: string;
        targetType?: string;
        updatedAt?: string;
        createdAt?: string;
        observationWindow?: string;
        observationMetrics?: string[];
        steps?: Array<{ code: string; label: string; detail: string }>;
        examples?: Array<{ targetLabel?: string; headline?: string; count?: number }>;
        applications?: Array<{
          id: string;
          status: string;
          createdAt: string;
          source?: string;
          targetType?: string;
          targetId?: string | null;
          targetLabel?: string;
          observationMetrics?: string[];
          nextAction?: {
            code: string;
            actionPath: string;
            actionLabel: string;
            description: string;
          } | null;
        }>;
      };
    }>
  >(url, { headers: getAdminHeaders() });
  return res.data!.playbook;
}

export async function applyOpsPlaybook(
  id: string,
  input: { source?: string; targetType?: string; targetId?: string | null; targetLabel?: string; note?: string },
) {
  const url = `${getBaseUrl()}/ops/playbooks/${encodeURIComponent(id)}/apply`;
  const res = await fetchJson<OpsEnvelope<{ playbook: any; application: any }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!;
}

export async function transitionOpsPlaybookApplication(
  playbookId: string,
  applicationId: string,
  input: { status: "in_review" | "executed" | "observing" | "succeeded" | "regressed" | "cancelled"; note?: string },
) {
  const url = `${getBaseUrl()}/ops/playbooks/${encodeURIComponent(playbookId)}/applications/${encodeURIComponent(applicationId)}/transition`;
  const res = await fetchJson<OpsEnvelope<{ playbook: any; application: any }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!;
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
  category?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  actionPrefix?: string;
  actor?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const url = new URL(`${getBaseUrl()}/ops/events`);
  if (params?.category) url.searchParams.set("category", params.category);
  if (params?.targetType) url.searchParams.set("targetType", params.targetType);
  if (params?.targetId) url.searchParams.set("targetId", params.targetId);
  if (params?.action) url.searchParams.set("action", params.action);
  if (params?.actionPrefix) url.searchParams.set("actionPrefix", params.actionPrefix);
  if (params?.actor) url.searchParams.set("actor", params.actor);
  if (params?.q) url.searchParams.set("q", params.q);
  if (typeof params?.limit === "number") url.searchParams.set("limit", String(params.limit));
  if (typeof params?.offset === "number") url.searchParams.set("offset", String(params.offset));
  const res = await fetchJson<OpsEnvelope<{ items: OpsEventRecord[]; total: number; limit?: number; offset?: number }>>(
    url,
  );
  return res.data ?? { items: [], total: 0 };
}

export async function createOpsTrialFeedback(input: {
  category: string;
  mostBlockedStep: string;
  easiestToMisclick: string;
  mostUnclearNextStep: string;
  note?: string;
  page?: string;
}) {
  const url = `${getBaseUrl()}/ops/events/feedback`;
  const res = await fetchJson<OpsEnvelope<{ event: OpsEventRecord }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!;
}

export type MonitoringSummary = {
  generatedAt: string;
  runtime: {
    controlPlane: "healthy";
    signalsHealth: "healthy" | "degraded" | "critical";
    cmsAdapter: string;
    consecutiveBatchFailures: number;
    lastBatchRunAt: string | null;
    seoSync: {
      enabled: boolean;
      configured: boolean;
      intervalMinutes: number;
      failureBaseDelayMinutes: number;
      failureMaxDelayMinutes: number;
      runOnStart: boolean;
      siteUrl: string | null;
      missing: string[];
      health: "healthy" | "warning" | "degraded" | "paused" | "not_configured" | "disabled";
      healthLabel: string;
      healthDetail: string;
      recoveryHint: string | null;
      source: string;
      lastRunStatus: "success" | "failure" | "skipped" | null;
      lastRunAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastSkippedAt: string | null;
      consecutiveFailures: number;
      lastError: string | null;
      lastErrorCategory: string | null;
      lastErrorCode: string | null;
      lastErrorRetryable: boolean | null;
      lastFetchedRows: number;
      lastIngestedRows: number;
      lastRequest: {
        siteUrl: string | null;
        startDate: string | null;
        endDate: string | null;
        rowLimit: number | null;
        searchType: string | null;
        dataState: string | null;
        aggregationType: string | null;
        dimensions: string[];
      } | null;
      lastActor: string | null;
      nextAllowedRunAt: string | null;
      backoffMinutes: number;
      paused: boolean;
      pausedAt: string | null;
      pausedBy: string | null;
      recentRuns: Array<{
        status: "success" | "failure" | "skipped";
        at: string;
        actor: string | null;
        fetchedRows: number;
        ingestedRows: number;
        error: string | null;
        errorCategory: string | null;
        errorCode: string | null;
        errorRetryable: boolean | null;
        recoveryHint: string | null;
        reason: string | null;
        request: {
          siteUrl: string | null;
          startDate: string | null;
          endDate: string | null;
        } | null;
      }>;
    };
    dependencies: {
      medusa: {
        status: "healthy" | "degraded" | "not_configured";
        baseUrl: string | null;
        statusCode: number | null;
        detail: string;
      };
      sanity: {
        status: "healthy" | "degraded" | "not_configured";
        projectId: string | null;
        dataset: string | null;
        statusCode: number | null;
        detail: string;
      };
    };
    counts: {
      events: number;
      snapshots: number;
      recommendations: number;
    };
  };
  seoRuntimeJudgment?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    detail: string;
    focusArea: "healthy" | "sync" | "freshness" | "import_gap" | "combined";
    actionHint: string;
  };
  todaysBestBet?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    reason: string;
    actionHint: string;
    actionPath: string;
    actionLabel: string;
    expectedImpact: string;
    source: "governance" | "growth_loop" | "geo" | "experiment";
    targetType: string;
    targetId: string | null;
    targetLabel: string;
    targetMeta: Record<string, string> | null;
    automationEligibility: "manual_only" | "auto_draft" | "auto_proposal_candidate";
    automationReason: string;
    automationArtifact: {
      kind: string;
      id: string;
      status: string;
      label: string;
      actionPath: string;
      actionLabel: string;
    } | null;
    promotionEligibility: "manual_review_only" | "draft_missing" | "draft_only" | "review_after_draft" | "candidate_ready";
    promotionReason: string;
    promotionAction: {
      code: string;
      actionPath: string;
      actionLabel: string;
      description: string;
      mutation: {
        kind: "proposal_transition" | "repo_change_transition";
        targetId: string;
        nextStatus: "approved" | "merge_candidate" | "auto_merge_candidate";
      } | null;
    };
    executionState: "pending" | "executed" | "observing" | "succeeded" | "returned_to_risk";
    executionReason: string;
    observationStatus: "not_started" | "handoff_ready" | "observing" | "complete" | "regressed";
    observationWindow: string;
    observationMetrics: string[];
    observationNextStep: string;
    playbookRef: {
      id: string;
      title: string;
      actionPath: string;
      latestApplication: {
        id: string;
        status: string;
        createdAt: string;
        nextAction: {
          code: string;
          actionPath: string;
          actionLabel: string;
          description: string;
        } | null;
      } | null;
    } | null;
  };
  decisionTimeline?: {
    trend: "risk_heavy" | "decision_heavy" | "execution_heavy" | "steady";
    summary: string;
    counts: {
      decision: number;
      execution: number;
      risk: number;
      signal: number;
    };
    currentStory: string;
    items: Array<{
      at: string;
      kind: "decision" | "execution" | "risk" | "signal";
      title: string;
      detail: string;
    }>;
  };
  dailySnapshotHistory?: {
    items: Array<{
      date: string;
      recordedAt: string;
      todaysBestBet: {
        health: "healthy" | "warning" | "degraded";
        headline: string;
        reason: string;
        actionHint: string;
        actionPath: string;
        actionLabel: string;
        expectedImpact: string;
        source: "governance" | "growth_loop" | "geo" | "experiment";
        targetType: string;
        targetId: string | null;
        targetLabel: string;
        targetMeta: Record<string, string> | null;
        automationEligibility: "manual_only" | "auto_draft" | "auto_proposal_candidate";
        automationReason: string;
        automationArtifact: {
          kind: string;
          id: string;
          status: string;
          label: string;
          actionPath: string;
          actionLabel: string;
        } | null;
        promotionEligibility: "manual_review_only" | "draft_missing" | "draft_only" | "review_after_draft" | "candidate_ready";
        promotionReason: string;
        promotionAction: {
          code: string;
          actionPath: string;
          actionLabel: string;
          description: string;
          mutation: {
            kind: "proposal_transition" | "repo_change_transition";
            targetId: string;
            nextStatus: "approved" | "merge_candidate" | "auto_merge_candidate";
          } | null;
        };
        executionState: "pending" | "executed" | "observing" | "succeeded" | "returned_to_risk";
        executionReason: string;
        observationStatus: "not_started" | "handoff_ready" | "observing" | "complete" | "regressed";
        observationWindow: string;
        observationMetrics: string[];
        observationNextStep: string;
      } | null;
      governanceOverview: {
        health: "healthy" | "warning" | "degraded";
        primaryLine: "seo" | "result_governance" | "commerce";
        headline: string | null;
      } | null;
      growthLoopOverview: {
        health: "healthy" | "warning" | "degraded";
        headline: string | null;
      } | null;
      geoOverview: {
        health: "healthy" | "warning" | "degraded";
        headline: string | null;
      } | null;
      growthExperimentOverview: {
        health: "healthy" | "warning" | "degraded";
        headline: string | null;
      } | null;
    }>;
  };
  weeklyOperatingReview?: {
    health: "healthy" | "warning" | "degraded";
    range: { from: string | null; to: string | null; days: number };
    headline: string;
    summary: string;
    executionOutcomes: {
      counts: {
        executed: number;
        observing: number;
        succeeded: number;
        returned_to_risk: number;
      };
      summary: string;
      items: Array<{
        date: string;
        source: "governance" | "growth_loop" | "geo" | "experiment";
        headline: string;
        targetLabel: string;
        executionState: "pending" | "executed" | "observing" | "succeeded" | "returned_to_risk";
        observationStatus: "not_started" | "handoff_ready" | "observing" | "complete" | "regressed";
      }>;
    };
    outcomeAttribution: {
      bySource: Record<
        "governance" | "growth_loop" | "geo" | "experiment",
        { total: number; executed: number; observing: number; succeeded: number; returned_to_risk: number }
      >;
      winningPatterns: Array<{
        source: "governance" | "growth_loop" | "geo" | "experiment";
        targetLabel: string;
        headline: string;
        count: number;
      }>;
      regressionPatterns: Array<{
        source: "governance" | "growth_loop" | "geo" | "experiment";
        targetLabel: string;
        headline: string;
        count: number;
      }>;
      hints: string[];
    };
    playbookDrafts: Array<{
      id: string;
      key: string;
      title: string;
      source: "governance" | "growth_loop" | "geo" | "experiment";
      targetType: string;
      actionPath: string;
      latestApplication: {
        id: string;
        status: string;
        createdAt: string;
        nextAction: {
          code: string;
          actionPath: string;
          actionLabel: string;
          description: string;
        } | null;
      } | null;
    }>;
    playbookApplicationOutcomes: {
      counts: Record<"draft" | "in_review" | "executed" | "observing" | "succeeded" | "regressed" | "cancelled", number>;
      summary: string;
      items: Array<{
        playbookId: string;
        playbookTitle: string;
        applicationId: string;
        createdAt: string;
        status: string;
        targetType: string;
        targetId: string | null;
        targetLabel: string;
        nextAction: { code: string; actionPath: string; actionLabel: string; description: string } | null;
        actionPath: string;
      }>;
    };
    focus: "governance" | "growth_loop" | "geo" | "experiment";
    bestBetSources: Record<string, number>;
    healthBuckets: Record<
      "governance" | "growth_loop" | "geo" | "experiment",
      { healthy: number; warning: number; degraded: number }
    >;
    riskDays: Array<{
      date: string;
      degraded: Array<"governance" | "growth_loop" | "geo" | "experiment">;
      bestBetSource: string;
    }>;
    nextWeekBets: Array<{
      priority: "p0" | "p1" | "p2";
      title: string;
      reason: string;
      actionPath: string;
      actionLabel: string;
      expectedImpact: string;
      metricSummary: string | null;
      targetType: string;
      targetId: string | null;
      targetLabel: string;
      targetMeta: Record<string, string> | null;
      automationEligibility: "manual_only" | "auto_draft" | "auto_proposal_candidate";
      automationReason: string;
      automationArtifact: {
        kind: string;
        id: string;
        status: string;
        label: string;
        actionPath: string;
        actionLabel: string;
      } | null;
      promotionEligibility: "manual_review_only" | "draft_missing" | "draft_only" | "review_after_draft" | "candidate_ready";
      promotionReason: string;
      promotionAction: {
        code: string;
        actionPath: string;
        actionLabel: string;
        description: string;
        mutation: {
          kind: "proposal_transition" | "repo_change_transition";
          targetId: string;
          nextStatus: "approved" | "merge_candidate" | "auto_merge_candidate";
        } | null;
      };
      executionState: "pending" | "executed" | "observing" | "succeeded" | "returned_to_risk";
      executionReason: string;
      observationStatus: "not_started" | "handoff_ready" | "observing" | "complete" | "regressed";
      observationWindow: string;
      observationMetrics: string[];
      observationNextStep: string;
      playbookRef: {
        id: string;
        title: string;
        actionPath: string;
        latestApplication: {
          id: string;
          status: string;
          createdAt: string;
          nextAction: {
            code: string;
            actionPath: string;
            actionLabel: string;
            description: string;
          } | null;
        } | null;
      } | null;
    }>;
  };
  governanceOverview?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    detail: string;
    primaryLine: "seo" | "result_governance" | "commerce";
    actionHint: string;
    lines: Array<{
      key: "seo" | "result_governance" | "commerce";
      title: string;
      health: "healthy" | "warning" | "degraded";
      headline: string;
      detail: string;
      actionHint: string;
      actionPath: string;
      actionLabel: string;
      supportingCount: number;
    }>;
  };
  growthLoopOverview?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    detail: string;
    actionHint: string;
    metrics: {
      seoTrackedTargets: number;
      seoLowCtrCount: number;
      seoPositionDropCount: number;
      checkoutStarts: number;
      checkoutCompletes: number;
      purchases24h: number;
      weakSources: number;
      purchaseMisalignedTargets: number;
    };
    lines: Array<{
      key: "traffic" | "conversion" | "result";
      title: string;
      status: "healthy" | "warning" | "degraded";
      detail: string;
    }>;
  };
  geoOverview?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    detail: string;
    actionHint: string;
    metrics: {
      seoTrackedTargets: number;
      seoLowCtrCount: number;
      seoPositionDropCount: number;
      entryViews: number;
      entryCtr: number;
      resultsViews: number;
      resultCtr: number;
      attributedProductViews: number;
      attributedPurchases: number;
      purchaseRateFromView: number;
      geoRiskItems: number;
    };
    lines: Array<{
      key: "discoverability" | "answer_quality" | "assisted_commerce";
      title: string;
      status: "healthy" | "warning" | "degraded";
      detail: string;
    }>;
  };
  growthExperimentOverview?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    detail: string;
    actionHint: string;
    totals: {
      needsDecision: number;
      observing: number;
      followupRisk: number;
      recovered: number;
    };
    groups: Array<{
      key: string;
      title: string;
      status: "healthy" | "warning" | "degraded";
      counts: {
        needsDecision: number;
        observing: number;
        followupRisk: number;
        recovered: number;
      };
    }>;
    items: Array<{
      groupKey: string;
      groupTitle: string;
      kind: "followup_risk" | "needs_decision" | "observing";
      id: string | null;
      headline: string;
      status: string;
      actionPath: string;
      actionLabel: string;
      targetType: string;
      targetId: string | null;
      targetLabel: string;
      targetMeta: Record<string, string> | null;
      effectState: "success" | "risk" | "observe" | "steady" | "failure" | null;
      effectSummary: string | null;
      effectMetrics: Array<{
        key: string;
        label: string;
        value: string;
      }>;
    }>;
  };
  seoSyncHistory?: {
    totalRunsTracked: number;
    statusCounts: {
      success: number;
      failure: number;
      skipped: number;
    };
    latestSuccessRun: MonitoringSummary["runtime"]["seoSync"]["recentRuns"][number] | null;
    latestFailureRun: MonitoringSummary["runtime"]["seoSync"]["recentRuns"][number] | null;
    latestSkippedRun: MonitoringSummary["runtime"]["seoSync"]["recentRuns"][number] | null;
    firstFailureInCurrentStreak: MonitoringSummary["runtime"]["seoSync"]["recentRuns"][number] | null;
    comparison: {
      latestSuccessAt: string | null;
      latestFailureAt: string | null;
      latestSuccessRows: {
        fetched: number;
        ingested: number;
      } | null;
      latestFailure: {
        category: string;
        code: string;
        retryable: boolean | null;
      } | null;
      changedSinceLastSuccess: boolean;
    } | null;
    recentRuns: MonitoringSummary["runtime"]["seoSync"]["recentRuns"];
  };
  seoSyncControlAudit?: {
    totalActionsTracked: number;
    actionCounts: {
      retry_now: number;
      pause: number;
      resume: number;
      clear_backoff: number;
    };
    latestAction: {
      at: string | null;
      actor: string | null;
      action: "retry_now" | "pause" | "resume" | "clear_backoff" | null;
      note: string | null;
      assessment: {
        status: "recovered" | "still_failing" | "pending_evidence" | "regressed" | "paused_intentionally";
        label: string;
        detail: string;
      };
      nextRun: {
        at: string | null;
        status: "success" | "failure" | "skipped" | null;
        errorCategory: string | null;
        errorCode: string | null;
        retryable: boolean | null;
        reason: string | null;
        ingestedRows: number;
      } | null;
    } | null;
    recentActions: Array<{
      at: string | null;
      actor: string | null;
      action: "retry_now" | "pause" | "resume" | "clear_backoff" | null;
      note: string | null;
      assessment: {
        status: "recovered" | "still_failing" | "pending_evidence" | "regressed" | "paused_intentionally";
        label: string;
        detail: string;
      };
      nextRun: {
        at: string | null;
        status: "success" | "failure" | "skipped" | null;
        errorCategory: string | null;
        errorCode: string | null;
        retryable: boolean | null;
        reason: string | null;
        ingestedRows: number;
      } | null;
    }>;
  };
  seoSyncRecoveryReview?: {
    status: "recovered" | "still_failing" | "pending_evidence" | "regressed" | "not_applicable";
    label: string;
    detail: string;
    latestAction: {
      at: string | null;
      actor: string | null;
      action: "retry_now" | "pause" | "resume" | "clear_backoff" | null;
      nextRun: {
        at: string | null;
        status: "success" | "failure" | "skipped" | null;
        errorCategory: string | null;
        errorCode: string | null;
        retryable: boolean | null;
        reason: string | null;
        ingestedRows: number;
      } | null;
    } | null;
  };
  resultGovernanceRuntimeJudgment?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    detail: string;
    focusArea: "healthy" | "payment" | "fulfillment" | "refund" | "combined";
    actionHint: string;
  };
  resultGovernanceLaneSummary?: {
    lanes: Array<{
      key: "payment" | "fulfillment" | "refund";
      title: string;
      health: "healthy" | "warning" | "degraded";
      headline: string;
      detail: string;
      counts: {
        recommendations: number;
        proposals: number;
        observationFollowups: number;
      };
      actionHint: string;
      actionPath: string;
      actionLabel: string;
    }>;
    totals: {
      recommendations: number;
      proposals: number;
      observationFollowups: number;
    };
  };
  commerceHealthSummary?: {
    health: "healthy" | "warning" | "degraded";
    label: string;
    detail: string;
    actionHint: string;
    weakestSource: string | null;
  };
  commerceRuntimeJudgment?: {
    health: "healthy" | "warning" | "degraded";
    headline: string;
    detail: string;
    focusArea: string;
    actionHint: string;
  };
  commerceSourceSummary?: {
    sources: Array<{
      key: string;
      source: string;
      health: "healthy" | "warning" | "degraded";
      headline: string;
      detail: string;
      counts: {
        recommendations: number;
        proposals: number;
        followupRisk: number;
      };
      actionHint: string;
      actionPath: string;
      actionLabel: string;
    }>;
    totals: {
      recommendations: number;
      proposals: number;
      followupRisk: number;
    };
  };
  seoFreshness?: {
    status: "healthy" | "warning" | "critical" | "not_configured";
    latestDate: string | null;
    latestUpdatedAt: string | null;
    latestSource: string | null;
    daysSinceLatest: number | null;
    totalRows: number;
    targetsTracked: number;
    targetsWithRecentData: number;
    thresholds: {
      warningDays: number;
      criticalDays: number;
    };
  };
  seoImportDiagnostics?: {
    latestRun: {
      id: string;
      createdAt: string;
      source: string;
      actor: string;
      parsedRows: number;
      normalizedRows: number;
      ingested: number;
      skippedRows: number;
      importDate: string | null;
      unmappedPages: string[];
      activeUnmappedPages: number;
      resolvedUnmappedPages: number;
      status: "healthy" | "partial" | "warning";
    } | null;
    recentRuns: Array<{
      id: string;
      createdAt: string;
      source: string;
      actor: string;
      parsedRows: number;
      normalizedRows: number;
      ingested: number;
      skippedRows: number;
      importDate: string | null;
      unmappedPages: string[];
    }>;
    recentUnmappedPages: Array<{
      pagePath: string;
      count: number;
      lastSeenAt: string;
      suggestion?: {
        targetType: string;
        targetId: string;
        confidence: "high" | "medium";
        reason: string;
      } | null;
      repoChange?: {
        id: string;
        status: string;
        prUrl: string | null;
        prNumber: number | null;
        branchName: string | null;
        updatedAt: string | null;
      } | null;
      resolutionStatus?: "unresolved" | "registered_pending_refresh";
    }>;
    resolvedRecentUnmappedPages: Array<{
      pagePath: string;
      count: number;
      lastSeenAt: string;
      suggestion?: {
        targetType: string;
        targetId: string;
        confidence: "high" | "medium";
        reason: string;
      } | null;
      repoChange?: {
        id: string;
        status: string;
        prUrl: string | null;
        prNumber: number | null;
        branchName: string | null;
        updatedAt: string | null;
      } | null;
      resolutionStatus?: "unresolved" | "registered_pending_refresh";
    }>;
  };
  seoPerformance?: {
    windowDays: number;
    targets: Array<{
      targetType: string;
      targetId: string;
      title?: string;
      targetPath?: string | null;
      issueTypes?: string[];
      issueScore?: number;
      summary: {
        windowDays: number;
        current: { impressions: number; clicks: number; ctr: number; position: number | null };
        previous: { impressions: number; clicks: number; ctr: number; position: number | null };
        delta: { impressions: number; clicks: number; ctr: number; position: number | null };
      };
    }>;
  };
  workflow: {
    openCount: number;
    inProgressCount: number;
    staleCount: number;
    staleExamples: Array<{
      id: string;
      ruleId: string;
      targetType: string;
      targetId: string;
      staleDays: number;
      priorityLevel: string;
      targetPath: string | null;
    }>;
    thresholds: {
      warning: number;
      critical: number;
    };
  };
  publishing: {
    warningPublishes24h: number;
    blockedPublishes24h: number;
    rollbacks24h: number;
    blockedFollowupsOpen: number;
    warningFollowupsOpen: number;
    cases: Array<{
      targetType: string;
      targetId: string;
      action: string;
      eventAt: string;
      verificationLevel: string | null;
      rollbackTrigger: string | null;
      rollbackTriggerReason: string | null;
      note: string | null;
      governanceStatus: string;
      nextAction: string;
      linkedDraftId: string | null;
      linkedRecommendationId: string | null;
      incidentProposalId: string | null;
      incidentProposalStatus: string | null;
      repoChangeId: string | null;
      repoChangeStatus: RepoChangeRecord["status"] | null;
      repoChangePrUrl: string | null;
      repoChangeNextStepCode: string | null;
      repoChangeNextStepLabel: string | null;
      actionCode: string;
      actionLabel: string;
      actionTone: "ready" | "progress" | "warning" | "critical";
      actionDetail: string;
      stateCode: string;
      stateLabel: string;
      stateTone: "ready" | "progress" | "warning" | "critical";
    }>;
    queue: {
      items: Array<{
        targetType: string;
        targetId: string;
        action: string;
        eventAt: string;
        verificationLevel: string | null;
        rollbackTrigger: string | null;
        rollbackTriggerReason: string | null;
        note: string | null;
        governanceStatus: string;
        nextAction: string;
        linkedDraftId: string | null;
        linkedRecommendationId: string | null;
        incidentProposalId: string | null;
        incidentProposalStatus: string | null;
        repoChangeId: string | null;
        repoChangeStatus: RepoChangeRecord["status"] | null;
        repoChangePrUrl: string | null;
        repoChangeNextStepCode: string | null;
        repoChangeNextStepLabel: string | null;
        actionCode: string;
        actionLabel: string;
        actionTone: "ready" | "progress" | "warning" | "critical";
        actionDetail: string;
        stateCode: string;
        stateLabel: string;
        stateTone: "ready" | "progress" | "warning" | "critical";
        priorityScore: number;
      }>;
      counts: Record<string, number>;
      top: Array<{
        targetType: string;
        targetId: string;
        actionCode: string;
        actionLabel: string;
        actionTone: "ready" | "progress" | "warning" | "critical";
        stateCode: string;
        stateLabel: string;
        stateTone: "ready" | "progress" | "warning" | "critical";
        priorityScore: number;
        governanceStatus: string;
        eventAt: string;
      } & Record<string, unknown>>;
    };
    thresholds: {
      warningPublishes24h: { warning: number; critical: number };
      blockedPublishes24h: { critical: number };
      rollbacks24h: { critical: number };
      blockedFollowupsOpen: { critical: number };
      warningFollowupsOpen: { warning: number; critical: number };
    };
  };
  purchase: {
    misalignedTargetsCount: number;
    topGaps: Array<{
      title: string;
      targetType: string;
      targetId: string;
      targetPath: string | null;
      status: string;
      gap: number;
      eventPurchaseCount: number;
      snapshotPurchaseCount: number;
      windowDays: number;
    }>;
    thresholdAbsGap: {
      warning: number;
      critical: number;
    };
  };
  paymentResults24h: {
    paid: number;
    authorized: number;
    failed: number;
    canceled: number;
    requiresAction: number;
    issues: number;
    issueRate: number;
    recoveryLanes: {
      providerReview: number;
      customerRetry: number;
      customerAction: number;
      awaitingCapture: number;
      fulfillmentReady: number;
    };
    topReasons: {
      payment_failed: Array<{
        key: string;
        issueKey: string;
        reason: string;
        label: string;
        affectedOrders: number;
      }>;
      payment_canceled: Array<{
        key: string;
        issueKey: string;
        reason: string;
        label: string;
        affectedOrders: number;
      }>;
      payment_requires_action: Array<{
        key: string;
        issueKey: string;
        reason: string;
        label: string;
        affectedOrders: number;
      }>;
    };
    dominantReasons: {
      payment_failed: { key: string; issueKey: string; reason: string; label: string; affectedOrders: number } | null;
      payment_canceled: { key: string; issueKey: string; reason: string; label: string; affectedOrders: number } | null;
      payment_requires_action: { key: string; issueKey: string; reason: string; label: string; affectedOrders: number } | null;
    };
    topTargets: {
      payment_failed: Array<{
        key: string;
        issueKey: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
      payment_canceled: Array<{
        key: string;
        issueKey: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
      payment_requires_action: Array<{
        key: string;
        issueKey: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
    };
    recommendations: Array<{
      id: string;
      ruleId: string;
      severity: string;
      reason: string;
      suggestedWorkflow: string;
      status: string;
      targetType: string;
      targetId: string;
      context?: {
        issueKey?: string;
        metricKey?: string;
        metricLabel?: string;
        parentProposalId?: string;
        recoveryLane?: string;
        recoveryOwner?: string;
        paymentIssueReason?: string | null;
        paymentIssueReasonLabel?: string | null;
        observedCount?: number;
        issueRate?: number;
        paidRate?: number;
        paidCount?: number;
        authorizedCount?: number;
        requiresActionCount?: number;
        failedCount?: number;
        canceledCount?: number;
        sampleSize?: number;
        paymentAttempts?: number;
        deltaTargetedIssueRate?: number;
        targetPath?: string;
        targetBreakdown?: Array<{
          key: string;
          issueKey: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          targetPath?: string;
          affectedOrders: number;
        }>;
        weakestPath?: {
          key: string;
          issueKey: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          targetPath?: string;
          affectedOrders: number;
        } | null;
        actionHints?: string[];
      } | null;
    }>;
    proposals: Array<{
      id: string;
      type: string;
      status: string;
      anomalyKind?: string | null;
      targetType?: string | null;
      targetId?: string | null;
      summary?: string | null;
      expectedImpact?: string | null;
      applyHowTo?: string | null;
      linkedRecommendationId?: string | null;
      createdAt?: string | null;
      context?: {
        issueKey?: string;
        targetPath?: string | null;
        metricLabel?: string;
        weakestPath?: {
          key: string;
          issueKey: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          targetPath?: string;
          affectedOrders: number;
        } | null;
      } | null;
    }>;
    proposalSync: {
      evaluated: number;
      createdOrUpdated: number;
    };
    governance: {
      counts: {
        mainNeedsDecision: number;
        observing: number;
        followupRisk: number;
        recovered: number;
      };
      top: {
        mainNeedsDecision: Array<{
          id: string;
          status: string;
          source: string;
          path: string | null;
          headline: string;
          nextStep: string | null;
        }>;
        observing: Array<{
          id: string;
          status: string;
          source: string;
          path: string | null;
          headline: string;
          nextStep: string | null;
        }>;
        followupRisk: Array<{
          id: string;
          status: string;
          source: string;
          path: string | null;
          headline: string;
          nextStep: string | null;
        }>;
      };
    };
  };
  fulfillmentResults24h: {
    processing: number;
    shipped: number;
    delivered: number;
    topTargets: {
      fulfillment_processing: Array<{
        key: string;
        eventType: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
      fulfillment_shipped: Array<{
        key: string;
        eventType: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
      fulfillment_delivered: Array<{
        key: string;
        eventType: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
    };
    recommendations: Array<{
      id: string;
      ruleId: string;
      severity: string;
      reason: string;
      suggestedWorkflow: string;
      status: string;
      targetType: string;
      targetId: string;
      context?: {
        stageKey?: string;
        metricKey?: string;
        metricLabel?: string;
        parentProposalId?: string;
        observedCount?: number;
        processingCount?: number;
        shippedCount?: number;
        deliveredCount?: number;
        sampleSize?: number;
        deltaProcessingBacklogRate?: number;
        shippedRate?: number;
        deliveredRate?: number;
        recoveryLane?: string;
        recoveryOwner?: string;
        targetPath?: string;
        targetBreakdown?: Array<{
          key: string;
          eventType: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          targetPath?: string;
          affectedOrders: number;
        }>;
        weakestPath?: {
          key: string;
          eventType: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          targetPath?: string;
          affectedOrders: number;
        } | null;
        actionHints?: string[];
      } | null;
    }>;
    proposals: Array<{
      id: string;
      type: string;
      status: string;
      anomalyKind?: string | null;
      targetType?: string | null;
      targetId?: string | null;
      summary?: string | null;
      expectedImpact?: string | null;
      applyHowTo?: string | null;
      linkedRecommendationId?: string | null;
      createdAt?: string | null;
      context?: {
        stageKey?: string;
        targetPath?: string | null;
        metricLabel?: string;
        weakestPath?: {
          key: string;
          eventType: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          targetPath?: string;
          affectedOrders: number;
        } | null;
      } | null;
    }>;
    proposalSync: {
      evaluated: number;
      createdOrUpdated: number;
    };
  };
  refundResults24h: {
    requested: number;
    refunded: number;
    backlog: number;
    topTargets: {
      refund_requested: Array<{
        key: string;
        eventType: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
      refund_refunded: Array<{
        key: string;
        eventType: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        targetPath?: string;
        affectedOrders: number;
      }>;
    };
  };
  commerceCheckout: {
    checkoutStarts: number;
    checkoutCompletes: number;
    checkoutDropoff: number;
    checkoutCompletionRate: number;
    purchases24h: number;
    bySource: Array<{
      source: string;
      checkoutStarts: number;
      checkoutCompletes: number;
      checkoutDropoff: number;
      checkoutCompletionRate: number;
      purchases24h: number;
      paths: Array<{
        key: string;
        source: string;
        targetType: string;
        targetId: string;
        contentRef?: string | null;
        checkoutStarts: number;
        checkoutCompletes: number;
        checkoutDropoff: number;
        checkoutCompletionRate: number;
        purchases24h: number;
      }>;
    }>;
    recommendations: Array<{
      id: string;
      ruleId: string;
      severity: string;
      reason: string;
      suggestedWorkflow: string;
      status: string;
      targetType: string;
      targetId: string;
      context?: {
        sourceKey?: string;
        parentProposalId?: string;
        targetPath?: string;
        metricKey?: string;
        metricLabel?: string;
        observedRate?: number;
        threshold?: number;
        sampleSize?: number;
        checkoutStarts?: number;
        checkoutCompletes?: number;
        checkoutDropoff?: number;
        deltaCheckoutCompletionRate?: number;
        targetBreakdown?: Array<{
          key: string;
          source: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          checkoutStarts: number;
          checkoutCompletes: number;
          checkoutDropoff: number;
          checkoutCompletionRate: number;
          purchases24h: number;
        }>;
        weakestPath?: {
          key: string;
          source: string;
          targetType: string;
          targetId: string;
          contentRef?: string | null;
          checkoutStarts: number;
          checkoutCompletes: number;
          checkoutDropoff: number;
          checkoutCompletionRate: number;
          purchases24h: number;
        } | null;
        actionHints?: string[];
      } | null;
    }>;
    proposals: Array<{
      id: string;
      type: string;
      status: string;
      anomalyKind?: string | null;
      targetType?: string | null;
      targetId?: string | null;
      summary?: string | null;
      expectedImpact?: string | null;
      applyHowTo?: string | null;
      linkedRecommendationId?: string | null;
      createdAt?: string | null;
    }>;
    proposalSync: {
      evaluated: number;
      createdOrUpdated: number;
    };
    governance: {
      counts: {
        mainNeedsDecision: number;
        observing: number;
        followupRisk: number;
        recovered: number;
      };
      top: {
        mainNeedsDecision: Array<{
          id: string;
          status: string;
          source: string;
          path: string | null;
          headline: string;
          nextStep: string | null;
        }>;
        observing: Array<{
          id: string;
          status: string;
          source: string;
          path: string | null;
          headline: string;
          nextStep: string | null;
        }>;
        followupRisk: Array<{
          id: string;
          status: string;
          source: string;
          path: string | null;
          headline: string;
          nextStep: string | null;
        }>;
      };
    };
  };
  aiConcierge: {
    events24h: number;
    buckets: {
      A: number;
      B: number;
      unknown: number;
    };
    funnel: {
      entryViews: number;
      entryClicks: number;
      quizViews: number;
      resultsViews: number;
      resultClicks: number;
      attributedProductViews: number;
      attributedAddToCart: number;
      attributedPurchases: number;
      entryCtr: number;
      resultCtr: number;
      atcRate: number;
      purchaseRateFromAtc: number;
      purchaseRateFromView: number;
    };
    recommendations: Array<{
      id: string;
      ruleId: string;
      severity: string;
      reason: string;
      suggestedWorkflow: string;
      status: string;
      context?: {
        metricKey?: string;
        metricLabel?: string;
      } | null;
    }>;
    proposals: Array<RuleTuningProposal>;
    governance: {
      counts: {
        mainNeedsDecision: number;
        mainAppliedObserving: number;
        mainAppliedRisk: number;
        followupFixCi: number;
        followupManualReview: number;
        followupObserving: number;
        followupSuccess: number;
        followupRisk: number;
      };
      top: {
        followupFixCi: Array<{ id: string; status: string; headline: string; prUrl: string | null; nextStep: string | null }>;
        followupManualReview: Array<{ id: string; status: string; headline: string; prUrl: string | null; nextStep: string | null }>;
        followupObserving: Array<{ id: string; status: string; headline: string; prUrl: string | null; nextStep: string | null }>;
      };
    };
  };
  governanceGroups: Array<{
    key: string;
    title: string;
    description: string;
    counts: {
      mainNeedsDecision?: number;
      observing?: number;
      recovered?: number;
      mainAppliedObserving?: number;
      mainAppliedRisk?: number;
      followupFixCi?: number;
      followupManualReview?: number;
      followupObserving?: number;
      followupSuccess?: number;
      followupRisk?: number;
    };
    top: {
      mainNeedsDecision?: Array<{ id: string; status: string; source: string; path: string | null; headline: string; nextStep: string | null }>;
      observing?: Array<{ id: string; status: string; source: string; path: string | null; headline: string; nextStep: string | null }>;
      followupRisk?: Array<{ id: string; status: string; source: string; path: string | null; headline: string; nextStep: string | null }>;
      followupFixCi?: Array<{ id: string; status: string; headline: string; prUrl: string | null; nextStep: string | null }>;
      followupManualReview?: Array<{ id: string; status: string; headline: string; prUrl: string | null; nextStep: string | null }>;
      followupObserving?: Array<{ id: string; status: string; headline: string; prUrl: string | null; nextStep: string | null }>;
    };
  }>;
  alerts: Array<{
    level: "critical" | "warning" | "info";
    title: string;
    detail: string;
  }>;
};

export type OpsAlert = {
  id: string;
  key: string;
  status: "open" | "acked";
  level: "warning" | "critical" | string;
  title: string;
  detail: string;
  source: string;
  target?: { type: string; id: string } | null;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  ackAt?: string | null;
  ackBy?: string | null;
  ackNote?: string | null;
  notify?: {
    channel: string;
    status: "pending" | "sent" | "failed" | "skipped" | string;
    attempts: number;
    lastAttemptAt?: string | null;
    sentAt?: string | null;
    lastError?: string | null;
    messageId?: string | null;
    to?: string[];
  } | null;
};

export type CustomerNotification = {
  id: string;
  key: string;
  status: "open" | "acked";
  kind: string;
  orderId: string;
  title: string;
  detail: string;
  to: string;
  actionUrl?: string | null;
  source: string;
  target?: { type: string; id: string } | null;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  ackAt?: string | null;
  ackBy?: string | null;
  ackNote?: string | null;
  notify?: {
    channel: string;
    status: "pending" | "sent" | "failed" | "skipped" | string;
    attempts: number;
    lastAttemptAt?: string | null;
    sentAt?: string | null;
    lastError?: string | null;
    messageId?: string | null;
    to?: string[];
  } | null;
};

export type SupportCase = {
  id: string;
  key: string;
  status: "open" | "acked" | "resolved";
  kind: string;
  severity: string;
  title: string;
  detail: string;
  source: string;
  target?: { type: string; id: string } | null;
  targetPath?: string | null;
  context?: Record<string, unknown> | null;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  owner?: string | null;
  suggestedOwner?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  sla?: {
    hours: number;
    dueAt?: string | null;
    overdue: boolean;
  } | null;
  ackAt?: string | null;
  ackBy?: string | null;
  ackNote?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
};

export async function getMonitoringSummary(params?: { targetType?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/monitoring-summary`);
  if (params?.targetType) url.searchParams.set("targetType", params.targetType);
  const res = await fetchJson<OpsEnvelope<MonitoringSummary>>(url);
  return res.data!;
}

export async function listOpsAlerts(params?: { status?: "open" | "acked"; limit?: number }) {
  const url = new URL(`${getBaseUrl()}/ops/alerts`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  const res = await fetchJson<OpsEnvelope<{ items: OpsAlert[]; total: number }>>(url);
  return res.data!;
}

export async function ackOpsAlert(id: string, params?: { note?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/alerts/${id}/ack`);
  const res = await fetchJson<OpsEnvelope<{ alert: OpsAlert }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ note: params?.note ?? null }),
  });
  return res.data!;
}

export async function resendOpsAlert(id: string) {
  const url = new URL(`${getBaseUrl()}/ops/alerts/${id}/resend`);
  const res = await fetchJson<OpsEnvelope<any>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!;
}

export async function listCustomerNotifications(params?: { status?: "open" | "acked"; q?: string; limit?: number }) {
  const url = new URL(`${getBaseUrl()}/ops/customer-notifications`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.q) url.searchParams.set("q", params.q);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  const res = await fetchJson<OpsEnvelope<{ items: CustomerNotification[]; total: number }>>(url);
  return res.data!;
}

export async function ackCustomerNotification(id: string, params?: { note?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/customer-notifications/${id}/ack`);
  const res = await fetchJson<OpsEnvelope<{ notification: CustomerNotification }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ note: params?.note ?? null }),
  });
  return res.data!;
}

export async function sendCustomerNotification(id: string) {
  const url = new URL(`${getBaseUrl()}/ops/customer-notifications/${id}/send`);
  const res = await fetchJson<OpsEnvelope<any>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!;
}

export async function listSupportCases(params?: {
  status?: "open" | "acked" | "resolved";
  owner?: string;
  kind?: string;
  severity?: string;
  q?: string;
  overdue?: boolean;
  limit?: number;
}) {
  const url = new URL(`${getBaseUrl()}/ops/support-cases`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.owner) url.searchParams.set("owner", params.owner);
  if (params?.kind) url.searchParams.set("kind", params.kind);
  if (params?.severity) url.searchParams.set("severity", params.severity);
  if (params?.q) url.searchParams.set("q", params.q);
  if (params?.overdue) url.searchParams.set("overdue", "true");
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  const res = await fetchJson<
    OpsEnvelope<{
      items: SupportCase[];
      total: number;
      summary: {
        total: number;
        overdue: number;
        unassigned: number;
        critical: number;
        byOwner: Array<{ owner: string | null; count: number }>;
      };
    }>
  >(url);
  return res.data!;
}

export type SeoMetricRow = {
  id: string;
  key: string;
  date: string;
  targetType: string;
  targetId: string;
  pagePath?: string | null;
  query?: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  position?: number | null;
  source: string;
  ingestedBy: string;
  createdAt: string;
  updatedAt: string;
};

export async function listSeoMetrics(params?: {
  targetType?: string;
  targetId?: string;
  sinceDays?: number;
  limit?: number;
  windowDays?: number;
}) {
  const url = new URL(`${getBaseUrl()}/ops/seo-metrics`);
  if (params?.targetType) url.searchParams.set("targetType", params.targetType);
  if (params?.targetId) url.searchParams.set("targetId", params.targetId);
  if (params?.sinceDays) url.searchParams.set("sinceDays", String(params.sinceDays));
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.windowDays) url.searchParams.set("windowDays", String(params.windowDays));
  const res = await fetchJson<
    OpsEnvelope<{
      items: SeoMetricRow[];
      total: number;
      summary: {
        windowDays: number;
        current: { impressions: number; clicks: number; ctr: number; position: number | null };
        previous: { impressions: number; clicks: number; ctr: number; position: number | null };
        delta: { impressions: number; clicks: number; ctr: number; position: number | null };
      } | null;
    }>
  >(url, { headers: getAdminHeaders() });
  return res.data!;
}

export async function ingestSeoMetrics(params: { rows: Array<any>; source?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/seo-metrics/ingest`);
  const res = await fetchJson<OpsEnvelope<{ ingested: number }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ rows: params.rows, source: params.source ?? "manual" }),
  });
  return res.data!;
}

export async function importSeoMetricsFromSearchConsole(params: {
  rows?: Array<any>;
  csvText?: string;
  importDate?: string;
  source?: string;
}) {
  const url = new URL(`${getBaseUrl()}/ops/seo-metrics/import`);
  const res = await fetchJson<
    OpsEnvelope<{
      ingested: number;
      parsedRows: number;
      normalizedRows: number;
      skippedRows: number;
      unmappedPages: string[];
      importDate: string | null;
    }>
  >(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({
      rows: params.rows ?? [],
      csvText: params.csvText ?? "",
      importDate: params.importDate ?? null,
      source: params.source ?? "search_console",
    }),
  });
  return res.data!;
}

export async function registerSeoTarget(params: {
  targetType: "product" | "collection" | "guide";
  targetId: string;
  targetPath: string;
  title?: string;
}) {
  const url = new URL(`${getBaseUrl()}/ops/seo-targets/register`);
  const res = await fetchJson<
    OpsEnvelope<{
      repoChange: any;
      result: { status: string; message?: string } | null;
    }>
  >(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(params),
  });
  return res.data!;
}

export async function replayLatestSeoImport() {
  const url = new URL(`${getBaseUrl()}/ops/seo-metrics/replay-latest`);
  const res = await fetchJson<
    OpsEnvelope<{
      status: string;
      replayedAt?: string;
      ingested?: number;
      parsedRows?: number;
      normalizedRows?: number;
      skippedRows?: number;
      unmappedPages?: string[];
      message?: string;
    }>
  >(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!;
}

export async function controlSeoSearchConsoleSync(action: "retry_now" | "clear_backoff" | "pause" | "resume") {
  const url = new URL(`${getBaseUrl()}/ops/seo-metrics/sync-search-console/control`);
  const res = await fetchJson<OpsEnvelope<{ action: string; result?: any; seoSyncStatus: MonitoringSummary["runtime"]["seoSync"] }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ action }),
  });
  return res.data!;
}

export async function assignSupportCase(id: string, params?: { owner?: string; note?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/support-cases/${id}/assign`);
  const res = await fetchJson<OpsEnvelope<{ supportCase: SupportCase }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ owner: params?.owner ?? null, note: params?.note ?? null }),
  });
  return res.data!;
}

export async function ackSupportCase(id: string, params?: { note?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/support-cases/${id}/ack`);
  const res = await fetchJson<OpsEnvelope<{ supportCase: SupportCase }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ note: params?.note ?? null }),
  });
  return res.data!;
}

export async function resolveSupportCase(id: string, params?: { note?: string }) {
  const url = new URL(`${getBaseUrl()}/ops/support-cases/${id}/resolve`);
  const res = await fetchJson<OpsEnvelope<{ supportCase: SupportCase }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ note: params?.note ?? null }),
  });
  return res.data!;
}

export async function syncIncidentFollowups(params?: { limit?: number; dryRun?: boolean }) {
  const url = new URL(`${getBaseUrl()}/recommendations/incidents/sync`);
  const res = await fetchJson<OpsEnvelope<any>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({
      limit: params?.limit ?? 10,
      dryRun: Boolean(params?.dryRun),
    }),
  });
  return res.data!;
}

export async function listRepoChanges(params?: {
  status?: string;
  targetType?: string;
  targetId?: string;
  limit?: number;
}) {
  const url = new URL(`${getBaseUrl()}/ops/repo-changes`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.targetType) url.searchParams.set("targetType", params.targetType);
  if (params?.targetId) url.searchParams.set("targetId", params.targetId);
  if (typeof params?.limit === "number") url.searchParams.set("limit", String(params.limit));
  const res = await fetchJson<OpsEnvelope<{ items: RepoChangeRecord[]; total: number }>>(url);
  return res.data ?? { items: [], total: 0 };
}

export async function syncRepoChange(id: string) {
  const url = `${getBaseUrl()}/ops/repo-changes/${id}/sync`;
  const res = await fetchJson<OpsEnvelope<{ repoChange: RepoChangeRecord; sync: { status: string; message: string } }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!;
}

export async function getAutoActionPolicy() {
  const url = `${getBaseUrl()}/ops/auto-action-policy`;
  const res = await fetchJson<OpsEnvelope<{ policy: AutoActionPolicy }>>(url, {
    headers: getAdminHeaders(),
  });
  return res.data!;
}

export async function updateAutoActionPolicy(policy: Partial<AutoActionPolicy>) {
  const url = `${getBaseUrl()}/ops/auto-action-policy`;
  const res = await fetchJson<OpsEnvelope<{ policy: AutoActionPolicy }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({ policy }),
  });
  return res.data!;
}

export async function syncActiveRepoChanges(input?: { limit?: number; targetType?: string; targetId?: string }) {
  const url = `${getBaseUrl()}/ops/repo-changes/sync`;
  const res = await fetchJson<
    OpsEnvelope<{ total: number; items: Array<{ repoChange: RepoChangeRecord; sync: { status: string; message: string } }> }>
  >(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input ?? {}),
  });
  return res.data!;
}

export async function openRepoChangePullRequest(id: string) {
  const url = `${getBaseUrl()}/ops/repo-changes/${id}/open-pr`;
  const res = await fetchJson<OpsEnvelope<{ repoChange: RepoChangeRecord; result: { status: string; message: string } }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!;
}

export async function openRepoChangeRevertPullRequest(id: string) {
  const url = `${getBaseUrl()}/ops/repo-changes/${id}/revert-pr`;
  const res = await fetchJson<OpsEnvelope<{ repoChange: RepoChangeRecord; result: { status: string; message: string } }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify({}),
  });
  return res.data!;
}

export async function transitionRepoChange(
  id: string,
  input: {
    status: "merge_candidate" | "auto_merge_candidate";
    note?: string;
    patch?: Record<string, any>;
  },
) {
  const url = `${getBaseUrl()}/ops/repo-changes/${id}/transition`;
  const res = await fetchJson<OpsEnvelope<{ repoChange: RepoChangeRecord }>>(url, {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(input),
  });
  return res.data!.repoChange;
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
    purchases: number;
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
        metrics: { views: number; ctaClicks: number; addToCart: number; purchases: number };
        rates: { ctaRate: number; addToCartRate: number; purchaseRate: number };
    };
    after: null | {
      contentRef: string | null;
      capturedAt: string;
        metrics: { views: number; ctaClicks: number; addToCart: number; purchases: number };
        rates: { ctaRate: number; addToCartRate: number; purchaseRate: number };
    };
    delta: null | {
        rates: { ctaRate: number; addToCartRate: number; purchaseRate: number };
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
  successPattern?: {
    sourceRecommendationId: string;
    sourceRuleId: string;
    targetType: string;
    contentRef: string | null;
    purchaseDeltaRate: number;
    focusAreas: string[];
    actionHints: string[];
    optimizationGoal?: string | null;
    summary: string;
  } | null;
  context?: {
    snapshot: {
      id: string;
      capturedAt: string;
      windowDays: number;
      contentRef: string | null;
      metrics: { views: number; ctaClicks: number; addToCart: number; purchases: number };
      rates: { ctaRate: number; addToCartRate: number; purchaseRate: number };
    };
    previous:
      | {
          id: string;
          capturedAt: string;
          contentRef: string | null;
          metrics: { views: number; ctaClicks: number; addToCart: number; purchases: number };
          rates: { ctaRate: number; addToCartRate: number; purchaseRate: number };
        }
      | null;
    delta:
      | {
          metrics: { views: number; ctaClicks: number; addToCart: number; purchases: number };
          rates: { ctaRate: number; addToCartRate: number; purchaseRate: number };
        }
      | null;
    focusAreas: string[];
    suggestedWorkflow: string;
    optimizationGoal?: string | null;
    actionHints?: string[];
    referencePattern?: {
      sourceRecommendationId: string;
      sourceRuleId: string;
      targetType: string;
      contentRef: string | null;
      purchaseDeltaRate: number;
      focusAreas: string[];
      actionHints: string[];
      optimizationGoal?: string | null;
      summary: string;
    } | null;
  };
};

export async function getSignals(params: { targetType: string; targetId: string }) {
  const url = new URL(`${getBaseUrl()}/signals`);
  url.searchParams.set("targetType", params.targetType);
  url.searchParams.set("targetId", params.targetId);
  const res = await fetchJson<OpsEnvelope<{ items: SignalSnapshot[]; total: number }>>(url);
  return res.data ?? { items: [], total: 0 };
}

export type PurchaseDiagnostics = {
  targetType: string | null;
  targetId: string | null;
  windowDays: number;
  untilAt: string;
  latestSnapshot: null | {
    id: string;
    capturedAt: string;
    source: string;
    contentRef: string | null;
    purchases: number;
  };
  eventPurchaseCount: number;
  snapshotPurchaseCount: number;
  gap: number;
  status: "aligned" | "snapshot_behind" | "snapshot_ahead" | "missing_snapshot";
  bySource: Array<{
    source: string;
    count: number;
    latestAt: string | null;
  }>;
  latestEventAt: string | null;
};

export async function getPurchaseDiagnostics(params: { targetType: string; targetId: string; windowDays?: number }) {
  const url = new URL(`${getBaseUrl()}/signals/purchase-diagnostics`);
  url.searchParams.set("targetType", params.targetType);
  url.searchParams.set("targetId", params.targetId);
  if (typeof params.windowDays === "number") url.searchParams.set("windowDays", String(params.windowDays));
  const res = await fetchJson<OpsEnvelope<PurchaseDiagnostics>>(url);
  return res.data!;
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
  targetType?: string;
  targetId?: string;
  repoChangeId?: string | null;
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
  sourceRecommendationIds?: string[];
  context?: Record<string, any> | null;
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
  followupExecution?: {
    state: string;
    headline: string;
    detail: string;
    repoChangeId: string | null;
    prUrl: string | null;
    prIsDraft: boolean | null;
    ciStatus: string | null;
    prLabels: string[];
    recommendedNextStep: { code: string; label: string; tone: string } | null;
    autoMergeAllowed: boolean;
    autoMergeReasons: string[];
    mergedAt?: string | null;
    observationStartAt?: string | null;
    plannedObservationEnd?: string | null;
    observationObservedDays?: number;
    observationComplete?: boolean;
  } | null;
  appliedConfigCheck?: {
    status: "match" | "mismatch" | "missing" | "unknown";
    reason: string;
    diff: null | {
      missingKeys: string[];
      extraKeys: string[];
      mismatched: Record<string, { applied: any; current: any }>;
    };
  } | null;
  postApplyEffect?: any;
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
