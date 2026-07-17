import Link from "next/link";
import { applyOpsPlaybook, getOpsPlaybook, transitionOpsPlaybookApplication } from "@/lib/control-plane/ops";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getString(sp: Record<string, string | string[] | undefined>, key: string) {
  return typeof sp[key] === "string" ? (sp[key] as string) : undefined;
}

export default async function OpsPlaybookPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const msg = getString(sp, "msg");
  const err = getString(sp, "err");
  const playbook = await getOpsPlaybook(id);

  async function onApplyPlaybook(formData: FormData) {
    "use server";
    const playbookId = String(formData.get("playbookId") ?? "");
    const source = String(formData.get("source") ?? "");
    const applyTargetType = String(formData.get("applyTargetType") ?? "");
    const applyTargetId = String(formData.get("applyTargetId") ?? "");
    const applyTargetLabel = String(formData.get("applyTargetLabel") ?? "");
    if (!playbookId) redirect(`/ops/playbooks/${id}?err=Invalid%20playbook%20apply`);
    try {
      const result = await applyOpsPlaybook(playbookId, {
        source: source || undefined,
        targetType: applyTargetType || undefined,
        targetId: applyTargetId || undefined,
        targetLabel: applyTargetLabel || undefined,
        note: "applied from playbook detail",
      });
      redirect(`/ops/playbooks/${id}?msg=${encodeURIComponent(`application ${result.application.id} created`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Playbook apply failed";
      redirect(`/ops/playbooks/${id}?err=${encodeURIComponent(message)}`);
    }
  }

  async function onTransitionApplication(formData: FormData) {
    "use server";
    const playbookId = String(formData.get("playbookId") ?? "");
    const applicationId = String(formData.get("applicationId") ?? "");
    const nextStatus = String(formData.get("nextStatus") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!playbookId || !applicationId || !nextStatus) {
      redirect(`/ops/playbooks/${id}?err=Invalid%20application%20transition`);
    }
    try {
      await transitionOpsPlaybookApplication(playbookId, applicationId, {
        status: nextStatus as any,
        note: note || undefined,
      });
      redirect(`/ops/playbooks/${id}?msg=${encodeURIComponent(`application ${applicationId} -> ${nextStatus}`)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Application transition failed";
      redirect(`/ops/playbooks/${id}?err=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Playbook</h1>
          <p className="mt-2 text-sm text-zinc-600">从 winning patterns 自动生成的可复用执行模板。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops/monitoring">
            Back to monitoring
          </Link>
        </div>
      </div>

      {msg ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div> : null}
      {err ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div> : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Title</p>
        <p className="mt-1 text-lg font-medium text-zinc-900">{playbook.title}</p>
        <p className="mt-2 text-sm text-zinc-600">
          key {playbook.key} · status {playbook.status} · updated {playbook.updatedAt ?? playbook.createdAt}
        </p>
        <form action={onApplyPlaybook} className="mt-4">
          <input type="hidden" name="playbookId" value={playbook.id} />
          <input type="hidden" name="source" value={playbook.source ?? ""} />
          <input type="hidden" name="applyTargetType" value={playbook.targetType ?? ""} />
          <input type="hidden" name="applyTargetId" value="" />
          <input type="hidden" name="applyTargetLabel" value={playbook.title} />
          <button type="submit" className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
            Apply playbook
          </button>
        </form>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Observation</p>
        <p className="mt-2 text-sm text-zinc-700">window {playbook.observationWindow}</p>
        {Array.isArray(playbook.observationMetrics) && playbook.observationMetrics.length ? (
          <p className="mt-1 text-sm text-zinc-700">metrics {playbook.observationMetrics.join(" · ")}</p>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Steps</p>
        <div className="mt-3 grid gap-3">
          {(Array.isArray(playbook.steps) ? playbook.steps : []).map((step: any) => (
            <div key={step.code} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <p className="text-sm font-medium text-zinc-900">{step.label}</p>
              <p className="mt-1 text-xs text-zinc-600">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {Array.isArray(playbook.examples) && playbook.examples.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Examples</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {playbook.examples.map((ex: any, index: number) => (
              <div key={`${ex.targetLabel ?? ex.headline}:${index}`} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs text-zinc-600">count {ex.count ?? 1}</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">{ex.targetLabel ?? "n/a"}</p>
                <p className="mt-1 text-xs text-zinc-600">{ex.headline ?? ""}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {Array.isArray(playbook.applications) && playbook.applications.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Applications</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {playbook.applications.map((app: any) => (
              <div key={app.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs text-zinc-600">{app.createdAt}</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">{app.targetLabel || app.targetType || "application draft"}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {app.source} · {app.targetType} · status {app.status}
                </p>
                {Array.isArray(app.observationMetrics) && app.observationMetrics.length ? (
                  <p className="mt-1 text-xs text-zinc-600">watch {app.observationMetrics.join(" · ")}</p>
                ) : null}
                {app.nextAction ? (
                  <>
                    <p className="mt-2 text-xs text-zinc-600">next action {app.nextAction.actionLabel}</p>
                    <p className="mt-1 text-xs text-zinc-600">{app.nextAction.description}</p>
                    <div className="mt-3">
                      <Link href={app.nextAction.actionPath} className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                        {app.nextAction.actionLabel}
                      </Link>
                    </div>
                  </>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {app.status === "draft" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={playbook.id} />
                      <input type="hidden" name="applicationId" value={app.id} />
                      <input type="hidden" name="nextStatus" value="in_review" />
                      <button type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                        Mark in review
                      </button>
                    </form>
                  ) : null}
                  {app.status === "in_review" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={playbook.id} />
                      <input type="hidden" name="applicationId" value={app.id} />
                      <input type="hidden" name="nextStatus" value="executed" />
                      <button type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                        Mark executed
                      </button>
                    </form>
                  ) : null}
                  {app.status === "executed" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={playbook.id} />
                      <input type="hidden" name="applicationId" value={app.id} />
                      <input type="hidden" name="nextStatus" value="observing" />
                      <button type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                        Start observing
                      </button>
                    </form>
                  ) : null}
                  {app.status === "observing" ? (
                    <>
                      <form action={onTransitionApplication}>
                        <input type="hidden" name="playbookId" value={playbook.id} />
                        <input type="hidden" name="applicationId" value={app.id} />
                        <input type="hidden" name="nextStatus" value="succeeded" />
                        <button type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                          Mark succeeded
                        </button>
                      </form>
                      <form action={onTransitionApplication}>
                        <input type="hidden" name="playbookId" value={playbook.id} />
                        <input type="hidden" name="applicationId" value={app.id} />
                        <input type="hidden" name="nextStatus" value="regressed" />
                        <button type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                          Mark regressed
                        </button>
                      </form>
                    </>
                  ) : null}
                  {app.status === "regressed" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={playbook.id} />
                      <input type="hidden" name="applicationId" value={app.id} />
                      <input type="hidden" name="nextStatus" value="in_review" />
                      <button type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                        Re-open review
                      </button>
                    </form>
                  ) : null}
                  {app.status !== "cancelled" ? (
                    <form action={onTransitionApplication}>
                      <input type="hidden" name="playbookId" value={playbook.id} />
                      <input type="hidden" name="applicationId" value={app.id} />
                      <input type="hidden" name="nextStatus" value="cancelled" />
                      <button type="submit" className="inline-flex rounded-lg border border-zinc-200 px-3 py-1.5 text-xs">
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
