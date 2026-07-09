import Link from "next/link";
import { redirect } from "next/navigation";
import { ackCustomerNotification, getOpsAuthStatus, listCustomerNotifications, sendCustomerNotification } from "@/lib/control-plane/ops";
import { GovernanceBadge } from "../components/governance-ui";

export const dynamic = "force-dynamic";

function toneForNotify(status: string) {
  if (status === "sent") return "ready";
  if (status === "pending") return "progress";
  if (status === "skipped") return "neutral";
  if (status === "failed") return "warning";
  return "neutral";
}

export default async function CustomerNotificationsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getOpsAuthStatus();
  const canManage = auth.capabilities.includes("manage_recommendations");
  const searchParams = (await props.searchParams) ?? {};
  const status = typeof searchParams.status === "string" ? searchParams.status : "open";
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const data = await listCustomerNotifications({ status: status as "open" | "acked", q: q || undefined, limit: 80 });

  function redirectToList(err?: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (err) params.set("err", err);
    redirect(`/ops/customer-notifications${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function onAck(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!id) return;
    try {
      await ackCustomerNotification(id, { note: note || undefined });
      redirectToList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ack failed";
      redirectToList(message);
    }
  }

  async function onSend(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    try {
      await sendCustomerNotification(id);
      redirectToList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      redirectToList(message);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Customer notification queue</h1>
          <p className="mt-2 text-sm text-zinc-600">需要对用户触达/召回的通知任务，默认人工确认后发送。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link className="underline underline-offset-4" href="/ops/monitoring">
            Back to monitoring
          </Link>
          <Link className="underline underline-offset-4" href="/ops">
            Back to Ops
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <form action="/ops/customer-notifications" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-600">
            <span>Status</span>
            <select name="status" defaultValue={status} className="h-10 rounded-md border border-zinc-200 px-3 text-sm">
              <option value="open">open</option>
              <option value="acked">acked</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-600">
            <span>Search</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="order/email/kind"
              className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
            />
          </label>
          <button type="submit" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50">
            Apply filters
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white">
        {data.items.length ? (
          <div className="divide-y divide-zinc-200">
            {data.items.map((n) => (
              <div key={n.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {n.kind} · order {n.orderId} · to {n.to} · last {n.lastSeenAt}
                    </p>
                  </div>
                  {n.notify ? (
                    <GovernanceBadge label={n.notify.status} tone={toneForNotify(n.notify.status)} />
                  ) : (
                    <GovernanceBadge label="pending" tone="progress" />
                  )}
                </div>
                <p className="mt-3 text-sm text-zinc-700">{n.detail}</p>
                {n.actionUrl ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    action:{" "}
                    <Link className="underline underline-offset-4" href={n.actionUrl}>
                      Open order
                    </Link>
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-zinc-500">
                  related:{" "}
                  <Link
                    className="underline underline-offset-4"
                    href={`/ops/support-cases?status=open&q=${encodeURIComponent(String(n.orderId))}`}
                  >
                    Find support cases
                  </Link>
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={onSend}>
                    <input type="hidden" name="id" value={n.id} />
                    <button
                      disabled={!canManage}
                      type="submit"
                      className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </form>
                  <form action={onAck} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={n.id} />
                    <input
                      name="note"
                      placeholder="ack 备注（可选）"
                      className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
                    />
                    <button
                      disabled={!canManage}
                      type="submit"
                      className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Ack
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <p className="text-sm text-zinc-600">No open customer notifications.</p>
          </div>
        )}
      </div>
    </div>
  );
}
