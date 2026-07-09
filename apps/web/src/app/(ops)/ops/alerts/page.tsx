import Link from "next/link";
import { redirect } from "next/navigation";
import { ackOpsAlert, getOpsAuthStatus, listOpsAlerts, resendOpsAlert, syncIncidentFollowups } from "@/lib/control-plane/ops";
import { GovernanceBadge } from "../components/governance-ui";

export const dynamic = "force-dynamic";

function toneForLevel(level: string) {
  if (level === "critical") return "critical";
  if (level === "warning") return "warning";
  return "neutral";
}

export default async function OpsAlertsPage() {
  const auth = await getOpsAuthStatus();
  const canAck = auth.capabilities.includes("manage_recommendations");
  const canSync = auth.capabilities.includes("run_batch_snapshot");
  const data = await listOpsAlerts({ status: "open", limit: 80 });

  async function onSync() {
    "use server";
    try {
      await syncIncidentFollowups({ limit: 15 });
      redirect("/ops/alerts");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync incidents failed";
      redirect(`/ops/alerts?err=${encodeURIComponent(message)}`);
    }
  }

  async function onAck(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!id) return;
    try {
      await ackOpsAlert(id, { note: note || undefined });
      redirect("/ops/alerts");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ack alert failed";
      redirect(`/ops/alerts?err=${encodeURIComponent(message)}`);
    }
  }

  async function onResend(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    try {
      await resendOpsAlert(id);
      redirect("/ops/alerts");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resend alert failed";
      redirect(`/ops/alerts?err=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Alert queue</h1>
          <p className="mt-2 text-sm text-zinc-600">落盘的 critical/warning 告警，供值班回看与确认。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <form action={onSync}>
            <button
              disabled={!canSync}
              className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
              type="submit"
            >
              Sync incidents
            </button>
          </form>
          <Link className="underline underline-offset-4" href="/ops/monitoring">
            Back to monitoring
          </Link>
          <Link className="underline underline-offset-4" href="/ops">
            Back to Ops
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white">
        {data.items.length ? (
          <div className="divide-y divide-zinc-200">
            {data.items.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{a.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {a.source} · seen {a.seenCount} · last {a.lastSeenAt}
                    </p>
                  </div>
                  <GovernanceBadge label={a.level} tone={toneForLevel(a.level)} />
                </div>
                <p className="mt-3 text-sm text-zinc-700">{a.detail}</p>
                {a.notify ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>notify:</span>
                    <GovernanceBadge
                      label={a.notify.status}
                      tone={a.notify.status === "sent" ? "ready" : a.notify.status === "pending" ? "progress" : a.notify.status === "skipped" ? "neutral" : "warning"}
                    />
                    <span>attempts {a.notify.attempts}</span>
                    {a.notify.lastAttemptAt ? <span>last attempt {a.notify.lastAttemptAt}</span> : null}
                    {a.notify.sentAt ? <span>sent {a.notify.sentAt}</span> : null}
                    {a.notify.lastError ? <span>error {a.notify.lastError}</span> : null}
                  </div>
                ) : null}
                {a.target?.type && a.target?.id ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    target:{" "}
                    <Link className="underline underline-offset-4" href={`/ops/${a.target.type}/${a.target.id}`}>
                      {a.target.type}:{a.target.id}
                    </Link>
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={onAck} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      name="note"
                      placeholder="ack 备注（可选）"
                      className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
                    />
                    <button
                      disabled={!canAck}
                      type="submit"
                      className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Ack
                    </button>
                  </form>
                  <form action={onResend}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      disabled={!canAck}
                      type="submit"
                      className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Resend
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <p className="text-sm text-zinc-600">No open alerts.</p>
          </div>
        )}
      </div>
    </div>
  );
}
