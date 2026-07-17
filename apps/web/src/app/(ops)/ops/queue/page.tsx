import Link from "next/link";
import {
  getMonitoringSummary,
  getOpsAuthStatus,
  getRecommendations,
  listCustomerNotifications,
  listRepoChanges,
  listRuleTuningProposals,
  listSupportCases,
} from "@/lib/control-plane/ops";
import { GovernanceBadge } from "../components/governance-ui";

export const dynamic = "force-dynamic";

function toneForSeverity(severity: string) {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "neutral";
}

function toneForProposal(item: { status?: string; reviewSummary?: { state?: string } | null } | null | undefined) {
  const status = String(item?.status || "");
  const state = String(item?.reviewSummary?.state || "");
  if (status === "approved") return "ready";
  if (status === "draft") return "progress";
  if (status === "applied" && state === "success") return "ready";
  if (status === "applied" && state === "risk") return "critical";
  if (status === "applied" && state === "observe") return "progress";
  return "neutral";
}

function seoFreshnessTone(status: string) {
  if (status === "healthy") return "text-emerald-700";
  if (status === "critical") return "text-rose-700";
  if (status === "warning") return "text-amber-700";
  return "text-zinc-500";
}

export default async function OpsQueuePage() {
  const auth = await getOpsAuthStatus();
  const monitoring = await getMonitoringSummary({});
  const support = await listSupportCases({ status: "open", limit: 30 });
  const notifications = await listCustomerNotifications({ status: "open", limit: 30 });
  const proposals = await listRuleTuningProposals({ limit: 30 });
  const repoChanges = await listRepoChanges({ limit: 20 });
  const recommendations = await getRecommendations({ status: "open,in_progress" });

  const incidentProposals = proposals.items.filter((p) => p.type === "incident_followup");
  const proposalReady = incidentProposals.filter((p) => p.status === "approved");
  const proposalDraft = incidentProposals.filter((p) => p.status === "draft");
  const proposalApplied = incidentProposals.filter((p) => p.status === "applied");
  const proposalRisk = proposalApplied.filter((p) => p.reviewSummary?.state === "risk");
  const proposalObserve = proposalApplied.filter((p) => ["observe", "steady"].includes(String(p.reviewSummary?.state || "")));

  const criticalSupport = support.items.filter((c) => c.severity === "critical").length;
  const overdueSupport = support.items.filter((c) => c.sla?.overdue).length;
  const unassignedSupport = support.summary?.unassigned ?? support.items.filter((c) => !c.owner).length;
  const criticalNotifications = notifications.items.filter((n) => n.notify?.status === "failed").length;
  const seoTargets = monitoring.seoPerformance?.targets ?? [];
  const seoFreshness = monitoring.seoFreshness ?? null;
  const seoLowCtr = seoTargets.filter((t) => t.summary.current.impressions >= 80 && t.summary.current.ctr < 0.02).length;
  const seoPositionDrop = seoTargets.filter((t) => (t.summary.delta.position ?? 0) > 3 && t.summary.current.impressions >= 50).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Ops Queue</h1>
          <p className="mt-2 text-sm text-zinc-600">把后链路承接对象集中到一个视图：support cases、customer notifications、proposals、repo changes。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Back to ops
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/support-cases">
            Support cases
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/customer-notifications">
            Notifications
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Support cases</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{support.items.length}</p>
          <p className="mt-1 text-xs text-zinc-500">critical {criticalSupport} · open queue</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Customer notifications</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{notifications.items.length}</p>
          <p className="mt-1 text-xs text-zinc-500">failed {criticalNotifications} · pending send/ack</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Incident proposals</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{incidentProposals.length}</p>
          <p className="mt-1 text-xs text-zinc-500">
            ready {proposalReady.length} · observing {proposalObserve.length} · risk {proposalRisk.length}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Monitoring alerts</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{monitoring.alerts.length}</p>
          <p className="mt-1 text-xs text-zinc-500">runtime {monitoring.runtime.signalsHealth}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">SEO/GEO · 7d</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{seoTargets.length}</p>
          <p className="mt-1 text-xs text-zinc-500">
            low CTR {seoLowCtr} · pos drop {seoPositionDrop}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            <Link className="underline underline-offset-4" href="/ops/monitoring">
              Open monitoring
            </Link>
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">SEO metrics freshness</p>
          <p className={`mt-2 text-2xl font-semibold ${seoFreshnessTone(seoFreshness?.status ?? "not_configured")}`}>
            {seoFreshness?.status ?? "not_configured"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            latest {seoFreshness?.latestDate ?? "n/a"} · {seoFreshness?.daysSinceLatest == null ? "n/a" : `${seoFreshness.daysSinceLatest}d old`}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Support cases (open)</p>
            <div className="flex flex-wrap items-center gap-3">
              {overdueSupport ? (
                <Link className="text-xs underline underline-offset-4" href="/ops/support-cases?status=open&overdue=true">
                  Overdue only
                </Link>
              ) : null}
              <Link className="text-xs underline underline-offset-4" href="/ops/support-cases">
                Open page
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link className="rounded-xl bg-zinc-50 p-3" href="/ops/support-cases?status=open&overdue=true">
              <p className="text-xs text-zinc-500">Overdue</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">{support.summary?.overdue ?? overdueSupport}</p>
            </Link>
            <Link className="rounded-xl bg-zinc-50 p-3" href="/ops/support-cases?status=open&owner=unassigned">
              <p className="text-xs text-zinc-500">Unassigned</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">{unassignedSupport}</p>
            </Link>
            <Link className="rounded-xl bg-zinc-50 p-3" href="/ops/support-cases?status=open&severity=critical">
              <p className="text-xs text-zinc-500">Critical</p>
              <p className="mt-2 text-lg font-semibold text-zinc-900">{support.summary?.critical ?? criticalSupport}</p>
            </Link>
          </div>
          {support.summary?.byOwner?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {support.summary.byOwner.map((item) => (
                <Link
                  key={`${item.owner || "unassigned"}:${item.count}`}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600"
                  href={`/ops/support-cases?status=open${item.owner ? `&owner=${encodeURIComponent(item.owner)}` : "&owner=unassigned"}`}
                >
                  {(item.owner || "unassigned") as string} · {item.count}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="mt-4 space-y-2">
            {support.items.slice(0, 8).map((c) => (
              <div key={c.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <GovernanceBadge label={c.severity} tone={toneForSeverity(c.severity)} />
                    {c.sla?.overdue ? <GovernanceBadge label="overdue" tone="critical" /> : null}
                    <span className="text-xs text-zinc-500">
                      {c.kind} · {c.target?.type ?? "target"} {c.target?.id ?? "n/a"} · owner {c.owner || "unassigned"}
                    </span>
                  </div>
                  {c.targetPath ? (
                    <Link className="text-xs underline underline-offset-4" href={c.targetPath}>
                      Open
                    </Link>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-zinc-700">{c.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {c.detail}
                  {c.sla?.dueAt ? ` · due ${c.sla.dueAt}` : ""}
                </p>
                {c.context?.orderId ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    <Link
                      className="underline underline-offset-4"
                      href={`/ops/customer-notifications?status=open&q=${encodeURIComponent(String(c.context.orderId))}`}
                    >
                      Related notifications
                    </Link>
                  </p>
                ) : null}
              </div>
            ))}
            {!support.items.length ? <p className="text-sm text-zinc-600">No open support cases.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Customer notifications (open)</p>
            <Link className="text-xs underline underline-offset-4" href="/ops/customer-notifications">
              Open page
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {notifications.items.slice(0, 8).map((n) => (
              <div key={n.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <GovernanceBadge label={n.notify?.status ?? "pending"} tone={n.notify?.status === "sent" ? "ready" : "progress"} />
                    <span className="text-xs text-zinc-500">
                      {n.kind} · order {n.orderId} · to {n.to}
                    </span>
                  </div>
                  {n.actionUrl ? (
                    <Link className="text-xs underline underline-offset-4" href={n.actionUrl}>
                      Open order
                    </Link>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-zinc-700">{n.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{n.detail}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  <Link className="underline underline-offset-4" href={`/ops/support-cases?status=open&q=${encodeURIComponent(String(n.orderId))}`}>
                    Related support cases
                  </Link>
                </p>
              </div>
            ))}
            {!notifications.items.length ? <p className="text-sm text-zinc-600">No open customer notifications.</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Incident proposals</p>
            <span className="text-xs text-zinc-500">
              draft {proposalDraft.length} · ready {proposalReady.length} · applied {proposalApplied.length}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {incidentProposals.slice(0, 10).map((p) => (
              <div key={p.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <GovernanceBadge label={p.status} tone={toneForProposal(p)} />
                    <span className="text-xs text-zinc-500">
                      {p.anomalyKind ?? "incident"} · {p.targetType}:{p.targetId}
                      {p.reviewSummary?.state ? ` · ${p.reviewSummary.state}` : ""}
                    </span>
                  </div>
                  <Link className="text-xs underline underline-offset-4" href={`/ops/proposals/${p.id}`}>
                    Open
                  </Link>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{p.reviewSummary?.headline ?? p.summary ?? "Incident proposal"}</p>
                {p.reviewSummary?.recommendation ? <p className="mt-1 text-xs text-zinc-500">{p.reviewSummary.recommendation}</p> : null}
              </div>
            ))}
            {!incidentProposals.length ? <p className="text-sm text-zinc-600">No incident proposals.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Repo changes</p>
            <span className="text-xs text-zinc-500">{repoChanges.items.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {repoChanges.items.slice(0, 10).map((c) => (
              <div key={c.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500">
                    {c.status} · {c.targetType ?? "target"} {c.targetId ?? "n/a"}
                  </span>
                  {c.prUrl ? (
                    <a className="text-xs underline underline-offset-4" href={c.prUrl} target="_blank" rel="noreferrer">
                      PR
                    </a>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-zinc-700">{c.title ?? c.summary ?? c.id}</p>
                {c.postMergeRiskSummary ? <p className="mt-1 text-xs text-zinc-500">{c.postMergeRiskSummary}</p> : null}
              </div>
            ))}
            {!repoChanges.items.length ? <p className="text-sm text-zinc-600">No repo changes.</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-900">Recommendations (open/in progress)</p>
          <span className="text-xs text-zinc-500">{recommendations.items.length}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recommendations.items.slice(0, 10).map((rec) => (
            <div key={rec.id} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <GovernanceBadge label={rec.severity} tone={toneForSeverity(rec.severity)} />
                  <span className="text-xs text-zinc-500">
                    {rec.ruleId} · {rec.targetType}:{rec.targetId} · {rec.status}
                  </span>
                </div>
                <Link className="text-xs underline underline-offset-4" href={`/ops?q=${encodeURIComponent(rec.targetId)}${rec.targetType ? `&type=${encodeURIComponent(rec.targetType)}` : ""}`}>
                  Open
                </Link>
              </div>
              <p className="mt-2 text-sm text-zinc-700">{rec.reason}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        role {auth.role} · capabilities {auth.capabilities.join(", ")}
      </p>
    </div>
  );
}
