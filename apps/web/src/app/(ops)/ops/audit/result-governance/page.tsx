import Link from "next/link";
import { getMonitoringSummary, getOpsEvents, listSupportCases } from "@/lib/control-plane/ops";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getString(sp: Record<string, string | string[] | undefined>, key: string) {
  return typeof sp[key] === "string" ? (sp[key] as string) : undefined;
}

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toneClass(status: string | null | undefined) {
  if (status === "healthy" || status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "degraded" || status === "critical" || status === "failure") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function laneQuery(lane: string | undefined) {
  if (lane === "payment") return "payment";
  if (lane === "fulfillment") return "fulfillment";
  if (lane === "refund") return "refund";
  return "";
}

function eventActionLabel(action: string) {
  const map: Record<string, string> = {
    support_case_created: "Support case created",
    support_case_assigned: "Support case assigned",
    support_case_acked: "Support case acknowledged",
    support_case_resolved: "Support case resolved",
    proposal_created: "Proposal created",
    proposal_updated: "Proposal updated",
    proposal_approved: "Proposal approved",
    recommendation_created: "Recommendation created",
  };
  return map[action] ?? action;
}

export default async function ResultGovernanceAuditPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const lane = getString(sp, "lane") ?? "all";
  const status = getString(sp, "status") ?? "open";
  const q = getString(sp, "q") ?? laneQuery(lane);
  const offset = Math.max(0, toInt(getString(sp, "offset"), 0));
  const limit = Math.min(100, Math.max(20, toInt(getString(sp, "limit"), 40)));

  const monitoring = await getMonitoringSummary({});
  const supportCases = await listSupportCases({
    status: status as "open" | "acked" | "resolved",
    q: q || undefined,
    limit: 40,
  });
  const events = await getOpsEvents({
    q: q || undefined,
    offset,
    limit,
  });

  const judgment = monitoring.resultGovernanceRuntimeJudgment ?? null;
  const laneSummary = monitoring.resultGovernanceLaneSummary ?? null;
  const paymentResults = monitoring.paymentResults24h;
  const fulfillmentResults = monitoring.fulfillmentResults24h;
  const refundResults = monitoring.refundResults24h;

  const activeLanes =
    lane === "all" ? laneSummary?.lanes ?? [] : (laneSummary?.lanes ?? []).filter((item) => item.key === lane);

  const nextOffset = offset + limit < events.total ? offset + limit : null;
  const prevOffset = offset - limit >= 0 ? offset - limit : null;

  const pageLink = (newOffset: number) => {
    const params = new URLSearchParams();
    if (lane && lane !== "all") params.set("lane", lane);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("limit", String(limit));
    params.set("offset", String(newOffset));
    return `/ops/audit/result-governance?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">Result governance audit</p>
          <p className="mt-2 text-sm text-zinc-600">把 payment / fulfillment / refund 的治理判断、lane 摘要、support queue 和相关事件拆成独立视图，方便值班与复盘。</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Back to monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit">
            Raw audit log
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl border p-4 ${toneClass(judgment?.health)}`}>
          <p className="text-xs opacity-80">Governance judgment</p>
          <p className="mt-2 text-xl font-semibold">{judgment?.headline ?? "n/a"}</p>
          <p className="mt-1 text-xs opacity-80">{judgment?.detail ?? "No judgment available."}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Lane totals</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{laneSummary?.lanes?.length ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">
            recs {laneSummary?.totals.recommendations ?? 0} · proposals {laneSummary?.totals.proposals ?? 0} · followups {laneSummary?.totals.observationFollowups ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Support queue</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{supportCases.summary.total}</p>
          <p className="mt-1 text-xs text-zinc-500">critical {supportCases.summary.critical} · overdue {supportCases.summary.overdue}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Event window</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{events.total}</p>
          <p className="mt-1 text-xs text-zinc-500">showing {events.items.length} · offset {offset}</p>
        </div>
      </div>

      <form className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[160px_160px_minmax(0,1fr)_120px]">
          <div>
            <label className="text-xs text-zinc-500">lane</label>
            <select name="lane" defaultValue={lane} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="all">all</option>
              <option value="payment">payment</option>
              <option value="fulfillment">fulfillment</option>
              <option value="refund">refund</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">status</label>
            <select name="status" defaultValue={status} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="open">open</option>
              <option value="acked">acked</option>
              <option value="resolved">resolved</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">q</label>
            <input name="q" defaultValue={q} placeholder="payment / fulfillment / refund / order id" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">limit</label>
            <input name="limit" defaultValue={String(limit)} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">
            Apply
          </button>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/result-governance">
            Reset
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/support-cases?status=open">
            Open support queue
          </Link>
        </div>
      </form>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">Lane summary</p>
            <p className="mt-1 text-xs text-zinc-500">按 lane 看治理状态、积压程度和下一步处理方向。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {activeLanes.length ? (
                activeLanes.map((laneItem) => (
                  <div key={laneItem.key} className={`rounded-xl border p-4 ${toneClass(laneItem.health)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide opacity-80">{laneItem.title}</p>
                        <p className="mt-1 text-sm font-medium">{laneItem.headline}</p>
                        <p className="mt-1 text-xs opacity-90">{laneItem.detail}</p>
                      </div>
                      <div className="rounded-full border border-current/20 px-3 py-1 text-xs">{laneItem.health}</div>
                    </div>
                    <p className="mt-3 text-xs opacity-80">
                      recs {laneItem.counts.recommendations} · proposals {laneItem.counts.proposals} · followups {laneItem.counts.observationFollowups}
                    </p>
                    <p className="mt-2 text-xs opacity-80">Next step: {laneItem.actionHint}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={laneItem.actionPath} className="rounded-lg border border-current/20 bg-white/70 px-3 py-1.5 text-xs">
                        {laneItem.actionLabel}
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-sm text-zinc-500">No lane summary available.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">24h lane metrics</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-900">Payment</p>
                <div className="mt-2 space-y-1 text-xs text-zinc-600">
                  <p>paid {paymentResults.paid} · authorized {paymentResults.authorized}</p>
                  <p>failed {paymentResults.failed} · canceled {paymentResults.canceled}</p>
                  <p>requires action {paymentResults.requiresAction} · issues {paymentResults.issues}</p>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-900">Fulfillment</p>
                <div className="mt-2 space-y-1 text-xs text-zinc-600">
                  <p>processing {fulfillmentResults.processing}</p>
                  <p>shipped {fulfillmentResults.shipped}</p>
                  <p>delivered {fulfillmentResults.delivered}</p>
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-900">Refund</p>
                <div className="mt-2 space-y-1 text-xs text-zinc-600">
                  <p>requested {refundResults.requested}</p>
                  <p>refunded {refundResults.refunded}</p>
                  <p>backlog {refundResults.backlog}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">Support queue snapshot</p>
            <p className="mt-1 text-xs text-zinc-500">当前 lane 过滤下最值得先处理的 support cases。</p>
            <div className="mt-4 max-h-[26rem] space-y-2 overflow-auto pr-1">
              {supportCases.items.length ? (
                supportCases.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-zinc-200 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {item.kind} · {item.target?.type ?? "target"} {item.target?.id ?? "n/a"}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs ${item.severity === "critical" ? "bg-rose-100 text-rose-700" : item.status === "acked" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-700"}`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-600">{item.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                      <span>owner {item.owner || "unassigned"}</span>
                      {item.context?.parentProposalId ? <Link className="underline underline-offset-4" href={`/ops/proposals/${String(item.context.parentProposalId)}`}>Open proposal</Link> : null}
                      {item.targetPath ? <Link className="underline underline-offset-4" href={item.targetPath}>Open linked view</Link> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-sm text-zinc-500">No support cases found for this lane.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 text-xs text-zinc-500">
              <span>
                Raw governance events: {events.total} · showing {events.items.length} · offset {offset}
              </span>
              <div className="flex gap-2">
                {prevOffset !== null ? (
                  <Link className="rounded-lg border border-zinc-200 px-3 py-1.5" href={pageLink(prevOffset)}>
                    Prev
                  </Link>
                ) : null}
                {nextOffset !== null ? (
                  <Link className="rounded-lg border border-zinc-200 px-3 py-1.5" href={pageLink(nextOffset)}>
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="max-h-[34rem] divide-y divide-zinc-200 overflow-auto">
              {events.items.length ? (
                events.items.map((event) => (
                  <div key={event.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{eventActionLabel(event.action)}</p>
                        <p className="mt-1 text-xs text-zinc-500">{event.action}</p>
                        <p className="mt-1 text-xs text-zinc-500">{event.at}</p>
                      </div>
                      <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{event.actor || "anonymous"}</span>
                    </div>
                    {event.note ? <p className="mt-2 text-xs text-zinc-600">{event.note}</p> : null}
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-sm text-zinc-500">No governance events found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
