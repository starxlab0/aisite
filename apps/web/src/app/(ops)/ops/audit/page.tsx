import Link from "next/link";
import { getOpsEvents } from "@/lib/control-plane/ops";
import { GovernanceBadge, governanceToneClass } from "../components/governance-ui";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getString(sp: Record<string, any>, key: string) {
  return typeof sp[key] === "string" ? (sp[key] as string) : undefined;
}

function toInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function actorLabel(actor: string) {
  if (!actor) return "anonymous";
  const [role, rest] = actor.split(":token:");
  if (rest) return `${role} · token:${rest}`;
  return actor;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    auto_action_policy_update: "Auto-action policy update",
    auto_merge_gate_allow: "Auto-merge gate allow",
    auto_merge_gate_hold: "Auto-merge gate hold",
    auto_revert_gate_allow: "Auto-revert gate allow",
    auto_revert_gate_hold: "Auto-revert gate hold",
    repo_change_ready_for_review: "Repo change ready for review",
    repo_change_auto_merge_candidate: "Repo change auto-merge candidate",
    repo_change_auto_merged: "Repo change auto-merged",
    repo_change_revert_candidate: "Repo change revert candidate",
  };
  return map[action] ?? action;
}

// governanceTone 已统一到共享组件 `governance-ui.tsx`

function governanceStateForEvent(event: any) {
  if (event.action === "publish") {
    if (event?.verification?.level === "blocked") {
      return { label: "需要立即处理", tone: "critical" };
    }
    if (event?.verification?.level === "warning") {
      return { label: "可观察后重发", tone: "progress" };
    }
  }
  if (event.action === "rollback") {
    if (event.trigger === "auto" || event.triggerReason === "verification-warning-threshold") {
      return { label: "暂停发布中", tone: "warning" };
    }
    return { label: "需要立即处理", tone: "critical" };
  }
  if (event.action === "repo_change_ready_for_review") {
    return { label: "需要立即审核", tone: "ready" };
  }
  if (event.action === "repo_change_auto_merge_candidate") {
    return { label: "等待外部结果", tone: "progress" };
  }
  if (event.action === "repo_change_revert_candidate") {
    return { label: "需要立即处理", tone: "critical" };
  }
  if (event.action.startsWith("auto_merge_gate_") || event.action.startsWith("auto_revert_gate_")) {
    return event.action.endsWith("_hold")
      ? { label: "暂停发布中", tone: "warning" }
      : { label: "等待外部结果", tone: "progress" };
  }
  return { label: "继续排查", tone: "warning" };
}

export default async function OpsAuditPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const category = getString(sp, "category");
  const targetType = getString(sp, "targetType");
  const targetId = getString(sp, "targetId");
  const action = getString(sp, "action");
  const actionPrefix = getString(sp, "actionPrefix");
  const actor = getString(sp, "actor");
  const q = getString(sp, "q");
  const offset = toInt(getString(sp, "offset"), 0);
  const limit = Math.min(200, Math.max(20, toInt(getString(sp, "limit"), 50)));

  const data = await getOpsEvents({ category, targetType, targetId, action, actionPrefix, actor, q, offset, limit });
  const governanceCounts = data.items.reduce(
    (acc, event) => {
      const state = governanceStateForEvent(event);
      acc[state.label] = (acc[state.label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const nextOffset = offset + limit < data.total ? offset + limit : null;
  const prevOffset = offset - limit >= 0 ? offset - limit : null;

  const baseParams = new URLSearchParams();
  if (category) baseParams.set("category", category);
  if (targetType) baseParams.set("targetType", targetType);
  if (targetId) baseParams.set("targetId", targetId);
  if (action) baseParams.set("action", action);
  if (actionPrefix) baseParams.set("actionPrefix", actionPrefix);
  if (actor) baseParams.set("actor", actor);
  if (q) baseParams.set("q", q);
  baseParams.set("limit", String(limit));

  const pageLink = (newOffset: number) => {
    const p = new URLSearchParams(baseParams);
    p.set("offset", String(newOffset));
    return `/ops/audit?${p.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">Audit log</p>
          <p className="mt-2 text-sm text-zinc-600">按 category / target / action / actor 过滤，支持推荐巡检视角与全文搜索（q）。</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Back to ops
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/commerce">
            Commerce audit
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/seo-sync">
            SEO sync audit
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/result-governance">
            Result governance audit
          </Link>
        </div>
      </div>

      <form className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <div>
            <label className="text-xs text-zinc-500">category</label>
            <select name="category" defaultValue={category ?? ""} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option value="">all</option>
              <option value="auto-action">auto-action</option>
              <option value="gate">gate</option>
              <option value="repo-publish">repo-publish</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">targetType</label>
            <input
              name="targetType"
              defaultValue={targetType ?? ""}
              placeholder="product / collection / faq"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">targetId</label>
            <input
              name="targetId"
              defaultValue={targetId ?? ""}
              placeholder="kokocang-x"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">action</label>
            <input
              name="action"
              defaultValue={action ?? ""}
              placeholder="publish / review / rollback ..."
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">actionPrefix</label>
            <input
              name="actionPrefix"
              defaultValue={actionPrefix ?? ""}
              placeholder="auto_merge_gate_"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">actor</label>
            <input
              name="actor"
              defaultValue={actor ?? ""}
              placeholder="publisher:token:xxxx…"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">q</label>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="全文搜索"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">
            Apply
          </button>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit">
            Reset
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?category=auto-action">
            Auto-action
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?category=gate">
            Gate only
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?category=gate&q=hold">
            Gate holds
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?category=gate&q=allow">
            Gate allows
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?action=repo_change_auto_merged">
            Auto merges
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?action=auto_action_policy_update">
            Policy updates
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/commerce">
            Commerce audit
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/seo-sync">
            SEO sync audit
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit/result-governance">
            Result governance audit
          </Link>
        </div>
      </form>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 text-xs text-zinc-500">
          <span>
            Total: {data.total} · Showing {data.items.length} · offset {offset}
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
        <div className="grid gap-4 border-b border-zinc-200 px-4 py-4 sm:grid-cols-5">
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">需要立即审核</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{governanceCounts["需要立即审核"] ?? 0}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">需要立即处理</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{governanceCounts["需要立即处理"] ?? 0}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">暂停发布中</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{governanceCounts["暂停发布中"] ?? 0}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">等待外部结果</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{governanceCounts["等待外部结果"] ?? 0}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">继续排查</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{governanceCounts["继续排查"] ?? 0}</p>
          </div>
        </div>
        <div className="divide-y divide-zinc-200">
          {data.items.length ? (
            data.items.map((event) => {
              const href = event.target
                ? event.target.type === "faq" && event.target.id.includes(":")
                  ? `/ops/faq/${event.target.id.split(":")[0]}/${event.target.id.split(":")[1]}`
                  : `/ops/${event.target.type}/${event.target.id}`
                : null;
              const governanceState = governanceStateForEvent(event);
              return (
                <div key={event.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{actionLabel(event.action)}</p>
                      <p className="mt-1 text-xs text-zinc-500">{event.action}</p>
                      <p className="mt-1 text-xs text-zinc-500">{event.at}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <GovernanceBadge label={governanceState.label} tone={governanceState.tone} className="py-1" />
                      <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{actorLabel(event.actor)}</span>
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
                  {event.action === "publish" && event.verification?.level ? (
                    <p className="mt-1 text-xs text-zinc-500">verification: {event.verification.level}</p>
                  ) : null}
                  {event.action === "rollback" && (event.trigger || event.triggerReason) ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      rollback: {event.trigger ?? "manual"}
                      {event.triggerReason ? ` · ${event.triggerReason}` : ""}
                    </p>
                  ) : null}
                  {event.draftId ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      draft: <code className="rounded bg-zinc-100 px-1">{event.draftId}</code>
                    </p>
                  ) : null}
                  {event.note ? <p className="mt-1 text-xs text-zinc-500">{event.note}</p> : null}
                  {event.previewUrl ? <p className="mt-1 text-xs text-zinc-500">{event.previewUrl}</p> : null}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-sm text-zinc-600">No events found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
