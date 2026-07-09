import { createRuleTuningProposal, getAutoActionPolicy, getMonitoringSummary, getOpsAuthStatus, getOpsEvents, getRecommendationRuleStats, getRecommendations, getSignalsOverview, getSignalsStatus, listOpsTargets, listRepoChanges, listRuleTuningProposals, openRepoChangePullRequest, openRepoChangeRevertPullRequest, resolveRecommendation, syncActiveRepoChanges, syncRepoChange, transitionRuleTuningProposal, updateAutoActionPolicy } from "@/lib/control-plane/ops";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GovernanceBadge, governanceToneClass } from "./components/governance-ui";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OpsDashboardPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const repoNext = typeof sp.repoNext === "string" ? sp.repoNext : undefined;
  const err = typeof sp.err === "string" ? sp.err : undefined;
  const msg = typeof sp.msg === "string" ? sp.msg : undefined;

  const { items } = await listOpsTargets({ type, q });
  const authStatus = await getOpsAuthStatus();
  const recommendations = await getRecommendations({
    status: status ?? "open,in_progress",
    targetType: type === "faq" ? undefined : type,
  });
  const ruleStats = await getRecommendationRuleStats({ sinceDays: 30 });
  const recentProposals = await listRuleTuningProposals({ limit: 6 });
  const repoChanges = await listRepoChanges({ limit: 20, targetType: type === "faq" ? undefined : type });
  const autoActionPolicy = await getAutoActionPolicy();
  const signalsStatus = await getSignalsStatus();
  const monitoringSummary = await getMonitoringSummary({ targetType: type === "faq" ? undefined : type });
  const audit = await getOpsEvents();
  const overviewResult = await getSignalsOverview(type === "faq" ? undefined : { targetType: type });
  const overview =
    (overviewResult as {
      items?: any[];
      stats?: {
        total: number;
        needsAttention: number;
        critical: number;
        warning: number;
        info: number;
      };
    } | null) ?? { items: [], stats: { total: 0, needsAttention: 0, critical: 0, warning: 0, info: 0 } };

  async function onResolveRecommendation(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const nextStatus = String(formData.get("status") ?? "resolved") as "in_progress" | "resolved" | "dismissed";
    const note = String(formData.get("note") ?? "").trim();
    if (!id) return;
    try {
      await resolveRecommendation(id, { status: nextStatus, note: note || undefined });
      redirect(`/ops${type ? `?type=${type}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Operation failed";
      redirect(`/ops${type ? `?type=${type}&` : "?"}err=${encodeURIComponent(message)}`);
    }
  }

  async function onCreateRuleTuningProposal(formData: FormData) {
    "use server";
    const ruleId = String(formData.get("ruleId") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!ruleId) return;
    try {
      const proposal = await createRuleTuningProposal({ ruleId, sinceDays: 30, note: note || undefined });
      redirect(`/ops?msg=${encodeURIComponent(`proposal ${proposal.id} created`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create proposal failed";
      redirect(`/ops?err=${encodeURIComponent(message)}`);
    }
  }

  async function onTransitionProposal(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    const appliedConfigText = String(formData.get("appliedConfig") ?? "").trim();
    if (!id || !status) return;
    try {
      let appliedConfig: any = undefined;
      if (status === "applied") {
        if (!appliedConfigText) {
          redirect(`/ops?err=${encodeURIComponent("Mark applied requires appliedConfig JSON")}`);
        }
        try {
          appliedConfig = JSON.parse(appliedConfigText);
        } catch {
          redirect(`/ops?err=${encodeURIComponent("Invalid appliedConfig JSON")}`);
        }
      }
      const proposal = await transitionRuleTuningProposal(id, {
        status: status as any,
        note: note || undefined,
        appliedConfig,
      });
      redirect(`/ops?msg=${encodeURIComponent(`proposal ${proposal.id} -> ${proposal.status}`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update proposal failed";
      redirect(`/ops?err=${encodeURIComponent(message)}`);
    }
  }

  async function onSyncRepoChange(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    try {
      const result = await syncRepoChange(id);
      redirect(`/ops?msg=${encodeURIComponent(result.sync.message)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Repo sync failed";
      redirect(`/ops?err=${encodeURIComponent(message)}`);
    }
  }

  async function onSyncActiveRepoChanges() {
    "use server";
    try {
      const result = await syncActiveRepoChanges({
        limit: 5,
        targetType: type === "faq" ? undefined : type,
      });
      redirect(`/ops${type ? `?type=${type}&` : "?"}msg=${encodeURIComponent(`synced ${result.total} active repo changes`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Repo bulk sync failed";
      redirect(`/ops${type ? `?type=${type}&` : "?"}err=${encodeURIComponent(message)}`);
    }
  }

  async function onOpenRepoChangePullRequest(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    try {
      const result = await openRepoChangePullRequest(id);
      redirect(`/ops?msg=${encodeURIComponent(result.result.message)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Open PR failed";
      redirect(`/ops?err=${encodeURIComponent(message)}`);
    }
  }

  async function onOpenRepoChangeRevertPullRequest(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    try {
      const result = await openRepoChangeRevertPullRequest(id);
      redirect(`/ops?msg=${encodeURIComponent(result.result.message)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Open revert PR failed";
      redirect(`/ops?err=${encodeURIComponent(message)}`);
    }
  }

  async function onUpdateAutoActionPolicy(formData: FormData) {
    "use server";
    const parseList = (value: FormDataEntryValue | null) =>
      String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    try {
      await updateAutoActionPolicy({
        autoMerge: {
          enabled: String(formData.get("autoMergeEnabled") ?? "") === "true",
          allowedTargetTypes: parseList(formData.get("autoMergeTargetTypes")),
          allowedTriggers: parseList(formData.get("autoMergeTriggers")),
          allowedTargetIds: parseList(formData.get("autoMergeTargetIds")),
        },
        autoRevert: {
          enabled: String(formData.get("autoRevertEnabled") ?? "") === "true",
          allowedTargetTypes: parseList(formData.get("autoRevertTargetTypes")),
          allowedTriggers: parseList(formData.get("autoRevertTriggers")),
          allowedTargetIds: parseList(formData.get("autoRevertTargetIds")),
          minRiskCount: Math.max(1, Number(formData.get("autoRevertMinRiskCount") ?? 2) || 2),
        },
      });
      redirect(`/ops?msg=${encodeURIComponent("auto-action policy updated")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update auto-action policy failed";
      redirect(`/ops?err=${encodeURIComponent(message)}`);
    }
  }

  function actorLabel(actor: string) {
    if (!actor) return "anonymous";
    const [role, rest] = actor.split(":token:");
    if (rest) return `${role} · token:${rest}`;
    return actor;
  }

  function actionLabel(action: string) {
    const map: Record<string, string> = {
      generate: "Generate draft",
      prepare_recommendation_draft: "Prepare draft for recommendation",
      create_followup_recommendation: "Create follow-up recommendation",
      edit: "Edit draft",
      submit: "Submit review",
      review: "Review draft",
      publish: "Publish",
      rollback: "Rollback",
      auto_merge_gate_allow: "Auto-merge gate allow",
      auto_merge_gate_hold: "Auto-merge gate hold",
      auto_revert_gate_allow: "Auto-revert gate allow",
      auto_revert_gate_hold: "Auto-revert gate hold",
      preview_token: "Create preview",
      revoke_preview: "Revoke preview",
    };
    return map[action] ?? action;
  }

  function fmtPercent(value: number) {
    return `${(value * 100).toFixed(2)}%`;
  }

  function fmtPts(value: number) {
    const pts = value * 100;
    return `${pts >= 0 ? "+" : ""}${pts.toFixed(2)} pts`;
  }

  function priorityBadge(rec: any) {
    const level = rec.effectivePriorityLevel ?? rec.priorityLevel ?? "p3";
    const map: Record<string, string> = {
      p0: "border-rose-200 bg-rose-50 text-rose-800",
      p1: "border-amber-200 bg-amber-50 text-amber-800",
      p2: "border-zinc-200 bg-zinc-50 text-zinc-700",
      p3: "border-zinc-200 bg-white text-zinc-500",
    };
    return (
      <span className={`rounded border px-2 py-0.5 text-xs ${map[level] ?? map.p3}`}>
        {level.toUpperCase()}
        {typeof (rec.effectivePriorityScore ?? rec.priorityScore) === "number"
          ? ` · ${rec.effectivePriorityScore ?? rec.priorityScore}`
          : ""}
      </span>
    );
  }

  function staleBadge(rec: any) {
    if (!rec?.stale) return null;
    const days = typeof rec.staleDays === "number" ? rec.staleDays : 0;
    return (
      <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-800">
        STALE · {days}d
      </span>
    );
  }

  function effectBadge(rec: any) {
    if (!rec?.effect) return null;
    const status = rec.effect.status;
    const map: Record<string, string> = {
      improved: "border-emerald-200 bg-emerald-50 text-emerald-800",
      neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
      worsened: "border-rose-200 bg-rose-50 text-rose-800",
      unknown: "border-zinc-200 bg-white text-zinc-500",
    };
    return <span className={`rounded border px-2 py-0.5 text-xs ${map[status] ?? map.unknown}`}>EFFECT · {status}</span>;
  }

  function focusLabel(key: string) {
    const map: Record<string, string> = {
      hero_title: "Hero 标题",
      selling_points: "卖点",
      cta_copy: "CTA 文案",
      faq_coverage: "FAQ 覆盖",
      hero_summary: "Hero 摘要",
      sections_structure: "分段结构",
      internal_links: "内部链接",
      question_coverage: "问题覆盖",
      answer_tone: "回答语气",
      ordering: "排序",
      duplication: "去重",
      content_quality: "内容质量",
      pricing_offer: "价格与优惠",
      trust_signals: "信任信号",
    };
    return map[key] ?? key;
  }

  function fmtRate(value: number) {
    return `${(value * 100).toFixed(0)}%`;
  }

  function qualityBadge(quality: string) {
    const map: Record<string, string> = {
      good: "border-emerald-200 bg-emerald-50 text-emerald-800",
      ok: "border-zinc-200 bg-zinc-50 text-zinc-700",
      weak: "border-amber-200 bg-amber-50 text-amber-800",
      risky: "border-rose-200 bg-rose-50 text-rose-800",
      insufficient: "border-zinc-200 bg-white text-zinc-500",
    };
    return <span className={`rounded border px-2 py-0.5 text-xs ${map[quality] ?? map.insufficient}`}>{quality}</span>;
  }

  function monitorAlertTone(level: string) {
    if (level === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
    if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
    return "border-zinc-200 bg-zinc-50 text-zinc-700";
  }

  function dependencyTone(status: string) {
    if (status === "healthy") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (status === "degraded") return "border-rose-200 bg-rose-50 text-rose-800";
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  function actionTone(tone: string) {
    return governanceToneClass(tone);
  }

  function governanceTargetHref(targetType: string, targetId: string) {
    if (targetType === "faq" && targetId.includes(":")) {
      const [faqType, faqId] = targetId.split(":");
      return `/ops/faq/${faqType}/${faqId}`;
    }
    return `/ops/${targetType}/${targetId}`;
  }

  function governanceRepoNextHref(targetType: string, targetId: string, code: string | null | undefined) {
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

  function governanceStateTone(tone: string) {
    return governanceToneClass(tone);
  }

  function repoGovernanceState(change: any) {
    const code = String(change?.recommendedNextStep?.code || "");
    if (code === "ready_for_review") return { label: "需要立即审核", tone: "ready" };
    if (["auto_revert_ready", "investigate_ci"].includes(code) || change?.status === "ci_failed") {
      return { label: "需要立即处理", tone: "critical" };
    }
    if (["blocked_auto_merge_policy", "blocked_revert_policy"].includes(code)) {
      return { label: "暂停发布中", tone: "warning" };
    }
    if (["wait_ci", "wait_ci_start", "ready_auto_merge"].includes(code)) {
      return { label: "等待外部结果", tone: "progress" };
    }
    return { label: "继续排查", tone: "warning" };
  }

  function proposalGovernanceState(proposal: any) {
    if (proposal?.type === "incident_followup") {
      if (proposal?.status === "draft") return { label: "需要立即审核", tone: "ready" };
      if (proposal?.status === "approved") return { label: "需要立即处理", tone: "critical" };
      if (proposal?.status === "applied") return { label: "等待外部结果", tone: "progress" };
      if (proposal?.status === "rejected") return { label: "暂停发布中", tone: "warning" };
    }
    return { label: "继续排查", tone: "warning" };
  }

  function configCheckBadge(check: any) {
    if (!check) return null;
    const status = check.status;
    const map: Record<string, string> = {
      match: "border-emerald-200 bg-emerald-50 text-emerald-800",
      mismatch: "border-rose-200 bg-rose-50 text-rose-800",
      missing: "border-amber-200 bg-amber-50 text-amber-800",
      unknown: "border-zinc-200 bg-white text-zinc-500",
    };
    return (
      <span className={`rounded border px-2 py-0.5 text-xs ${map[status] ?? map.unknown}`}>
        CONFIG · {String(status).toUpperCase()}
      </span>
    );
  }

  function fmtPtsFromRate(value: number) {
    const pts = value * 100;
    return `${pts >= 0 ? "+" : ""}${pts.toFixed(2)} pts`;
  }

  function fmtCountDelta(value: number) {
    return `${value >= 0 ? "+" : ""}${value}`;
  }

  function ruleKindBadge(ruleMeta: any) {
    if (!ruleMeta?.kind) return null;
    return (
      <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700">
        {ruleMeta.kind}
        {ruleMeta.rate ? ` · ${ruleMeta.rate}` : ""}
      </span>
    );
  }

  function reviewSummaryBadge(summary: any) {
    if (!summary?.state) return null;
    const map: Record<string, string> = {
      success: "border-emerald-200 bg-emerald-50 text-emerald-800",
      steady: "border-emerald-200 bg-emerald-50 text-emerald-800",
      observe: "border-amber-200 bg-amber-50 text-amber-800",
      pending: "border-zinc-200 bg-white text-zinc-500",
      closed: "border-zinc-200 bg-zinc-50 text-zinc-700",
      risk: "border-rose-200 bg-rose-50 text-rose-800",
    };
    return <span className={`rounded border px-2 py-0.5 text-xs ${map[summary.state] ?? map.pending}`}>REVIEW · {String(summary.state).toUpperCase()}</span>;
  }

  const publishingEvents = audit.items.filter((event) => event.action === "publish" || event.action === "rollback");
  const recentPublishEvents = publishingEvents.filter((event) => event.action === "publish");
  const recentRollbackEvents = publishingEvents.filter((event) => event.action === "rollback");
  const autoRollbackEvents = recentRollbackEvents.filter((event) => event.trigger === "auto");
  const warningThresholdRollbacks = autoRollbackEvents.filter(
    (event) => event.triggerReason === "verification-warning-threshold",
  );

  function verificationLevel(event: any) {
    return event?.verification?.level ?? (event?.verification?.ok ? "pass" : event?.verification?.skipped ? "skipped" : "unknown");
  }

  function targetHref(target?: { type?: string; id?: string } | null) {
    if (!target?.type || !target?.id) return null;
    if (target.type === "faq" && target.id.includes(":")) {
      const [faqType, faqId] = target.id.split(":");
      return `/ops/faq/${faqType}/${faqId}`;
    }
    return `/ops/${target.type}/${target.id}`;
  }

  function verificationBadge(event: any) {
    const level = verificationLevel(event);
    const map: Record<string, string> = {
      pass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      warning: "border-amber-200 bg-amber-50 text-amber-800",
      blocked: "border-rose-200 bg-rose-50 text-rose-800",
      skipped: "border-zinc-200 bg-zinc-50 text-zinc-700",
      unknown: "border-zinc-200 bg-white text-zinc-500",
    };
    return <span className={`rounded border px-2 py-0.5 text-xs ${map[level] ?? map.unknown}`}>VERIFY · {level.toUpperCase()}</span>;
  }

  function revalidateBadge(event: any) {
    const revalidate = event?.revalidate;
    if (!revalidate) {
      return <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500">REVALIDATE · N/A</span>;
    }
    const tone = revalidate.ok
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : revalidate.skipped
        ? "border-zinc-200 bg-zinc-50 text-zinc-700"
        : "border-rose-200 bg-rose-50 text-rose-800";
    const label = revalidate.ok ? "OK" : revalidate.skipped ? "SKIPPED" : "FAILED";
    return <span className={`rounded border px-2 py-0.5 text-xs ${tone}`}>REVALIDATE · {label}</span>;
  }

  const verificationFailures = recentPublishEvents.filter((event) => verificationLevel(event) === "warning" || verificationLevel(event) === "blocked");
  const blockedVerifications = recentPublishEvents.filter((event) => verificationLevel(event) === "blocked");
  const latestFailedVerification = verificationFailures[0] ?? null;
  const blockedByTargetType = blockedVerifications.reduce(
    (acc, event) => {
      const key = event.target?.type ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const blockedTargetRows = Object.entries(blockedByTargetType).sort((a, b) => b[1] - a[1]);
  const recentAutoRollbackRows = autoRollbackEvents.slice(0, 4);
  const recentBlockedRows = blockedVerifications.slice(0, 4);
  const incidentProposals = recentProposals.items.filter((p: any) => p.type === "incident_followup");
  const activeRepoChanges = repoChanges.items.filter((item) => !["merged", "reverted", "cancelled"].includes(item.status));
  const repoChangesWithCi = repoChanges.items.filter((item) => item.ciStatus && item.ciStatus !== "not_started");
  const repoChangesWithWorkflow = repoChanges.items.filter((item) => item.workflowRunUrl);
  const repoChangesWithFailures = repoChanges.items.filter((item) => (item.failedJobs?.length ?? 0) > 0);
  const mergeCandidates = repoChanges.items.filter((item) => item.status === "merge_candidate");
  const autoMergeCandidates = repoChanges.items.filter((item) => item.status === "auto_merge_candidate");
  const revertCandidates = repoChanges.items.filter((item) => item.status === "revert_candidate");
  const readyAutoMergeCount = repoChanges.items.filter((item) => item.recommendedNextStep?.code === "ready_auto_merge").length;
  const waitCiCount = repoChanges.items.filter((item) =>
    ["wait_ci", "wait_ci_start"].includes(String(item.recommendedNextStep?.code || "")),
  ).length;
  const blockedPolicyCount = repoChanges.items.filter((item) =>
    ["blocked_auto_merge_policy", "blocked_revert_policy"].includes(String(item.recommendedNextStep?.code || "")),
  ).length;
  const readyRevertCount = repoChanges.items.filter((item) => item.recommendedNextStep?.code === "auto_revert_ready").length;
  const matchesRepoNext = (code: string | undefined, bucket: string | undefined) => {
    if (!bucket) return true;
    if (bucket === "ready_auto_merge") return code === "ready_auto_merge";
    if (bucket === "wait_ci") return ["wait_ci", "wait_ci_start"].includes(String(code || ""));
    if (bucket === "blocked_policy") return ["blocked_auto_merge_policy", "blocked_revert_policy"].includes(String(code || ""));
    if (bucket === "ready_revert") return code === "auto_revert_ready";
    return true;
  };
  const nextStepPriority = (item: any) => {
    const code = String(item?.recommendedNextStep?.code || "");
    const map: Record<string, number> = {
      auto_revert_ready: 100,
      blocked_revert_policy: 95,
      blocked_auto_merge_policy: 90,
      ready_auto_merge: 85,
      investigate_ci: 80,
      ready_for_review: 70,
      wait_auto_merge_labeling: 65,
      wait_ci: 60,
      wait_ci_start: 55,
      wait_risk_threshold: 50,
      review_revert_pr: 45,
      revert_pr_open: 45,
      wait_candidate_promotion: 40,
      open_pr: 35,
      monitor: 20,
      done_merged: 10,
      done_reverted: 5,
      done_cancelled: 0,
    };
    return map[code] ?? 1;
  };
  const statusPriority = (statusValue: string | undefined) => {
    const map: Record<string, number> = {
      revert_candidate: 100,
      auto_merge_candidate: 90,
      merge_candidate: 80,
      ci_failed: 70,
      ci_running: 60,
      ci_passed: 55,
      pr_opened: 50,
      draft: 40,
      merged: 30,
      reverted: 20,
      cancelled: 10,
    };
    return map[String(statusValue || "")] ?? 0;
  };
  const priorityReason = (item: any) => {
    const code = String(item?.recommendedNextStep?.code || "");
    if (code === "auto_revert_ready") return "priority: ready to revert";
    if (["blocked_revert_policy", "blocked_auto_merge_policy"].includes(code)) return "priority: blocked by policy";
    if (code === "ready_auto_merge") return "priority: ready to auto-merge";
    if (code === "investigate_ci" || item?.status === "ci_failed") return "priority: investigate ci failure";
    if (Number(item?.postMergeRiskCount || 0) > 0) return `priority: risk ${Number(item.postMergeRiskCount)}`;
    if (["wait_ci", "wait_ci_start"].includes(code)) return "priority: waiting for ci";
    if (code === "ready_for_review") return "priority: ready for review";
    return "priority: recent activity";
  };
  const compareRepoItems = (a: any, b: any) => {
    const nextDelta = nextStepPriority(b) - nextStepPriority(a);
    if (nextDelta !== 0) return nextDelta;
    const statusDelta = statusPriority(b.status) - statusPriority(a.status);
    if (statusDelta !== 0) return statusDelta;
    const riskDelta = Number(b.postMergeRiskCount || 0) - Number(a.postMergeRiskCount || 0);
    if (riskDelta !== 0) return riskDelta;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  };
  const sortedRepoItems = [...repoChanges.items].sort(compareRepoItems);
  const filteredRepoItems = sortedRepoItems.filter((item) => matchesRepoNext(item.recommendedNextStep?.code, repoNext));
  const sampleForBucket = (bucket: string) => sortedRepoItems.find((item) => matchesRepoNext(item.recommendedNextStep?.code, bucket)) ?? null;
  const readyAutoMergeSample = sampleForBucket("ready_auto_merge");
  const waitCiSample = sampleForBucket("wait_ci");
  const blockedPolicySample = sampleForBucket("blocked_policy");
  const readyRevertSample = sampleForBucket("ready_revert");
  const repoNextBaseParams = new URLSearchParams();
  if (type) repoNextBaseParams.set("type", type);
  if (q) repoNextBaseParams.set("q", q);
  if (status) repoNextBaseParams.set("status", status);
  const repoNextLink = (bucket?: string) => {
    const params = new URLSearchParams(repoNextBaseParams);
    if (bucket) params.set("repoNext", bucket);
    const query = params.toString();
    return `/ops${query ? `?${query}` : ""}#repo-publish-queue`;
  };
  const repoNextLabel =
    repoNext === "ready_auto_merge"
      ? "Ready to auto-merge"
      : repoNext === "wait_ci"
        ? "Waiting for CI"
        : repoNext === "blocked_policy"
          ? "Blocked by policy"
          : repoNext === "ready_revert"
            ? "Ready to revert"
            : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Ops Console</h1>
          <p className="mt-2 text-sm text-zinc-600">
            B2.5：把 recommendation 提升为工作台主入口，并显示版本表现变化。
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            All
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/queue">
            Queue
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/customer-notifications">
            Notifications
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/support-cases">
            Support cases
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/alerts">
            Alerts
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops?type=product">
            Product
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops?type=collection">
            Collection
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops?type=faq">
            FAQ
          </Link>
        </div>
      </div>

      {err ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-900">Permission / operation error</p>
          <p className="mt-1 text-sm text-rose-800">{err}</p>
        </div>
      ) : null}
      {msg ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">OK</p>
          <p className="mt-1 text-sm text-emerald-800">{msg}</p>
        </div>
      ) : null}

      {signalsStatus.health !== "healthy" ? (
        <div
          className={`mt-6 rounded-2xl border p-4 ${
            signalsStatus.health === "critical"
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <p
            className={`text-sm font-medium ${
              signalsStatus.health === "critical" ? "text-rose-900" : "text-amber-900"
            }`}
          >
            {signalsStatus.health === "critical" ? "Runtime alert: critical" : "Runtime warning: degraded"}
          </p>
          <p
            className={`mt-1 text-sm ${
              signalsStatus.health === "critical" ? "text-rose-800" : "text-amber-800"
            }`}
          >
            当前自动 snapshot 运行存在异常，连续失败 {signalsStatus.consecutiveBatchFailures} 次。
            {signalsStatus.lastBatchRun?.error ? ` 最近错误：${signalsStatus.lastBatchRun.error}` : ""}
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Tracked targets</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{overview.stats?.total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs text-amber-700">Needs attention</p>
          <p className="mt-2 text-2xl font-semibold text-amber-900">{overview.stats?.needsAttention ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="text-xs text-rose-700">Critical</p>
          <p className="mt-2 text-2xl font-semibold text-rose-900">{overview.stats?.critical ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Open / In progress</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{recommendations.total}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Monitoring summary</p>
            <p className="mt-1 text-xs text-zinc-500">试运行前最小监控面：runtime、workflow、publish、purchase reconciliation。</p>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <p>Generated at {monitoringSummary.generatedAt}</p>
            <p>
              control-plane {monitoringSummary.runtime.controlPlane} · signals {monitoringSummary.runtime.signalsHealth} · cms{" "}
              {monitoringSummary.runtime.cmsAdapter}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Action queue</p>
              <p className="mt-1 text-xs text-zinc-500">首页先看最紧急的治理项，再决定是否进入监控页细看。</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
              <span>需要立即审核 {monitoringSummary.publishing.queue.counts.review_now ?? 0}</span>
              <span>需要立即处理 {monitoringSummary.publishing.queue.counts.fix_now ?? 0}</span>
              <span>暂停发布中 {monitoringSummary.publishing.queue.counts.hold_publish ?? 0}</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {monitoringSummary.publishing.queue.top.slice(0, 3).length ? (
              monitoringSummary.publishing.queue.top.slice(0, 3).map((item) => (
                <div
                  key={`${String(item.targetType)}:${String(item.targetId)}:${String(item.actionCode)}`}
                  className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700"
                >
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
                    <Link className="underline" href={governanceTargetHref(String(item.targetType), String(item.targetId))}>
                      Open target
                    </Link>
                    {typeof item.incidentProposalId === "string" && item.incidentProposalId ? (
                      <Link className="underline" href={`/ops/proposals/${item.incidentProposalId}`}>
                        Open proposal
                      </Link>
                    ) : null}
                    {typeof item.repoChangeId === "string" && item.repoChangeId ? (
                      <Link
                        className="underline"
                        href={governanceRepoNextHref(
                          String(item.targetType),
                          String(item.targetId),
                          typeof item.repoChangeNextStepCode === "string" ? item.repoChangeNextStepCode : null,
                        )}
                      >
                        Open repo change lane
                      </Link>
                    ) : null}
                    <Link className="underline" href={`/ops/audit?action=${encodeURIComponent(String(item.action))}&q=${encodeURIComponent(String(item.targetId))}`}>
                      Audit context
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-600">No urgent governance queue item.</div>
            )}
            <Link className="inline-flex text-xs text-zinc-900 underline" href="/ops/monitoring">
              Open full monitoring queue
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Runtime</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">{monitoringSummary.runtime.signalsHealth}</p>
            <p className="mt-1 text-xs text-zinc-500">
              batch failures {monitoringSummary.runtime.consecutiveBatchFailures}
              {monitoringSummary.runtime.lastBatchRunAt ? ` · last ${monitoringSummary.runtime.lastBatchRunAt}` : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Workflow stalled</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">{monitoringSummary.workflow.staleCount}</p>
            <p className="mt-1 text-xs text-zinc-500">
              open {monitoringSummary.workflow.openCount} · in progress {monitoringSummary.workflow.inProgressCount}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Publish anomalies · 24h</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">
              {monitoringSummary.publishing.warningPublishes24h + monitoringSummary.publishing.blockedPublishes24h + monitoringSummary.publishing.rollbacks24h}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              warning {monitoringSummary.publishing.warningPublishes24h} · blocked {monitoringSummary.publishing.blockedPublishes24h} · rollback{" "}
              {monitoringSummary.publishing.rollbacks24h}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Purchase gaps</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">{monitoringSummary.purchase.misalignedTargetsCount}</p>
            <p className="mt-1 text-xs text-zinc-500">
              follow-up blocked {monitoringSummary.publishing.blockedFollowupsOpen} · warning {monitoringSummary.publishing.warningFollowupsOpen}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${dependencyTone(monitoringSummary.runtime.dependencies.medusa.status)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Medusa probe</p>
              <span className="rounded border border-current/20 px-2 py-0.5 text-xs">{monitoringSummary.runtime.dependencies.medusa.status}</span>
            </div>
            <p className="mt-2 text-xs">{monitoringSummary.runtime.dependencies.medusa.detail}</p>
            {monitoringSummary.runtime.dependencies.medusa.baseUrl ? (
              <p className="mt-1 text-xs opacity-80">
                {monitoringSummary.runtime.dependencies.medusa.baseUrl}
                {monitoringSummary.runtime.dependencies.medusa.statusCode
                  ? ` · ${monitoringSummary.runtime.dependencies.medusa.statusCode}`
                  : ""}
              </p>
            ) : null}
          </div>
          <div className={`rounded-2xl border p-4 ${dependencyTone(monitoringSummary.runtime.dependencies.sanity.status)}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Sanity probe</p>
              <span className="rounded border border-current/20 px-2 py-0.5 text-xs">{monitoringSummary.runtime.dependencies.sanity.status}</span>
            </div>
            <p className="mt-2 text-xs">{monitoringSummary.runtime.dependencies.sanity.detail}</p>
            {monitoringSummary.runtime.dependencies.sanity.projectId ? (
              <p className="mt-1 text-xs opacity-80">
                {monitoringSummary.runtime.dependencies.sanity.projectId} / {monitoringSummary.runtime.dependencies.sanity.dataset}
                {monitoringSummary.runtime.dependencies.sanity.statusCode
                  ? ` · ${monitoringSummary.runtime.dependencies.sanity.statusCode}`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Alerts</p>
            {monitoringSummary.alerts.length ? (
              monitoringSummary.alerts.map((alert, index) => (
                <div key={`${alert.title}-${index}`} className={`rounded-xl border p-3 ${monitorAlertTone(alert.level)}`}>
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="mt-1 text-xs">{alert.detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                No active monitoring alerts in the current view.
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Stale workflow samples</p>
              {monitoringSummary.workflow.staleExamples.length ? (
                monitoringSummary.workflow.staleExamples.map((item) => (
                  <div key={item.id} className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">
                      {item.ruleId} · {item.staleDays}d
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.targetType}:{item.targetId} · {item.priorityLevel.toUpperCase()}
                    </p>
                    {item.targetPath ? (
                      <Link className="mt-2 inline-flex text-xs text-zinc-900 underline" href={item.targetPath}>
                        Open target
                      </Link>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No stale in-progress recommendation.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top purchase gaps</p>
              {monitoringSummary.purchase.topGaps.length ? (
                monitoringSummary.purchase.topGaps.map((item) => (
                  <div key={`${item.targetType}:${item.targetId}`} className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700">
                    <p className="font-medium text-zinc-900">
                      {item.title} · {item.gap > 0 ? "+" : ""}
                      {item.gap}
                    </p>
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
                <p className="rounded-xl border border-zinc-200 p-3 text-sm text-zinc-600">No purchase reconciliation gap in the current view.</p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
          Thresholds · stale warning {monitoringSummary.workflow.thresholds.warning}, critical {monitoringSummary.workflow.thresholds.critical}
          {" · "}publish warning warning {monitoringSummary.publishing.thresholds.warningPublishes24h.warning}, critical{" "}
          {monitoringSummary.publishing.thresholds.warningPublishes24h.critical}
          {" · "}blocked publish {monitoringSummary.publishing.thresholds.blockedPublishes24h.critical}
          {" · "}rollback {monitoringSummary.publishing.thresholds.rollbacks24h.critical}
          {" · "}purchase gap abs warning {monitoringSummary.purchase.thresholdAbsGap.warning}, critical{" "}
          {monitoringSummary.purchase.thresholdAbsGap.critical}
        </div>
      </div>

      <div id="auto-action-policy" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Current auth</p>
            <p className="mt-1 text-xs text-zinc-500">
              当前 `/ops` 正在使用的后端角色能力。这个角色决定哪些动作会被允许。
            </p>
          </div>
          <span className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900">
            {authStatus.role}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {authStatus.capabilities.map((capability) => (
            <span key={capability} className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700">
              {capability}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Signals runtime</p>
            <p className="mt-1 text-xs text-zinc-500">
              events {signalsStatus.counts.events} · snapshots {signalsStatus.counts.snapshots} · recommendations{" "}
              {signalsStatus.counts.recommendations}
            </p>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <p>
              Health:{" "}
              <span
                className={
                  signalsStatus.health === "critical"
                    ? "text-rose-700"
                    : signalsStatus.health === "degraded"
                      ? "text-amber-700"
                      : "text-emerald-700"
                }
              >
                {signalsStatus.health}
              </span>
            </p>
            <p className="mt-1">consecutive failures: {signalsStatus.consecutiveBatchFailures}</p>
          </div>
        </div>
        {signalsStatus.lastBatchRun ? (
          <p className="mt-3 text-xs text-zinc-500">
            last batch {signalsStatus.lastBatchRun.status} · {signalsStatus.lastBatchRun.at} · window{" "}
            {signalsStatus.lastBatchRun.windowDays}d · processed {signalsStatus.lastBatchRun.total} targets
            {signalsStatus.lastBatchRun.error ? ` · error: ${signalsStatus.lastBatchRun.error}` : ""}
          </p>
        ) : null}
        {signalsStatus.recentBatchRuns.length ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
            <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Recent runs</div>
            <div className="divide-y divide-zinc-200">
              {signalsStatus.recentBatchRuns.slice(0, 5).map((run) => (
                <div key={`${run.at}:${run.status}`} className="px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-zinc-900">
                      <span className={run.status === "error" ? "text-rose-700" : "text-emerald-700"}>{run.status}</span>
                      <span className="ml-2 text-xs text-zinc-500">{run.at}</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      window {run.windowDays}d · targets {run.total}
                    </p>
                  </div>
                  {run.error ? <p className="mt-1 text-xs text-rose-700">{run.error}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Auto-action policy</p>
            <p className="mt-1 text-xs text-zinc-500">控制 auto-merge / auto-revert 的启用开关、target 范围和 trigger 白名单。</p>
          </div>
        </div>
        <form action={onUpdateAutoActionPolicy} className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-900">Auto merge</p>
              <select
                name="autoMergeEnabled"
                defaultValue={String(autoActionPolicy.policy.autoMerge.enabled)}
                className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700"
              >
                <option value="true">enabled</option>
                <option value="false">disabled</option>
              </select>
            </div>
            <label className="mt-4 block text-xs text-zinc-500">
              target types
              <input
                name="autoMergeTargetTypes"
                defaultValue={autoActionPolicy.policy.autoMerge.allowedTargetTypes.join(", ")}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              triggers
              <input
                name="autoMergeTriggers"
                defaultValue={autoActionPolicy.policy.autoMerge.allowedTriggers.join(", ")}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              target ids
              <input
                name="autoMergeTargetIds"
                defaultValue={autoActionPolicy.policy.autoMerge.allowedTargetIds.join(", ")}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                placeholder="empty = all allowed ids"
              />
            </label>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-900">Auto revert</p>
              <select
                name="autoRevertEnabled"
                defaultValue={String(autoActionPolicy.policy.autoRevert.enabled)}
                className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700"
              >
                <option value="true">enabled</option>
                <option value="false">disabled</option>
              </select>
            </div>
            <label className="mt-4 block text-xs text-zinc-500">
              target types
              <input
                name="autoRevertTargetTypes"
                defaultValue={autoActionPolicy.policy.autoRevert.allowedTargetTypes.join(", ")}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              triggers
              <input
                name="autoRevertTriggers"
                defaultValue={autoActionPolicy.policy.autoRevert.allowedTriggers.join(", ")}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              target ids
              <input
                name="autoRevertTargetIds"
                defaultValue={autoActionPolicy.policy.autoRevert.allowedTargetIds.join(", ")}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                placeholder="empty = all allowed ids"
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              min risk count
              <input
                type="number"
                min={1}
                name="autoRevertMinRiskCount"
                defaultValue={autoActionPolicy.policy.autoRevert.minRiskCount}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
          </div>
          <div className="lg:col-span-2 flex justify-end">
            <button className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">Save policy</button>
          </div>
        </form>
      </div>

      <div id="repo-publish-queue" className="mt-4 rounded-2xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Repo publish queue</p>
            <p className="mt-1 text-xs text-zinc-500">从 incident proposal 升级出来的代码变更候选。</p>
          </div>
          <form action={onSyncActiveRepoChanges}>
            <button className="rounded border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700">Sync active</button>
          </form>
        </div>
        <div className="grid gap-4 border-b border-zinc-200 px-4 py-4 sm:grid-cols-6">
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Open repo changes</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{activeRepoChanges.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Merge candidates</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{mergeCandidates.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Auto-merge candidates</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{autoMergeCandidates.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Revert candidates</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{revertCandidates.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Workflow attached</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{repoChangesWithWorkflow.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Workflow failures</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{repoChangesWithFailures.length}</p>
            <p className="mt-1 text-xs text-zinc-500">{repoChangesWithCi.length} items with CI/check status</p>
          </div>
        </div>
        <div className="grid gap-4 border-b border-zinc-200 px-4 py-4 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700">Ready to auto-merge</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-900">{readyAutoMergeCount}</p>
            <p className="mt-1 text-xs text-emerald-700">已经满足当前自动 merge 门槛</p>
            {readyAutoMergeSample ? (
              <div className="mt-2 text-[11px] text-emerald-800">
                <p>
                  sample:{" "}
                  {targetHref({ type: readyAutoMergeSample.targetType ?? undefined, id: readyAutoMergeSample.targetId ?? undefined }) ? (
                    <Link
                      className="underline underline-offset-4"
                      href={targetHref({ type: readyAutoMergeSample.targetType ?? undefined, id: readyAutoMergeSample.targetId ?? undefined })!}
                    >
                      {readyAutoMergeSample.title ?? readyAutoMergeSample.id}
                    </Link>
                  ) : (
                    readyAutoMergeSample.title ?? readyAutoMergeSample.id
                  )}
                </p>
                <p className="mt-1">{priorityReason(readyAutoMergeSample)}</p>
                <div className="mt-2">
                  <NextStepActions
                    change={readyAutoMergeSample}
                    onSyncRepoChange={onSyncRepoChange}
                    onOpenRepoChangePullRequest={onOpenRepoChangePullRequest}
                    onOpenRepoChangeRevertPullRequest={onOpenRepoChangeRevertPullRequest}
                  />
                </div>
              </div>
            ) : null}
            <Link className="mt-3 inline-flex text-[11px] font-medium text-emerald-800 underline underline-offset-4" href={repoNextLink("ready_auto_merge")}>
              Open bucket
            </Link>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs text-sky-700">Waiting for CI</p>
            <p className="mt-2 text-2xl font-semibold text-sky-900">{waitCiCount}</p>
            <p className="mt-1 text-xs text-sky-700">等待 CI 启动或完成</p>
            {waitCiSample ? (
              <div className="mt-2 text-[11px] text-sky-800">
                <p>
                  sample:{" "}
                  {targetHref({ type: waitCiSample.targetType ?? undefined, id: waitCiSample.targetId ?? undefined }) ? (
                    <Link
                      className="underline underline-offset-4"
                      href={targetHref({ type: waitCiSample.targetType ?? undefined, id: waitCiSample.targetId ?? undefined })!}
                    >
                      {waitCiSample.title ?? waitCiSample.id}
                    </Link>
                  ) : (
                    waitCiSample.title ?? waitCiSample.id
                  )}
                </p>
                <p className="mt-1">{priorityReason(waitCiSample)}</p>
                <div className="mt-2">
                  <NextStepActions
                    change={waitCiSample}
                    onSyncRepoChange={onSyncRepoChange}
                    onOpenRepoChangePullRequest={onOpenRepoChangePullRequest}
                    onOpenRepoChangeRevertPullRequest={onOpenRepoChangeRevertPullRequest}
                  />
                </div>
              </div>
            ) : null}
            <Link className="mt-3 inline-flex text-[11px] font-medium text-sky-800 underline underline-offset-4" href={repoNextLink("wait_ci")}>
              Open bucket
            </Link>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700">Blocked by policy</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">{blockedPolicyCount}</p>
            <p className="mt-1 text-xs text-amber-700">命中 whitelist / trigger 治理限制</p>
            {blockedPolicySample ? (
              <div className="mt-2 text-[11px] text-amber-800">
                <p>
                  sample:{" "}
                  {targetHref({ type: blockedPolicySample.targetType ?? undefined, id: blockedPolicySample.targetId ?? undefined }) ? (
                    <Link
                      className="underline underline-offset-4"
                      href={targetHref({ type: blockedPolicySample.targetType ?? undefined, id: blockedPolicySample.targetId ?? undefined })!}
                    >
                      {blockedPolicySample.title ?? blockedPolicySample.id}
                    </Link>
                  ) : (
                    blockedPolicySample.title ?? blockedPolicySample.id
                  )}
                </p>
                <p className="mt-1">{priorityReason(blockedPolicySample)}</p>
                <div className="mt-2">
                  <NextStepActions
                    change={blockedPolicySample}
                    onSyncRepoChange={onSyncRepoChange}
                    onOpenRepoChangePullRequest={onOpenRepoChangePullRequest}
                    onOpenRepoChangeRevertPullRequest={onOpenRepoChangeRevertPullRequest}
                  />
                </div>
              </div>
            ) : null}
            <Link className="mt-3 inline-flex text-[11px] font-medium text-amber-800 underline underline-offset-4" href={repoNextLink("blocked_policy")}>
              Open bucket
            </Link>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs text-rose-700">Ready to revert</p>
            <p className="mt-2 text-2xl font-semibold text-rose-900">{readyRevertCount}</p>
            <p className="mt-1 text-xs text-rose-700">风险阈值已满足，可继续止损</p>
            {readyRevertSample ? (
              <div className="mt-2 text-[11px] text-rose-800">
                <p>
                  sample:{" "}
                  {targetHref({ type: readyRevertSample.targetType ?? undefined, id: readyRevertSample.targetId ?? undefined }) ? (
                    <Link
                      className="underline underline-offset-4"
                      href={targetHref({ type: readyRevertSample.targetType ?? undefined, id: readyRevertSample.targetId ?? undefined })!}
                    >
                      {readyRevertSample.title ?? readyRevertSample.id}
                    </Link>
                  ) : (
                    readyRevertSample.title ?? readyRevertSample.id
                  )}
                </p>
                <p className="mt-1">{priorityReason(readyRevertSample)}</p>
                <div className="mt-2">
                  <NextStepActions
                    change={readyRevertSample}
                    onSyncRepoChange={onSyncRepoChange}
                    onOpenRepoChangePullRequest={onOpenRepoChangePullRequest}
                    onOpenRepoChangeRevertPullRequest={onOpenRepoChangeRevertPullRequest}
                  />
                </div>
              </div>
            ) : null}
            <Link className="mt-3 inline-flex text-[11px] font-medium text-rose-800 underline underline-offset-4" href={repoNextLink("ready_revert")}>
              Open bucket
            </Link>
          </div>
        </div>
        {repoNextLabel ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
            <div>
              <p className="text-xs text-zinc-600">
                Filtered view: <span className="font-medium text-zinc-900">{repoNextLabel}</span> · {filteredRepoItems.length} items
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">sorted by next step → status → risk → updated time</p>
            </div>
            <Link className="rounded border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700" href={repoNextLink()}>
              Clear filter
            </Link>
          </div>
        ) : null}
        <div className="divide-y divide-zinc-200">
          {filteredRepoItems.length ? (
            filteredRepoItems.map((change) => (
              <div key={change.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{change.title ?? change.id}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <code className="rounded bg-zinc-100 px-1">{change.id}</code> · {change.status}
                      {change.targetType && change.targetId ? ` · ${change.targetType}:${change.targetId}` : ""}
                    </p>
                    {change.summary ? <p className="mt-2 text-sm text-zinc-700">{change.summary}</p> : null}
                    {change.recommendedNextStep ? (
                      <>
                        <p
                          className={`mt-2 inline-flex rounded px-2 py-1 text-xs ${
                            change.recommendedNextStep.tone === "ready"
                              ? "bg-emerald-50 text-emerald-700"
                              : change.recommendedNextStep.tone === "warning"
                                ? "bg-rose-50 text-rose-700"
                                : change.recommendedNextStep.tone === "hold"
                                  ? "bg-amber-50 text-amber-700"
                                  : change.recommendedNextStep.tone === "progress"
                                    ? "bg-sky-50 text-sky-700"
                                    : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          next: {change.recommendedNextStep.label}
                        </p>
                        <p className="mt-2">
                          <GovernanceBadge label={`state: ${repoGovernanceState(change).label}`} tone={repoGovernanceState(change).tone} className="py-1" />
                        </p>
                        <div>
                          <NextStepActions
                            change={change}
                            onSyncRepoChange={onSyncRepoChange}
                            onOpenRepoChangePullRequest={onOpenRepoChangePullRequest}
                            onOpenRepoChangeRevertPullRequest={onOpenRepoChangeRevertPullRequest}
                          />
                        </div>
                        <p className="mt-2 text-[11px] text-zinc-500">{priorityReason(change)}</p>
                      </>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-500">
                      branch: <code className="rounded bg-zinc-100 px-1">{change.branchName ?? "n/a"}</code>
                      {change.proposalId ? ` · proposal ${change.proposalId}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      ci: {change.ciStatus ?? "not_started"} · updated {change.updatedAt}
                    </p>
                    {change.workflowRunUrl ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        workflow: {change.workflowName ?? "run"} · {change.workflowStatus ?? "unknown"}
                        {change.workflowConclusion ? `/${change.workflowConclusion}` : ""}
                        {change.workflowUpdatedAt ? ` · ${change.workflowUpdatedAt}` : ""}
                      </p>
                    ) : null}
                    {change.lastSyncedAt ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        sync: {change.syncState ?? "ok"} · {change.lastSyncedAt}
                        {change.syncMessage ? ` · ${change.syncMessage}` : ""}
                      </p>
                    ) : null}
                    {change.commitSha ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        sha: <code className="rounded bg-zinc-100 px-1">{change.commitSha.slice(0, 12)}</code>
                        {change.prNumber ? ` · pr #${change.prNumber}` : ""}
                        {change.repoName ? ` · ${change.repoOwner}/${change.repoName}` : ""}
                      </p>
                    ) : null}
                    {typeof change.prIsDraft === "boolean" ? (
                      <p className="mt-1 text-xs text-zinc-500">pr mode: {change.prIsDraft ? "draft" : "ready"}</p>
                    ) : null}
                    {change.mergedAt ? (
                      <p className="mt-1 text-xs text-emerald-700">merged at: {change.mergedAt}</p>
                    ) : null}
                    {change.readyForReviewAt ? (
                      <p className="mt-1 text-xs text-sky-700">ready for review: {change.readyForReviewAt}</p>
                    ) : null}
                    {change.autoMergeCandidateAt ? (
                      <p className="mt-1 text-xs text-violet-700">auto-merge candidate: {change.autoMergeCandidateAt}</p>
                    ) : null}
                    {change.autoMergedAt ? (
                      <p className="mt-1 text-xs text-emerald-700">
                        auto merged: {change.autoMergedAt}
                        {change.mergeMethod ? ` · ${change.mergeMethod}` : ""}
                        {change.mergeCommitSha ? ` · ${change.mergeCommitSha.slice(0, 12)}` : ""}
                      </p>
                    ) : null}
                    {change.postMergeRiskAt ? (
                      <p className="mt-1 text-xs text-rose-700">
                        post-merge risk: {change.postMergeRiskAt}
                        {change.postMergeRiskCount ? ` · count ${change.postMergeRiskCount}` : ""}
                        {change.postMergeRiskSummary ? ` · ${change.postMergeRiskSummary}` : ""}
                      </p>
                    ) : null}
                    {change.revertedAt ? (
                      <p className="mt-1 text-xs text-amber-700">reverted at: {change.revertedAt}</p>
                    ) : null}
                    {change.revertPrUrl ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        revert: pr #{change.revertPrNumber ?? "n/a"} · {change.revertPrState ?? "open"}
                        {change.revertPrMergedAt ? ` · merged ${change.revertPrMergedAt}` : ""}
                        {change.revertCommitSha ? ` · ${change.revertCommitSha.slice(0, 12)}` : ""}
                      </p>
                    ) : null}
                    {change.checks?.length ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        checks: {change.checks.slice(0, 3).map((check) => `${check.name}:${check.conclusion ?? check.status}`).join(" · ")}
                      </p>
                    ) : null}
                    {change.failedJobs?.length ? (
                      <p className="mt-1 text-xs text-rose-700">
                        failed jobs: {change.failedJobs.slice(0, 3).map((job) => `${job.name}:${job.conclusion ?? job.status}`).join(" · ")}
                      </p>
                    ) : null}
                    {change.autoActionGate?.autoMerge?.snapshot ? (
                      <GateSnapshotCard
                        title="auto-merge gate"
                        allowed={change.autoActionGate.autoMerge.allowed}
                        tone={change.autoActionGate.autoMerge.allowed ? "emerald" : "amber"}
                        sections={[
                          change.autoActionGate.autoMerge.snapshot.policy,
                          change.autoActionGate.autoMerge.snapshot.ci,
                          change.autoActionGate.autoMerge.snapshot.labels,
                        ]}
                      />
                    ) : change.autoActionGate?.autoMerge ? (
                      <p className={`mt-1 text-xs ${change.autoActionGate.autoMerge.allowed ? "text-emerald-700" : "text-amber-700"}`}>
                        auto-merge gate: {change.autoActionGate.autoMerge.allowed ? "allow" : "hold"} ·{" "}
                        {change.autoActionGate.autoMerge.reasons.join(" · ")}
                      </p>
                    ) : null}
                    {change.autoActionGate?.autoRevert?.snapshot ? (
                      <GateSnapshotCard
                        title="auto-revert gate"
                        allowed={change.autoActionGate.autoRevert.allowed}
                        tone={change.autoActionGate.autoRevert.allowed ? "rose" : "zinc"}
                        sections={[
                          change.autoActionGate.autoRevert.snapshot.policy,
                          change.autoActionGate.autoRevert.snapshot.risk,
                          change.autoActionGate.autoRevert.snapshot.execution,
                        ]}
                      />
                    ) : change.autoActionGate?.autoRevert ? (
                      <p className={`mt-1 text-xs ${change.autoActionGate.autoRevert.allowed ? "text-rose-700" : "text-zinc-500"}`}>
                        auto-revert gate: {change.autoActionGate.autoRevert.allowed ? "allow" : "hold"} ·{" "}
                        {change.autoActionGate.autoRevert.reasons.join(" · ")}
                      </p>
                    ) : null}
                    {change.prLabels?.length ? (
                      <p className="mt-1 text-xs text-zinc-500">labels: {change.prLabels.join(" · ")}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-start gap-2 text-xs">
                    <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-700">
                      {change.trigger ?? "incident"}
                    </span>
                    {change.status === "merge_candidate" ? (
                      <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">merge candidate</span>
                    ) : null}
                    {change.status === "auto_merge_candidate" ? (
                      <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-violet-700">auto-merge candidate</span>
                    ) : null}
                    {change.status === "revert_candidate" ? (
                      <span className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">revert candidate</span>
                    ) : null}
                    {change.prUrl ? (
                      <a className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700" href={change.prUrl}>
                        Open PR
                      </a>
                    ) : null}
                    {!change.prUrl ? (
                      <form action={onOpenRepoChangePullRequest}>
                        <input type="hidden" name="id" value={change.id} />
                        <button className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700">
                          Create PR
                        </button>
                      </form>
                    ) : null}
                    {["merged", "revert_candidate"].includes(change.status) && !change.revertPrUrl ? (
                      <form action={onOpenRepoChangeRevertPullRequest}>
                        <input type="hidden" name="id" value={change.id} />
                        <button className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700">
                          Create revert PR
                        </button>
                      </form>
                    ) : null}
                    {change.revertPrUrl ? (
                      <a className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700" href={change.revertPrUrl}>
                        Open revert PR
                      </a>
                    ) : null}
                    {change.workflowRunUrl ? (
                      <a className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700" href={change.workflowRunUrl}>
                        Open run
                      </a>
                    ) : null}
                    <form action={onSyncRepoChange}>
                      <input type="hidden" name="id" value={change.id} />
                      <button className="rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-700">
                        Sync GitHub
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-4">
              <p className="text-sm text-zinc-600">No repo publish candidates yet. Approve an incident proposal to seed the queue.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">Publishing health</p>
            <p className="mt-1 text-xs text-zinc-500">最近自动 publish / rollback / verification 的执行结果摘要。</p>
          </div>
          <Link className="text-sm underline underline-offset-4" href="/ops/audit">
            View full audit log
          </Link>
        </div>
        <div className="grid gap-4 border-b border-zinc-200 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Recent publishes</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{recentPublishEvents.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Verification failures</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{verificationFailures.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Blocked publishes</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{blockedVerifications.length}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Recent rollbacks</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{recentRollbackEvents.length}</p>
          </div>
        </div>
        <div className="grid gap-4 border-b border-zinc-200 px-4 py-4 xl:grid-cols-3">
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Auto rollbacks</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{autoRollbackEvents.length}</p>
            <p className="mt-1 text-xs text-zinc-500">系统自动止损触发次数</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Warning threshold hits</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{warningThresholdRollbacks.length}</p>
            <p className="mt-1 text-xs text-zinc-500">连续 warning 升级为自动回滚</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Top blocked target type</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{blockedTargetRows[0]?.[0] ?? "none"}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {blockedTargetRows[0] ? `${blockedTargetRows[0][1]} blocked publishes` : "No blocked publishes yet"}
            </p>
          </div>
        </div>
        {latestFailedVerification ? (
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Latest verification issue</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {verificationBadge(latestFailedVerification)}
              {revalidateBadge(latestFailedVerification)}
              <span className="text-xs text-zinc-500">{latestFailedVerification.at}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-700">
              {latestFailedVerification.target ? (
                latestFailedVerification.target.type === "faq" && latestFailedVerification.target.id.includes(":") ? (
                  <Link
                    className="underline underline-offset-4"
                    href={`/ops/faq/${latestFailedVerification.target.id.split(":")[0]}/${latestFailedVerification.target.id.split(":")[1]}`}
                  >
                    {latestFailedVerification.target.type}:{latestFailedVerification.target.id}
                  </Link>
                ) : (
                  <Link
                    className="underline underline-offset-4"
                    href={`/ops/${latestFailedVerification.target.type}/${latestFailedVerification.target.id}`}
                  >
                    {latestFailedVerification.target.type}:{latestFailedVerification.target.id}
                  </Link>
                )
              ) : (
                "unknown target"
              )}
            </p>
            {latestFailedVerification.verification?.results?.length ? (
              <p className="mt-1 text-xs text-zinc-500">
                {latestFailedVerification.verification.results
                  .filter((item: any) => !item.ok)
                  .slice(0, 2)
                  .map((item: any) => `${item.path} (${item.statusCode})`)
                  .join(" · ")}
              </p>
            ) : null}
            {latestFailedVerification.verification?.summary ? (
              <p className="mt-1 text-xs text-zinc-500">{latestFailedVerification.verification.summary}</p>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-0 border-b border-zinc-200 xl:grid-cols-3">
          <div className="border-b border-zinc-200 px-4 py-4 xl:border-b-0 xl:border-r">
            <p className="text-sm font-medium text-zinc-900">Recent auto rollbacks</p>
            <div className="mt-3 space-y-3">
              {recentAutoRollbackRows.length ? (
                recentAutoRollbackRows.map((event) => {
                  const href = targetHref(event.target);
                  return (
                    <div key={`auto-rb-${event.id}`} className="rounded-xl bg-zinc-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-800">
                          AUTO
                        </span>
                        <span className="text-xs text-zinc-500">{event.at}</span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">
                        {href ? (
                          <Link className="underline underline-offset-4" href={href}>
                            {event.target?.type}:{event.target?.id}
                          </Link>
                        ) : (
                          `${event.target?.type}:${event.target?.id}`
                        )}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{event.triggerReason ?? "verification-blocked"}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-600">No auto rollbacks yet.</p>
              )}
            </div>
          </div>
          <div className="border-b border-zinc-200 px-4 py-4 xl:border-b-0 xl:border-r">
            <p className="text-sm font-medium text-zinc-900">Blocked publishes</p>
            <div className="mt-3 space-y-3">
              {recentBlockedRows.length ? (
                recentBlockedRows.map((event) => {
                  const href = targetHref(event.target);
                  return (
                    <div key={`blocked-${event.id}`} className="rounded-xl bg-zinc-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {verificationBadge(event)}
                        <span className="text-xs text-zinc-500">{event.at}</span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">
                        {href ? (
                          <Link className="underline underline-offset-4" href={href}>
                            {event.target?.type}:{event.target?.id}
                          </Link>
                        ) : (
                          `${event.target?.type}:${event.target?.id}`
                        )}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{event.verification?.summary ?? "blocked verification"}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-600">No blocked publishes yet.</p>
              )}
            </div>
          </div>
          <div className="px-4 py-4">
            <p className="text-sm font-medium text-zinc-900">Blocked by target type</p>
            <div className="mt-3 space-y-3">
              {blockedTargetRows.length ? (
                blockedTargetRows.map(([targetType, count]) => (
                  <div key={`blocked-type-${targetType}`} className="rounded-xl bg-zinc-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-zinc-700">{targetType}</p>
                      <p className="text-sm font-medium text-zinc-900">{count}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-600">No blocked target types yet.</p>
              )}
            </div>
          </div>
        </div>
        {incidentProposals.length ? (
          <div className="border-b border-zinc-200 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">Repair proposals</p>
                <p className="mt-1 text-xs text-zinc-500">高优先级发布异常已自动升级为修复方案入口。</p>
              </div>
              <Link className="text-sm underline underline-offset-4" href="/ops">
                View proposal queue
              </Link>
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-3">
              {incidentProposals.slice(0, 3).map((proposal: any) => {
                const href =
                  proposal.targetType && proposal.targetId
                    ? targetHref({ type: proposal.targetType, id: proposal.targetId })
                    : null;
                return (
                  <div key={`incident-prop-${proposal.id}`} className="rounded-xl bg-zinc-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-xs ${
                          proposal.severity === "critical"
                            ? "border-rose-200 bg-rose-50 text-rose-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        {proposal.severity ?? "warning"}
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 text-xs text-zinc-700">{proposal.status}</span>
                      <GovernanceBadge label={proposalGovernanceState(proposal).label} tone={proposalGovernanceState(proposal).tone} />
                    </div>
                    <p className="mt-2 text-sm font-medium text-zinc-900">{proposal.summary ?? proposal.suggestion}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {proposal.anomalyKind ?? "incident"} · last seen {proposal.lastSeenAt ?? proposal.createdAt}
                    </p>
                    {href ? (
                      <p className="mt-2 text-xs text-zinc-600">
                        target:{" "}
                        <Link className="underline underline-offset-4" href={href}>
                          {proposal.targetType}:{proposal.targetId}
                        </Link>
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <Link className="underline underline-offset-4 text-zinc-700" href={`/ops/proposals/${proposal.id}`}>
                        View proposal
                      </Link>
                      {proposal.linkedDraftId && href ? (
                        <Link className="underline underline-offset-4 text-zinc-700" href={`${href}?draft=${proposal.linkedDraftId}`}>
                          Open linked draft
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="divide-y divide-zinc-200">
          {publishingEvents.length ? (
            publishingEvents.slice(0, 8).map((event) => {
              const href = targetHref(event.target);
              return (
                <div key={`publish-health-${event.id}`} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{actionLabel(event.action)}</p>
                      <p className="mt-1 text-xs text-zinc-500">{event.at}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {event.action === "rollback" && event.trigger === "auto" ? (
                        <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-800">
                          AUTO ROLLBACK
                        </span>
                      ) : null}
                      {revalidateBadge(event)}
                      {event.action === "publish" ? verificationBadge(event) : null}
                    </div>
                  </div>
                  {event.target ? (
                    <p className="mt-2 text-sm text-zinc-700">
                      {href ? (
                        <Link className="underline underline-offset-4" href={href}>
                          {event.target.type}:{event.target.id}
                        </Link>
                      ) : (
                        `${event.target.type}:${event.target.id}`
                      )}
                    </p>
                  ) : null}
                  {event.revalidate?.requested?.length ? (
                    <p className="mt-1 text-xs text-zinc-500">paths: {event.revalidate.requested.join(" · ")}</p>
                  ) : null}
                  {event.verification?.results?.length ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      verify:{" "}
                      {event.verification.results
                        .slice(0, 2)
                        .map((item: any) => `${item.path} ${item.ok ? "ok" : "fail"}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {event.verification?.summary ? <p className="mt-1 text-xs text-zinc-500">{event.verification.summary}</p> : null}
                  {event.trigger ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      trigger: {event.trigger}
                      {event.triggerReason ? ` · ${event.triggerReason}` : ""}
                    </p>
                  ) : null}
                  {event.note ? <p className="mt-1 text-xs text-zinc-500">{event.note}</p> : null}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-sm text-zinc-600">No publishing events yet.</div>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Needs attention</p>
              <p className="mt-1 text-xs text-zinc-500">按严重度与活跃 recommendation 排序。</p>
            </div>
            <div className="flex gap-2 text-xs">
              <Link className="rounded-lg border border-zinc-200 px-3 py-1.5" href="/ops?status=open,in_progress">
                Active
              </Link>
              <Link className="rounded-lg border border-zinc-200 px-3 py-1.5" href="/ops?status=open">
                Open
              </Link>
              <Link className="rounded-lg border border-zinc-200 px-3 py-1.5" href="/ops?status=in_progress">
                In progress
              </Link>
            </div>
          </div>
          <div className="divide-y divide-zinc-200">
            {(overview.items ?? []).filter((item) => item.activeRecommendationsCount > 0).length ? (
              (overview.items ?? [])
                .filter((item) => item.activeRecommendationsCount > 0)
                .map((item) => {
                  const href = `/ops/${item.target.type}/${item.target.id}`;
                  const compare = item.comparison;
                  return (
                    <div key={`${item.target.type}:${item.target.id}`} className="px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-zinc-900">
                            <Link className="underline underline-offset-4" href={href}>
                              {item.target.title}
                            </Link>
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            <code className="rounded bg-zinc-100 px-1">{item.target.type}</code>{" "}
                            <code className="rounded bg-zinc-100 px-1">{item.target.id}</code>
                            {item.lastRecommendation ? (
                              <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5">
                                {item.lastRecommendation.severity}
                              </span>
                            ) : null}
                          </p>
                          {item.lastRecommendation ? (
                            <p className="mt-2 text-sm text-zinc-700">{item.lastRecommendation.reason}</p>
                          ) : null}
                        </div>
                        <div className="text-right text-xs text-zinc-500">
                          <p>Active recs: {item.activeRecommendationsCount}</p>
                          <p className="mt-1">
                            Ref: <code className="rounded bg-zinc-100 px-1">{item.latestSnapshot?.contentRef ?? "∅"}</code>
                          </p>
                        </div>
                      </div>

                      {compare ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl bg-zinc-50 p-3">
                            <p className="text-xs text-zinc-500">Views</p>
                            <p className="mt-1 text-sm font-medium text-zinc-900">{compare.current.views}</p>
                            {compare.delta ? (
                              <p className={`mt-1 text-xs ${compare.delta.views >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                {compare.delta.views >= 0 ? "+" : ""}
                                {compare.delta.views} vs prev
                              </p>
                            ) : null}
                          </div>
                          <div className="rounded-xl bg-zinc-50 p-3">
                            <p className="text-xs text-zinc-500">CTA rate</p>
                            <p className="mt-1 text-sm font-medium text-zinc-900">
                              {(compare.current.ctaRate * 100).toFixed(2)}%
                            </p>
                            {compare.delta ? (
                              <p className={`mt-1 text-xs ${compare.delta.ctaRate >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                {compare.delta.ctaRate >= 0 ? "+" : ""}
                                {(compare.delta.ctaRate * 100).toFixed(2)} pts
                              </p>
                            ) : null}
                          </div>
                          <div className="rounded-xl bg-zinc-50 p-3">
                            <p className="text-xs text-zinc-500">ATC rate</p>
                            <p className="mt-1 text-sm font-medium text-zinc-900">
                              {(compare.current.addToCartRate * 100).toFixed(2)}%
                            </p>
                            {compare.delta ? (
                              <p
                                className={`mt-1 text-xs ${
                                  compare.delta.addToCartRate >= 0 ? "text-emerald-700" : "text-rose-700"
                                }`}
                              >
                                {compare.delta.addToCartRate >= 0 ? "+" : ""}
                                {(compare.delta.addToCartRate * 100).toFixed(2)} pts
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
            ) : (
              <div className="px-4 py-8 text-sm text-zinc-600">No active recommendations.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Recommendation queue</p>
            <p className="mt-1 text-xs text-zinc-500">支持进入处理中、关闭或忽略。</p>
          </div>
          <div className="divide-y divide-zinc-200">
            {recommendations.items.length ? (
              recommendations.items.slice(0, 12).map((rec) => {
                const href = rec.preparedDraft?.draftId
                  ? `/ops/${rec.targetType}/${rec.targetId}?draft=${rec.preparedDraft.draftId}`
                  : `/ops/${rec.targetType}/${rec.targetId}`;
                return (
                  <div key={rec.id} className="px-4 py-4">
                    <p className="text-sm font-medium text-zinc-900">
                      <Link className="underline underline-offset-4" href={href}>
                        {rec.ruleId}
                      </Link>
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      <code className="rounded bg-zinc-100 px-1">{rec.targetType}</code>{" "}
                      <code className="rounded bg-zinc-100 px-1">{rec.targetId}</code>{" "}
                      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5">{rec.status}</span>
                    </p>
                    {rec.status === "in_progress" && rec.startedAt ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        已自动进入处理中：{rec.startedAt}
                        {rec.startedBy ? ` · ${rec.startedBy}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-zinc-700">{rec.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {priorityBadge(rec)}
                      {staleBadge(rec)}
                      {effectBadge(rec)}
                      {rec.severity ? (
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{rec.severity}</span>
                      ) : null}
                    </div>
                    {rec.preparedDraft ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        Draft ready:{" "}
                        <Link className="underline underline-offset-4" href={href}>
                          <code className="rounded bg-emerald-50 px-1">{rec.preparedDraft.draftId}</code>
                        </Link>
                        {" · "}
                        {rec.preparedDraft.reused ? "reused existing draft" : "prepared automatically"}
                      </p>
                    ) : null}
                    {rec.preparedDraftError ? (
                      <p className="mt-2 text-xs text-rose-700">{rec.preparedDraftError}</p>
                    ) : null}
                    {typeof rec.occurrences === "number" ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        近期开启次数：{rec.occurrences}
                        {rec.lastSeenAt ? ` · 最近触发：${rec.lastSeenAt}` : ""}
                      </p>
                    ) : null}
                    {rec.effectivePriorityReason || rec.priorityReason ? (
                      <p className="mt-2 text-xs text-zinc-500">{rec.effectivePriorityReason ?? rec.priorityReason}</p>
                    ) : null}
                    {rec.effect?.summary ? (
                      <p className="mt-2 text-xs text-zinc-500">效果：{rec.effect.summary}</p>
                    ) : null}
                    {rec.context ? (
                      <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
                        <p>
                          Window {rec.context.snapshot.windowDays}d · Views {rec.context.snapshot.metrics.views} · CTA{" "}
                          {fmtPercent(rec.context.snapshot.rates.ctaRate)} · ATC {fmtPercent(rec.context.snapshot.rates.addToCartRate)} · Purchase{" "}
                          {fmtPercent(rec.context.snapshot.rates.purchaseRate)}
                        </p>
                        {rec.context.delta ? (
                          <p className="mt-1">
                            vs prev: CTA {fmtPts(rec.context.delta.rates.ctaRate)} · ATC{" "}
                            {fmtPts(rec.context.delta.rates.addToCartRate)} · Purchase {fmtPts(rec.context.delta.rates.purchaseRate)}
                          </p>
                        ) : (
                          <p className="mt-1">vs prev: n/a</p>
                        )}
                        {rec.context.optimizationGoal ? <p className="mt-2">目标：{rec.context.optimizationGoal}</p> : null}
                        {rec.context.focusAreas?.length ? (
                          <p className="mt-2">
                            关注点：{rec.context.focusAreas.map(focusLabel).join("、")}
                          </p>
                        ) : null}
                        {rec.context.actionHints?.length ? (
                          <p className="mt-2">建议：{rec.context.actionHints.join("；")}</p>
                        ) : null}
                        {rec.context.referencePattern ? <p className="mt-2">参考模式：{rec.context.referencePattern.summary}</p> : null}
                        {rec.successPattern ? <p className="mt-2">成功模式：{rec.successPattern.summary}</p> : null}
                      </div>
                    ) : null}
                    <form action={onResolveRecommendation} className="mt-3 space-y-2">
                      <input type="hidden" name="id" value={rec.id} />
                      <input
                        name="note"
                        placeholder="处理备注（可选）"
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        {rec.status !== "in_progress" ? (
                          <button
                            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                            name="status"
                            value="in_progress"
                            type="submit"
                          >
                            Start
                          </button>
                        ) : null}
                        <button
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                          name="status"
                          value="resolved"
                          type="submit"
                        >
                          Resolve
                        </button>
                        <button
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                          name="status"
                          value="dismissed"
                          type="submit"
                        >
                          Dismiss
                        </button>
                      </div>
                    </form>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-sm text-zinc-600">No recommendations yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3">
          <p className="text-sm font-medium text-zinc-900">Rule effectiveness (30d)</p>
          <p className="mt-1 text-xs text-zinc-500">
            evaluated {ruleStats.totals.evaluated} · improved {ruleStats.totals.improved} · worsened {ruleStats.totals.worsened} · rate{" "}
            {fmtRate(ruleStats.totals.improvementRate)}
          </p>
        </div>
        {ruleStats.missingEvaluators?.length ? (
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Missing evaluators</p>
            <p className="mt-1 text-xs text-zinc-500">
              这些 rule 有统计数据，但当前没有 evaluator 实现，可能导致触发模拟/配置化调参无法覆盖。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ruleStats.missingEvaluators.slice(0, 8).map((r) => (
                <span key={r.ruleId} className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                  {r.ruleId} · {r.total}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {ruleStats.ruleConfigWarnings?.length ? (
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Rule config warnings</p>
            <p className="mt-1 text-xs text-zinc-500">配置有缺口时系统会自动回退默认值，并在这里提示。</p>
            <div className="mt-3 space-y-2">
              {ruleStats.ruleConfigWarnings.slice(0, 8).map((r) => (
                <div key={r.ruleId} className="rounded-xl bg-zinc-50 px-3 py-2">
                  <p className="text-sm text-zinc-900">{r.ruleId}</p>
                  <p className="mt-1 text-xs text-amber-800">{r.warnings.join(" · ")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {ruleStats.suggestedRuleTuning?.length ? (
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Suggested rule tuning</p>
            <p className="mt-1 text-xs text-zinc-500">仅给出建议，不自动改规则阈值。</p>
            <div className="mt-3 space-y-2">
              {ruleStats.suggestedRuleTuning.map((row) => (
                <div key={row.ruleId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                  <div>
                    <p className="text-sm text-zinc-900">
                      {row.ruleId} {qualityBadge(row.quality)}
                      {ruleKindBadge(row.ruleMeta)}
                      {row.hasEvaluator === false ? (
                        <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                          no-eval
                        </span>
                      ) : null}
                      {row.configWarnings?.length ? (
                        <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                          config-warn
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {row.suggestion} · evaluated {row.evaluated} · improved {fmtRate(row.improvementRate)} · worsened{" "}
                      {fmtRate(row.worsenedRate)}
                    </p>
                    {row.ruleMeta?.description ? <p className="mt-1 text-xs text-zinc-500">{row.ruleMeta.description}</p> : null}
                    {row.ruleMeta?.parameterSummary ? (
                      <p className="mt-1 text-xs text-zinc-500">params: {row.ruleMeta.parameterSummary}</p>
                    ) : null}
                    {row.configWarnings?.length ? <p className="mt-1 text-xs text-amber-800">{row.configWarnings.join(" · ")}</p> : null}
                    <form action={onCreateRuleTuningProposal} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="ruleId" value={row.ruleId} />
                      <input
                        name="note"
                        placeholder="提案备注（可选）"
                        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <button className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs">
                        Create proposal
                      </button>
                    </form>
                  </div>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">last {row.lastSeenAt ?? "n/a"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {recentProposals.items.length ? (
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Recent proposals</p>
            <p className="mt-1 text-xs text-zinc-500">规则调整提案草稿（仅记录，不会自动改规则）。</p>
            <div className="mt-3 space-y-2">
              {recentProposals.items.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                  <div>
                    <p className="text-sm text-zinc-900">
                      <code className="rounded bg-zinc-100 px-1">{p.id}</code> · {p.type === "incident_followup" ? p.anomalyKind : p.ruleId} ·{" "}
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700">{p.status}</span>
                    </p>
                    <p className="mt-1">
                      <GovernanceBadge label={proposalGovernanceState(p).label} tone={proposalGovernanceState(p).tone} />
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {p.type === "incident_followup"
                        ? `${p.targetType}:${p.targetId} · ${p.severity ?? "warning"}`
                        : `${p.ruleMeta?.description ?? "rule proposal"} ${p.ruleMeta ? `· ${p.ruleMeta.kind}${p.ruleMeta.rate ? `/${p.ruleMeta.rate}` : ""}` : ""}`}
                    </p>
                    {p.reviewSummary ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {reviewSummaryBadge(p.reviewSummary)}
                        <span className="text-xs text-zinc-600">{p.reviewSummary.headline}</span>
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-600">
                      {p.type === "incident_followup"
                        ? `${p.suggestion} · occurrences ${p.evaluated}`
                        : `${p.suggestion} · improved ${fmtRate(p.improvementRate)} · worsened ${fmtRate(p.worsenedRate)}`}
                    </p>
                    {p.reviewSummary?.recommendation ? (
                      <p className="mt-1 text-xs text-zinc-500">next: {p.reviewSummary.recommendation}</p>
                    ) : null}
                    {p.type !== "incident_followup" && p.currentConfig ? (
                      <p className="mt-1 text-xs text-zinc-600">
                        current: <code className="rounded bg-zinc-100 px-1">{p.currentConfigSummary ?? JSON.stringify(p.currentConfig)}</code>{" "}
                        suggested: <code className="rounded bg-zinc-100 px-1">{p.suggestedConfigSummary ?? JSON.stringify(p.suggestedConfig ?? {})}</code>
                      </p>
                    ) : p.type !== "incident_followup" ? (
                      <p className="mt-1 text-xs text-zinc-500">current: n/a · suggested: n/a</p>
                    ) : null}
                    {p.expectedImpact ? <p className="mt-1 text-xs text-zinc-500">impact: {p.expectedImpact}</p> : null}
                    {p.applyHowTo ? <p className="mt-1 text-xs text-zinc-500">how to: {p.applyHowTo}</p> : null}
                    {p.type !== "incident_followup" && p.appliedConfig ? (
                      <p className="mt-1 text-xs text-zinc-600">
                        applied: <code className="rounded bg-zinc-100 px-1">{JSON.stringify(p.appliedConfig)}</code>
                      </p>
                    ) : null}
                    {p.type !== "incident_followup" && p.appliedConfigCheck ? (
                      <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                        <div className="flex flex-wrap items-center gap-2">
                          {configCheckBadge(p.appliedConfigCheck)}
                          <span>{p.appliedConfigCheck.reason}</span>
                        </div>
                        {p.appliedConfigCheck.status === "mismatch" && p.appliedConfigCheck.diff ? (
                          <div className="mt-2 space-y-1">
                            {p.appliedConfigCheck.diff.missingKeys?.length ? (
                              <p>missing keys: {p.appliedConfigCheck.diff.missingKeys.join(", ")}</p>
                            ) : null}
                            {p.appliedConfigCheck.diff.extraKeys?.length ? (
                              <p>extra keys: {p.appliedConfigCheck.diff.extraKeys.join(", ")}</p>
                            ) : null}
                            {p.appliedConfigCheck.diff.mismatched &&
                            Object.keys(p.appliedConfigCheck.diff.mismatched).length ? (
                              <p>
                                mismatched:{" "}
                                {Object.entries(p.appliedConfigCheck.diff.mismatched)
                                  .slice(0, 4)
                                  .map(([k, v]: any) => `${k} (${JSON.stringify(v.applied)} != ${JSON.stringify(v.current)})`)
                                  .join(", ")}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {p.type !== "incident_followup" && p.postApplyEffect ? (
                      <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                        <p className="font-medium text-zinc-700">post-apply effect ({p.postApplyEffect.windowDays}d window)</p>
                        <p className="mt-1">computed: {p.postApplyEffect.computedAt}</p>
                        <p className="mt-1">
                          window: pre [{p.postApplyEffect.window.preStart} ~ {p.postApplyEffect.window.preEnd}] · post [
                          {p.postApplyEffect.window.postStart} ~ {p.postApplyEffect.window.postEnd}]
                        </p>
                        <p className="mt-1">
                          coverage:{" "}
                          {p.postApplyEffect.coverage.postWindowComplete
                            ? "complete"
                            : `partial (${p.postApplyEffect.coverage.postObservedDays}d observed, planned until ${p.postApplyEffect.coverage.plannedPostEnd})`}
                        </p>
                        {p.postApplyEffect.triggerSim && p.postApplyEffect.triggerDelta ? (
                          <p className="mt-1">
                            trigger sim: pre {p.postApplyEffect.triggerSim.pre.triggers}/{p.postApplyEffect.triggerSim.pre.snapshots} (
                            {fmtRate(p.postApplyEffect.triggerSim.pre.triggerRate)}) · post {p.postApplyEffect.triggerSim.post.triggers}/
                            {p.postApplyEffect.triggerSim.post.snapshots} ({fmtRate(p.postApplyEffect.triggerSim.post.triggerRate)}) · delta{" "}
                            {fmtCountDelta(p.postApplyEffect.triggerDelta.triggers)} / {fmtPtsFromRate(p.postApplyEffect.triggerDelta.triggerRate)}
                          </p>
                        ) : (
                          <p className="mt-1 text-zinc-500">trigger sim: n/a (missing before/after config)</p>
                        )}
                        <p className="mt-1">
                          pre: evaluated {p.postApplyEffect.pre.evaluated} · improved {fmtRate(p.postApplyEffect.pre.improvementRate)}
                          {" · "}
                          post: evaluated {p.postApplyEffect.post.evaluated} · improved {fmtRate(p.postApplyEffect.post.improvementRate)}
                        </p>
                        <p className="mt-1">delta: {fmtPtsFromRate(p.postApplyEffect.delta.improvementRate)}</p>
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <Link href={`/ops/proposals/${p.id}`} className="text-xs text-zinc-700 underline underline-offset-2">
                        View proposal details
                      </Link>
                    </div>
                    {p.type === "incident_followup" ? (
                      p.status !== "rejected" ? (
                        <form action={onTransitionProposal} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            name="note"
                            placeholder="处理备注（可选）"
                            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs"
                          />
                          {p.status === "draft" ? (
                            <button className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs" name="status" value="approved">
                              Approve
                            </button>
                          ) : null}
                          <button className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs" name="status" value="rejected">
                            Reject
                          </button>
                        </form>
                      ) : null
                    ) : p.status !== "applied" ? (
                      <form action={onTransitionProposal} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          name="note"
                          placeholder="变更备注（可选）"
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                        {p.status === "approved" ? (
                          <input
                            name="appliedConfig"
                            placeholder='appliedConfig JSON，例如 {"minViews":200,"maxRate":0.02}'
                            defaultValue={p.suggestedConfig ? JSON.stringify(p.suggestedConfig) : ""}
                            className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs"
                          />
                        ) : null}
                        {p.status === "draft" ? (
                          <button className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs" name="status" value="approved">
                            Approve
                          </button>
                        ) : null}
                        {p.status !== "rejected" ? (
                          <button className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs" name="status" value="rejected">
                            Reject
                          </button>
                        ) : null}
                        {p.status === "approved" ? (
                          <button className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs" name="status" value="applied">
                            Mark applied
                          </button>
                        ) : null}
                      </form>
                    ) : null}
                  </div>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{p.createdAt}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="divide-y divide-zinc-200">
          {ruleStats.items.length ? (
            ruleStats.items.slice(0, 8).map((row) => (
              <div key={row.ruleId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">
                    {row.ruleId} <span className="ml-2">{qualityBadge(row.quality)}</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    total {row.total} · evaluated {row.evaluated} · improved {row.improved} · worsened {row.worsened} · rate{" "}
                    {fmtRate(row.improvementRate)}
                  </p>
                </div>
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  last {row.lastSeenAt ?? "n/a"}
                </span>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-zinc-600">No completed recommendations yet.</div>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Recent audit</p>
            <p className="mt-1 text-xs text-zinc-500">展示最近关键动作，actor 已带角色前缀。</p>
          </div>
          <div className="border-b border-zinc-200 px-4 py-3">
            <Link className="text-sm underline underline-offset-4" href="/ops/audit">
              View full audit log
            </Link>
          </div>
          <div className="divide-y divide-zinc-200">
            {audit.items.length ? (
              audit.items.slice(0, 12).map((event) => {
                const href = event.target
                  ? event.target.type === "faq" && event.target.id.includes(":")
                    ? `/ops/faq/${event.target.id.split(":")[0]}/${event.target.id.split(":")[1]}`
                    : `/ops/${event.target.type}/${event.target.id}`
                  : null;
                return (
                  <div key={event.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{actionLabel(event.action)}</p>
                        <p className="mt-1 text-xs text-zinc-500">{event.at}</p>
                      </div>
                      <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                        {actorLabel(event.actor)}
                      </span>
                    </div>
                    {event.target ? (
                      <p className="mt-2 text-sm text-zinc-700">
                        {href ? (
                          <Link className="underline underline-offset-4" href={href}>
                            {event.target.type}:{event.target.id}
                          </Link>
                        ) : (
                          `${event.target.type}:${event.target.id}`
                        )}
                      </p>
                    ) : null}
                    {event.note ? <p className="mt-1 text-xs text-zinc-500">{event.note}</p> : null}
                    {event.previewUrl ? <p className="mt-1 text-xs text-zinc-500">{event.previewUrl}</p> : null}
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-sm text-zinc-600">No audit events yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3 text-xs text-zinc-500">
            Total: {items.length}
          </div>
          <ul className="divide-y divide-zinc-200">
            {items.map((t) => {
              const href =
                t.type === "faq" && t.faqTargetType && t.faqTargetId
                  ? `/ops/faq/${t.faqTargetType}/${t.faqTargetId}`
                  : `/ops/${t.type}/${t.id}`;
              return (
                <li key={`${t.type}:${t.id}`} className="px-4 py-4">
                  <Link className="block" href={href}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{t.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          <code className="rounded bg-zinc-100 px-1">{t.type}</code>{" "}
                          <code className="rounded bg-zinc-100 px-1">{t.id}</code>{" "}
                          <span className="ml-2">{t.targetPath}</span>
                        </p>
                      </div>
                      <span className="text-sm underline underline-offset-4">Open</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function GateSnapshotCard({
  title,
  allowed,
  tone,
  sections,
}: {
  title: string;
  allowed: boolean;
  tone: "emerald" | "amber" | "rose" | "zinc";
  sections: Array<{ ok: boolean; label: string; detail: string }>;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50"
          : "border-zinc-200 bg-zinc-50";
  const pillClass = allowed
    ? tone === "rose"
      ? "border-rose-200 bg-white text-rose-700"
      : "border-emerald-200 bg-white text-emerald-700"
    : "border-zinc-200 bg-white text-zinc-600";

  return (
    <div className={`mt-2 rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-zinc-900">{title}</p>
        <span className={`rounded px-2 py-0.5 text-[11px] border ${pillClass}`}>{allowed ? "allow" : "hold"}</span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {sections.map((section) => (
          <div key={`${title}-${section.label}`} className="rounded border border-white/70 bg-white/80 px-2 py-2">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">{section.label}</p>
            <p className={`mt-1 text-[11px] ${section.ok ? "text-emerald-700" : "text-amber-700"}`}>
              {section.ok ? "ok" : "hold"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">{section.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function NextStepActions({
  change,
  onSyncRepoChange,
  onOpenRepoChangePullRequest,
  onOpenRepoChangeRevertPullRequest,
}: {
  change: any;
  onSyncRepoChange: (formData: FormData) => Promise<void>;
  onOpenRepoChangePullRequest: (formData: FormData) => Promise<void>;
  onOpenRepoChangeRevertPullRequest: (formData: FormData) => Promise<void>;
}) {
  const code = String(change?.recommendedNextStep?.code || "");
  const actionClass = "rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700";

  if (code === "open_pr" && !change?.prUrl) {
    return (
      <form action={onOpenRepoChangePullRequest} className="mt-2 inline-flex">
        <input type="hidden" name="id" value={change.id} />
        <button className={actionClass}>Create draft PR</button>
      </form>
    );
  }
  if (["ready_for_review", "ready_auto_merge", "wait_ci", "wait_ci_start", "wait_auto_merge_labeling"].includes(code)) {
    return (
      <form action={onSyncRepoChange} className="mt-2 inline-flex">
        <input type="hidden" name="id" value={change.id} />
        <button className={actionClass}>Sync to advance</button>
      </form>
    );
  }
  if (code === "review_revert_pr" || code === "revert_pr_open") {
    if (change?.revertPrUrl) {
      return (
        <a className={`${actionClass} mt-2 inline-flex`} href={change.revertPrUrl}>
          Review revert PR
        </a>
      );
    }
  }
  if (code === "auto_revert_ready" && !change?.revertPrUrl) {
    return (
      <form action={onOpenRepoChangeRevertPullRequest} className="mt-2 inline-flex">
        <input type="hidden" name="id" value={change.id} />
        <button className={actionClass}>Create revert PR</button>
      </form>
    );
  }
  if (["blocked_auto_merge_policy", "blocked_revert_policy"].includes(code)) {
    return (
      <a className={`${actionClass} mt-2 inline-flex`} href="#auto-action-policy">
        Open policy
      </a>
    );
  }
  if (code === "investigate_ci" && change?.workflowRunUrl) {
    return (
      <a className={`${actionClass} mt-2 inline-flex`} href={change.workflowRunUrl}>
        Investigate run
      </a>
    );
  }
  return null;
}
