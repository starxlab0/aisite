import Link from "next/link";
import { getOpsEvents } from "@/lib/control-plane/ops";

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

export default async function OpsAuditPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const targetType = getString(sp, "targetType");
  const targetId = getString(sp, "targetId");
  const action = getString(sp, "action");
  const actor = getString(sp, "actor");
  const q = getString(sp, "q");
  const offset = toInt(getString(sp, "offset"), 0);
  const limit = Math.min(200, Math.max(20, toInt(getString(sp, "limit"), 50)));

  const data = await getOpsEvents({ targetType, targetId, action, actor, q, offset, limit });

  const nextOffset = offset + limit < data.total ? offset + limit : null;
  const prevOffset = offset - limit >= 0 ? offset - limit : null;

  const baseParams = new URLSearchParams();
  if (targetType) baseParams.set("targetType", targetType);
  if (targetId) baseParams.set("targetId", targetId);
  if (action) baseParams.set("action", action);
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
          <p className="mt-2 text-sm text-zinc-600">按 target / action / actor 过滤，支持全文搜索（q）。</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" href="/ops">
            Back to ops
          </Link>
        </div>
      </div>

      <form className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <div className="divide-y divide-zinc-200">
          {data.items.length ? (
            data.items.map((event) => {
              const href = event.target
                ? event.target.type === "faq" && event.target.id.includes(":")
                  ? `/ops/faq/${event.target.id.split(":")[0]}/${event.target.id.split(":")[1]}`
                  : `/ops/${event.target.type}/${event.target.id}`
                : null;
              return (
                <div key={event.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{event.action}</p>
                      <p className="mt-1 text-xs text-zinc-500">{event.at}</p>
                    </div>
                    <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{actorLabel(event.actor)}</span>
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

