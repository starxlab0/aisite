import Link from "next/link";
import { getMonitoringSummary, getOpsEvents } from "@/lib/control-plane/ops";

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

function eventActionLabel(action: string) {
  const map: Record<string, string> = {
    proposal_created: "Proposal created",
    proposal_updated: "Proposal updated",
    proposal_approved: "Proposal approved",
    recommendation_created: "Recommendation created",
    recommendation_resolved: "Recommendation resolved",
  };
  return map[action] ?? action;
}

export default async function CommerceAuditPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const source = getString(sp, "source") ?? "all";
  const q = getString(sp, "q") ?? (source === "all" ? "checkout" : source);
  const offset = Math.max(0, toInt(getString(sp, "offset"), 0));
  const limit = Math.min(100, Math.max(20, toInt(getString(sp, "limit"), 40)));

  const monitoring = await getMonitoringSummary({});
  const events = await getOpsEvents({
    q: q || undefined,
    offset,
    limit,
  });

  const judgment = monitoring.commerceRuntimeJudgment ?? null;
  const healthSummary = monitoring.commerceHealthSummary ?? null;
  const sourceSummary = monitoring.commerceSourceSummary ?? null;
  const commerceCheckout = monitoring.commerceCheckout;

  const activeSources =
    source === "all" ? sourceSummary?.sources ?? [] : (sourceSummary?.sources ?? []).filter((item) => item.source === source);
  const activeSourceKeys = new Set(activeSources.map((item) => item.source));
  const activeRecommendations =
    source === "all"
      ? commerceCheckout.recommendations
      : commerceCheckout.recommendations.filter((item) => String(item.context?.sourceKey || item.targetId || "") === source);
  const activeProposals =
    source === "all" ? commerceCheckout.proposals : commerceCheckout.proposals.filter((item) => String(item.targetId || "") === source);

  const nextOffset = offset + limit < events.total ? offset + limit : null;
  const prevOffset = offset - limit >= 0 ? offset - limit : null;

  const pageLink = (newOffset: number) => {
    const params = new URLSearchParams();
    if (source && source !== "all") params.set("source", source);
    if (q) params.set("q", q);
    params.set("limit", String(limit));
    params.set("offset", String(newOffset));
    return `/ops/audit/commerce?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">Commerce audit</p>
          <p className="mt-2 text-sm text-zinc-600">把 checkout 来源判断、source 工作面、推荐与提案、以及相关治理事件拆成独立视图，方便值班和复盘。</p>
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
          <p className="text-xs opacity-80">Commerce judgment</p>
          <p className="mt-2 text-xl font-semibold">{judgment?.headline ?? "n/a"}</p>
          <p className="mt-1 text-xs opacity-80">{judgment?.detail ?? "No judgment available."}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${toneClass(healthSummary?.health)}`}>
          <p className="text-xs opacity-80">Health summary</p>
          <p className="mt-2 text-xl font-semibold">{healthSummary?.label ?? "n/a"}</p>
          <p className="mt-1 text-xs opacity-80">{healthSummary?.detail ?? "No health summary available."}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Source totals</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{sourceSummary?.sources?.length ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">
            recs {sourceSummary?.totals.recommendations ?? 0} · proposals {sourceSummary?.totals.proposals ?? 0} · followup risk {sourceSummary?.totals.followupRisk ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">24h checkout</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{commerceCheckout.checkoutStarts}</p>
          <p className="mt-1 text-xs text-zinc-500">
            completes {commerceCheckout.checkoutCompletes} · dropoff {commerceCheckout.checkoutDropoff} · purchases {commerceCheckout.purchases24h}
          </p>
        </div>
      </div>

      <form className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_120px]">
          <div>
            <label className="text-xs text-zinc-500">source</label>
            <select name="source" defaultValue={source} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="all">all</option>
              {(sourceSummary?.sources ?? []).map((item) => (
                <option key={item.key} value={item.source}>
                  {item.source}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">q</label>
            <input name="q" defaultValue={q} placeholder="guide / ai_concierge / checkout / proposal id" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
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
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/commerce">
            Reset
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops?status=open,in_progress&q=checkout">
            Open commerce queue
          </Link>
        </div>
      </form>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">Source summary</p>
            <p className="mt-1 text-xs text-zinc-500">按 attribution source 看当前掉队、治理积压与下一步处理方向。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeSources.length ? (
                activeSources.map((item) => (
                  <div key={item.key} className={`rounded-xl border p-4 ${toneClass(item.health)}`}>
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
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-sm text-zinc-500">No source summary available.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">24h source metrics</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(source === "all" ? commerceCheckout.bySource : commerceCheckout.bySource.filter((item) => activeSourceKeys.has(item.source)))
                .slice(0, 6)
                .map((item) => (
                  <div key={item.source} className="rounded-xl bg-zinc-50 p-4">
                    <p className="text-xs font-medium text-zinc-900">{item.source}</p>
                    <div className="mt-2 space-y-1 text-xs text-zinc-600">
                      <p>starts {item.checkoutStarts} · completes {item.checkoutCompletes}</p>
                      <p>dropoff {item.checkoutDropoff} · completion {(item.checkoutCompletionRate * 100).toFixed(1)}%</p>
                      <p>purchases {item.purchases24h}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">Open recommendations</p>
            <div className="mt-4 max-h-[18rem] space-y-2 overflow-auto pr-1">
              {activeRecommendations.length ? (
                activeRecommendations.map((item) => (
                  <div key={item.id} className="rounded-lg border border-zinc-200 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{item.reason}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {item.ruleId} · {item.status} · {item.context?.sourceKey ?? item.targetId}
                        </p>
                      </div>
                      <Link className="text-xs underline underline-offset-4" href={`/ops?status=open,in_progress&q=${encodeURIComponent(String(item.context?.sourceKey ?? item.targetId ?? ""))}`}>
                        Open queue
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-sm text-zinc-500">No open commerce recommendations for this source.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">Commerce proposals</p>
            <div className="mt-4 max-h-[18rem] space-y-2 overflow-auto pr-1">
              {activeProposals.length ? (
                activeProposals.map((item) => (
                  <div key={item.id} className="rounded-lg border border-zinc-200 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{item.summary ?? "commerce proposal"}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {item.status} · {item.targetId ?? "n/a"} · created {item.createdAt ?? "n/a"}
                        </p>
                      </div>
                      <Link className="text-xs underline underline-offset-4" href={`/ops/proposals/${item.id}`}>
                        Open proposal
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-sm text-zinc-500">No commerce proposals for this source.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 text-xs text-zinc-500">
              <span>
                Raw commerce events: {events.total} · showing {events.items.length} · offset {offset}
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
            <div className="max-h-[24rem] divide-y divide-zinc-200 overflow-auto">
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
                <div className="px-4 py-8 text-sm text-zinc-500">No commerce governance events found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
