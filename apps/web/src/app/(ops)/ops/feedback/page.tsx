import Link from "next/link";
import { createOpsTrialFeedback, getOpsAuthStatus, getOpsEvents } from "@/lib/control-plane/ops";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getString(sp: Record<string, string | string[] | undefined>, key: string) {
  return typeof sp[key] === "string" ? (sp[key] as string) : undefined;
}

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest === "NEXT_REDIRECT" ||
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT;"))
  );
}

export default async function OpsFeedbackPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const msg = getString(sp, "msg");
  const err = getString(sp, "err");
  const auth = await getOpsAuthStatus();
  const feedback = await getOpsEvents({ action: "trial_feedback", limit: 20 });

  async function onSubmitFeedback(formData: FormData) {
    "use server";
    const category = String(formData.get("category") ?? "").trim();
    const mostBlockedStep = String(formData.get("mostBlockedStep") ?? "").trim();
    const easiestToMisclick = String(formData.get("easiestToMisclick") ?? "").trim();
    const mostUnclearNextStep = String(formData.get("mostUnclearNextStep") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const page = String(formData.get("page") ?? "").trim();

    if (!category || !mostBlockedStep || !easiestToMisclick || !mostUnclearNextStep) {
      redirect("/ops/feedback?err=Please%20fill%20all%20required%20fields");
    }

    try {
      await createOpsTrialFeedback({
        category,
        mostBlockedStep,
        easiestToMisclick,
        mostUnclearNextStep,
        note: note || undefined,
        page: page || undefined,
      });
      redirect("/ops/feedback?msg=Feedback%20saved");
    } catch (error) {
      if (isNextRedirectError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Feedback submit failed";
      redirect(`/ops/feedback?err=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Trial feedback</h1>
          <p className="mt-2 text-sm text-zinc-600">把试运行里最真实的卡点直接记在系统里，方便后续统一复盘。</p>
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
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/checklist">
            Open checklist
          </Link>
        </div>
      </div>

      {msg ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div> : null}
      {err ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <form action={onSubmitFeedback} className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">New feedback</p>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm text-zinc-700">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Category</span>
              <select name="category" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                <option value="daily_flow">Daily flow</option>
                <option value="weekly_review">Weekly review</option>
                <option value="playbook_ops">Playbook ops</option>
                <option value="proposal_repo">Proposal / repo</option>
                <option value="permissions">Permissions</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Most blocked step</span>
              <input
                name="mostBlockedStep"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="例如：不知道先在 Monitoring 还是 Playbooks 里处理"
              />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Easiest to misclick</span>
              <input
                name="easiestToMisclick"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="例如：Apply playbook 和 Open playbook 太近"
              />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Most unclear next step</span>
              <input
                name="mostUnclearNextStep"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="例如：application 进入 observing 后该去哪里继续看"
              />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Page</span>
              <input name="page" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="/ops/monitoring" />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Note</span>
              <textarea
                name="note"
                rows={4}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="补充上下文，例如发生在哪一条 bet / playbook / proposal 上。"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">
              Save feedback
            </button>
            <Link href="/ops/runbook" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              Back to runbook
            </Link>
          </div>
        </form>

        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Recent feedback</p>
          <div className="mt-4 space-y-3">
            {feedback.items.length ? (
              feedback.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <p className="text-xs text-zinc-500">{item.at} · {item.actor}</p>
                  <p className="mt-2 text-sm text-zinc-800">{item.note}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-600">No trial feedback yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
