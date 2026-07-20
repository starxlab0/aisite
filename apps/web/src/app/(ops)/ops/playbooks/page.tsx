import Link from "next/link";
import { getOpsAuthStatus, listOpsPlaybooks, transitionOpsPlaybookApplication } from "@/lib/control-plane/ops";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getString(sp: Record<string, string | string[] | undefined>, key: string) {
  return typeof sp[key] === "string" ? (sp[key] as string) : undefined;
}

function statusMeta(status: string) {
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
    map[status] ?? {
      priority: "P3",
      label: status,
      badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-700",
      cardBorderClassName: "border-zinc-200",
    }
  );
}

export default async function OpsPlaybooksIndexPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const msg = getString(sp, "msg");
  const err = getString(sp, "err");
  const sourceFilter = getString(sp, "source") ?? "";
  const targetTypeFilter = getString(sp, "targetType") ?? "";
  const statusFilter = getString(sp, "status") ?? "";
  const statusGroupFilter = getString(sp, "statusGroup") ?? "";
  const auth = await getOpsAuthStatus();
  const canPublish = Array.isArray(auth.capabilities) && auth.capabilities.includes("publish_content");
  const { items, total } = await listOpsPlaybooks({ limit: 50 });
  const sourceOptions = Array.from(new Set(items.map((pb: any) => String(pb.source || "")).filter(Boolean))).sort();
  const targetTypeOptions = Array.from(new Set(items.map((pb: any) => String(pb.targetType || "")).filter(Boolean))).sort();
  const statusOptions = Array.from(
    new Set([
      ...items
        .map((pb: any) =>
          Array.isArray(pb.applications) && pb.applications.length ? String(pb.applications[0]?.status || "") : "",
        )
        .filter(Boolean),
      "no_application",
    ]),
  ).sort();
  const latestStatusCounts = items.reduce(
    (acc: Record<string, number>, pb: any) => {
      const status =
        Array.isArray(pb.applications) && pb.applications.length ? String(pb.applications[0]?.status || "no_application") : "no_application";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const filteredItems = items
    .filter((pb: any) => {
    const latestApplication = Array.isArray(pb.applications) && pb.applications.length ? pb.applications[0] : null;
    const latestStatus = latestApplication ? String(latestApplication.status || "") : "";
    if (sourceFilter && String(pb.source || "") !== sourceFilter) return false;
    if (targetTypeFilter && String(pb.targetType || "") !== targetTypeFilter) return false;
    if (statusFilter) {
      if (statusFilter === "no_application") return latestApplication == null;
      if (latestStatus !== statusFilter) return false;
    }
    if (statusGroupFilter) {
      if (statusGroupFilter === "in_progress") {
        return ["in_review", "executed", "observing"].includes(latestStatus);
      }
      if (statusGroupFilter === "no_application") {
        return latestApplication == null;
      }
    }
    return true;
    })
    .slice()
    .sort((a: any, b: any) => {
      const aLatest = Array.isArray(a.applications) && a.applications.length ? a.applications[0] : null;
      const bLatest = Array.isArray(b.applications) && b.applications.length ? b.applications[0] : null;
      const aStatus = aLatest ? String(aLatest.status || "") : "no_application";
      const bStatus = bLatest ? String(bLatest.status || "") : "no_application";
      const priority: Record<string, number> = {
        observing: 0,
        executed: 1,
        in_review: 2,
        draft: 3,
        regressed: 4,
        succeeded: 5,
        cancelled: 6,
        no_application: 7,
      };
      const aP = priority[aStatus] ?? 99;
      const bP = priority[bStatus] ?? 99;
      if (aP !== bP) return aP - bP;
      const aTime = String(aLatest?.updatedAt || aLatest?.createdAt || a.updatedAt || a.createdAt || "");
      const bTime = String(bLatest?.updatedAt || bLatest?.createdAt || b.updatedAt || b.createdAt || "");
      return bTime.localeCompare(aTime);
    });

  async function onTransitionApplication(formData: FormData) {
    "use server";
    const playbookId = String(formData.get("playbookId") ?? "");
    const applicationId = String(formData.get("applicationId") ?? "");
    const nextStatus = String(formData.get("nextStatus") ?? "");
    if (!playbookId || !applicationId || !nextStatus) {
      redirect("/ops/playbooks?err=Invalid%20application%20transition");
    }
    try {
      await transitionOpsPlaybookApplication(playbookId, applicationId, {
        status: nextStatus as any,
      });
      redirect(`/ops/playbooks?msg=${encodeURIComponent(`application ${applicationId} -> ${nextStatus}`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Application transition failed";
      redirect(`/ops/playbooks?err=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Playbooks</h1>
          <p className="mt-2 text-sm text-zinc-600">从 weekly winning patterns 自动生成并可复用的一组执行模板。</p>
          <p className="mt-2 text-xs text-zinc-500">
            total {total} · showing {filteredItems.length}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            role {auth.role} · capabilities {auth.capabilities.join(", ") || "none"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Back to monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Back to ops
          </Link>
        </div>
      </div>

      {msg ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div> : null}
      {err ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}
      {!canPublish ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have read-only access. Applying playbooks and transitioning applications require the `publish_content` capability.
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/ops/playbooks" className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Total playbooks</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{total}</p>
          <p className="mt-1 text-xs text-zinc-600">all visible templates</p>
        </Link>
        <Link href="/ops/playbooks?status=no_application" className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">No application</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{latestStatusCounts.no_application ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-600">ready to be applied</p>
        </Link>
        <Link href="/ops/playbooks?statusGroup=in_progress" className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">In progress</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            {(latestStatusCounts.in_review ?? 0) + (latestStatusCounts.executed ?? 0) + (latestStatusCounts.observing ?? 0)}
          </p>
          <p className="mt-1 text-xs text-zinc-600">active applications</p>
        </Link>
        <Link href="/ops/playbooks?status=succeeded" className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Succeeded</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{latestStatusCounts.succeeded ?? 0}</p>
          <p className="mt-1 text-xs text-zinc-600">latest application reached success</p>
        </Link>
      </div>

      <form method="GET" className="mt-6 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-zinc-700">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Source</span>
            <select name="source" defaultValue={sourceFilter} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="">All sources</option>
              {sourceOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-700">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Target type</span>
            <select name="targetType" defaultValue={targetTypeFilter} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="">All target types</option>
              {targetTypeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-700">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Latest status</span>
            <select name="status" defaultValue={statusFilter} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="">All latest statuses</option>
              {statusOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {statusGroupFilter ? <input type="hidden" name="statusGroup" value={statusGroupFilter} /> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
            Apply filters
          </button>
          <Link href="/ops/playbooks" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
            Reset
          </Link>
        </div>
      </form>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {filteredItems.map((pb: any) => (
          <div
            key={pb.id}
            className={`rounded-2xl border bg-white px-5 py-4 ${
              statusMeta(
                Array.isArray(pb.applications) && pb.applications.length
                  ? String(pb.applications[0]?.status || "no_application")
                  : "no_application",
              ).cardBorderClassName
            }`}
          >
            {(() => {
              const latestApplication =
                Array.isArray(pb.applications) && pb.applications.length ? pb.applications[0] : null;
              const nextAction = latestApplication?.nextAction ?? null;
              const latestStatus = latestApplication ? String(latestApplication.status || "") : "no_application";
              const meta = statusMeta(latestStatus);
              return (
                <>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Playbook</p>
            <p className="mt-1 text-lg font-medium text-zinc-900">{pb.title}</p>
            <p className="mt-1 text-xs text-zinc-600">
              key {pb.key} · status {pb.status} · source {pb.source || "n/a"} · targetType {pb.targetType || "n/a"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">updated {pb.updatedAt ?? pb.createdAt ?? "n/a"}</p>
            {latestApplication ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs text-zinc-600">
                  latest application {latestApplication.id} · {latestApplication.status}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${meta.badgeClassName}`}>
                    {meta.priority} · {meta.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">created {latestApplication.createdAt}</p>
                {nextAction ? (
                  <p className="mt-1 text-xs text-zinc-600">next {nextAction.actionLabel}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {latestApplication.status === "draft" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={pb.id} />
                      <input type="hidden" name="applicationId" value={latestApplication.id} />
                      <input type="hidden" name="nextStatus" value="in_review" />
                      <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                        Mark in review
                      </button>
                    </form>
                  ) : null}
                  {latestApplication.status === "in_review" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={pb.id} />
                      <input type="hidden" name="applicationId" value={latestApplication.id} />
                      <input type="hidden" name="nextStatus" value="executed" />
                      <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                        Mark executed
                      </button>
                    </form>
                  ) : null}
                  {latestApplication.status === "executed" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={pb.id} />
                      <input type="hidden" name="applicationId" value={latestApplication.id} />
                      <input type="hidden" name="nextStatus" value="observing" />
                      <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                        Start observing
                      </button>
                    </form>
                  ) : null}
                  {latestApplication.status === "observing" ? (
                    <>
                      <form action={onTransitionApplication}>
                        <input type="hidden" name="playbookId" value={pb.id} />
                        <input type="hidden" name="applicationId" value={latestApplication.id} />
                        <input type="hidden" name="nextStatus" value="succeeded" />
                        <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                          Mark succeeded
                        </button>
                      </form>
                      <form action={onTransitionApplication}>
                        <input type="hidden" name="playbookId" value={pb.id} />
                        <input type="hidden" name="applicationId" value={latestApplication.id} />
                        <input type="hidden" name="nextStatus" value="regressed" />
                        <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                          Mark regressed
                        </button>
                      </form>
                    </>
                  ) : null}
                  {latestApplication.status === "regressed" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={pb.id} />
                      <input type="hidden" name="applicationId" value={latestApplication.id} />
                      <input type="hidden" name="nextStatus" value="in_review" />
                      <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                        Re-open review
                      </button>
                    </form>
                  ) : null}
                  {latestApplication.status !== "cancelled" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={pb.id} />
                      <input type="hidden" name="applicationId" value={latestApplication.id} />
                      <input type="hidden" name="nextStatus" value="cancelled" />
                      <button disabled={!canPublish} type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusMeta("no_application").badgeClassName}`}>
                  {statusMeta("no_application").priority} · {statusMeta("no_application").label}
                </span>
                <p className="text-xs text-zinc-500">No applications yet.</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {nextAction ? (
                <Link className="inline-flex rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white" href={nextAction.actionPath}>
                  {nextAction.actionLabel}
                </Link>
              ) : null}
              <Link className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs" href={`/ops/playbooks/${pb.id}`}>
                Open playbook
              </Link>
            </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>
      {!filteredItems.length ? <div className="mt-6 rounded-2xl border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-600">No playbooks match the current filters.</div> : null}
    </div>
  );
}
