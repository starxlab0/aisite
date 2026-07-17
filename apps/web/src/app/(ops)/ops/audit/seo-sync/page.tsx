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
  if (status === "healthy" || status === "recovered" || status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "degraded" || status === "still_failing" || status === "regressed" || status === "failure") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function actionLabel(action: string | null | undefined) {
  if (action === "retry_now") return "Retry now";
  if (action === "pause") return "Pause automation";
  if (action === "resume") return "Resume automation";
  if (action === "clear_backoff") return "Clear backoff";
  return action || "unknown";
}

function eventActionLabel(action: string) {
  const map: Record<string, string> = {
    seo_metrics_sync_search_console: "Sync succeeded",
    seo_metrics_sync_search_console_failed: "Sync failed",
    seo_metrics_sync_search_console_skipped: "Sync skipped",
    seo_metrics_sync_search_console_retry_now: "Manual retry",
    seo_metrics_sync_search_console_pause: "Pause automation",
    seo_metrics_sync_search_console_resume: "Resume automation",
    seo_metrics_sync_search_console_clear_backoff: "Clear backoff",
  };
  return map[action] ?? action;
}

export default async function OpsSeoSyncAuditPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const actor = getString(sp, "actor");
  const q = getString(sp, "q");
  const offset = Math.max(0, toInt(getString(sp, "offset"), 0));
  const limit = Math.min(100, Math.max(20, toInt(getString(sp, "limit"), 40)));

  const monitoring = await getMonitoringSummary({});
  const events = await getOpsEvents({
    actionPrefix: "seo_metrics_sync_search_console",
    actor,
    q,
    offset,
    limit,
  });

  const seoSync = monitoring.runtime.seoSync;
  const seoSyncHistory = monitoring.seoSyncHistory;
  const seoSyncControlAudit = monitoring.seoSyncControlAudit;
  const seoSyncRecoveryReview = monitoring.seoSyncRecoveryReview;

  const nextOffset = offset + limit < events.total ? offset + limit : null;
  const prevOffset = offset - limit >= 0 ? offset - limit : null;

  const pageLink = (newOffset: number) => {
    const params = new URLSearchParams();
    if (actor) params.set("actor", actor);
    if (q) params.set("q", q);
    params.set("limit", String(limit));
    params.set("offset", String(newOffset));
    return `/ops/audit/seo-sync?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">SEO sync audit</p>
          <p className="mt-2 text-sm text-zinc-600">
            把 Search Console sync 的运行历史、人工控制动作和恢复判断拆成独立视图，方便值班排障和复盘。
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Back to monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?actionPrefix=seo_metrics_sync_search_console">
            Raw audit log
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl border p-4 ${toneClass(seoSync.health)}`}>
          <p className="text-xs opacity-80">Sync health</p>
          <p className="mt-2 text-2xl font-semibold">{seoSync.healthLabel}</p>
          <p className="mt-1 text-xs opacity-80">{seoSync.healthDetail}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${toneClass(seoSyncRecoveryReview?.status)}`}>
          <p className="text-xs opacity-80">Recovery review</p>
          <p className="mt-2 text-2xl font-semibold">{seoSyncRecoveryReview?.label ?? "n/a"}</p>
          <p className="mt-1 text-xs opacity-80">{seoSyncRecoveryReview?.detail ?? "No recovery review available."}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Runs tracked</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{seoSyncHistory?.totalRunsTracked ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">
            success {seoSyncHistory?.statusCounts.success ?? 0} · failure {seoSyncHistory?.statusCounts.failure ?? 0} · skipped{" "}
            {seoSyncHistory?.statusCounts.skipped ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Manual actions tracked</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{seoSyncControlAudit?.totalActionsTracked ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-500">
            retry {seoSyncControlAudit?.actionCounts.retry_now ?? 0} · pause {seoSyncControlAudit?.actionCounts.pause ?? 0} · resume{" "}
            {seoSyncControlAudit?.actionCounts.resume ?? 0}
          </p>
        </div>
      </div>

      <form className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_120px]">
          <div>
            <label className="text-xs text-zinc-500">actor</label>
            <input
              name="actor"
              defaultValue={actor ?? ""}
              placeholder="operator:token:..."
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">q</label>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="search in sync notes / errors"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
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
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/seo-sync">
            Reset
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Monitoring
          </Link>
        </div>
      </form>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-900">Sync history</p>
              <p className="mt-1 text-xs text-zinc-500">
                最近成功、失败和 skipped 的分布，以及最近一次成功和失败的对照。
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 p-4">
              <p className="text-xs font-medium text-zinc-900">History summary</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                <p>latest success {seoSyncHistory?.latestSuccessRun?.at ?? "n/a"}</p>
                <p>latest failure {seoSyncHistory?.latestFailureRun?.at ?? "n/a"}</p>
                <p>latest skipped {seoSyncHistory?.latestSkippedRun?.at ?? "n/a"}</p>
                <p>failure streak started {seoSyncHistory?.firstFailureInCurrentStreak?.at ?? "n/a"}</p>
                <p>
                  latest failure category {seoSyncHistory?.comparison?.latestFailure?.category ?? "n/a"} · code{" "}
                  {seoSyncHistory?.comparison?.latestFailure?.code ?? "n/a"}
                </p>
                <p>
                  changed since last success {seoSyncHistory?.comparison?.changedSinceLastSuccess ? "yes" : "no"}
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-zinc-50 p-4">
              <p className="text-xs font-medium text-zinc-900">Recovery review</p>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                <p>status {seoSyncRecoveryReview?.label ?? "n/a"}</p>
                <p>{seoSyncRecoveryReview?.detail ?? "No review available."}</p>
                <p>latest action {actionLabel(seoSyncRecoveryReview?.latestAction?.action)}</p>
                <p>latest action at {seoSyncRecoveryReview?.latestAction?.at ?? "n/a"}</p>
                <p>next run {seoSyncRecoveryReview?.latestAction?.nextRun?.status ?? "n/a"}</p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-xs font-medium text-zinc-900">Recent runs</p>
          <div className="mt-2 max-h-[40rem] space-y-2 overflow-auto pr-1">
            {seoSyncHistory?.recentRuns?.length ? (
              seoSyncHistory.recentRuns.map((run, index) => (
                <div key={`${run.at}-${index}`} className="rounded-lg border border-zinc-200 px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={`text-xs font-medium ${run.status === "success" ? "text-emerald-700" : run.status === "failure" ? "text-rose-700" : "text-amber-700"}`}>
                        {run.status}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {run.at} · actor {run.actor ?? "n/a"}
                      </p>
                    </div>
                    <p className="text-xs text-zinc-500">
                      rows {run.fetchedRows} fetched · {run.ingestedRows} ingested
                    </p>
                  </div>
                  {run.request?.startDate || run.request?.endDate ? (
                    <p className="mt-2 text-xs text-zinc-600">
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
              <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-sm text-zinc-500">No sync runs recorded yet.</div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">Manual interventions</p>
            <p className="mt-1 text-xs text-zinc-500">把人工动作、动作说明和动作后的第一条 sync run 放在一起看。</p>
            <div className="mt-4 max-h-[28rem] space-y-2 overflow-auto pr-1">
              {seoSyncControlAudit?.recentActions?.length ? (
                seoSyncControlAudit.recentActions.map((item, index) => (
                  <div key={`${item.at}-${index}`} className="rounded-lg border border-zinc-200 px-3 py-3">
                    <p className="text-xs font-medium text-zinc-900">{actionLabel(item.action)}</p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {item.at ?? "n/a"} · actor {item.actor ?? "n/a"}
                    </p>
                    <p className={`mt-1 text-xs ${item.assessment?.status === "recovered" ? "text-emerald-700" : item.assessment?.status === "still_failing" || item.assessment?.status === "regressed" ? "text-rose-700" : "text-amber-700"}`}>
                      {item.assessment?.label ?? "n/a"} · {item.assessment?.detail ?? "n/a"}
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
                <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-sm text-zinc-500">No manual control actions recorded yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 text-xs text-zinc-500">
              <span>
                Raw sync events: {events.total} · showing {events.items.length} · offset {offset}
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
            <div className="max-h-[32rem] divide-y divide-zinc-200 overflow-auto">
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
                <div className="px-4 py-8 text-sm text-zinc-500">No sync events found.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
