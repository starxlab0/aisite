import Link from "next/link";
import { getOpsAuthStatus } from "@/lib/control-plane/ops";

export const dynamic = "force-dynamic";

export default async function OpsRunbookPage() {
  const auth = await getOpsAuthStatus();
  const canPublish = Array.isArray(auth.capabilities) && auth.capabilities.includes("publish_content");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Ops runbook</h1>
          <p className="mt-2 text-sm text-zinc-600">试运行值班说明：先看哪里、哪些按钮能点、异常时先回哪一页。</p>
          <p className="mt-2 text-xs text-zinc-500">
            role {auth.role} · capabilities {auth.capabilities.join(", ") || "none"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Back to ops
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Open monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/playbooks">
            Open playbooks
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/checklist">
            Open checklist
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/feedback">
            Open feedback
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Start here</p>
        <p className="mt-2 text-sm text-zinc-700">每天先打开 `Monitoring`，先看 `Today’s best bet`，再看 `Weekly operating review`，最后再进入 `Playbooks` 处理更长周期的复用动作。</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Daily flow</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
            <li>在 `Today’s best bet` 看当前最值得处理的一条。</li>
            <li>如果卡片上有 `nextAction` 主按钮，优先点它。</li>
            <li>如果没有现成 application，可先用 `Apply playbook` 生成一条 application draft。</li>
            <li>如果涉及 promotion / proposal / repo 变更，确认权限后再提交。</li>
          </ol>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Weekly flow</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
            <li>在 `Weekly operating review` 看 `playbookDrafts` 与 `nextWeekBets`。</li>
            <li>优先处理 `P0 / P1 / P2` 的 playbook 或 application。</li>
            <li>对进入 `observing` 的条目持续跟踪，再决定 `succeeded` 或 `regressed`。</li>
            <li>在 `/ops/playbooks` 里统一处理筛选、排序和批量值班视图。</li>
          </ol>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Permission guide</p>
        <div className="mt-3 space-y-2 text-sm text-zinc-700">
          <p>`Read-only`：可以查看 monitoring、playbooks、proposal/repo 明细，也可以打开 PR、运行记录和详情页，但不能做会改变状态的提交。</p>
          <p>`publish_content`：可以执行 playbook apply、application lifecycle transition、proposal approve/reject/applied，以及 repo publish 相关动作。</p>
          {!canPublish ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              你当前没有 `publish_content`，页面上会显示只读提示，关键提交按钮会被禁用。
            </p>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              你当前拥有 `publish_content`，提交前仍应先确认目标对象、状态和回退路径。
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">When something fails</p>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          <li>`Permission / operation error`：先看页面顶部的 role/capabilities，确认是否只是权限不足。</li>
          <li>`Application transition failed`：回到 playbook detail 或 `/ops/playbooks`，确认当前状态是否允许下一跳。</li>
          <li>`Promotion failed`：回到 `Monitoring` 查看反馈条，再从 proposal / repo queue 对应详情继续排查。</li>
          <li>`Repo action failed`：先去 `/ops` 主工作台看 repo publish queue，再打开 PR / run / revert PR 链接。</li>
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Example incidents</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">1. Permission / operation error</p>
            <p className="mt-2 text-xs text-amber-800">你会看到：页面顶部出现 permission / operation error，关键按钮是灰的。</p>
            <p className="mt-1 text-xs text-amber-800">最常见原因：当前账号没有 `publish_content`。</p>
            <p className="mt-1 text-xs text-amber-800">第一跳：留在当前页，先看顶部 `role + capabilities`。如果确认是只读，不要重复点按钮。</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-900">2. Application transition failed</p>
            <p className="mt-2 text-xs text-rose-800">你会看到：`/ops/playbooks` 或 playbook detail 返回 transition failed。</p>
            <p className="mt-1 text-xs text-rose-800">最常见原因：当前 application 状态不允许直接跳到目标状态。</p>
            <p className="mt-1 text-xs text-rose-800">第一跳：打开对应 playbook，确认 latest application 当前是 `draft / in_review / executed / observing / regressed` 中哪一档，再按允许的下一跳继续。</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
            <p className="text-sm font-medium text-sky-900">3. Promotion failed</p>
            <p className="mt-2 text-xs text-sky-800">你会看到：Monitoring 反馈条提示 promotion failed 或 error。</p>
            <p className="mt-1 text-xs text-sky-800">最常见原因：proposal / repo change 当前状态不满足 promotion 条件，或权限不足。</p>
            <p className="mt-1 text-xs text-sky-800">第一跳：回到 `Monitoring` 看 feedback 条，再去 `/ops` 主工作台里的 proposal / repo queue 查对应对象详情。</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">4. Repo action failed</p>
            <p className="mt-2 text-xs text-zinc-700">你会看到：`Create PR` / `Sync GitHub` / `Create revert PR` 返回失败。</p>
            <p className="mt-1 text-xs text-zinc-700">最常见原因：GitHub 侧状态还没同步、PR 已存在、或当前 change 不在允许的下一步。</p>
            <p className="mt-1 text-xs text-zinc-700">第一跳：回到 `/ops` 主工作台的 repo publish queue，先看 recommended next step，再打开 PR / workflow run / revert PR 链接核对现状。</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Quick links</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/playbooks">
            Playbooks
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/checklist">
            Checklist
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/feedback">
            Feedback
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops?type=product">
            Product queue
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/audit?action=publish">
            Publish audit
          </Link>
        </div>
      </div>
    </div>
  );
}
