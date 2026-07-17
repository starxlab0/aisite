import Link from "next/link";
import {
  applyOpsPlaybook,
  controlSeoSearchConsoleSync,
  generateOpsDraft,
  getMonitoringSummary,
  getOpsAuthStatus,
  getOpsEvents,
  getRecommendations,
  importSeoMetricsFromSearchConsole,
  replayLatestSeoImport,
  registerSeoTarget,
  transitionRepoChange,
  transitionRuleTuningProposal,
} from "@/lib/control-plane/ops";
import { redirect } from "next/navigation";
import { DependencyStatusBadge, GovernanceBadge, RollbackTriggerBadge, VerificationBadge, governanceToneClass } from "../components/governance-ui";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getString(sp: Record<string, string | string[] | undefined>, key: string) {
  return typeof sp[key] === "string" ? (sp[key] as string) : undefined;
}

function alertTone(level: string) {
  if (level === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function dependencyTone(status: string) {
  if (status === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "degraded") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function freshnessTone(status: string) {
  if (status === "healthy") return "text-emerald-700";
  if (status === "critical") return "text-rose-700";
  if (status === "warning") return "text-amber-700";
  return "text-zinc-500";
}

function importGapTone(status: string) {
  if (status === "healthy") return "text-emerald-700";
  if (status === "warning") return "text-amber-700";
  return "text-zinc-600";
}

function seoSyncTone(health: string | null | undefined) {
  if (health === "healthy") return "text-emerald-700";
  if (health === "degraded") return "text-rose-700";
  if (health === "warning" || health === "paused" || health === "not_configured") return "text-amber-700";
  return "text-zinc-500";
}

function seoSyncLabel(healthLabel: string | null | undefined) {
  return healthLabel || "unknown";
}

function seoRuntimeJudgmentTone(health: string | null | undefined) {
  if (health === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (health === "degraded") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function resultGovernanceJudgmentTone(health: string | null | undefined) {
  if (health === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (health === "degraded") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function commerceJudgmentTone(health: string | null | undefined) {
  if (health === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (health === "degraded") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function repoChangeStatusLabel(status: string) {
  if (status === "merged") return "merged";
  if (status === "pr_opened") return "draft pr";
  if (status === "ci_running") return "ci running";
  if (status === "ci_passed") return "ci passed";
  if (status === "ci_failed") return "ci failed";
  if (status === "merge_candidate") return "ready";
  if (status === "auto_merge_candidate") return "auto-merge";
  if (status === "draft") return "repo change";
  return status || "n/a";
}

function governanceTone(status: string) {
  if (["repair_approved", "repair_draft_ready", "warning_followup_ready"].includes(status)) {
    return "ready";
  }
  if (["observe_warning", "rollback_completed", "repair_proposal_draft"].includes(status)) {
    return "warning";
  }
  return "critical";
}

function repoNextHref(targetType: string, targetId: string, code: string | null | undefined) {
  const params = new URLSearchParams();
  if (targetType) params.set("type", targetType);
  if (targetId) params.set("q", targetId);
  if (code === "ready_for_review") params.set("repoNext", "wait_ci");
  if (code === "ready_auto_merge") params.set("repoNext", "ready_auto_merge");
  if (code === "auto_revert_ready") params.set("repoNext", "ready_revert");
  if (code === "blocked_auto_merge_policy" || code === "blocked_revert_policy") params.set("repoNext", "blocked_policy");
  const query = params.toString();
  return `/ops${query ? `?${query}` : ""}#repo-publish-queue`;
}

function targetHref(target?: { type?: string; id?: string } | null) {
  if (!target?.type || !target?.id) return null;
  if (target.type === "faq" && target.id.includes(":")) {
    const [faqType, faqId] = target.id.split(":");
    return `/ops/faq/${faqType}/${faqId}`;
  }
  if (target.type === "guide") {
    const params = new URLSearchParams();
    params.set("type", "guide");
    params.set("q", target.id);
    return `/ops?${params.toString()}`;
  }
  return `/ops/${target.type}/${target.id}`;
}

function draftHrefForTarget(target?: { type?: string; id?: string } | null, draftId?: string | null) {
  if (!target?.type || !target?.id || !draftId) return null;
  if (target.type === "faq" && target.id.includes(":")) {
    const [faqType, faqId] = target.id.split(":");
    return `/ops/faq/${faqType}/${faqId}?draft=${encodeURIComponent(draftId)}`;
  }
  if (target.type === "product" || target.type === "collection") {
    return `/ops/${target.type}/${target.id}?draft=${encodeURIComponent(draftId)}`;
  }
  return null;
}

function weeklyBetFeedbackKey(bet: {
  priority: string;
  targetType: string;
  targetId: string | null;
  title: string;
}) {
  return `weekly:${bet.priority}:${bet.targetType}:${bet.targetId ?? "none"}:${bet.title}`;
}

function feedbackTone(status: string | undefined) {
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function executionStateTone(state: string | undefined) {
  if (state === "succeeded") return "text-emerald-700";
  if (state === "observing" || state === "executed") return "text-sky-700";
  if (state === "returned_to_risk") return "text-rose-700";
  return "text-zinc-600";
}

function observationTone(status: string | undefined) {
  if (status === "complete") return "text-emerald-700";
  if (status === "observing" || status === "handoff_ready") return "text-sky-700";
  if (status === "regressed") return "text-rose-700";
  return "text-zinc-600";
}

function playbookStatusMeta(status: string | undefined) {
  const key = String(status || "no_application");
  const map: Record<
    string,
    {
      priority: string;
      label: string;
      badgeClassName: string;
      cardBorderClassName: string;
    }
  > = {
    observing: {
      priority: "P0",
      label: "Observing",
      badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
      cardBorderClassName: "border-rose-200",
    },
    executed: {
      priority: "P1",
      label: "Executed",
      badgeClassName: "border-orange-200 bg-orange-50 text-orange-800",
      cardBorderClassName: "border-orange-200",
    },
    in_review: {
      priority: "P2",
      label: "In review",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
      cardBorderClassName: "border-amber-200",
    },
    draft: {
      priority: "P3",
      label: "Draft",
      badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-700",
      cardBorderClassName: "border-zinc-200",
    },
    regressed: {
      priority: "P1",
      label: "Regressed",
      badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
      cardBorderClassName: "border-rose-200",
    },
    succeeded: {
      priority: "P4",
      label: "Succeeded",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
      cardBorderClassName: "border-emerald-200",
    },
    cancelled: {
      priority: "P5",
      label: "Cancelled",
      badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-500",
      cardBorderClassName: "border-zinc-200",
    },
    no_application: {
      priority: "P3",
      label: "No application",
      badgeClassName: "border-sky-200 bg-sky-50 text-sky-800",
      cardBorderClassName: "border-sky-200",
    },
  };
  return (
    map[key] ?? {
      priority: "P3",
      label: key,
      badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-700",
      cardBorderClassName: "border-zinc-200",
    }
  );
}

export default async function OpsMonitoringPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const auth = await getOpsAuthStatus();
  const canPublish = Array.isArray(auth.capabilities) && auth.capabilities.includes("publish_content");
  const targetType = getString(sp, "type");
  const msg = getString(sp, "msg");
  const err = getString(sp, "err");
  const feedbackKey = getString(sp, "feedbackKey");
  const feedbackStatus = getString(sp, "feedbackStatus");
  const feedbackNote = getString(sp, "feedbackNote");

  const monitoring = await getMonitoringSummary({ targetType: targetType === "faq" ? undefined : targetType });
  const publishEvents = await getOpsEvents({ action: "publish", limit: 12, targetType: targetType === "faq" ? undefined : targetType });
  const rollbackEvents = await getOpsEvents({ action: "rollback", limit: 12, targetType: targetType === "faq" ? undefined : targetType });
  const recommendations = await getRecommendations({ status: "open,in_progress" });

  const failedPublishes = publishEvents.items.filter(
    (event) => ["warning", "blocked"].includes(String(event?.verification?.level || "unknown")),
  );
  const rollbacks = rollbackEvents.items;
  const aiGovernanceGroup = monitoring.aiConcierge.governance;
  const commerceGovernanceGroup = monitoring.commerceCheckout.governance;
  const paymentGovernanceGroup = monitoring.paymentResults24h.governance;
  const seoTargets = monitoring.seoPerformance?.targets ?? [];
  const seoFreshness = monitoring.seoFreshness ?? null;
  const seoImportDiagnostics = monitoring.seoImportDiagnostics ?? null;
  const seoSync = monitoring.runtime.seoSync;
  const seoRuntimeJudgment = monitoring.seoRuntimeJudgment ?? null;
  const seoSyncHistory = monitoring.seoSyncHistory ?? null;
  const seoSyncControlAudit = monitoring.seoSyncControlAudit ?? null;
  const seoSyncRecoveryReview = monitoring.seoSyncRecoveryReview ?? null;
  const todaysBestBet = monitoring.todaysBestBet ?? null;
  const decisionTimeline = monitoring.decisionTimeline ?? null;
  const dailySnapshotHistory = monitoring.dailySnapshotHistory ?? null;
  const weeklyOperatingReview = monitoring.weeklyOperatingReview ?? null;
  const governanceOverview = monitoring.governanceOverview ?? null;
  const growthLoopOverview = monitoring.growthLoopOverview ?? null;
  const geoOverview = monitoring.geoOverview ?? null;
  const growthExperimentOverview = monitoring.growthExperimentOverview ?? null;
  const resultGovernanceRuntimeJudgment = monitoring.resultGovernanceRuntimeJudgment ?? null;
  const resultGovernanceLaneSummary = monitoring.resultGovernanceLaneSummary ?? null;
  const commerceHealthSummary = monitoring.commerceHealthSummary ?? null;
  const commerceRuntimeJudgment = monitoring.commerceRuntimeJudgment ?? null;
  const commerceSourceSummary = monitoring.commerceSourceSummary ?? null;
  const todaysBestBetExecutionState =
    todaysBestBet && feedbackKey === "today-best-bet" && feedbackStatus === "success" ? "executed" : todaysBestBet?.executionState ?? null;
  const todaysBestBetExecutionReason =
    todaysBestBet && feedbackKey === "today-best-bet" && feedbackStatus === "success"
      ? feedbackNote || "This bet was executed from monitoring."
      : todaysBestBet?.executionReason ?? null;
  const todaysBestBetObservationStatus =
    todaysBestBet && feedbackKey === "today-best-bet" && feedbackStatus === "success"
      ? "handoff_ready"
      : todaysBestBet?.observationStatus ?? null;
  const todaysBestBetObservationWindow =
    todaysBestBet && feedbackKey === "today-best-bet" && feedbackStatus === "success"
      ? "next 24-72h"
      : todaysBestBet?.observationWindow ?? null;
  const todaysBestBetObservationNextStep =
    todaysBestBet && feedbackKey === "today-best-bet" && feedbackStatus === "success"
      ? `Start the observation window for ${todaysBestBet.targetLabel} and watch the first metrics now.`
      : todaysBestBet?.observationNextStep ?? null;
  const seoSuggestedTargets =
    seoImportDiagnostics?.recentUnmappedPages
      ?.filter((item) => item.suggestion?.targetType && item.suggestion?.targetId && item.suggestion.confidence === "high")
      .slice(0, 5)
      .map((item) => ({
        targetType: item.suggestion!.targetType,
        targetId: item.suggestion!.targetId,
        targetPath: item.pagePath,
      })) ?? [];
  const seoLowCtr = seoTargets.filter((t) => t.summary.current.impressions >= 80 && t.summary.current.ctr < 0.02).length;
  const seoPositionDrop = seoTargets.filter((t) => (t.summary.delta.position ?? 0) > 3 && t.summary.current.impressions >= 50).length;
  const seoRecommendationByTarget = new Map(
    recommendations.items
      .filter((item) => ["seo-low-ctr", "seo-position-drop"].includes(String(item.ruleId || "")))
      .map((item) => [`${item.targetType}:${item.targetId}`, item]),
  );
  const seoTopIssues = seoTargets
    .filter((t) => (t.issueScore ?? 0) > 0)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      recommendation: seoRecommendationByTarget.get(`${item.targetType}:${item.targetId}`) ?? null,
    }));

  async function onGenerateSeoDraft(formData: FormData) {
    "use server";
    const issueTargetType = String(formData.get("targetType") ?? "");
    const issueTargetId = String(formData.get("targetId") ?? "");
    if (!issueTargetType || !issueTargetId) return;
    try {
      const draft = await generateOpsDraft(issueTargetType, issueTargetId);
      if (issueTargetType === "faq" && issueTargetId.includes(":")) {
        const [faqType, faqId] = issueTargetId.split(":");
        redirect(`/ops/faq/${faqType}/${faqId}?draft=${encodeURIComponent(draft.id)}`);
      }
      if (issueTargetType === "product" || issueTargetType === "collection") {
        redirect(`/ops/${issueTargetType}/${issueTargetId}?draft=${encodeURIComponent(draft.id)}`);
      }
      const params = new URLSearchParams();
      params.set("type", issueTargetType);
      params.set("q", issueTargetId);
      params.set("msg", `draft ${draft.id} created`);
      redirect(`/ops?${params.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generate draft failed";
      redirect(`/ops/monitoring?err=${encodeURIComponent(message)}`);
    }
  }

  async function onImportSeoCsv(formData: FormData) {
    "use server";
    const csvText = String(formData.get("csvText") ?? "").trim();
    const importDate = String(formData.get("importDate") ?? "").trim();
    if (!csvText) {
      redirect("/ops/monitoring?err=CSV%20text%20is%20required");
    }
    try {
      const result = await importSeoMetricsFromSearchConsole({
        csvText,
        importDate: importDate || undefined,
        source: "search_console",
      });
      const params = new URLSearchParams();
      params.set(
        "msg",
        `Imported ${result.ingested}/${result.parsedRows} rows, skipped ${result.skippedRows}${result.unmappedPages.length ? `, unmapped ${result.unmappedPages.length}` : ""}`,
      );
      redirect(`/ops/monitoring?${params.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SEO import failed";
      redirect(`/ops/monitoring?err=${encodeURIComponent(message)}`);
    }
  }

  async function onRegisterSeoTarget(formData: FormData) {
    "use server";
    const targetType = String(formData.get("targetType") ?? "");
    const targetId = String(formData.get("targetId") ?? "");
    const targetPath = String(formData.get("targetPath") ?? "");
    if (!targetType || !targetId || !targetPath) return;
    try {
      const result = await registerSeoTarget({
        targetType: targetType as any,
        targetId,
        targetPath,
        title: targetId,
      });
      const prUrl = result.repoChange?.prUrl;
      if (prUrl) redirect(prUrl);
      redirect(`/ops/monitoring?msg=${encodeURIComponent("Repo change created; open PR from ops queue.")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Register target failed";
      redirect(`/ops/monitoring?err=${encodeURIComponent(message)}`);
    }
  }

  async function onRegisterSeoTargetsBulk(formData: FormData) {
    "use server";
    const raw = String(formData.get("items") ?? "[]");
    let items: Array<{ targetType: "product" | "collection" | "guide"; targetId: string; targetPath: string }> = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = [];
    }
    if (!items.length) redirect("/ops/monitoring?err=No%20suggested%20targets%20to%20register");

    const opened: string[] = [];
    let reused = 0;
    let merged = 0;
    for (const item of items.slice(0, 5)) {
      try {
        const result = await registerSeoTarget(item);
        const status = result.result?.status;
        const prUrl = result.repoChange?.prUrl;
        if (status === "exists" && result.repoChange?.status === "merged") {
          merged += 1;
          continue;
        }
        if (status === "exists" || status === "exists" || status === "created") {
          if (status === "exists") reused += 1;
        }
        if (prUrl) opened.push(prUrl);
      } catch {
        // ignore per-item failure; we still want partial progress
      }
    }

    const msg =
      opened.length > 0
        ? `Opened ${opened.length} PR(s)${reused ? `, reused ${reused}` : ""}${merged ? `, already merged ${merged}` : ""}. First: ${opened[0]}`
        : merged > 0 || reused > 0
          ? `No new PRs needed${reused ? `, reused ${reused}` : ""}${merged ? `, already merged ${merged}` : ""}.`
          : "Repo changes created. Open PRs from ops queue.";
    redirect(`/ops/monitoring?msg=${encodeURIComponent(msg)}`);
  }

  async function onPromotionMutation(formData: FormData) {
    "use server";
    const mutationKind = String(formData.get("mutationKind") ?? "");
    const targetId = String(formData.get("targetId") ?? "");
    const nextStatus = String(formData.get("nextStatus") ?? "");
    const returnTargetType = String(formData.get("returnTargetType") ?? "").trim();
    const feedbackKey = String(formData.get("feedbackKey") ?? "").trim();
    if (!["proposal_transition", "repo_change_transition"].includes(mutationKind) || !targetId || !nextStatus) {
      redirect("/ops/monitoring?err=Invalid%20promotion%20mutation");
    }
    try {
      if (mutationKind === "repo_change_transition") {
        const repoChange = await transitionRepoChange(targetId, {
          status: nextStatus as "merge_candidate" | "auto_merge_candidate",
          note: "promoted from monitoring candidate action",
        });
        const params = new URLSearchParams();
        if (returnTargetType) params.set("type", returnTargetType);
        params.set("msg", `repo change ${repoChange.id} -> ${repoChange.status}`);
        if (feedbackKey) params.set("feedbackKey", feedbackKey);
        params.set("feedbackStatus", "success");
        params.set("feedbackNote", `repo change promoted to ${repoChange.status}`);
        redirect(`/ops/monitoring?${params.toString()}`);
      }
      const proposal = await transitionRuleTuningProposal(targetId, {
        status: nextStatus as "approved",
        note: "promoted from monitoring candidate action",
      });
      const params = new URLSearchParams();
      if (returnTargetType) params.set("type", returnTargetType);
      params.set("msg", `proposal ${proposal.id} -> ${proposal.status}`);
      if (feedbackKey) params.set("feedbackKey", feedbackKey);
      params.set("feedbackStatus", "success");
      params.set("feedbackNote", `proposal promoted to ${proposal.status}`);
      redirect(`/ops/monitoring?${params.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Promotion failed";
      const params = new URLSearchParams();
      if (returnTargetType) params.set("type", returnTargetType);
      params.set("err", message);
      if (feedbackKey) params.set("feedbackKey", feedbackKey);
      params.set("feedbackStatus", "error");
      params.set("feedbackNote", message);
      redirect(`/ops/monitoring?${params.toString()}`);
    }
  }

  async function onApplyPlaybook(formData: FormData) {
    "use server";
    const playbookId = String(formData.get("playbookId") ?? "");
    const source = String(formData.get("source") ?? "");
    const applyTargetType = String(formData.get("applyTargetType") ?? "");
    const applyTargetId = String(formData.get("applyTargetId") ?? "");
    const applyTargetLabel = String(formData.get("applyTargetLabel") ?? "");
    const returnTargetType = String(formData.get("returnTargetType") ?? "").trim();
    const feedbackKey = String(formData.get("feedbackKey") ?? "").trim();
    if (!playbookId) {
      redirect("/ops/monitoring?err=Invalid%20playbook%20apply");
    }
    try {
      const result = await applyOpsPlaybook(playbookId, {
        source: source || undefined,
        targetType: applyTargetType || undefined,
        targetId: applyTargetId || undefined,
        targetLabel: applyTargetLabel || undefined,
        note: "applied from monitoring",
      });
      const params = new URLSearchParams();
      if (returnTargetType) params.set("type", returnTargetType);
      params.set("msg", `playbook application ${result.application.id} created`);
      if (feedbackKey) params.set("feedbackKey", feedbackKey);
      params.set("feedbackStatus", "info");
      params.set("feedbackNote", `playbook draft ${result.application.id} prepared`);
      redirect(`/ops/monitoring?${params.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Playbook apply failed";
      const params = new URLSearchParams();
      if (returnTargetType) params.set("type", returnTargetType);
      params.set("err", message);
      if (feedbackKey) params.set("feedbackKey", feedbackKey);
      params.set("feedbackStatus", "error");
      params.set("feedbackNote", message);
      redirect(`/ops/monitoring?${params.toString()}`);
    }
  }

  async function onReplayLatestSeoImport() {
    "use server";
    try {
      const result = await replayLatestSeoImport();
      if (result.status === "missing_replay") {
        redirect(`/ops/monitoring?err=${encodeURIComponent(result.message || "No replayable import available")}`);
      }
      const msg = `Replayed latest import: ${result.ingested ?? 0}/${result.parsedRows ?? 0} rows, skipped ${result.skippedRows ?? 0}`;
      redirect(`/ops/monitoring?msg=${encodeURIComponent(msg)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Replay latest import failed";
      redirect(`/ops/monitoring?err=${encodeURIComponent(message)}`);
    }
  }

  async function onControlSeoSync(formData: FormData) {
    "use server";
    const action = String(formData.get("action") ?? "").trim() as "retry_now" | "clear_backoff" | "pause" | "resume";
    if (!action) {
      redirect("/ops/monitoring?err=SEO%20sync%20action%20is%20required");
    }
    try {
      await controlSeoSearchConsoleSync(action);
      const msg =
        action === "retry_now"
          ? "Search Console sync triggered."
          : action === "clear_backoff"
            ? "Search Console sync backoff cleared."
            : action === "pause"
              ? "Search Console sync automation paused."
              : "Search Console sync automation resumed.";
      redirect(`/ops/monitoring?msg=${encodeURIComponent(msg)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search Console sync control failed";
      redirect(`/ops/monitoring?err=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Monitoring</h1>
          <p className="mt-2 text-sm text-zinc-600">试运行值班视图：先看依赖、再看告警、最后看 publish / rollback 明细。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Back to ops
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/runbook">
            Runbook
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/checklist">
            Checklist
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?action=publish">
            Publish audit
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?action=rollback">
            Rollback audit
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/playbooks">
            Playbooks
          </Link>
        </div>
      </div>

      {msg ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>
      ) : null}
      {err ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>
      ) : null}
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
        role {auth.role} · capabilities {auth.capabilities.join(", ") || "none"}
        {!canPublish ? (
          <p className="mt-1 text-xs text-amber-700">
            Read-only mode: playbook apply, lifecycle transition, and promotion actions require the `publish_content` capability.
          </p>
        ) : null}
      </div>
      {todaysBestBet ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(todaysBestBet.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Today's best bet</p>
              <p className="mt-1 text-base font-medium">{todaysBestBet.headline}</p>
              <p className="mt-1 text-sm opacity-90">{todaysBestBet.reason}</p>
              <p className="mt-2 text-xs opacity-80">Target: {todaysBestBet.targetLabel}</p>
              <p className="mt-2 text-xs opacity-80">Automation: {todaysBestBet.automationEligibility}</p>
              <p className="mt-2 text-xs opacity-80">{todaysBestBet.automationReason}</p>
              {todaysBestBet.automationArtifact ? (
                <p className="mt-2 text-xs opacity-80">
                  Auto draft ready: {todaysBestBet.automationArtifact.label} · {todaysBestBet.automationArtifact.status}
                </p>
              ) : null}
              <p className={`mt-2 text-xs ${executionStateTone(todaysBestBetExecutionState ?? undefined)}`}>Execution: {todaysBestBetExecutionState}</p>
              <p className="mt-2 text-xs opacity-80">{todaysBestBetExecutionReason}</p>
              <p className={`mt-2 text-xs ${observationTone(todaysBestBetObservationStatus ?? undefined)}`}>Observation: {todaysBestBetObservationStatus}</p>
              <p className="mt-2 text-xs opacity-80">Window: {todaysBestBetObservationWindow}</p>
              <p className="mt-2 text-xs opacity-80">Watch: {todaysBestBet.observationMetrics.join(" · ")}</p>
              <p className="mt-2 text-xs opacity-80">Next observation step: {todaysBestBetObservationNextStep}</p>
              <p className="mt-2 text-xs opacity-80">Promotion: {todaysBestBet.promotionEligibility}</p>
              <p className="mt-2 text-xs opacity-80">{todaysBestBet.promotionReason}</p>
              <p className="mt-2 text-xs opacity-80">Promotion action: {todaysBestBet.promotionAction.actionLabel}</p>
              <p className="mt-2 text-xs opacity-80">{todaysBestBet.promotionAction.description}</p>
              {feedbackKey === "today-best-bet" && feedbackNote ? (
                <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${feedbackTone(feedbackStatus)}`}>Execution feedback: {feedbackNote}</div>
              ) : null}
              {todaysBestBet.playbookRef ? (
                <>
                  <p className="mt-2 text-xs opacity-80">
                    Playbook:{" "}
                    <Link href={todaysBestBet.playbookRef.actionPath} className="underline underline-offset-2">
                      {todaysBestBet.playbookRef.title}
                    </Link>
                  </p>
                  {todaysBestBet.playbookRef.latestApplication ? (
                    <>
                      <p className="mt-2 text-xs opacity-80">
                        Latest application: {todaysBestBet.playbookRef.latestApplication.id} · {todaysBestBet.playbookRef.latestApplication.status}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            playbookStatusMeta(todaysBestBet.playbookRef.latestApplication.status).badgeClassName
                          }`}
                        >
                          {playbookStatusMeta(todaysBestBet.playbookRef.latestApplication.status).priority} ·{" "}
                          {playbookStatusMeta(todaysBestBet.playbookRef.latestApplication.status).label}
                        </span>
                      </div>
                      {todaysBestBet.playbookRef.latestApplication.nextAction ? (
                        <p className="mt-2 text-xs opacity-80">
                          Next playbook action: {todaysBestBet.playbookRef.latestApplication.nextAction.actionLabel}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                          playbookStatusMeta("no_application").badgeClassName
                        }`}
                      >
                        {playbookStatusMeta("no_application").priority} · {playbookStatusMeta("no_application").label}
                      </span>
                    </div>
                  )}
                </>
              ) : null}
              <p className="mt-2 text-xs opacity-80">Why now: {todaysBestBet.expectedImpact}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {todaysBestBet.actionHint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{todaysBestBet.source}</div>
              <Link href={todaysBestBet.actionPath} className="rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                {todaysBestBet.actionLabel}
              </Link>
              {todaysBestBet.promotionAction.mutation ? (
                <form action={onPromotionMutation}>
                  <input type="hidden" name="mutationKind" value={todaysBestBet.promotionAction.mutation.kind} />
                  <input type="hidden" name="targetId" value={todaysBestBet.promotionAction.mutation.targetId} />
                  <input type="hidden" name="nextStatus" value={todaysBestBet.promotionAction.mutation.nextStatus} />
                  <input type="hidden" name="returnTargetType" value={targetType ?? ""} />
                  <input type="hidden" name="feedbackKey" value="today-best-bet" />
                  <button disabled={!canPublish} type="submit" className="rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                    {todaysBestBet.promotionAction.actionLabel}
                  </button>
                </form>
              ) : (
                <Link href={todaysBestBet.promotionAction.actionPath} className="rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                  {todaysBestBet.promotionAction.actionLabel}
                </Link>
              )}
              {todaysBestBet.playbookRef ? (
                <form action={onApplyPlaybook}>
                  <input type="hidden" name="playbookId" value={todaysBestBet.playbookRef.id} />
                  <input type="hidden" name="source" value={todaysBestBet.source} />
                  <input type="hidden" name="applyTargetType" value={todaysBestBet.targetType} />
                  <input type="hidden" name="applyTargetId" value={todaysBestBet.targetId ?? ""} />
                  <input type="hidden" name="applyTargetLabel" value={todaysBestBet.targetLabel} />
                  <input type="hidden" name="returnTargetType" value={targetType ?? ""} />
                  <input type="hidden" name="feedbackKey" value="today-best-bet" />
                  <button disabled={!canPublish} type="submit" className="rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                    Apply playbook
                  </button>
                </form>
              ) : null}
              {todaysBestBet.playbookRef?.latestApplication?.nextAction ? (
                <Link
                  href={todaysBestBet.playbookRef.latestApplication.nextAction.actionPath}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white"
                >
                  {todaysBestBet.playbookRef.latestApplication.nextAction.actionLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {decisionTimeline ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(decisionTimeline.trend === "risk_heavy" ? "degraded" : decisionTimeline.trend === "steady" ? "healthy" : "warning")}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Decision timeline</p>
              <p className="mt-1 text-base font-medium">{decisionTimeline.summary}</p>
              <p className="mt-1 text-sm opacity-90">{decisionTimeline.currentStory}</p>
              <p className="mt-2 text-xs opacity-80">
                decisions {decisionTimeline.counts.decision} · execution {decisionTimeline.counts.execution} · risk {decisionTimeline.counts.risk} · signals {decisionTimeline.counts.signal}
              </p>
            </div>
            <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{decisionTimeline.trend}</div>
          </div>
          {decisionTimeline.items.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {decisionTimeline.items.map((item, index) => (
                <div key={`${item.at}:${item.title}:${index}`} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                  <p className="text-xs opacity-80">{item.kind}</p>
                  <p className="mt-1 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs opacity-80">{item.detail}</p>
                  <p className="mt-2 text-xs opacity-70">{item.at}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {dailySnapshotHistory?.items?.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Daily snapshot history</p>
              <p className="mt-1 text-base font-medium text-zinc-900">Recent daily operating snapshots</p>
              <p className="mt-1 text-sm text-zinc-600">按天回看最近的 best bet 和几个 top-level health，帮助判断建议最近是怎么演化的。</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dailySnapshotHistory.items.map((item) => (
              <div key={item.date} className={`rounded-xl border p-4 ${commerceJudgmentTone(item.todaysBestBet?.health ?? item.governanceOverview?.health ?? "warning")}`}>
                <p className="text-xs opacity-80">{item.date}</p>
                <p className="mt-1 text-sm font-medium">{item.todaysBestBet?.headline ?? "No best bet recorded"}</p>
                <p className="mt-1 text-xs opacity-80">{item.todaysBestBet?.source ?? "snapshot"} · recorded {item.recordedAt}</p>
                <div className="mt-3 space-y-1 text-xs opacity-80">
                  <p>governance {item.governanceOverview?.health ?? "n/a"}</p>
                  <p>growth loop {item.growthLoopOverview?.health ?? "n/a"}</p>
                  <p>GEO {item.geoOverview?.health ?? "n/a"}</p>
                  <p>experiments {item.growthExperimentOverview?.health ?? "n/a"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {weeklyOperatingReview ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(weeklyOperatingReview.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Weekly operating review</p>
              <p className="mt-1 text-base font-medium">{weeklyOperatingReview.headline}</p>
              <p className="mt-1 text-sm opacity-90">{weeklyOperatingReview.summary}</p>
              <p className="mt-2 text-xs opacity-80">
                range {weeklyOperatingReview.range.from ?? "n/a"} → {weeklyOperatingReview.range.to ?? "n/a"} · focus {weeklyOperatingReview.focus}
              </p>
            </div>
            <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{weeklyOperatingReview.health}</div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(["governance", "growth_loop", "geo", "experiment"] as const).map((key) => (
              <div key={key} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                <p className="text-xs uppercase tracking-wide opacity-80">{key}</p>
                <p className="mt-1 text-xs opacity-80">
                  healthy {weeklyOperatingReview.healthBuckets[key].healthy} · warning {weeklyOperatingReview.healthBuckets[key].warning} · degraded {weeklyOperatingReview.healthBuckets[key].degraded}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-current/15 bg-white/70 p-4 text-current">
            <p className="text-xs uppercase tracking-wide opacity-80">Executed bets</p>
            <p className="mt-1 text-sm opacity-90">{weeklyOperatingReview.executionOutcomes.summary}</p>
            <p className="mt-2 text-xs opacity-80">
              executed {weeklyOperatingReview.executionOutcomes.counts.executed} · observing {weeklyOperatingReview.executionOutcomes.counts.observing} · succeeded {weeklyOperatingReview.executionOutcomes.counts.succeeded} · returned to risk {weeklyOperatingReview.executionOutcomes.counts.returned_to_risk}
            </p>
          </div>
          {weeklyOperatingReview.executionOutcomes.items.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {weeklyOperatingReview.executionOutcomes.items.map((item) => (
                <div key={`${item.date}:${item.headline}:${item.targetLabel}`} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                  <p className="text-xs opacity-80">{item.date}</p>
                  <p className="mt-1 text-sm font-medium">{item.headline}</p>
                  <p className="mt-1 text-xs opacity-80">{item.source} · {item.targetLabel}</p>
                  <p className={`mt-2 text-xs ${executionStateTone(item.executionState)}`}>Execution: {item.executionState}</p>
                  <p className={`mt-2 text-xs ${observationTone(item.observationStatus)}`}>Observation: {item.observationStatus}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border border-current/15 bg-white/70 p-4 text-current">
            <p className="text-xs uppercase tracking-wide opacity-80">Outcome attribution</p>
            <p className="mt-2 text-xs opacity-80">
              governance {weeklyOperatingReview.outcomeAttribution.bySource.governance.succeeded}/{weeklyOperatingReview.outcomeAttribution.bySource.governance.total} wins · growth loop {weeklyOperatingReview.outcomeAttribution.bySource.growth_loop.succeeded}/{weeklyOperatingReview.outcomeAttribution.bySource.growth_loop.total} wins · geo {weeklyOperatingReview.outcomeAttribution.bySource.geo.succeeded}/{weeklyOperatingReview.outcomeAttribution.bySource.geo.total} wins · experiment {weeklyOperatingReview.outcomeAttribution.bySource.experiment.succeeded}/{weeklyOperatingReview.outcomeAttribution.bySource.experiment.total} wins
            </p>
            {weeklyOperatingReview.outcomeAttribution.hints.length ? (
              <div className="mt-3 space-y-1 text-xs opacity-80">
                {weeklyOperatingReview.outcomeAttribution.hints.map((hint) => (
                  <p key={hint}>{hint}</p>
                ))}
              </div>
            ) : null}
          </div>
          {weeklyOperatingReview.playbookDrafts?.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {weeklyOperatingReview.playbookDrafts.map((pb) => (
                <div
                  key={pb.id}
                  className={`rounded-xl border bg-white/70 p-4 text-current ${
                    playbookStatusMeta(pb.latestApplication?.status ?? "no_application").cardBorderClassName
                  }`}
                >
                  <p className="text-xs opacity-80">Playbook draft</p>
                  <p className="mt-1 text-sm font-medium">{pb.title}</p>
                  <p className="mt-1 text-xs opacity-80">{pb.source} · {pb.targetType}</p>
                  {pb.latestApplication ? (
                    <>
                      <p className="mt-2 text-xs opacity-80">
                        Latest application: {pb.latestApplication.id} · {pb.latestApplication.status}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            playbookStatusMeta(pb.latestApplication.status).badgeClassName
                          }`}
                        >
                          {playbookStatusMeta(pb.latestApplication.status).priority} · {playbookStatusMeta(pb.latestApplication.status).label}
                        </span>
                      </div>
                      {pb.latestApplication.nextAction ? (
                        <p className="mt-2 text-xs opacity-80">
                          Next playbook action: {pb.latestApplication.nextAction.actionLabel}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                          playbookStatusMeta("no_application").badgeClassName
                        }`}
                      >
                        {playbookStatusMeta("no_application").priority} · {playbookStatusMeta("no_application").label}
                      </span>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {pb.latestApplication?.nextAction ? (
                      <Link href={pb.latestApplication.nextAction.actionPath} className="inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white">
                        {pb.latestApplication.nextAction.actionLabel}
                      </Link>
                    ) : null}
                    <form action={onApplyPlaybook}>
                      <input type="hidden" name="playbookId" value={pb.id} />
                      <input type="hidden" name="source" value={pb.source} />
                      <input type="hidden" name="applyTargetType" value={pb.targetType} />
                      <input type="hidden" name="applyTargetId" value="" />
                      <input type="hidden" name="applyTargetLabel" value={pb.title} />
                      <input type="hidden" name="returnTargetType" value={targetType ?? ""} />
                      <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                        Apply playbook
                      </button>
                    </form>
                    <Link href={pb.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                      Open playbook
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {weeklyOperatingReview.playbookApplicationOutcomes ? (
            <div className="mt-4 rounded-xl border border-current/15 bg-white/70 p-4 text-current">
              <p className="text-xs uppercase tracking-wide opacity-80">Playbook applications</p>
              <p className="mt-1 text-sm opacity-90">{weeklyOperatingReview.playbookApplicationOutcomes.summary}</p>
              {weeklyOperatingReview.playbookApplicationOutcomes.items?.length ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {weeklyOperatingReview.playbookApplicationOutcomes.items.map((item) => (
                    <div key={`${item.playbookId}:${item.applicationId}`} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                      <p className="text-xs opacity-80">{item.createdAt}</p>
                      <p className="mt-1 text-sm font-medium">{item.targetLabel}</p>
                      <p className="mt-1 text-xs opacity-80">{item.playbookTitle} · status {item.status}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={item.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                          Open playbook
                        </Link>
                        {item.nextAction ? (
                          <Link href={item.nextAction.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                            {item.nextAction.actionLabel}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {weeklyOperatingReview.riskDays.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {weeklyOperatingReview.riskDays.map((day) => (
                <div key={day.date} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                  <p className="text-xs opacity-80">{day.date}</p>
                  <p className="mt-1 text-xs opacity-80">degraded: {day.degraded.join(", ")}</p>
                  <p className="mt-1 text-xs opacity-80">best bet: {day.bestBetSource}</p>
                </div>
              ))}
            </div>
          ) : null}
          {weeklyOperatingReview.nextWeekBets?.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {weeklyOperatingReview.nextWeekBets.map((bet) => (
                <div key={bet.title} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                  {(() => {
                    const matched = feedbackKey === weeklyBetFeedbackKey(bet) && feedbackStatus === "success";
                    const executionState = matched ? "executed" : bet.executionState;
                    const executionReason = matched ? feedbackNote || "This bet was executed from monitoring." : bet.executionReason;
                    const observationStatus = matched ? "handoff_ready" : bet.observationStatus;
                    const observationWindow = matched ? "next 24-72h" : bet.observationWindow;
                    const observationNextStep = matched
                      ? `Start the observation window for ${bet.targetLabel} and watch the first metrics now.`
                      : bet.observationNextStep;
                    return (
                      <>
                  <p className="text-xs opacity-80">{bet.priority}</p>
                  <p className="mt-1 text-sm font-medium">{bet.title}</p>
                  <p className="mt-1 text-xs opacity-80">{bet.reason}</p>
                  <p className="mt-2 text-xs opacity-80">Target: {bet.targetLabel}</p>
                  <p className="mt-2 text-xs opacity-80">Automation: {bet.automationEligibility}</p>
                  <p className="mt-2 text-xs opacity-80">{bet.automationReason}</p>
                  {bet.automationArtifact ? (
                    <p className="mt-2 text-xs opacity-80">
                      Auto draft ready: {bet.automationArtifact.label} · {bet.automationArtifact.status}
                    </p>
                  ) : null}
                  <p className={`mt-2 text-xs ${executionStateTone(executionState)}`}>Execution: {executionState}</p>
                  <p className="mt-2 text-xs opacity-80">{executionReason}</p>
                  <p className={`mt-2 text-xs ${observationTone(observationStatus)}`}>Observation: {observationStatus}</p>
                  <p className="mt-2 text-xs opacity-80">Window: {observationWindow}</p>
                  <p className="mt-2 text-xs opacity-80">Watch: {bet.observationMetrics.join(" · ")}</p>
                  <p className="mt-2 text-xs opacity-80">Next observation step: {observationNextStep}</p>
                  <p className="mt-2 text-xs opacity-80">Promotion: {bet.promotionEligibility}</p>
                  <p className="mt-2 text-xs opacity-80">{bet.promotionReason}</p>
                  <p className="mt-2 text-xs opacity-80">Promotion action: {bet.promotionAction.actionLabel}</p>
                  <p className="mt-2 text-xs opacity-80">{bet.promotionAction.description}</p>
                  {feedbackKey === weeklyBetFeedbackKey(bet) && feedbackNote ? (
                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${feedbackTone(feedbackStatus)}`}>Execution feedback: {feedbackNote}</div>
                  ) : null}
                  {bet.playbookRef ? (
                    <>
                      <p className="mt-2 text-xs opacity-80">
                        Playbook:{" "}
                        <Link href={bet.playbookRef.actionPath} className="underline underline-offset-2">
                          {bet.playbookRef.title}
                        </Link>
                      </p>
                      {bet.playbookRef.latestApplication ? (
                        <>
                          <p className="mt-2 text-xs opacity-80">
                            Latest application: {bet.playbookRef.latestApplication.id} · {bet.playbookRef.latestApplication.status}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                                playbookStatusMeta(bet.playbookRef.latestApplication.status).badgeClassName
                              }`}
                            >
                              {playbookStatusMeta(bet.playbookRef.latestApplication.status).priority} ·{" "}
                              {playbookStatusMeta(bet.playbookRef.latestApplication.status).label}
                            </span>
                          </div>
                          {bet.playbookRef.latestApplication.nextAction ? (
                            <p className="mt-2 text-xs opacity-80">
                              Next playbook action: {bet.playbookRef.latestApplication.nextAction.actionLabel}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                              playbookStatusMeta("no_application").badgeClassName
                            }`}
                          >
                            {playbookStatusMeta("no_application").priority} · {playbookStatusMeta("no_application").label}
                          </span>
                        </div>
                      )}
                    </>
                  ) : null}
                  {bet.metricSummary ? <p className="mt-2 text-xs opacity-80">{bet.metricSummary}</p> : null}
                  <p className="mt-2 text-xs opacity-80">Expected impact: {bet.expectedImpact}</p>
                  <div className="mt-3">
                    <Link href={bet.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                      {bet.actionLabel}
                    </Link>
                    {bet.promotionAction.mutation ? (
                      <form action={onPromotionMutation} className="ml-2 inline-flex">
                        <input type="hidden" name="mutationKind" value={bet.promotionAction.mutation.kind} />
                        <input type="hidden" name="targetId" value={bet.promotionAction.mutation.targetId} />
                        <input type="hidden" name="nextStatus" value={bet.promotionAction.mutation.nextStatus} />
                        <input type="hidden" name="returnTargetType" value={targetType ?? ""} />
                        <input type="hidden" name="feedbackKey" value={weeklyBetFeedbackKey(bet)} />
                        <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                          {bet.promotionAction.actionLabel}
                        </button>
                      </form>
                    ) : (
                      <Link href={bet.promotionAction.actionPath} className="ml-2 inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                        {bet.promotionAction.actionLabel}
                      </Link>
                    )}
                    {bet.playbookRef ? (
                      <form action={onApplyPlaybook} className="ml-2 inline-flex">
                        <input type="hidden" name="playbookId" value={bet.playbookRef.id} />
                        <input type="hidden" name="applyTargetType" value={bet.targetType} />
                        <input type="hidden" name="applyTargetId" value={bet.targetId ?? ""} />
                        <input type="hidden" name="applyTargetLabel" value={bet.targetLabel} />
                        <input type="hidden" name="returnTargetType" value={targetType ?? ""} />
                        <input type="hidden" name="feedbackKey" value={weeklyBetFeedbackKey(bet)} />
                        <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                          Apply playbook
                        </button>
                      </form>
                    ) : null}
                    {bet.playbookRef?.latestApplication?.nextAction ? (
                      <Link
                        href={bet.playbookRef.latestApplication.nextAction.actionPath}
                        className="ml-2 inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white"
                      >
                        {bet.playbookRef.latestApplication.nextAction.actionLabel}
                      </Link>
                    ) : null}
                    {bet.playbookRef ? (
                      <Link href={bet.playbookRef.actionPath} className="ml-2 inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                        Open playbook
                      </Link>
                    ) : null}
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {governanceOverview ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(governanceOverview.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Top-level governance overview</p>
              <p className="mt-1 text-base font-medium">{governanceOverview.headline}</p>
              <p className="mt-1 text-sm opacity-90">{governanceOverview.detail}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {governanceOverview.actionHint}</p>
            </div>
            <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{governanceOverview.primaryLine}</div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {governanceOverview.lines.map((line) => (
              <div key={line.key} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-80">{line.title}</p>
                    <p className="mt-1 text-sm font-medium">{line.headline}</p>
                    <p className="mt-1 text-xs opacity-90">{line.detail}</p>
                  </div>
                  <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{line.health}</div>
                </div>
                <p className="mt-3 text-xs opacity-80">open weight {line.supportingCount}</p>
                <p className="mt-2 text-xs opacity-80">Next step: {line.actionHint}</p>
                <div className="mt-3">
                  <Link href={line.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                    {line.actionLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {growthLoopOverview ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(growthLoopOverview.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Growth loop overview</p>
              <p className="mt-1 text-base font-medium">{growthLoopOverview.headline}</p>
              <p className="mt-1 text-sm opacity-90">{growthLoopOverview.detail}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {growthLoopOverview.actionHint}</p>
            </div>
            <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{growthLoopOverview.health}</div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {growthLoopOverview.lines.map((line) => (
              <div key={line.key} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-80">{line.title}</p>
                    <p className="mt-1 text-xs opacity-90">{line.detail}</p>
                  </div>
                  <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{line.status}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs opacity-80">
            SEO weak targets {growthLoopOverview.metrics.seoLowCtrCount} · weak commerce sources {growthLoopOverview.metrics.weakSources} · purchase gaps {growthLoopOverview.metrics.purchaseMisalignedTargets}
          </p>
        </div>
      ) : null}
      {geoOverview ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(geoOverview.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">GEO overview</p>
              <p className="mt-1 text-base font-medium">{geoOverview.headline}</p>
              <p className="mt-1 text-sm opacity-90">{geoOverview.detail}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {geoOverview.actionHint}</p>
            </div>
            <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{geoOverview.health}</div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {geoOverview.lines.map((line) => (
              <div key={line.key} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-80">{line.title}</p>
                    <p className="mt-1 text-xs opacity-90">{line.detail}</p>
                  </div>
                  <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{line.status}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs opacity-80">
            SEO weak targets {geoOverview.metrics.seoLowCtrCount} · AI result CTR {(geoOverview.metrics.resultCtr * 100).toFixed(1)}% · AI purchase/view {(geoOverview.metrics.purchaseRateFromView * 100).toFixed(2)}%
          </p>
        </div>
      ) : null}
      {growthExperimentOverview ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(growthExperimentOverview.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Growth experiment overview</p>
              <p className="mt-1 text-base font-medium">{growthExperimentOverview.headline}</p>
              <p className="mt-1 text-sm opacity-90">{growthExperimentOverview.detail}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {growthExperimentOverview.actionHint}</p>
            </div>
            <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{growthExperimentOverview.health}</div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {growthExperimentOverview.groups.slice(0, 3).map((group) => (
              <div key={group.key} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide opacity-80">{group.title}</p>
                    <p className="mt-1 text-xs opacity-90">
                      needs {group.counts.needsDecision} · observing {group.counts.observing} · risk {group.counts.followupRisk}
                    </p>
                  </div>
                  <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{group.status}</div>
                </div>
              </div>
            ))}
          </div>
          {growthExperimentOverview.items.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {growthExperimentOverview.items.slice(0, 6).map((item) => (
                <div key={`${item.groupKey}:${item.kind}:${item.id ?? item.headline}`} className="rounded-xl border border-current/15 bg-white/70 p-4 text-current">
                  <p className="text-xs opacity-80">{item.groupTitle} · {item.kind}</p>
                  <p className="mt-1 text-sm font-medium">{item.headline}</p>
                  <p className="mt-1 text-xs opacity-80">
                    status {item.status}{item.effectState ? ` · effect ${item.effectState}` : ""}
                  </p>
                  {item.effectMetrics.length ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
                      {item.effectMetrics.map((metric) => (
                        <span key={metric.key}>{metric.label} {metric.value}</span>
                      ))}
                    </div>
                  ) : item.effectSummary ? (
                    <p className="mt-1 text-xs opacity-80">{item.effectSummary}</p>
                  ) : null}
                  <div className="mt-3">
                    <Link href={item.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/80 px-3 py-1.5 text-xs">
                      {item.actionLabel}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {seoRuntimeJudgment ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${seoRuntimeJudgmentTone(seoRuntimeJudgment.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">SEO runtime judgment</p>
              <p className="mt-1 text-base font-medium">{seoRuntimeJudgment.headline}</p>
              <p className="mt-1 text-sm opacity-90">{seoRuntimeJudgment.detail}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {seoRuntimeJudgment.actionHint}</p>
            </div>
            <div className="rounded-full border border-current/20 px-3 py-1 text-xs">
              {seoRuntimeJudgment.focusArea}
            </div>
          </div>
        </div>
      ) : null}
      {resultGovernanceRuntimeJudgment ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${resultGovernanceJudgmentTone(resultGovernanceRuntimeJudgment.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Result governance judgment</p>
              <p className="mt-1 text-base font-medium">{resultGovernanceRuntimeJudgment.headline}</p>
              <p className="mt-1 text-sm opacity-90">{resultGovernanceRuntimeJudgment.detail}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {resultGovernanceRuntimeJudgment.actionHint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{resultGovernanceRuntimeJudgment.focusArea}</div>
              <Link href="/ops/audit/result-governance" className="rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-xs">
                Open governance audit
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      {commerceRuntimeJudgment ? (
        <div className={`mt-4 rounded-2xl border px-4 py-4 ${commerceJudgmentTone(commerceRuntimeJudgment.health)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Commerce judgment</p>
              <p className="mt-1 text-base font-medium">{commerceRuntimeJudgment.headline}</p>
              <p className="mt-1 text-sm opacity-90">{commerceRuntimeJudgment.detail}</p>
              <p className="mt-2 text-xs opacity-80">Next step: {commerceRuntimeJudgment.actionHint}</p>
              {commerceHealthSummary ? <p className="mt-2 text-xs opacity-80">Health summary: {commerceHealthSummary.label} · {commerceHealthSummary.detail}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{commerceRuntimeJudgment.focusArea}</div>
              <Link href="/ops/audit/commerce" className="rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-xs">
                Open commerce audit
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      {commerceSourceSummary?.sources?.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {commerceSourceSummary.sources.map((item) => (
            <div key={item.key} className={`rounded-2xl border p-4 ${commerceJudgmentTone(item.health)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-80">{item.source}</p>
                  <p className="mt-1 text-sm font-medium">{item.headline}</p>
                  <p className="mt-1 text-xs opacity-90">{item.detail}</p>
                </div>
                <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{item.health}</div>
              </div>
              <p className="mt-3 text-xs opacity-80">
                recs {item.counts.recommendations} · proposals {item.counts.proposals} · followup risk {item.counts.followupRisk}
              </p>
              <p className="mt-2 text-xs opacity-80">Next step: {item.actionHint}</p>
              <div className="mt-3">
                <Link href={item.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-xs">
                  {item.actionLabel}
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {resultGovernanceLaneSummary?.lanes?.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {resultGovernanceLaneSummary.lanes.map((lane) => (
            <div key={lane.key} className={`rounded-2xl border p-4 ${resultGovernanceJudgmentTone(lane.health)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-80">{lane.title} lane</p>
                  <p className="mt-1 text-sm font-medium">{lane.headline}</p>
                  <p className="mt-1 text-xs opacity-90">{lane.detail}</p>
                </div>
                <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{lane.health}</div>
              </div>
              <p className="mt-3 text-xs opacity-80">
                recs {lane.counts.recommendations} · proposals {lane.counts.proposals} · followups {lane.counts.observationFollowups}
              </p>
              <p className="mt-2 text-xs opacity-80">Next step: {lane.actionHint}</p>
              <div className="mt-3">
                <Link href={lane.actionPath} className="inline-flex rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-xs">
                  {lane.actionLabel}
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Signals runtime</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.runtime.signalsHealth}</p>
          <p className="mt-1 text-xs text-zinc-500">
            batch failures {monitoring.runtime.consecutiveBatchFailures}
            {monitoring.runtime.lastBatchRunAt ? ` · last ${monitoring.runtime.lastBatchRunAt}` : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Stale workflow</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.workflow.staleCount}</p>
          <p className="mt-1 text-xs text-zinc-500">
            warning ≥ {monitoring.workflow.thresholds.warning} · critical ≥ {monitoring.workflow.thresholds.critical}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Publish anomalies · 24h</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {monitoring.publishing.warningPublishes24h + monitoring.publishing.blockedPublishes24h + monitoring.publishing.rollbacks24h}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            warning {monitoring.publishing.warningPublishes24h} · blocked {monitoring.publishing.blockedPublishes24h} · rollback {monitoring.publishing.rollbacks24h}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Purchase reconciliation</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.purchase.misalignedTargetsCount}</p>
          <p className="mt-1 text-xs text-zinc-500">
            gap warning ≥ {monitoring.purchase.thresholdAbsGap.warning} · critical ≥ {monitoring.purchase.thresholdAbsGap.critical}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">SEO/GEO performance · 7d</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{seoTargets.length}</p>
          <p className="mt-1 text-xs text-zinc-500">
            low CTR {seoLowCtr} · pos drop {seoPositionDrop}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            <Link className="underline underline-offset-4" href="/ops?status=open,in_progress&q=seo-">
              View SEO recommendations
            </Link>
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">SEO metrics freshness</p>
          <p className={`mt-2 text-2xl font-semibold ${freshnessTone(seoFreshness?.status ?? "not_configured")}`}>
            {seoFreshness?.status ?? "not_configured"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            latest {seoFreshness?.latestDate ?? "n/a"} · {seoFreshness?.daysSinceLatest == null ? "n/a" : `${seoFreshness.daysSinceLatest}d old`}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            tracked {seoFreshness?.targetsTracked ?? 0} · recent {seoFreshness?.targetsWithRecentData ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">SEO import gap</p>
          <p className={`mt-2 text-2xl font-semibold ${importGapTone(seoImportDiagnostics?.latestRun?.status ?? "healthy")}`}>
            {seoImportDiagnostics?.latestRun?.activeUnmappedPages ?? 0}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            latest import {seoImportDiagnostics?.latestRun?.createdAt ?? "n/a"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            active {seoImportDiagnostics?.recentUnmappedPages?.length ?? 0} · resolved pending refresh{" "}
            {seoImportDiagnostics?.resolvedRecentUnmappedPages?.length ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">SEO sync runtime</p>
          <p className={`mt-2 text-2xl font-semibold ${seoSyncTone(seoSync.health)}`}>
            {seoSyncLabel(seoSync.healthLabel)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            last run {seoSync.lastRunAt ?? "n/a"} · success {seoSync.lastSuccessAt ?? "n/a"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            failures {seoSync.consecutiveFailures} · backoff {seoSync.backoffMinutes}m
            {seoSync.nextAllowedRunAt ? ` · next ${seoSync.nextAllowedRunAt}` : ""}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            automation {seoSync.paused ? "paused" : seoSync.enabled ? "running" : "disabled"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{seoSync.healthDetail}</p>
          {seoSync.recoveryHint ? <p className="mt-1 text-xs text-zinc-500">next step {seoSync.recoveryHint}</p> : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Commerce funnel · 24h</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.commerceCheckout.checkoutStarts}</p>
          <p className="mt-1 text-xs text-zinc-500">
            starts {monitoring.commerceCheckout.checkoutStarts} · completes {monitoring.commerceCheckout.checkoutCompletes} · purchases {monitoring.commerceCheckout.purchases24h}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            dropoff {monitoring.commerceCheckout.checkoutDropoff} · completion {(monitoring.commerceCheckout.checkoutCompletionRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Payment results · 24h</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.paymentResults24h.paid}</p>
          <p className="mt-1 text-xs text-zinc-500">
            paid {monitoring.paymentResults24h.paid} · authorized {monitoring.paymentResults24h.authorized} · requires action {monitoring.paymentResults24h.requiresAction}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            failed {monitoring.paymentResults24h.failed} · canceled {monitoring.paymentResults24h.canceled} · issue rate {(monitoring.paymentResults24h.issueRate * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Payment recovery lanes · 24h</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.paymentResults24h.recoveryLanes.providerReview}</p>
          <p className="mt-1 text-xs text-zinc-500">
            provider review {monitoring.paymentResults24h.recoveryLanes.providerReview} · customer retry {monitoring.paymentResults24h.recoveryLanes.customerRetry}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            customer action {monitoring.paymentResults24h.recoveryLanes.customerAction} · awaiting capture {monitoring.paymentResults24h.recoveryLanes.awaitingCapture} · ready {monitoring.paymentResults24h.recoveryLanes.fulfillmentReady}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Fulfillment results · 24h</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.fulfillmentResults24h.processing}</p>
          <p className="mt-1 text-xs text-zinc-500">
            processing {monitoring.fulfillmentResults24h.processing} · shipped {monitoring.fulfillmentResults24h.shipped} · delivered {monitoring.fulfillmentResults24h.delivered}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Refund results · 24h</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.refundResults24h.requested}</p>
          <p className="mt-1 text-xs text-zinc-500">
            requested {monitoring.refundResults24h.requested} · refunded {monitoring.refundResults24h.refunded} · backlog {monitoring.refundResults24h.backlog}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">SEO metrics import</p>
            <p className="mt-1 text-xs text-zinc-500">
              先支持直接粘贴 Search Console 风格 CSV。需要包含 `page/url`、`clicks`、`impressions`，若 CSV 没有 `date` 列，可在下面补一个 import date。
            </p>
          </div>
        </div>
        <form action={onImportSeoCsv} className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
            <label className="text-sm text-zinc-600" htmlFor="importDate">
              Import date
            </label>
            <input
              id="importDate"
              name="importDate"
              type="date"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div className="grid gap-3">
            <label className="text-sm text-zinc-600" htmlFor="csvText">
              CSV text
            </label>
            <textarea
              id="csvText"
              name="csvText"
              rows={8}
              className="w-full rounded-xl border border-zinc-200 px-3 py-3 font-mono text-xs text-zinc-900"
              placeholder={`page,query,clicks,impressions,ctr,position,date\n/products/kokocang-x,best quiet keyboard,12,340,3.5%,4.2,2026-07-09`}
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">
              Import Search Console CSV
            </button>
          </div>
        </form>
        {seoImportDiagnostics?.latestRun ? (
          <div className="mt-4 rounded-xl bg-zinc-50 p-4">
            <p className="text-sm font-medium text-zinc-900">Latest import diagnostics</p>
            <p className="mt-1 text-xs text-zinc-500">
              parsed {seoImportDiagnostics.latestRun.parsedRows} · imported {seoImportDiagnostics.latestRun.ingested} · skipped{" "}
              {seoImportDiagnostics.latestRun.skippedRows} · source {seoImportDiagnostics.latestRun.source}
            </p>
            {seoImportDiagnostics.latestRun.resolvedUnmappedPages ? (
              <p className="mt-1 text-xs text-emerald-700">
                {seoImportDiagnostics.latestRun.resolvedUnmappedPages} page(s) already registered and waiting for refreshed import data.
              </p>
            ) : null}
            {seoImportDiagnostics.recentUnmappedPages.length ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-900">Recent unmapped pages</p>
                  {seoSuggestedTargets.length >= 2 ? (
                    <form action={onRegisterSeoTargetsBulk}>
                      <input type="hidden" name="items" value={JSON.stringify(seoSuggestedTargets)} />
                      <button type="submit" className="text-xs underline underline-offset-4">
                        Open PRs ({seoSuggestedTargets.length})
                      </button>
                    </form>
                  ) : null}
                </div>
                <div className="mt-2 space-y-2">
                  {seoImportDiagnostics.recentUnmappedPages.slice(0, 6).map((item) => (
                    <p key={item.pagePath} className="text-xs text-zinc-600">
                      <code>{item.pagePath}</code> · seen {item.count} time(s)
                      {item.suggestion?.targetType && item.suggestion?.targetId ? (
                        <>
                          {" "}
                          · suggest {item.suggestion.targetType}:{item.suggestion.targetId}
                          {item.repoChange ? (
                            <>
                              {" "}
                              · {item.repoChange.prUrl ? (
                                <Link className="underline underline-offset-4" href={item.repoChange.prUrl}>
                                  {repoChangeStatusLabel(item.repoChange.status)}
                                </Link>
                              ) : (
                                repoChangeStatusLabel(item.repoChange.status)
                              )}
                            </>
                          ) : null}
                          <form action={onRegisterSeoTarget} className="inline">
                            <input type="hidden" name="targetType" value={item.suggestion.targetType} />
                            <input type="hidden" name="targetId" value={item.suggestion.targetId} />
                            <input type="hidden" name="targetPath" value={item.pagePath} />
                            <button type="submit" className="ml-2 text-xs underline underline-offset-4">
                              Open PR
                            </button>
                          </form>
                        </>
                      ) : null}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-emerald-700">No unmapped pages in recent imports.</p>
            )}
            {seoImportDiagnostics.resolvedRecentUnmappedPages.length ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-900">Registered, waiting for refreshed import</p>
                  <form action={onReplayLatestSeoImport}>
                    <button type="submit" className="text-xs underline underline-offset-4">
                      Replay latest import
                    </button>
                  </form>
                </div>
                <div className="mt-2 space-y-2">
                  {seoImportDiagnostics.resolvedRecentUnmappedPages.slice(0, 4).map((item) => (
                    <p key={item.pagePath} className="text-xs text-zinc-600">
                      <code>{item.pagePath}</code> ·{" "}
                      {item.repoChange?.prUrl ? (
                        <Link className="underline underline-offset-4" href={item.repoChange.prUrl}>
                          {repoChangeStatusLabel(item.repoChange.status)}
                        </Link>
                      ) : (
                        repoChangeStatusLabel(item.repoChange?.status ?? "merged")
                      )}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 rounded-xl bg-zinc-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Search Console sync runtime</p>
              <p className="mt-1 text-xs text-zinc-500">
                automation {seoSync.enabled ? "enabled" : "disabled"} · config {seoSync.configured ? "ready" : "missing"} · interval{" "}
                {seoSync.intervalMinutes ? `${seoSync.intervalMinutes}m` : "manual only"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                health {seoSync.healthLabel} · {seoSync.healthDetail}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/ops/audit/seo-sync" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900">
                Open audit page
              </Link>
              <form action={onControlSeoSync}>
                <input type="hidden" name="action" value="retry_now" />
                <button type="submit" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900">
                  Retry now
                </button>
              </form>
              <form action={onControlSeoSync}>
                <input type="hidden" name="action" value="clear_backoff" />
                <button type="submit" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900">
                  Clear backoff
                </button>
              </form>
              <form action={onControlSeoSync}>
                <input type="hidden" name="action" value={seoSync.paused ? "resume" : "pause"} />
                <button type="submit" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900">
                  {seoSync.paused ? "Resume automation" : "Pause automation"}
                </button>
              </form>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs font-medium text-zinc-900">Current state</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                <p>health {seoSync.healthLabel}</p>
                <p>status {seoSync.lastRunStatus ?? "n/a"}</p>
                <p>automation {seoSync.paused ? `paused by ${seoSync.pausedBy ?? "unknown"}` : seoSync.enabled ? "enabled" : "disabled"}</p>
                <p>paused at {seoSync.pausedAt ?? "n/a"}</p>
                <p>last success {seoSync.lastSuccessAt ?? "n/a"}</p>
                <p>last failure {seoSync.lastFailureAt ?? "n/a"}</p>
                <p>last skipped {seoSync.lastSkippedAt ?? "n/a"}</p>
                <p>last actor {seoSync.lastActor ?? "n/a"}</p>
                <p>error category {seoSync.lastErrorCategory ?? "n/a"} · code {seoSync.lastErrorCode ?? "n/a"}</p>
                <p>retryable {seoSync.lastErrorRetryable == null ? "n/a" : seoSync.lastErrorRetryable ? "yes" : "no"}</p>
                <p>
                  last rows fetched {seoSync.lastFetchedRows} · ingested {seoSync.lastIngestedRows}
                </p>
                {seoSync.nextAllowedRunAt ? <p>next auto retry {seoSync.nextAllowedRunAt}</p> : null}
                {seoSync.lastError ? <p className="text-rose-700">last error {seoSync.lastError}</p> : null}
                {seoSync.recoveryHint ? <p className="text-amber-700">recovery {seoSync.recoveryHint}</p> : null}
                {!seoSync.configured && seoSync.missing.length ? <p>missing {seoSync.missing.join(", ")}</p> : null}
              </div>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs font-medium text-zinc-900">History summary</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                <p>tracked runs {seoSyncHistory?.totalRunsTracked ?? seoSync.recentRuns.length}</p>
                <p>
                  success {seoSyncHistory?.statusCounts.success ?? 0} · failure {seoSyncHistory?.statusCounts.failure ?? 0} · skipped{" "}
                  {seoSyncHistory?.statusCounts.skipped ?? 0}
                </p>
                <p>latest success {seoSyncHistory?.latestSuccessRun?.at ?? "n/a"}</p>
                <p>latest failure {seoSyncHistory?.latestFailureRun?.at ?? "n/a"}</p>
                <p>latest skipped {seoSyncHistory?.latestSkippedRun?.at ?? "n/a"}</p>
                <p>failure streak started {seoSyncHistory?.firstFailureInCurrentStreak?.at ?? "n/a"}</p>
                {seoSyncHistory?.comparison ? (
                  <>
                    <p>
                      since last success {seoSyncHistory.comparison.changedSinceLastSuccess ? "changed" : "stable"} · latest failure{" "}
                      {seoSyncHistory.comparison.latestFailure?.category ?? "n/a"}
                    </p>
                    {seoSyncHistory.comparison.latestSuccessRows ? (
                      <p>
                        last success rows fetched {seoSyncHistory.comparison.latestSuccessRows.fetched} · ingested{" "}
                        {seoSyncHistory.comparison.latestSuccessRows.ingested}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
              <p className="mt-4 text-xs font-medium text-zinc-900">Recent runs</p>
              <div className="mt-2 max-h-[28rem] space-y-2 overflow-auto pr-1">
                {(seoSyncHistory?.recentRuns?.length ? seoSyncHistory.recentRuns : seoSync.recentRuns).length ? (
                  (seoSyncHistory?.recentRuns?.length ? seoSyncHistory.recentRuns : seoSync.recentRuns).slice(0, 10).map((run, index) => (
                    <div key={`${run.at}-${index}`} className="rounded-lg border border-zinc-200 px-3 py-2">
                      <p className={`text-xs font-medium ${run.status === "success" ? "text-emerald-700" : run.status === "failure" ? "text-rose-700" : "text-amber-700"}`}>{run.status}</p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {run.at} · actor {run.actor ?? "n/a"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        rows {run.fetchedRows} fetched · {run.ingestedRows} ingested
                      </p>
                      {run.request?.startDate || run.request?.endDate ? (
                        <p className="mt-1 text-xs text-zinc-600">
                          window {run.request?.startDate ?? "n/a"} → {run.request?.endDate ?? "n/a"}
                        </p>
                      ) : null}
                      {run.errorCategory || run.errorCode ? (
                        <p className="mt-1 text-xs text-zinc-600">
                          category {run.errorCategory ?? "n/a"} · code {run.errorCode ?? "n/a"} · retryable{" "}
                          {run.errorRetryable == null ? "n/a" : run.errorRetryable ? "yes" : "no"}
                        </p>
                      ) : null}
                      {run.error ? <p className="mt-1 text-xs text-rose-700">{run.error}</p> : null}
                      {run.recoveryHint ? <p className="mt-1 text-xs text-amber-700">{run.recoveryHint}</p> : null}
                      {run.reason ? <p className="mt-1 text-xs text-amber-700">{run.reason}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">No sync runs recorded yet.</p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs font-medium text-zinc-900">Recovery review</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                <p>status {seoSyncRecoveryReview?.label ?? "n/a"}</p>
                <p>{seoSyncRecoveryReview?.detail ?? "No recovery review yet."}</p>
                <p>
                  latest recovery action {seoSyncRecoveryReview?.latestAction?.action ?? "n/a"} ·{" "}
                  {seoSyncRecoveryReview?.latestAction?.at ?? "n/a"}
                </p>
                {seoSyncRecoveryReview?.latestAction?.nextRun ? (
                  <p>
                    next run {seoSyncRecoveryReview.latestAction.nextRun.status ?? "n/a"} ·{" "}
                    {seoSyncRecoveryReview.latestAction.nextRun.at ?? "n/a"}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs font-medium text-zinc-900">Control audit</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                <p>tracked actions {seoSyncControlAudit?.totalActionsTracked ?? 0}</p>
                <p>
                  retry {seoSyncControlAudit?.actionCounts.retry_now ?? 0} · pause {seoSyncControlAudit?.actionCounts.pause ?? 0} · resume{" "}
                  {seoSyncControlAudit?.actionCounts.resume ?? 0} · clear backoff {seoSyncControlAudit?.actionCounts.clear_backoff ?? 0}
                </p>
                <p>latest action {seoSyncControlAudit?.latestAction?.action ?? "n/a"}</p>
                <p>latest actor {seoSyncControlAudit?.latestAction?.actor ?? "n/a"}</p>
                <p>latest at {seoSyncControlAudit?.latestAction?.at ?? "n/a"}</p>
                <p>
                  next run after latest action {seoSyncControlAudit?.latestAction?.nextRun?.status ?? "n/a"}
                  {seoSyncControlAudit?.latestAction?.nextRun?.at ? ` · ${seoSyncControlAudit.latestAction.nextRun.at}` : ""}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs font-medium text-zinc-900">Recent manual interventions</p>
              <div className="mt-2 max-h-56 space-y-2 overflow-auto pr-1">
                {seoSyncControlAudit?.recentActions?.length ? (
                  seoSyncControlAudit.recentActions.map((item, index) => (
                    <div key={`${item.at}-${index}`} className="rounded-lg border border-zinc-200 px-3 py-2">
                      <p className="text-xs font-medium text-zinc-900">{item.action ?? "unknown"}</p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {item.at ?? "n/a"} · actor {item.actor ?? "n/a"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        assessment {item.assessment?.label ?? "n/a"} · {item.assessment?.detail ?? "n/a"}
                      </p>
                      {item.note ? <p className="mt-1 text-xs text-zinc-600">{item.note}</p> : null}
                      {item.nextRun ? (
                        <p className="mt-1 text-xs text-zinc-600">
                          next run {item.nextRun.status ?? "n/a"} · {item.nextRun.at ?? "n/a"}
                          {item.nextRun.status === "success" ? ` · ingested ${item.nextRun.ingestedRows}` : ""}
                          {item.nextRun.errorCategory ? ` · ${item.nextRun.errorCategory}` : ""}
                          {item.nextRun.reason ? ` · ${item.nextRun.reason}` : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-500">No sync run has been recorded after this action yet.</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">No manual control actions recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Payment issue reasons</p>
            <p className="mt-1 text-xs text-zinc-500">把 payment issue 再细分到更明确的异常原因，方便判断具体恢复动作。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { key: "payment_failed", label: "Payment failed", items: monitoring.paymentResults24h.topReasons.payment_failed },
            { key: "payment_canceled", label: "Payment canceled", items: monitoring.paymentResults24h.topReasons.payment_canceled },
            { key: "payment_requires_action", label: "Requires action", items: monitoring.paymentResults24h.topReasons.payment_requires_action },
          ].map((group) => (
            <div key={group.key} className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">{group.label}</p>
              <div className="mt-2 space-y-2">
                {group.items.length ? (
                  group.items.map((item) => (
                    <p key={item.key} className="text-xs text-zinc-600">
                      {item.label} · affected {item.affectedOrders}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {seoTopIssues.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">SEO/GEO top issues</p>
              <p className="mt-1 text-xs text-zinc-500">按 issue score 排序的前 5 个目标，帮助快速定位需要先修的页面。</p>
            </div>
            <Link className="text-xs underline underline-offset-4" href="/ops?status=open,in_progress&q=seo-">
              All SEO recommendations
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {seoTopIssues.map((item) => {
              const href =
                targetHref({ type: item.targetType, id: item.targetId }) ??
                (item.targetPath ? item.targetPath : null);
              const draftHref = draftHrefForTarget(
                { type: item.targetType, id: item.targetId },
                item.recommendation?.preparedDraft?.draftId ?? null,
              );
              return (
                <div key={`${item.targetType}:${item.targetId}`} className="rounded-xl bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {href ? (
                          <Link className="underline underline-offset-4" href={href}>
                            {item.title ?? `${item.targetType}:${item.targetId}`}
                          </Link>
                        ) : (
                          item.title ?? `${item.targetType}:${item.targetId}`
                        )}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.targetType} · {item.targetId}
                        {item.issueTypes?.length ? ` · ${item.issueTypes.join(", ")}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <p className="text-xs text-zinc-500">score {(item.issueScore ?? 0).toFixed(0)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {draftHref ? (
                          <Link className="text-xs underline underline-offset-4" href={draftHref}>
                            Open prepared draft
                          </Link>
                        ) : null}
                        <form action={onGenerateSeoDraft}>
                          <input type="hidden" name="targetType" value={item.targetType} />
                          <input type="hidden" name="targetId" value={item.targetId} />
                          <button type="submit" className="text-xs underline underline-offset-4">
                            {draftHref ? "Refresh draft" : "Create draft"}
                          </button>
                        </form>
                        {href ? (
                          <Link className="text-xs underline underline-offset-4" href={href}>
                            Open target
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs text-zinc-500">Impressions</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">{item.summary.current.impressions}</p>
                      <p className="mt-1 text-xs text-zinc-500">Δ {item.summary.delta.impressions}</p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs text-zinc-500">Clicks</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">{item.summary.current.clicks}</p>
                      <p className="mt-1 text-xs text-zinc-500">Δ {item.summary.delta.clicks}</p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs text-zinc-500">CTR</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">{(item.summary.current.ctr * 100).toFixed(2)}%</p>
                      <p className="mt-1 text-xs text-zinc-500">Δ {(item.summary.delta.ctr * 100).toFixed(2)}pts</p>
                    </div>
                    <div className="rounded-lg bg-white p-3">
                      <p className="text-xs text-zinc-500">Position</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900">
                        {item.summary.current.position == null ? "n/a" : item.summary.current.position.toFixed(1)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Δ {item.summary.delta.position == null ? "n/a" : item.summary.delta.position.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  {item.recommendation?.context?.actionHints?.length ? (
                    <div className="mt-3 rounded-lg bg-white p-3">
                      <p className="text-xs font-medium text-zinc-900">Suggested edits</p>
                      <div className="mt-2 space-y-2">
                        {item.recommendation.context.actionHints.slice(0, 3).map((hint, idx) => (
                          <p key={`${item.targetType}:${item.targetId}:hint:${idx}`} className="text-xs text-zinc-600">
                            {idx + 1}. {hint}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">AI concierge funnel · 24h</p>
            <p className="mt-1 text-xs text-zinc-500">观察入口曝光、问答进入、结果曝光与结果点击，评估购买前 AI 化是否开始形成漏斗。</p>
          </div>
          <span className="text-xs text-zinc-500">{monitoring.aiConcierge.events24h} events</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Entry views</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.aiConcierge.funnel.entryViews}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Entry clicks</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.aiConcierge.funnel.entryClicks}</p>
            <p className="mt-1 text-xs text-zinc-500">CTR {(monitoring.aiConcierge.funnel.entryCtr * 100).toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Quiz views</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.aiConcierge.funnel.quizViews}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Results views</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.aiConcierge.funnel.resultsViews}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Result clicks</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.aiConcierge.funnel.resultClicks}</p>
            <p className="mt-1 text-xs text-zinc-500">CTR {(monitoring.aiConcierge.funnel.resultCtr * 100).toFixed(1)}%</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          bucket A {monitoring.aiConcierge.buckets.A} · bucket B {monitoring.aiConcierge.buckets.B} · unknown {monitoring.aiConcierge.buckets.unknown}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          attributed · product views {monitoring.aiConcierge.funnel.attributedProductViews} · add_to_cart {monitoring.aiConcierge.funnel.attributedAddToCart} · purchases {monitoring.aiConcierge.funnel.attributedPurchases}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          rates · atc/view {(monitoring.aiConcierge.funnel.atcRate * 100).toFixed(1)}% · purchase/atc {(monitoring.aiConcierge.funnel.purchaseRateFromAtc * 100).toFixed(1)}% · purchase/view {(monitoring.aiConcierge.funnel.purchaseRateFromView * 100).toFixed(2)}%
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">主策略待决</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{aiGovernanceGroup.counts.mainNeedsDecision}</p>
            <p className="mt-1 text-xs text-zinc-500">draft/approved</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">风险修正待审</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{aiGovernanceGroup.counts.followupManualReview}</p>
            <p className="mt-1 text-xs text-zinc-500">keep draft</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">修正观察中</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{aiGovernanceGroup.counts.followupObserving}</p>
            <p className="mt-1 text-xs text-zinc-500">merged window</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">修正 CI 失败</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{aiGovernanceGroup.counts.followupFixCi}</p>
            <p className="mt-1 text-xs text-zinc-500">fix before review</p>
          </div>
        </div>
        {(aiGovernanceGroup.top.followupFixCi.length ||
          aiGovernanceGroup.top.followupManualReview.length ||
          aiGovernanceGroup.top.followupObserving.length) ? (
          <div className="mt-4 rounded-xl border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-900">AI concierge governance queue</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="text-xs font-medium text-zinc-900">Fix CI</p>
                <div className="mt-2 space-y-2">
                  {aiGovernanceGroup.top.followupFixCi.length ? (
                    aiGovernanceGroup.top.followupFixCi.map((item) => (
                      <div key={item.id} className="text-xs text-zinc-600">
                        <Link className="underline underline-offset-2" href={`/ops/proposals/${item.id}`}>
                          {item.id}
                        </Link>
                        <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500">none</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="text-xs font-medium text-zinc-900">Manual review</p>
                <div className="mt-2 space-y-2">
                  {aiGovernanceGroup.top.followupManualReview.length ? (
                    aiGovernanceGroup.top.followupManualReview.map((item) => (
                      <div key={item.id} className="text-xs text-zinc-600">
                        <Link className="underline underline-offset-2" href={`/ops/proposals/${item.id}`}>
                          {item.id}
                        </Link>
                        <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500">none</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="text-xs font-medium text-zinc-900">Observing</p>
                <div className="mt-2 space-y-2">
                  {aiGovernanceGroup.top.followupObserving.length ? (
                    aiGovernanceGroup.top.followupObserving.map((item) => (
                      <div key={item.id} className="text-xs text-zinc-600">
                        <Link className="underline underline-offset-2" href={`/ops/proposals/${item.id}`}>
                          {item.id}
                        </Link>
                        <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500">none</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {monitoring.aiConcierge.recommendations.length ? (
          <div className="mt-4 rounded-xl border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-900">Open AI concierge recommendations</p>
            <div className="mt-2 space-y-2">
              {monitoring.aiConcierge.recommendations.map((rec) => (
                <div key={rec.id} className="rounded-lg bg-zinc-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <GovernanceBadge label={rec.severity} tone={rec.severity === "critical" ? "critical" : "warning"} />
                    <span className="text-xs text-zinc-500">
                      {rec.context?.metricLabel ?? rec.context?.metricKey ?? rec.ruleId} · {rec.suggestedWorkflow}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">{rec.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {monitoring.aiConcierge.proposals.length ? (
          <div className="mt-4 rounded-xl border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-900">AI concierge tuning proposals</p>
            <div className="mt-2 space-y-2">
              {monitoring.aiConcierge.proposals.map((proposal) => (
                <div key={proposal.id} className="rounded-lg bg-zinc-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{proposal.ruleMeta?.description ?? "AI concierge strategy tuning"}</p>
                      <p className="mt-1 text-xs text-zinc-500">{proposal.status} · created {proposal.createdAt}</p>
                    </div>
                    <Link className="text-xs underline underline-offset-4" href={`/ops/proposals/${proposal.id}`}>
                      Open proposal
                    </Link>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">{proposal.suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Action queue</p>
            <p className="mt-1 text-xs text-zinc-500">按治理动作优先级排序，打开页面先处理最该处理的 case。</p>
          </div>
          <span className="text-xs text-zinc-500">{monitoring.publishing.queue.counts.total ?? 0} items</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">需要立即审核</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.publishing.queue.counts.review_now ?? 0}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">需要立即处理</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.publishing.queue.counts.fix_now ?? 0}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">暂停发布中</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.publishing.queue.counts.hold_publish ?? 0}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">等待外部结果</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{monitoring.publishing.queue.counts.waiting ?? 0}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {monitoring.publishing.queue.top.length ? (
            monitoring.publishing.queue.top.map((item) => {
              const href = targetHref({ type: String(item.targetType), id: String(item.targetId) });
              return (
                <div key={`${String(item.targetType)}:${String(item.targetId)}:${String(item.actionCode)}`} className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900">
                        {String(item.targetType)}:{String(item.targetId)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        priority {Number(item.priorityScore)} · {String(item.stateLabel)} · {String(item.eventAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GovernanceBadge label={String(item.stateLabel)} tone={String(item.stateTone)} />
                      <GovernanceBadge label={String(item.actionLabel)} tone={String(item.actionTone)} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {href ? (
                      <Link className="underline" href={href}>
                        Open target
                      </Link>
                    ) : null}
                    {typeof item.incidentProposalId === "string" && item.incidentProposalId ? (
                      <Link className="underline" href={`/ops/proposals/${item.incidentProposalId}`}>
                        Open proposal
                      </Link>
                    ) : null}
                    {typeof item.repoChangeId === "string" && item.repoChangeId ? (
                      <Link className="underline" href={repoNextHref(String(item.targetType), String(item.targetId), typeof item.repoChangeNextStepCode === "string" ? item.repoChangeNextStepCode : null)}>
                        Open repo change lane
                      </Link>
                    ) : null}
                    <Link className="underline" href={`/ops/audit?action=${encodeURIComponent(String(item.action))}&q=${encodeURIComponent(String(item.targetId))}`}>
                      Audit context
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No active governance queue item.</div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className={`rounded-2xl border p-5 ${dependencyTone(monitoring.runtime.dependencies.medusa.status)}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Medusa probe</p>
            <DependencyStatusBadge status={monitoring.runtime.dependencies.medusa.status} />
          </div>
          <p className="mt-2 text-sm">{monitoring.runtime.dependencies.medusa.detail}</p>
          {monitoring.runtime.dependencies.medusa.baseUrl ? (
            <p className="mt-1 text-xs opacity-80">
              {monitoring.runtime.dependencies.medusa.baseUrl}
              {monitoring.runtime.dependencies.medusa.statusCode ? ` · ${monitoring.runtime.dependencies.medusa.statusCode}` : ""}
            </p>
          ) : null}
        </div>
        <div className={`rounded-2xl border p-5 ${dependencyTone(monitoring.runtime.dependencies.sanity.status)}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Sanity probe</p>
            <DependencyStatusBadge status={monitoring.runtime.dependencies.sanity.status} />
          </div>
          <p className="mt-2 text-sm">{monitoring.runtime.dependencies.sanity.detail}</p>
          {monitoring.runtime.dependencies.sanity.projectId ? (
            <p className="mt-1 text-xs opacity-80">
              {monitoring.runtime.dependencies.sanity.projectId} / {monitoring.runtime.dependencies.sanity.dataset}
              {monitoring.runtime.dependencies.sanity.statusCode ? ` · ${monitoring.runtime.dependencies.sanity.statusCode}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Commerce funnel by source</p>
            <p className="mt-1 text-xs text-zinc-500">按 attribution source 看 24h checkout 开始、完成和掉队情况。</p>
          </div>
          <span className="text-xs text-zinc-500">{monitoring.commerceCheckout.bySource.length} sources</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {monitoring.commerceCheckout.bySource.length ? (
            monitoring.commerceCheckout.bySource.slice(0, 6).map((item) => (
              <div key={item.source} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900">{item.source}</p>
                  <span className="text-xs text-zinc-500">{(item.checkoutCompletionRate * 100).toFixed(1)}%</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  starts {item.checkoutStarts} · completes {item.checkoutCompletes} · dropoff {item.checkoutDropoff}
                </p>
                <p className="mt-1 text-xs text-zinc-500">purchases {item.purchases24h}</p>
                {item.paths?.length ? (
                  <div className="mt-2 space-y-1">
                    {item.paths.slice(0, 2).map((path) => (
                      <p key={path.key} className="text-xs text-zinc-500">
                        path {path.targetType}:{path.targetId} · starts {path.checkoutStarts} · completes {path.checkoutCompletes} · dropoff {path.checkoutDropoff}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No checkout source sample in current window.</div>
          )}
        </div>
      </div>

      {monitoring.paymentResults24h.recommendations.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Payment issue recommendations</p>
              <p className="mt-1 text-xs text-zinc-500">把 payment failed / canceled / requires action 从统计项推进成可跟进对象。</p>
            </div>
            <span className="text-xs text-zinc-500">{monitoring.paymentResults24h.recommendations.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.paymentResults24h.recommendations.map((rec) => (
              <div key={rec.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <GovernanceBadge label={rec.severity} tone={rec.severity === "critical" ? "critical" : "warning"} />
                    <span className="text-xs text-zinc-500">
                      {rec.context?.metricLabel ?? rec.ruleId} · {rec.suggestedWorkflow}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {typeof rec.context?.issueRate === "number" ? `${(rec.context.issueRate * 100).toFixed(1)}%` : null}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{rec.reason}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  affected {rec.context?.observedCount ?? 0} · paid {rec.context?.paidCount ?? 0} · failed {rec.context?.failedCount ?? 0} · canceled {rec.context?.canceledCount ?? 0} · requires action {rec.context?.requiresActionCount ?? 0}
                </p>
                {rec.context?.recoveryLane ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    lane {rec.context.recoveryLane} · owner {rec.context.recoveryOwner ?? "ops"}
                    {rec.context.paymentIssueReasonLabel ? ` · reason ${rec.context.paymentIssueReasonLabel}` : ""}
                  </p>
                ) : null}
                {typeof rec.context?.deltaTargetedIssueRate === "number" ? (
                  <p className="mt-1 text-xs text-zinc-500">delta {(rec.context.deltaTargetedIssueRate * 100).toFixed(1)} pts · attempts {rec.context?.paymentAttempts ?? rec.context?.sampleSize ?? 0}</p>
                ) : null}
                {rec.context?.weakestPath ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    focus path {rec.context.weakestPath.targetPath ?? `${rec.context.weakestPath.targetType}:${rec.context.weakestPath.targetId}`} · affected {rec.context.weakestPath.affectedOrders}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {rec.context?.targetPath ? (
                    <Link className="underline" href={rec.context.targetPath}>
                      Open monitoring
                    </Link>
                  ) : null}
                  {rec.context?.parentProposalId ? (
                    <Link className="underline" href={`/ops/proposals/${rec.context.parentProposalId}`}>
                      Open parent proposal
                    </Link>
                  ) : null}
                  {Array.isArray(rec.context?.actionHints) && rec.context?.actionHints[0] ? (
                    <span className="text-zinc-600">next: {rec.context.actionHints[0]}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {monitoring.paymentResults24h.proposals.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Payment follow-up proposals</p>
              <p className="mt-1 text-xs text-zinc-500">payment issue recommendation 已经进入 proposal 承接，可继续审核和推进。</p>
            </div>
            <span className="text-xs text-zinc-500">
              {monitoring.paymentResults24h.proposals.length} · sync {monitoring.paymentResults24h.proposalSync.createdOrUpdated}/{monitoring.paymentResults24h.proposalSync.evaluated}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.paymentResults24h.proposals.map((proposal) => (
              <div key={proposal.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {proposal.targetId ?? "payment issue"}
                      {proposal.context?.weakestPath
                        ? ` · ${proposal.context.weakestPath.targetPath ?? `${proposal.context.weakestPath.targetType}:${proposal.context.weakestPath.targetId}`}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {proposal.status} · created {proposal.createdAt ?? "n/a"}
                    </p>
                  </div>
                  <Link className="text-xs underline underline-offset-4" href={`/ops/proposals/${proposal.id}`}>
                    Open proposal
                  </Link>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{proposal.summary ?? proposal.expectedImpact ?? "Payment follow-up proposal"}</p>
                {proposal.applyHowTo ? <p className="mt-2 text-xs text-zinc-500">how to: {proposal.applyHowTo}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Payment issue paths</p>
            <p className="mt-1 text-xs text-zinc-500">按 payment issue 展示当前最弱的商品/内容路径，帮助快速定位更具体的问题入口。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { key: "payment_failed", label: "Payment failed", items: monitoring.paymentResults24h.topTargets.payment_failed },
            { key: "payment_canceled", label: "Payment canceled", items: monitoring.paymentResults24h.topTargets.payment_canceled },
            { key: "payment_requires_action", label: "Requires action", items: monitoring.paymentResults24h.topTargets.payment_requires_action },
          ].map((group) => (
            <div key={group.key} className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">{group.label}</p>
              <div className="mt-2 space-y-2">
                {group.items.length ? (
                  group.items.slice(0, 3).map((item) => (
                    <p key={item.key} className="text-xs text-zinc-600">
                      {item.targetPath ?? `${item.targetType}:${item.targetId}`} · affected {item.affectedOrders}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Fulfillment paths</p>
            <p className="mt-1 text-xs text-zinc-500">按履约阶段展示当前最集中的商品/内容路径，帮助判断后链路卡在哪些路径。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { key: "fulfillment_processing", label: "Processing", items: monitoring.fulfillmentResults24h.topTargets.fulfillment_processing },
            { key: "fulfillment_shipped", label: "Shipped", items: monitoring.fulfillmentResults24h.topTargets.fulfillment_shipped },
            { key: "fulfillment_delivered", label: "Delivered", items: monitoring.fulfillmentResults24h.topTargets.fulfillment_delivered },
          ].map((group) => (
            <div key={group.key} className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">{group.label}</p>
              <div className="mt-2 space-y-2">
                {group.items.length ? (
                  group.items.slice(0, 3).map((item) => (
                    <p key={item.key} className="text-xs text-zinc-600">
                      {item.targetPath ?? `${item.targetType}:${item.targetId}`} · affected {item.affectedOrders}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Refund paths</p>
            <p className="mt-1 text-xs text-zinc-500">把订单逆向链路先接进 monitoring，先看退款请求和退款完成集中在哪些商品路径。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            { key: "refund_requested", label: "Refund requested", items: monitoring.refundResults24h.topTargets.refund_requested },
            { key: "refund_refunded", label: "Refund refunded", items: monitoring.refundResults24h.topTargets.refund_refunded },
          ].map((group) => (
            <div key={group.key} className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">{group.label}</p>
              <div className="mt-2 space-y-2">
                {group.items.length ? (
                  group.items.slice(0, 4).map((item) => (
                    <p key={item.key} className="text-xs text-zinc-600">
                      {item.targetPath ?? `${item.targetType}:${item.targetId}`} · affected {item.affectedOrders}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {monitoring.fulfillmentResults24h.recommendations.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Fulfillment backlog recommendations</p>
              <p className="mt-1 text-xs text-zinc-500">把 processing 积压从监控统计推进成可跟进对象，先帮助定位履约卡顿路径。</p>
            </div>
            <span className="text-xs text-zinc-500">{monitoring.fulfillmentResults24h.recommendations.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.fulfillmentResults24h.recommendations.map((rec) => (
              <div key={rec.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <GovernanceBadge label={rec.severity} tone={rec.severity === "critical" ? "critical" : "warning"} />
                  <span className="text-xs text-zinc-500">
                    {rec.context?.metricLabel ?? rec.ruleId} · {rec.suggestedWorkflow}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{rec.reason}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  processing {rec.context?.processingCount ?? 0} · shipped {rec.context?.shippedCount ?? 0} · delivered {rec.context?.deliveredCount ?? 0}
                </p>
                {typeof rec.context?.deltaProcessingBacklogRate === "number" ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    backlog delta {(rec.context.deltaProcessingBacklogRate * 100).toFixed(1)} pts · tracked {rec.context?.sampleSize ?? 0}
                  </p>
                ) : null}
                {rec.context?.weakestPath ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    focus path {rec.context.weakestPath.targetPath ?? `${rec.context.weakestPath.targetType}:${rec.context.weakestPath.targetId}`} · affected {rec.context.weakestPath.affectedOrders}
                  </p>
                ) : null}
                {rec.context?.recoveryLane ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    lane {rec.context.recoveryLane} · owner {rec.context.recoveryOwner ?? "ops"}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {rec.context?.targetPath ? (
                    <Link className="underline" href={rec.context.targetPath}>
                      Open monitoring
                    </Link>
                  ) : null}
                  {rec.context?.parentProposalId ? (
                    <Link className="underline" href={`/ops/proposals/${rec.context.parentProposalId}`}>
                      Open parent proposal
                    </Link>
                  ) : null}
                  {Array.isArray(rec.context?.actionHints) && rec.context?.actionHints[0] ? (
                    <span className="text-zinc-600">next: {rec.context.actionHints[0]}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {monitoring.fulfillmentResults24h.proposals.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Fulfillment follow-up proposals</p>
              <p className="mt-1 text-xs text-zinc-500">fulfillment backlog recommendation 已进入 proposal 承接，可继续审核与推进。</p>
            </div>
            <span className="text-xs text-zinc-500">
              {monitoring.fulfillmentResults24h.proposals.length} · sync {monitoring.fulfillmentResults24h.proposalSync.createdOrUpdated}/{monitoring.fulfillmentResults24h.proposalSync.evaluated}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.fulfillmentResults24h.proposals.map((proposal) => (
              <div key={proposal.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {proposal.targetId ?? "fulfillment backlog"}
                      {proposal.context?.weakestPath
                        ? ` · ${proposal.context.weakestPath.targetPath ?? `${proposal.context.weakestPath.targetType}:${proposal.context.weakestPath.targetId}`}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {proposal.status} · created {proposal.createdAt ?? "n/a"}
                    </p>
                  </div>
                  <Link className="text-xs underline underline-offset-4" href={`/ops/proposals/${proposal.id}`}>
                    Open proposal
                  </Link>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{proposal.summary ?? proposal.expectedImpact ?? "Fulfillment follow-up proposal"}</p>
                {proposal.applyHowTo ? <p className="mt-2 text-xs text-zinc-500">how to: {proposal.applyHowTo}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Payment recovery governance queue</p>
            <p className="mt-1 text-xs text-zinc-500">把 payment issue 整理成待处理、观察中、风险续推、已恢复四个状态，方便按队列推进。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">待处理</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{paymentGovernanceGroup.counts.mainNeedsDecision}</p>
            <p className="mt-1 text-xs text-zinc-500">open recommendations</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">观察中</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{paymentGovernanceGroup.counts.observing}</p>
            <p className="mt-1 text-xs text-zinc-500">applied proposals</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">风险续推</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{paymentGovernanceGroup.counts.followupRisk}</p>
            <p className="mt-1 text-xs text-zinc-500">follow-up needed</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">已恢复</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{paymentGovernanceGroup.counts.recovered}</p>
            <p className="mt-1 text-xs text-zinc-500">success window</p>
          </div>
        </div>
        {(paymentGovernanceGroup.top.mainNeedsDecision.length ||
          paymentGovernanceGroup.top.observing.length ||
          paymentGovernanceGroup.top.followupRisk.length) ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">Needs decision</p>
              <div className="mt-2 space-y-2">
                {paymentGovernanceGroup.top.mainNeedsDecision.length ? (
                  paymentGovernanceGroup.top.mainNeedsDecision.map((item) => (
                    <div key={item.id} className="text-xs text-zinc-600">
                      <p className="font-medium text-zinc-900">{item.source}{item.path ? ` · ${item.path}` : ""}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">Observing</p>
              <div className="mt-2 space-y-2">
                {paymentGovernanceGroup.top.observing.length ? (
                  paymentGovernanceGroup.top.observing.map((item) => (
                    <div key={item.id} className="text-xs text-zinc-600">
                      <Link className="underline underline-offset-2" href={`/ops/proposals/${item.id}`}>
                        {item.source}{item.path ? ` · ${item.path}` : ""}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">Follow-up risk</p>
              <div className="mt-2 space-y-2">
                {paymentGovernanceGroup.top.followupRisk.length ? (
                  paymentGovernanceGroup.top.followupRisk.map((item) => (
                    <div key={item.id} className="text-xs text-zinc-600">
                      <p className="font-medium text-zinc-900">{item.source}{item.path ? ` · ${item.path}` : ""}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Commerce checkout governance queue</p>
            <p className="mt-1 text-xs text-zinc-500">把 source-path 级别的 checkout 掉队整理成待处理、观察中、风险续推三个队列。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">待处理</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{commerceGovernanceGroup.counts.mainNeedsDecision}</p>
            <p className="mt-1 text-xs text-zinc-500">open recommendations</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">观察中</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{commerceGovernanceGroup.counts.observing}</p>
            <p className="mt-1 text-xs text-zinc-500">applied proposals</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">风险续推</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{commerceGovernanceGroup.counts.followupRisk}</p>
            <p className="mt-1 text-xs text-zinc-500">follow-up needed</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">已恢复</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{commerceGovernanceGroup.counts.recovered}</p>
            <p className="mt-1 text-xs text-zinc-500">success window</p>
          </div>
        </div>
        {(commerceGovernanceGroup.top.mainNeedsDecision.length ||
          commerceGovernanceGroup.top.observing.length ||
          commerceGovernanceGroup.top.followupRisk.length) ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">Needs decision</p>
              <div className="mt-2 space-y-2">
                {commerceGovernanceGroup.top.mainNeedsDecision.length ? (
                  commerceGovernanceGroup.top.mainNeedsDecision.map((item) => (
                    <div key={item.id} className="text-xs text-zinc-600">
                      <p className="font-medium text-zinc-900">{item.source}{item.path ? ` · ${item.path}` : ""}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">Observing</p>
              <div className="mt-2 space-y-2">
                {commerceGovernanceGroup.top.observing.length ? (
                  commerceGovernanceGroup.top.observing.map((item) => (
                    <div key={item.id} className="text-xs text-zinc-600">
                      <Link className="underline underline-offset-2" href={`/ops/proposals/${item.id}`}>
                        {item.source}{item.path ? ` · ${item.path}` : ""}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-900">Follow-up risk</p>
              <div className="mt-2 space-y-2">
                {commerceGovernanceGroup.top.followupRisk.length ? (
                  commerceGovernanceGroup.top.followupRisk.map((item) => (
                    <div key={item.id} className="text-xs text-zinc-600">
                      <p className="font-medium text-zinc-900">{item.source}{item.path ? ` · ${item.path}` : ""}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.headline}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500">none</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {monitoring.commerceCheckout.recommendations.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Commerce result recommendations</p>
              <p className="mt-1 text-xs text-zinc-500">把低 checkout completion 来源正式变成可跟进对象。</p>
            </div>
            <span className="text-xs text-zinc-500">{monitoring.commerceCheckout.recommendations.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.commerceCheckout.recommendations.map((rec) => (
              <div key={rec.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <GovernanceBadge label={rec.severity} tone={rec.severity === "critical" ? "critical" : "warning"} />
                    <span className="text-xs text-zinc-500">
                      {rec.context?.sourceKey ?? rec.targetId} · {rec.context?.metricLabel ?? rec.ruleId} · {rec.suggestedWorkflow}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {typeof rec.context?.observedRate === "number" ? `${(rec.context.observedRate * 100).toFixed(1)}%` : null}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{rec.reason}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  starts {rec.context?.checkoutStarts ?? 0} · completes {rec.context?.checkoutCompletes ?? 0} · dropoff {rec.context?.checkoutDropoff ?? 0}
                  {typeof rec.context?.threshold === "number" ? ` · threshold ${(rec.context.threshold * 100).toFixed(1)}%` : ""}
                  {typeof rec.context?.deltaCheckoutCompletionRate === "number"
                    ? ` · delta ${(rec.context.deltaCheckoutCompletionRate * 100).toFixed(1)} pts`
                    : ""}
                </p>
                {rec.context?.weakestPath ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    focus path {rec.context.weakestPath.targetType}:{rec.context.weakestPath.targetId} · starts {rec.context.weakestPath.checkoutStarts} · completes {rec.context.weakestPath.checkoutCompletes} · dropoff {rec.context.weakestPath.checkoutDropoff}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {rec.context?.targetPath ? (
                    <Link className="underline" href={rec.context.targetPath}>
                      Open source path
                    </Link>
                  ) : null}
                  {rec.context?.parentProposalId ? (
                    <Link className="underline" href={`/ops/proposals/${rec.context.parentProposalId}`}>
                      Open parent proposal
                    </Link>
                  ) : null}
                  {Array.isArray(rec.context?.actionHints) && rec.context?.actionHints[0] ? (
                    <span className="text-zinc-600">next: {rec.context.actionHints[0]}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {monitoring.commerceCheckout.proposals.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Commerce follow-up proposals</p>
              <p className="mt-1 text-xs text-zinc-500">
                低 checkout completion 来源已经进入 proposal 承接，可继续审核和推进。
              </p>
            </div>
            <span className="text-xs text-zinc-500">
              {monitoring.commerceCheckout.proposals.length} · sync {monitoring.commerceCheckout.proposalSync.createdOrUpdated}/{monitoring.commerceCheckout.proposalSync.evaluated}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.commerceCheckout.proposals.map((proposal) => (
              <div key={proposal.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {proposal.targetId ?? "journey"} · {proposal.anomalyKind ?? "checkout_completion_dropoff"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {proposal.status} · created {proposal.createdAt ?? "n/a"}
                    </p>
                  </div>
                  <Link className="text-xs underline underline-offset-4" href={`/ops/proposals/${proposal.id}`}>
                    Open proposal
                  </Link>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{proposal.summary ?? proposal.expectedImpact ?? "Commerce follow-up proposal"}</p>
                {proposal.applyHowTo ? <p className="mt-2 text-xs text-zinc-500">how to: {proposal.applyHowTo}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Publishing governance</p>
            <span className="text-xs text-zinc-500">{monitoring.publishing.cases.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.publishing.cases.length ? (
              monitoring.publishing.cases.map((item) => {
                const href = targetHref({ type: item.targetType, id: item.targetId });
                return (
                  <div key={`${item.targetType}:${item.targetId}:${item.action}`} className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">
                          {item.targetType}:{item.targetId}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {item.action} · {item.eventAt}
                          {item.verificationLevel ? ` · ${item.verificationLevel}` : ""}
                          {item.rollbackTriggerReason ? ` · ${item.rollbackTriggerReason}` : ""}
                        </p>
                      </div>
                      <span className={`rounded border px-2 py-0.5 text-xs ${governanceToneClass(governanceTone(item.governanceStatus))}`}>{item.governanceStatus}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <GovernanceBadge label={item.actionLabel} tone={item.actionTone} />
                      <p className="text-xs text-zinc-600">{item.actionDetail}</p>
                    </div>
                    <p className="mt-2 text-xs text-zinc-600">{item.nextAction}</p>
                    {item.note ? <p className="mt-1 text-xs text-zinc-500">{item.note}</p> : null}
                    {item.linkedDraftId ? <p className="mt-1 text-xs text-zinc-500">linked draft {item.linkedDraftId}</p> : null}
                    {item.repoChangeId ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        repo change {item.repoChangeId}
                        {item.repoChangeStatus ? ` · ${item.repoChangeStatus}` : ""}
                        {item.repoChangeNextStepLabel ? ` · next ${item.repoChangeNextStepLabel}` : ""}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {href ? (
                        <Link className="underline" href={href}>
                          Open target
                        </Link>
                      ) : null}
                      {item.incidentProposalId ? (
                        <Link className="underline" href={`/ops/proposals/${item.incidentProposalId}`}>
                          Open proposal
                        </Link>
                      ) : null}
                      {item.repoChangeId ? (
                        <Link className="underline" href={repoNextHref(item.targetType, item.targetId, item.repoChangeNextStepCode)}>
                          Open repo change lane
                        </Link>
                      ) : null}
                      {item.repoChangePrUrl ? (
                        <a className="underline" href={item.repoChangePrUrl} target="_blank" rel="noreferrer">
                          Pull request
                        </a>
                      ) : null}
                      <Link className="underline" href={`/ops/audit?action=${encodeURIComponent(item.action)}&q=${encodeURIComponent(item.targetId)}`}>
                        Audit context
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No active publishing governance case in the latest sample.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Active alerts</p>
            <div className="flex items-center gap-3">
              <Link className="text-xs underline underline-offset-4 text-zinc-600" href="/ops/alerts">
                View alert queue
              </Link>
              <span className="text-xs text-zinc-500">{monitoring.alerts.length}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.alerts.length ? (
              monitoring.alerts.map((alert, index) => (
                <div key={`${alert.title}-${index}`} className={`rounded-xl border p-3 ${alertTone(alert.level)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <span className="rounded border border-current/20 px-2 py-0.5 text-xs">{alert.level}</span>
                  </div>
                  <p className="mt-1 text-xs">{alert.detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                No active alerts.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Top purchase gaps</p>
            <span className="text-xs text-zinc-500">{monitoring.purchase.topGaps.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {monitoring.purchase.topGaps.length ? (
              monitoring.purchase.topGaps.map((item) => (
                <div key={`${item.targetType}:${item.targetId}`} className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-zinc-900">{item.title}</p>
                    <span className="text-xs text-zinc-500">
                      {item.gap > 0 ? "+" : ""}
                      {item.gap}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    event {item.eventPurchaseCount} · snapshot {item.snapshotPurchaseCount} · {item.status}
                  </p>
                  {item.targetPath ? (
                    <Link className="mt-2 inline-flex text-xs text-zinc-900 underline" href={item.targetPath}>
                      Open target
                    </Link>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No purchase gap in current scope.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Recent publish anomalies</p>
            <Link className="text-xs text-zinc-500 underline" href="/ops/audit?action=publish">
              Open audit
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {failedPublishes.length ? (
              failedPublishes.map((event) => {
                const href = targetHref(event.target);
                const level = String(event?.verification?.level || "unknown");
                return (
                  <div key={event.id} className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">{event.target?.type}:{event.target?.id}</p>
                        <p className="mt-1 text-xs text-zinc-500">{event.at}</p>
                      </div>
                      <VerificationBadge level={level} />
                    </div>
                    {event.note ? <p className="mt-2 text-xs text-zinc-500">{event.note}</p> : null}
                    <div className="mt-2 flex gap-3 text-xs">
                      {href ? (
                        <Link className="underline" href={href}>
                          Open target
                        </Link>
                      ) : null}
                      <Link className="underline" href={`/ops/audit?action=publish&q=${encodeURIComponent(event.target?.id ?? "")}`}>
                        Audit context
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No warning / blocked publish event in the latest sample.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Recent rollback events</p>
            <Link className="text-xs text-zinc-500 underline" href="/ops/audit?action=rollback">
              Open audit
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {rollbacks.length ? (
              rollbacks.map((event) => {
                const href = targetHref(event.target);
                return (
                  <div key={event.id} className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-900">{event.target?.type}:{event.target?.id}</p>
                        <p className="mt-1 text-xs text-zinc-500">{event.at}</p>
                      </div>
                      <RollbackTriggerBadge trigger={event.trigger} />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {event.triggerReason ? `reason: ${event.triggerReason}` : "reason: not recorded"}
                    </p>
                    {event.note ? <p className="mt-1 text-xs text-zinc-500">{event.note}</p> : null}
                    <div className="mt-2 flex gap-3 text-xs">
                      {href ? (
                        <Link className="underline" href={href}>
                          Open target
                        </Link>
                      ) : null}
                      <Link className="underline" href={`/ops/audit?action=rollback&q=${encodeURIComponent(event.target?.id ?? "")}`}>
                        Audit context
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No recent rollback event in the latest sample.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
