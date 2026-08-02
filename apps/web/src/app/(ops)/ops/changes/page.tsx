import Link from "next/link";
import { getOpsDraft, getOpsRepoChange, listOpsChangeRequests } from "@/lib/control-plane/ops";

export default async function OpsChangeRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const lane = typeof sp.lane === "string" ? sp.lane : undefined;
  const actionableOnly = typeof sp.actionable === "string" ? sp.actionable === "1" : false;

  const { items: allItems } = await listOpsChangeRequests({ limit: 200 });

  type BoardItem = {
    id: string;
    title: string;
    summary: string;
    status: string;
    lane?: string;
    label: string;
    query?: string | null;
    href: string;
    execution?: {
      draftId?: string | null;
      repoChangeId?: string | null;
      detailHref?: string | null;
      lastAction?: string | null;
    } | null;
  };

  const laneCounts = (allItems as BoardItem[]).reduce(
    (acc, item) => {
      const key = item.lane || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const items = (allItems as BoardItem[]).filter((item) => (lane ? item.lane === lane : true));

  type EnrichedItem = BoardItem & {
    bucket: {
      key:
        | "needs_execution"
        | "draft_draft"
        | "draft_needs_review"
        | "draft_approved"
        | "draft_published"
        | "repo_draft"
        | "repo_in_progress"
        | "repo_merge_candidate"
        | "repo_merged"
        | "done"
        | "other";
      title: string;
      hint: string;
    };
    nextAction?: { label: string; href: string } | null;
    linked: {
      draft?: { id: string; status: string } | null;
      repoChange?: { id: string; status: string; prNumber?: number | null; ciStatus?: string | null } | null;
    };
  };

  function bucketForDraftStatus(status: string | null | undefined): EnrichedItem["bucket"] {
    if (!status) return { key: "other", title: "其他", hint: "需要进一步确认" };
    if (status === "draft") return { key: "draft_draft", title: "草稿待完善", hint: "补内容后提交审核" };
    if (status === "needs_review") return { key: "draft_needs_review", title: "等待审核", hint: "进入详情完成 review" };
    if (status === "approved") return { key: "draft_approved", title: "等待发布", hint: "进入详情执行发布" };
    if (status === "published") return { key: "draft_published", title: "已发布", hint: "观察验证与回滚信号" };
    return { key: "other", title: "其他", hint: "需要进一步确认" };
  }

  function bucketForRepoStatus(status: string | null | undefined): EnrichedItem["bucket"] {
    if (!status) return { key: "other", title: "其他", hint: "需要进一步确认" };
    if (status === "draft") return { key: "repo_draft", title: "等待开 PR", hint: "开 PR 并进入 review" };
    if (status === "pr_opened" || status === "ci_running" || status === "ci_passed")
      return { key: "repo_in_progress", title: "PR/CI 进行中", hint: "等待 review / CI / merge" };
    if (status === "merge_candidate" || status === "auto_merge_candidate")
      return { key: "repo_merge_candidate", title: "准备合并", hint: "进入发布中心推进 merge" };
    if (status === "merged") return { key: "repo_merged", title: "已合并", hint: "观察部署与回滚信号" };
    return { key: "other", title: "其他", hint: "需要进一步确认" };
  }

  const enriched: EnrichedItem[] = await Promise.all(
    (items as BoardItem[]).map(async (item) => {
      const draft =
        item.execution?.draftId ? await getOpsDraft(item.execution.draftId).catch(() => null) : null;
      const repoChange =
        item.execution?.repoChangeId
          ? await getOpsRepoChange(item.execution.repoChangeId).catch(() => null)
          : null;

      const detailHref = `/ops/changes/${item.id}`;

      if (draft) {
        const bucket = bucketForDraftStatus(draft.status);
        const draftHref =
          item.execution?.detailHref && item.execution?.draftId
            ? `${item.execution.detailHref}?draft=${item.execution.draftId}`
            : null;
        const publishHref = draftHref ? `${draftHref}&intent=publish` : null;
        const nextAction =
          draft.status === "approved" && publishHref
            ? { label: "进入发布", href: publishHref }
            : draft.status === "needs_review" && draftHref
              ? { label: "进入审核", href: draftHref }
              : draftHref
                ? { label: "打开草稿", href: draftHref }
                : { label: "打开变更单", href: detailHref };

        return {
          ...item,
          bucket,
          nextAction,
          linked: { draft: { id: draft.id, status: draft.status }, repoChange: null },
        };
      }

      if (repoChange) {
        const bucket = bucketForRepoStatus(repoChange.status);
        const nextAction =
          repoChange.status === "draft"
            ? { label: "开 PR", href: detailHref }
            : repoChange.status === "pr_opened" || repoChange.status === "ci_running"
              ? { label: "同步状态", href: detailHref }
              : { label: "打开发布中心", href: "/ops/queue" };

        return {
          ...item,
          bucket,
          nextAction,
          linked: {
            draft: null,
            repoChange: {
              id: repoChange.id,
              status: repoChange.status,
              prNumber: repoChange.prNumber ?? null,
              ciStatus: repoChange.ciStatus ?? null,
            },
          },
        };
      }

      const bucket: EnrichedItem["bucket"] =
        item.status === "cancelled" || item.status === "applied"
          ? { key: "done", title: "已完成/已关闭", hint: "无需继续处理" }
          : { key: "needs_execution", title: "待生成执行动作", hint: "先生成 draft 或 repo change" };

      const nextAction =
        bucket.key === "needs_execution"
          ? { label: "打开变更单", href: detailHref }
          : { label: "查看详情", href: detailHref };

      return {
        ...item,
        bucket,
        nextAction,
        linked: { draft: null, repoChange: null },
      };
    }),
  );

  const bucketOrder: EnrichedItem["bucket"]["key"][] = [
    "needs_execution",
    "draft_draft",
    "draft_needs_review",
    "draft_approved",
    "repo_draft",
    "repo_in_progress",
    "repo_merge_candidate",
    "draft_published",
    "repo_merged",
    "done",
    "other",
  ];

  const actionableBucketKeys: Set<EnrichedItem["bucket"]["key"]> = new Set([
    "needs_execution",
    "draft_draft",
    "draft_needs_review",
    "draft_approved",
    "repo_draft",
    "repo_in_progress",
    "repo_merge_candidate",
  ]);
  const visibleItems = actionableOnly ? enriched.filter((item) => actionableBucketKeys.has(item.bucket.key)) : enriched;

  const grouped = new Map<EnrichedItem["bucket"]["key"], { meta: EnrichedItem["bucket"]; items: EnrichedItem[] }>();
  for (const item of visibleItems) {
    const key = item.bucket.key;
    const current = grouped.get(key);
    if (current) current.items.push(item);
    else grouped.set(key, { meta: item.bucket, items: [item] });
  }

  const filterHref = (next: { lane?: string; actionable?: boolean }) => {
    const params = new URLSearchParams();
    const finalLane = typeof next.lane === "string" ? next.lane : lane;
    const finalActionable = typeof next.actionable === "boolean" ? next.actionable : actionableOnly;
    if (finalLane) params.set("lane", finalLane);
    if (finalActionable) params.set("actionable", "1");
    const query = params.toString();
    return query ? `/ops/changes?${query}` : "/ops/changes";
  };

  const laneFilters: Array<{ label: string; lane?: string }> = [
    { label: "全部" },
    { label: "商品", lane: "product" },
    { label: "内容", lane: "content" },
    { label: "页面运营", lane: "page" },
    { label: "站点策略", lane: "strategy" },
    { label: "发布", lane: "publish" },
    { label: "治理", lane: "governance" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">变更单</h1>
          <p className="mt-2 text-sm text-zinc-600">
            这里按执行状态把变更单整理成看板：你可以直接看到当前卡在草稿、审核、发布或 repo change 的哪一步。
          </p>
        </div>
        <Link href="/ops" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
          返回工作台
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {laneFilters.map((item) => {
              const active = (item.lane ?? "") === (lane ?? "");
              const count = item.lane ? laneCounts[item.lane] || 0 : (allItems as BoardItem[]).length;
              return (
                <Link
                  key={item.label}
                  href={filterHref({ lane: item.lane })}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {item.label} <span className={active ? "text-white/80" : "text-zinc-500"}>· {count}</span>
                </Link>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={filterHref({ actionable: !actionableOnly })}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                actionableOnly
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              只看需要我处理的
            </Link>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          当前过滤：{lane ? `lane=${lane}` : "全部"} · {actionableOnly ? "只看需要处理" : "包含全部状态"}
        </p>
      </div>

      <div className="mt-8 space-y-8">
        {visibleItems.length ? (
          bucketOrder
            .map((key) => grouped.get(key))
            .filter(Boolean)
            .map((group) => (
              <div key={group!.meta.key}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {group!.meta.title} <span className="text-zinc-500">· {group!.items.length}</span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">{group!.meta.hint}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {group!.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-zinc-200 bg-white p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <Link href={`/ops/changes/${item.id}`} className="text-sm font-medium text-zinc-900 underline underline-offset-4">
                            {item.title}
                          </Link>
                          <p className="mt-1 text-sm text-zinc-600">{item.summary}</p>
                        </div>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                          {item.status}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">{item.label}</span>
                        {item.query ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">query: {item.query}</span>
                        ) : null}
                        {item.linked.draft ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
                            draft: {item.linked.draft.status}
                          </span>
                        ) : null}
                        {item.linked.repoChange ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
                            repo: {item.linked.repoChange.status}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">{item.id}</span>
                      </div>

                      {item.nextAction ? (
                        <div className="mt-4">
                          <Link
                            href={item.nextAction.href}
                            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                          >
                            {item.nextAction.label}
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-sm text-zinc-600">
            还没有变更单。先回到工作台，用 AI 指令入口生成第一条变更单。
          </div>
        )}
      </div>
    </div>
  );
}
