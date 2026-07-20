import Link from "next/link";
import { getOpsAuthStatus } from "@/lib/control-plane/ops";

export const dynamic = "force-dynamic";

export default async function OpsChecklistPage() {
  const auth = await getOpsAuthStatus();
  const canPublish = Array.isArray(auth.capabilities) && auth.capabilities.includes("publish_content");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Trial checklist</h1>
          <p className="mt-2 text-sm text-zinc-600">试运行前最后核对页：确认权限、关键路径、回退方式和值班入口已经准备好。</p>
          <p className="mt-2 text-xs text-zinc-500">
            role {auth.role} · capabilities {auth.capabilities.join(", ") || "none"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Back to ops
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/runbook">
            Open runbook
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Open monitoring
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/feedback">
            Open feedback
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Go / no-go</p>
        <p className="mt-2 text-sm text-zinc-700">
          只有当 `Monitoring`、`Playbooks`、`Runbook` 都可访问，关键路径手工走通过一次，并且至少有一位拥有 `publish_content` 的值班同学在线时，才建议开始试运行。
        </p>
        {!canPublish ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            你当前没有 `publish_content`。你仍可参与试运行值班，但不能执行会改变状态的提交动作。
          </p>
        ) : (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            你当前拥有 `publish_content`，可以承担试运行期间的执行角色。
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Must complete</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            <li>确认至少一位值班账号拥有 `publish_content`。</li>
            <li>手工走通 `Today’s best bet` 到 `nextAction / Apply playbook`。</li>
            <li>手工走通 `Playbook` 到 `application lifecycle transition`。</li>
            <li>确认 `/ops/runbook` 已可访问，并让试运行同学读过一遍。</li>
            <li>确认 promotion / proposal / repo queue 的关键按钮在只读账号下是禁用的。</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Should complete</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-700">
            <li>确认 `Weekly operating review` 里的 playbook badges 与 nextAction 展示正常。</li>
            <li>在 `/ops/playbooks` 试一次筛选、排序和列表页内联 transition。</li>
            <li>确认一个 repo action 失败时，值班同学知道先回 `/ops` 主工作台。</li>
            <li>准备一条试运行群消息，告诉大家默认从 `Monitoring` 进入。</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Critical paths</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Path A</p>
            <p className="mt-1 text-xs text-zinc-700">Monitoring → Today’s best bet → nextAction / Apply playbook</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Path B</p>
            <p className="mt-1 text-xs text-zinc-700">Monitoring → Weekly operating review → playbookDrafts / nextWeekBets</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Path C</p>
            <p className="mt-1 text-xs text-zinc-700">Playbooks → latest application → lifecycle transition</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">Path D</p>
            <p className="mt-1 text-xs text-zinc-700">Ops workspace → proposal / repo queue → approve / sync / create PR</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">During trial</p>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          <li>默认从 `Monitoring` 进入，不要求所有人都先看 `/ops` 主工作台。</li>
          <li>优先处理 `P0 / P1 / P2` 的 playbook/application，不追求一次把所有卡片都清空。</li>
          <li>出现错误时先回 `Runbook` 的 `Example incidents` 对照，再决定是否需要开发介入。</li>
          <li>每天记录 3 件事：哪一步最卡、哪一步最容易点错、哪一步做完后最不确定接下来干嘛。</li>
        </ul>
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
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/runbook">
            Runbook
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/feedback">
            Feedback
          </Link>
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Ops workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
