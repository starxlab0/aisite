import Link from "next/link";
import { redirect } from "next/navigation";
import { ackSupportCase, assignSupportCase, getOpsAuthStatus, listSupportCases, resolveSupportCase } from "@/lib/control-plane/ops";
import { GovernanceBadge } from "../components/governance-ui";

export const dynamic = "force-dynamic";

function toneForCase(severity: string, status: string) {
  if (status === "resolved") return "ready";
  if (severity === "critical") return "critical";
  if (status === "acked") return "progress";
  return "warning";
}

export default async function SupportCasesPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getOpsAuthStatus();
  const canManage = auth.capabilities.includes("manage_recommendations");
  const searchParams = (await props.searchParams) ?? {};
  const status = typeof searchParams.status === "string" ? searchParams.status : "open";
  const owner = typeof searchParams.owner === "string" ? searchParams.owner : "";
  const severity = typeof searchParams.severity === "string" ? searchParams.severity : "";
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const overdue = searchParams.overdue === "true";
  const data = await listSupportCases({
    status: status as "open" | "acked" | "resolved",
    owner: owner || undefined,
    severity: severity || undefined,
    q: q || undefined,
    overdue,
    limit: 80,
  });

  function redirectToList(err?: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (owner) params.set("owner", owner);
    if (severity) params.set("severity", severity);
    if (q) params.set("q", q);
    if (overdue) params.set("overdue", "true");
    if (err) params.set("err", err);
    redirect(`/ops/support-cases${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function onAssign(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const nextOwner = String(formData.get("owner") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    if (!id) return;
    try {
      await assignSupportCase(id, { owner: nextOwner || undefined, note: note || undefined });
      redirectToList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assign failed";
      redirectToList(message);
    }
  }

  async function onAck(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!id) return;
    try {
      await ackSupportCase(id, { note: note || undefined });
      redirectToList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ack failed";
      redirectToList(message);
    }
  }

  async function onResolve(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!id) return;
    try {
      await resolveSupportCase(id, { note: note || undefined });
      redirectToList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resolve failed";
      redirectToList(message);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Support case queue</h1>
          <p className="mt-2 text-sm text-zinc-600">把 payment / fulfillment / refund 的后链路风险汇总成客服或售后可承接的内部 case。</p>
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
        <form action="/ops/support-cases" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-600">
            <span>Status</span>
            <select name="status" defaultValue={status} className="h-10 rounded-md border border-zinc-200 px-3 text-sm">
              <option value="open">open</option>
              <option value="acked">acked</option>
              <option value="resolved">resolved</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-600">
            <span>Owner</span>
            <input name="owner" defaultValue={owner} placeholder="例如 ops-a" className="h-10 rounded-md border border-zinc-200 px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-600">
            <span>Severity</span>
            <select name="severity" defaultValue={severity} className="h-10 rounded-md border border-zinc-200 px-3 text-sm">
              <option value="">all</option>
              <option value="critical">critical</option>
              <option value="warning">warning</option>
              <option value="info">info</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-600">
            <span>Search</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="target/order/owner/title"
              className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" name="overdue" value="true" defaultChecked={overdue} />
            overdue only
          </label>
          <button type="submit" className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50">
            Apply filters
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Link className="rounded-2xl border border-zinc-200 bg-white p-4" href={`/ops/support-cases?status=${encodeURIComponent(status)}`}>
          <p className="text-xs text-zinc-500">Filtered total</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{data.summary.total}</p>
        </Link>
        <Link className="rounded-2xl border border-zinc-200 bg-white p-4" href={`/ops/support-cases?status=${encodeURIComponent(status)}&overdue=true`}>
          <p className="text-xs text-zinc-500">Overdue</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{data.summary.overdue}</p>
        </Link>
        <Link className="rounded-2xl border border-zinc-200 bg-white p-4" href={`/ops/support-cases?status=${encodeURIComponent(status)}&owner=unassigned`}>
          <p className="text-xs text-zinc-500">Unassigned</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{data.summary.unassigned}</p>
        </Link>
        <Link className="rounded-2xl border border-zinc-200 bg-white p-4" href={`/ops/support-cases?status=${encodeURIComponent(status)}&severity=critical`}>
          <p className="text-xs text-zinc-500">Critical</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{data.summary.critical}</p>
        </Link>
      </div>

      {data.summary.byOwner.length ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium text-zinc-900">Owner load</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.summary.byOwner.map((item) => (
              <Link
                key={`${item.owner || "unassigned"}:${item.count}`}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600"
                href={`/ops/support-cases?status=${encodeURIComponent(status)}${item.owner ? `&owner=${encodeURIComponent(item.owner)}` : ""}`}
              >
                {(item.owner || "unassigned") as string} · {item.count}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white">
        {data.items.length ? (
          <div className="divide-y divide-zinc-200">
            {data.items.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.kind} · {item.target?.type ?? "target"} {item.target?.id ?? "n/a"} · last {item.lastSeenAt}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      owner {item.owner || "unassigned"} · SLA {item.sla?.hours ?? "n/a"}h
                      {item.sla?.dueAt ? ` · due ${item.sla.dueAt}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.sla?.overdue ? <GovernanceBadge label="overdue" tone="critical" /> : null}
                    <GovernanceBadge label={item.status} tone={toneForCase(item.severity, item.status)} />
                  </div>
                </div>
                <p className="mt-3 text-sm text-zinc-700">{item.detail}</p>
                {item.targetPath ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    action:{" "}
                    <Link className="underline underline-offset-4" href={item.targetPath}>
                      Open linked view
                    </Link>
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                  {item.context?.parentProposalId ? (
                    <Link className="underline underline-offset-4" href={`/ops/proposals/${String(item.context.parentProposalId)}`}>
                      Open proposal
                    </Link>
                  ) : null}
                  {item.context?.orderId ? (
                    <Link className="underline underline-offset-4" href={`/order/${encodeURIComponent(String(item.context.orderId))}`}>
                      Open order
                    </Link>
                  ) : null}
                  {item.context?.orderId ? (
                    <Link
                      className="underline underline-offset-4"
                      href={`/ops/customer-notifications?status=open&q=${encodeURIComponent(String(item.context.orderId))}`}
                    >
                      Find notifications
                    </Link>
                  ) : null}
                  {!item.owner && item.suggestedOwner ? <span>suggested owner {item.suggestedOwner}</span> : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={onAssign} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      name="owner"
                      defaultValue={item.owner ?? ""}
                      placeholder="assign owner"
                      className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
                    />
                    <input
                      name="note"
                      placeholder="assign 备注（可选）"
                      className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
                    />
                    <button
                      disabled={!canManage}
                      type="submit"
                      className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Assign
                    </button>
                  </form>
                  {!item.owner && item.suggestedOwner ? (
                    <form action={onAssign}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="owner" value={item.suggestedOwner} />
                      <input type="hidden" name="note" value="assigned from suggested owner" />
                      <button
                        disabled={!canManage}
                        type="submit"
                        className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Assign suggested
                      </button>
                    </form>
                  ) : null}
                  <form action={onAck} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={item.id} />
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
                  <form action={onResolve} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input
                      name="note"
                      placeholder="resolve 备注（可选）"
                      className="h-10 rounded-md border border-zinc-200 px-3 text-sm"
                    />
                    <button
                      disabled={!canManage}
                      type="submit"
                      className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <p className="text-sm text-zinc-600">No open support cases.</p>
          </div>
        )}
      </div>
    </div>
  );
}
