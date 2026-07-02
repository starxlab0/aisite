import { createRuleTuningProposal, getOpsAuthStatus, getOpsEvents, getRecommendationRuleStats, getRecommendations, getSignalsOverview, getSignalsStatus, listOpsTargets, listRuleTuningProposals, resolveRecommendation, transitionRuleTuningProposal } from "@/lib/control-plane/ops";
import Link from "next/link";
import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OpsDashboardPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const status = typeof sp.status === "string" ? sp.status : undefined;
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
  const signalsStatus = await getSignalsStatus();
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
                          {fmtPercent(rec.context.snapshot.rates.ctaRate)} · ATC {fmtPercent(rec.context.snapshot.rates.addToCartRate)}
                        </p>
                        {rec.context.delta ? (
                          <p className="mt-1">
                            vs prev: CTA {fmtPts(rec.context.delta.rates.ctaRate)} · ATC{" "}
                            {fmtPts(rec.context.delta.rates.addToCartRate)}
                          </p>
                        ) : (
                          <p className="mt-1">vs prev: n/a</p>
                        )}
                        {rec.context.focusAreas?.length ? (
                          <p className="mt-2">
                            关注点：{rec.context.focusAreas.map(focusLabel).join("、")}
                          </p>
                        ) : null}
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
