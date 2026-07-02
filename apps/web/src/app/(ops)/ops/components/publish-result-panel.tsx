type DraftPublishMeta = {
  at?: string;
  contentRef?: string;
  linkedDocuments?: Array<{ id: string; type: string; targetId: string; mode?: string }>;
  revalidate?: {
    ok: boolean;
    skipped?: boolean;
    requested?: string[];
    revalidated?: string[];
    reason?: string;
  } | null;
  verification?: {
    ok: boolean;
    skipped?: boolean;
    level?: "pass" | "warning" | "blocked" | "skipped";
    summary?: string;
    reason?: string;
    requested?: string[];
    results?: Array<{
      path: string;
      ok: boolean;
      statusCode: number;
      title?: string;
      description?: string;
      checks?: Record<string, boolean>;
    }>;
  } | null;
  snapshotBeforeIds?: string[];
  autoRollback?: {
    status: string;
    rollbackFromRef?: string | null;
    rollbackToRef?: string | null;
    publishedRef?: string | null;
    trigger?: "auto" | "manual";
    triggerReason?: string | null;
  } | null;
} | null;

type OpsEventMeta = {
  at: string;
  action: string;
  linkedDocuments?: Array<{ id: string; type: string; targetId: string; mode?: string }>;
  revalidate?: {
    ok: boolean;
    skipped?: boolean;
    requested?: string[];
    revalidated?: string[];
    reason?: string;
  } | null;
  verification?: {
    ok: boolean;
    skipped?: boolean;
    level?: "pass" | "warning" | "blocked" | "skipped";
    summary?: string;
    reason?: string;
    requested?: string[];
    results?: Array<{
      path: string;
      ok: boolean;
      statusCode: number;
      title?: string;
      description?: string;
      checks?: Record<string, boolean>;
    }>;
  } | null;
  trigger?: "auto" | "manual";
  triggerReason?: string | null;
  sourceDraftId?: string | null;
  sourceContentRef?: string | null;
  note?: string;
};

function renderLinkedDocuments(items?: Array<{ id: string; type: string; targetId: string; mode?: string }>) {
  if (!items?.length) return <p className="mt-2 text-xs text-zinc-500">linked docs: none</p>;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-zinc-500">linked docs</p>
      {items.map((item) => (
        <p key={`${item.id}:${item.mode ?? "na"}`} className="text-xs text-zinc-700">
          <code className="rounded bg-zinc-100 px-1">{item.type}</code> · {item.targetId} · {item.mode ?? "n/a"}
        </p>
      ))}
    </div>
  );
}

function renderRevalidate(revalidate?: {
  ok: boolean;
  skipped?: boolean;
  requested?: string[];
  revalidated?: string[];
  reason?: string;
} | null) {
  if (!revalidate) return <p className="mt-2 text-xs text-zinc-500">revalidate: none</p>;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-zinc-500">
        revalidate: <span className="text-zinc-700">{revalidate.ok ? "ok" : "failed"}</span>
        {revalidate.skipped ? " · skipped" : ""}
        {revalidate.reason ? ` · ${revalidate.reason}` : ""}
      </p>
      {revalidate.requested?.length ? (
        <p className="text-xs text-zinc-700">requested: {revalidate.requested.join(" · ")}</p>
      ) : null}
      {revalidate.revalidated?.length ? (
        <p className="text-xs text-zinc-700">done: {revalidate.revalidated.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function renderVerification(verification?: {
  ok: boolean;
  skipped?: boolean;
  level?: "pass" | "warning" | "blocked" | "skipped";
  summary?: string;
  reason?: string;
  requested?: string[];
  results?: Array<{
    path: string;
    ok: boolean;
    statusCode: number;
    title?: string;
    description?: string;
    checks?: Record<string, boolean>;
  }>;
} | null) {
  if (!verification) return <p className="mt-2 text-xs text-zinc-500">verification: none</p>;
  const level = verification.level ?? (verification.ok ? "pass" : verification.skipped ? "skipped" : "warning");
  const tone =
    level === "pass"
      ? "text-emerald-700"
      : level === "blocked"
        ? "text-rose-700"
        : level === "warning"
          ? "text-amber-700"
          : "text-zinc-700";
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-zinc-500">
        verification: <span className={tone}>{level}</span>
        {verification.summary ? ` · ${verification.summary}` : verification.reason ? ` · ${verification.reason}` : ""}
      </p>
      {verification.requested?.length ? (
        <p className="text-xs text-zinc-700">requested: {verification.requested.join(" · ")}</p>
      ) : null}
      {verification.results?.length ? (
        <div className="space-y-1">
          {verification.results.map((item) => (
            <p key={item.path} className="text-xs text-zinc-700">
              {item.path} · {item.ok ? "ok" : "failed"} · {item.statusCode}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PublishResultPanel({
  published,
  latestRollback,
}: {
  published?: DraftPublishMeta;
  latestRollback?: OpsEventMeta | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-zinc-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Last publish</p>
        {published ? (
          <>
            <p className="mt-2 text-sm text-zinc-700">
              ref: <code className="rounded bg-white px-1">{published.contentRef ?? "n/a"}</code>
            </p>
            {published.at ? <p className="mt-1 text-xs text-zinc-500">at: {published.at}</p> : null}
            {published.snapshotBeforeIds?.length ? (
              <p className="mt-1 text-xs text-zinc-500">snapshot before: {published.snapshotBeforeIds.join(" · ")}</p>
            ) : null}
            {published.autoRollback ? (
              <div className="mt-2 space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs text-rose-800">
                  auto rollback: {published.autoRollback.triggerReason ?? "triggered"}
                </p>
                <p className="text-xs text-rose-700">
                  {published.autoRollback.rollbackFromRef ?? "n/a"} → {published.autoRollback.rollbackToRef ?? published.autoRollback.publishedRef ?? "n/a"}
                </p>
              </div>
            ) : null}
            {renderRevalidate(published.revalidate)}
            {renderVerification(published.verification)}
            {renderLinkedDocuments(published.linkedDocuments)}
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">No publish metadata yet.</p>
        )}
      </div>

      <div className="rounded-xl bg-zinc-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Last rollback</p>
        {latestRollback ? (
          <>
            <p className="mt-2 text-xs text-zinc-500">at: {latestRollback.at}</p>
            {latestRollback.trigger ? (
              <p className="mt-1 text-xs text-zinc-500">
                source: {latestRollback.trigger}
                {latestRollback.triggerReason ? ` · ${latestRollback.triggerReason}` : ""}
              </p>
            ) : null}
            {latestRollback.note ? <p className="mt-1 text-sm text-zinc-700">{latestRollback.note}</p> : null}
            {renderRevalidate(latestRollback.revalidate)}
            {renderVerification(latestRollback.verification)}
            {renderLinkedDocuments(latestRollback.linkedDocuments)}
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">No rollback event yet.</p>
        )}
      </div>
    </div>
  );
}
