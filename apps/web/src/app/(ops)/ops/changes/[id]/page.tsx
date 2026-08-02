import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createOpsRepoChange,
  generateOpsDraft,
  getOpsChangeRequest,
  getOpsDraft,
  getOpsRepoChange,
  openRepoChangePullRequest,
  syncRepoChange,
  submitOpsDraft,
  transitionOpsChangeRequest,
  updateOpsDraft,
} from "@/lib/control-plane/ops";
import { getChangeRequestExecutionTarget } from "@/lib/control-plane/change-request-execution";

export default async function OpsChangeRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getOpsChangeRequest(id);
  const executionTarget = getChangeRequestExecutionTarget(item);
  const executionDraftHref = item.execution?.detailHref && item.execution?.draftId ? `${item.execution.detailHref}?draft=${item.execution.draftId}` : null;
  const executionDraftPublishHref = executionDraftHref ? `${executionDraftHref}&intent=publish` : null;
  const executionRepoChangeHint = item.execution?.repoChangeId ? `${item.execution.repoChangeId}${item.execution?.lastAction ? ` · ${item.execution.lastAction}` : ""}` : null;
  const [linkedDraft, linkedRepoChange] = await Promise.all([
    item.execution?.draftId ? getOpsDraft(item.execution.draftId).catch(() => null) : Promise.resolve(null),
    item.execution?.repoChangeId ? getOpsRepoChange(item.execution.repoChangeId).catch(() => null) : Promise.resolve(null),
  ]);

  async function onTransition(formData: FormData) {
    "use server";
    const status = String(formData.get("status") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    await transitionOpsChangeRequest(id, { status, note });
    redirect(`/ops/changes/${id}`);
  }

  async function onCreateExecutionDraft() {
    "use server";
    const fresh = await getOpsChangeRequest(id);
    const target = getChangeRequestExecutionTarget(fresh);
    if (!target) {
      redirect(`/ops/changes/${id}`);
    }
    if (target.mode !== "draft") {
      redirect(`/ops/changes/${id}`);
    }

    const draft = await generateOpsDraft(target.targetType, target.targetId);
    const patched = await updateOpsDraft(draft.id, target.patch);
    await transitionOpsChangeRequest(id, {
      status: "approved",
      note: `execution draft ${patched.id} created for ${target.targetType}:${target.targetId}`,
      patch: {
        execution: {
          draftId: patched.id,
          targetType: target.targetType,
          targetId: target.targetId,
          detailHref: target.detailHrefBase,
          lastAction: "draft_created",
        },
      },
    });
    redirect(`${target.detailHrefBase}?draft=${patched.id}`);
  }

  async function onCreateAndSubmitExecutionDraft() {
    "use server";
    const fresh = await getOpsChangeRequest(id);
    const target = getChangeRequestExecutionTarget(fresh);
    if (!target) {
      redirect(`/ops/changes/${id}`);
    }
    if (target.mode !== "draft") {
      redirect(`/ops/changes/${id}`);
    }

    const existingDraftId =
      fresh.execution?.draftId &&
      fresh.execution?.targetType === target.targetType &&
      fresh.execution?.targetId === target.targetId
        ? fresh.execution.draftId
        : null;

    const draft = existingDraftId
      ? { id: existingDraftId }
      : await generateOpsDraft(target.targetType, target.targetId);
    const patched = await updateOpsDraft(draft.id, target.patch);
    const submitted = await submitOpsDraft(patched.id);
    await transitionOpsChangeRequest(id, {
      status: "applied",
      note: `execution draft ${submitted.id} submitted for review`,
      patch: {
        execution: {
          draftId: submitted.id,
          targetType: target.targetType,
          targetId: target.targetId,
          detailHref: target.detailHrefBase,
          lastAction: "submitted_for_review",
        },
      },
    });
    redirect(`${target.detailHrefBase}?draft=${submitted.id}`);
  }

  async function onCreateRepoChangeExecution() {
    "use server";
    const fresh = await getOpsChangeRequest(id);
    const target = getChangeRequestExecutionTarget(fresh);
    if (!target) {
      redirect(`/ops/changes/${id}`);
    }
    if (target.mode !== "repo_change") {
      redirect(`/ops/changes/${id}`);
    }

    const repoChange = await createOpsRepoChange({
      kind: target.kind,
      title: target.title,
      summary: target.summary,
      trigger: "ai_change_request",
      branchName: target.branchName,
      targetType: target.targetType,
      targetId: target.targetId,
      siteConfigChange: target.siteConfigChange,
      linkedChangeRequestId: fresh.id,
      prDraft: {
        title: `chore(site): ${target.siteConfigChange.op} ${target.siteConfigChange.feature} for ${target.siteConfigChange.siteKeys.join(",")}`,
        checklist: [
          "确认目标站点与 feature 开关一致",
          "确认 sitemap 与导航是否需要同步验证",
          "部署后回归验证对应路由是否按预期开放/关闭",
        ],
      },
    });
    await transitionOpsChangeRequest(id, {
      status: "approved",
      note: `repo change ${repoChange.id} created for ${target.targetId}`,
      patch: {
        execution: {
          repoChangeId: repoChange.id,
          targetType: target.targetType,
          targetId: target.targetId,
          detailHref: target.detailHrefBase,
          lastAction: "repo_change_created",
        },
      },
    });
    redirect(target.detailHrefBase);
  }

  async function onOpenLinkedRepoPr() {
    "use server";
    const fresh = await getOpsChangeRequest(id);
    const repoChangeId = fresh.execution?.repoChangeId;
    if (!repoChangeId) {
      redirect(`/ops/changes/${id}`);
    }
    const result = await openRepoChangePullRequest(repoChangeId);
    await transitionOpsChangeRequest(id, {
      status: fresh.status,
      note: `repo change ${repoChangeId} open pr requested`,
      patch: {
        execution: {
          ...(fresh.execution ?? {}),
          repoChangeId,
          lastAction: result.result?.status || "pr_open_requested",
        },
      },
    });
    redirect(`/ops/changes/${id}`);
  }

  async function onSyncLinkedRepoChange() {
    "use server";
    const fresh = await getOpsChangeRequest(id);
    const repoChangeId = fresh.execution?.repoChangeId;
    if (!repoChangeId) {
      redirect(`/ops/changes/${id}`);
    }
    const result = await syncRepoChange(repoChangeId);
    await transitionOpsChangeRequest(id, {
      status: fresh.status,
      note: `repo change ${repoChangeId} synced`,
      patch: {
        execution: {
          ...(fresh.execution ?? {}),
          repoChangeId,
          lastAction: result.sync?.status || "repo_change_synced",
        },
      },
    });
    redirect(`/ops/changes/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">{item.id}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{item.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">{item.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/ops/changes" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
            返回变更单
          </Link>
          <Link href={item.href} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
            打开对应入口
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">当前状态</p>
          <p className="mt-2 text-sm font-medium text-zinc-900">{item.status}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">任务类型</p>
          <p className="mt-2 text-sm font-medium text-zinc-900">{item.label}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">查询词</p>
          <p className="mt-2 text-sm font-medium text-zinc-900">{item.query || "未提取到具体对象"}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">原始指令</p>
        <p className="mt-2 text-sm text-zinc-700">{item.prompt}</p>
      </div>

      {item.plan ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">拟执行动作</p>
            <p className="mt-3 text-sm text-zinc-700">
              {item.plan.kind}
              {item.plan.targetType ? ` · ${item.plan.targetType}` : ""}
              {item.plan.targetId ? ` · ${item.plan.targetId}` : ""}
            </p>
            {item.plan.sites?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.plan.sites.map((site) => (
                  <span key={site} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                    {site}
                  </span>
                ))}
              </div>
            ) : null}
            {item.plan.fields ? (
              <pre className="mt-4 overflow-auto rounded-xl bg-zinc-950 px-3 py-3 text-xs text-zinc-100">
                {JSON.stringify(item.plan.fields, null, 2)}
              </pre>
            ) : null}
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-900">影响与配合</p>
            <div className="mt-3">
              <p className="text-xs text-zinc-500">影响路径</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.plan.affectedPaths.map((path) => (
                  <span key={path} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                    {path}
                  </span>
                ))}
              </div>
            </div>
            {item.plan.risks.length ? (
              <div className="mt-4">
                <p className="text-xs text-zinc-500">风险提示</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-rose-700">
                  {item.plan.risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {item.plan.requires.length ? (
              <div className="mt-4">
                <p className="text-xs text-zinc-500">需要配合</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
                  {item.plan.requires.map((need) => (
                    <li key={need}>{need}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">状态流转</p>
        {(linkedDraft || linkedRepoChange) ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {linkedDraft ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">执行追踪 · Draft</p>
                    <p className="mt-1 text-xs text-zinc-500">{linkedDraft.id}</p>
                  </div>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700">
                    {linkedDraft.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">{linkedDraft.targetType}</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">{linkedDraft.targetId}</span>
                  {linkedDraft.review?.decision ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">review: {linkedDraft.review.decision}</span>
                  ) : null}
                  {linkedDraft.published?.verification?.level ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                      verification: {linkedDraft.published.verification.level}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-zinc-600">
                  {linkedDraft.status === "draft"
                    ? "草稿已创建，下一步建议补充内容后提交审核。"
                    : linkedDraft.status === "needs_review"
                      ? "草稿已提交审核，下一步建议进入详情页完成 review。"
                      : linkedDraft.status === "approved"
                        ? "草稿已审核通过，下一步建议进入详情页执行发布。"
                        : linkedDraft.status === "published"
                          ? "草稿已经发布，可继续关注验证和回滚信号。"
                          : "可继续打开目标详情页查看最新状态。"}
                </p>
                {executionDraftHref ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href={executionDraftHref} className="text-sm underline underline-offset-4">
                      打开 draft 详情
                    </Link>
                    {linkedDraft.status === "approved" && executionDraftPublishHref ? (
                      <Link href={executionDraftPublishHref} className="text-sm underline underline-offset-4">
                        进入发布
                      </Link>
                    ) : null}
                    {linkedDraft.status === "needs_review" ? (
                      <Link href={executionDraftHref} className="text-sm underline underline-offset-4">
                        进入审核
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {linkedRepoChange ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">执行追踪 · Repo change</p>
                    <p className="mt-1 text-xs text-zinc-500">{linkedRepoChange.id}</p>
                  </div>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700">
                    {linkedRepoChange.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                  {linkedRepoChange.prNumber ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">PR #{linkedRepoChange.prNumber}</span>
                  ) : null}
                  {linkedRepoChange.ciStatus ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">CI: {linkedRepoChange.ciStatus}</span>
                  ) : null}
                  {linkedRepoChange.recommendedNextStep?.label ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                      next: {linkedRepoChange.recommendedNextStep.label}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-zinc-600">
                  {linkedRepoChange.status === "draft"
                    ? "Repo change 已创建，下一步建议打开发布中心继续开 PR 或进入 review。"
                    : linkedRepoChange.status === "pr_opened" || linkedRepoChange.status === "ci_running"
                      ? "Repo change 已进入 PR / CI 流程，下一步建议继续跟踪构建和 review。"
                      : linkedRepoChange.status === "merge_candidate" || linkedRepoChange.status === "auto_merge_candidate"
                        ? "Repo change 已接近 merge 阶段，下一步建议在发布中心处理合并。"
                        : linkedRepoChange.status === "merged"
                          ? "Repo change 已合并，下一步建议继续观察部署后结果。"
                          : "可继续打开发布中心查看最新治理状态。"}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href="/ops/queue" className="text-sm underline underline-offset-4">
                    打开发布中心
                  </Link>
                  {linkedRepoChange.status === "draft" ? (
                    <form action={onOpenLinkedRepoPr}>
                      <button type="submit" className="text-sm underline underline-offset-4">
                        开 PR
                      </button>
                    </form>
                  ) : null}
                  {linkedRepoChange.status === "pr_opened" || linkedRepoChange.status === "ci_running" ? (
                    <form action={onSyncLinkedRepoChange}>
                      <button type="submit" className="text-sm underline underline-offset-4">
                        同步最新状态
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {executionTarget ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">执行适配器</p>
            <p className="mt-1 text-sm text-emerald-800">
              {executionTarget.mode === "draft"
                ? "这条变更单已经能自动生成下一步 draft，并预填识别到的 `siteKeys`。生成后会直接带你进入对应详情页继续审核和发布。"
                : "这条变更单会生成一条 repo change，请把站点策略变更纳入现有发布治理链，而不是直接改代码文件。"}
            </p>
            {executionTarget.mode === "draft" && executionDraftHref ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900">
                当前已关联 draft：<Link className="underline underline-offset-4" href={executionDraftHref}>{item.execution?.draftId}</Link>
                {item.execution?.lastAction ? ` · ${item.execution.lastAction}` : ""}
              </div>
            ) : null}
            {executionTarget.mode === "repo_change" && executionRepoChangeHint ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900">
                当前已关联 repo change：{executionRepoChangeHint}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              {executionTarget.mode === "draft" ? (
                <>
                  <form action={onCreateExecutionDraft}>
                    <button type="submit" className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-medium text-white">
                      生成执行草稿
                    </button>
                  </form>
                  <form action={onCreateAndSubmitExecutionDraft}>
                    <button type="submit" className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900">
                      生成并提交审核
                    </button>
                  </form>
                  {executionDraftHref ? (
                    <Link href={executionDraftHref} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700">
                      继续处理当前草稿
                    </Link>
                  ) : null}
                </>
              ) : (
                <>
                  <form action={onCreateRepoChangeExecution}>
                    <button type="submit" className="rounded-xl bg-emerald-900 px-4 py-2 text-sm font-medium text-white">
                      生成 repo change
                    </button>
                  </form>
                  <Link href="/ops/queue" className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700">
                    打开发布中心
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
            这条变更单当前还没有自动执行适配器。可以先用“打开对应入口”继续人工处理。
          </div>
        )}
        <form action={onTransition} className="mt-4 flex flex-col gap-3 md:flex-row">
          <select
            name="status"
            defaultValue={item.status}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="draft">draft</option>
            <option value="approved">approved</option>
            <option value="applied">applied</option>
            <option value="cancelled">cancelled</option>
          </select>
          <input
            name="note"
            type="text"
            placeholder="补一句备注，例如：已人工确认，准备进入商品后台"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
            更新状态
          </button>
        </form>
        <div className="mt-5 space-y-3">
          {(item.statusTimeline || []).map((entry, index) => (
            <div key={`${entry.label}-${entry.at}-${index}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-sm font-medium text-zinc-900">{entry.label}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {entry.at}
                {entry.by ? ` · ${entry.by}` : ""}
              </p>
              {entry.note ? <p className="mt-2 text-sm text-zinc-700">{entry.note}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
