import Link from "next/link";
import { generateOpsDraft, getMonitoringSummary, getOpsEvents, getRecommendations } from "@/lib/control-plane/ops";
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

export default async function OpsMonitoringPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const targetType = getString(sp, "type");

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
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?action=publish">
            Publish audit
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?action=rollback">
            Rollback audit
          </Link>
        </div>
      </div>

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
