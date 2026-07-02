import { getRuleTuningProposal } from "@/lib/control-plane/ops";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

function fmtRate(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function fmtPtsFromRate(value: number) {
  const pts = value * 100;
  return `${pts >= 0 ? "+" : ""}${pts.toFixed(2)} pts`;
}

export default async function OpsProposalDetailPage({ params }: Props) {
  const { id } = await params;
  let proposal;
  try {
    proposal = await getRuleTuningProposal(id);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/ops" className="underline underline-offset-2">
              Ops
            </Link>{" "}
            / Proposal
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            {proposal.id} · {proposal.type === "incident_followup" ? proposal.anomalyKind : proposal.ruleId}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {proposal.type === "incident_followup"
              ? proposal.summary ?? "Incident follow-up proposal"
              : proposal.ruleMeta?.description ?? "Rule tuning proposal"}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
          status · <span className="font-medium text-zinc-900">{proposal.status}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">{proposal.type === "incident_followup" ? "Anomaly" : "Rule kind"}</p>
          <p className="mt-2 text-sm font-medium text-zinc-900">
            {proposal.type === "incident_followup"
              ? `${proposal.anomalyKind ?? "incident"}${proposal.severity ? ` · ${proposal.severity}` : ""}`
              : `${proposal.ruleMeta?.kind ?? "unknown"}${proposal.ruleMeta?.rate ? ` · ${proposal.ruleMeta.rate}` : ""}`}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">{proposal.type === "incident_followup" ? "Occurrences" : "Effectiveness"}</p>
          <p className="mt-2 text-sm font-medium text-zinc-900">
            {proposal.type === "incident_followup"
              ? `${proposal.evaluated ?? 0} incidents`
              : `improved ${fmtRate(proposal.improvementRate)} · worsened ${fmtRate(proposal.worsenedRate)}`}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {proposal.type === "incident_followup" ? `last seen ${proposal.lastSeenAt ?? "n/a"}` : `evaluated ${proposal.evaluated}`}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs text-zinc-500">Scope</p>
          <p className="mt-2 text-sm font-medium text-zinc-900">
            {proposal.type === "incident_followup"
              ? `${proposal.targetType ?? "n/a"} · ${proposal.targetId ?? "n/a"}`
              : proposal.ruleMeta?.targetTypes?.join(" · ") || "n/a"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {proposal.type === "incident_followup"
              ? `linked draft ${proposal.linkedDraftId ?? "n/a"}`
              : `last seen ${proposal.lastSeenAt ?? "n/a"}`}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">Review summary</p>
        {proposal.reviewSummary ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-xl bg-zinc-50 px-3 py-3">
              <p className="text-sm font-medium text-zinc-900">{proposal.reviewSummary.headline}</p>
              <p className="mt-1 text-sm text-zinc-600">{proposal.reviewSummary.recommendation}</p>
            </div>
            {proposal.reviewSummary.signals?.length ? (
              <div className="space-y-2">
                {proposal.reviewSummary.signals.map((signal) => (
                  <p key={signal} className="text-sm text-zinc-700">
                    {signal}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No review summary yet.</p>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">{proposal.type === "incident_followup" ? "Repair summary" : "Config summary"}</p>
        <div className="mt-3 space-y-2 text-sm text-zinc-700">
          {proposal.type === "incident_followup" ? (
            <>
              <p>summary: <code className="rounded bg-zinc-100 px-1">{proposal.summary ?? "n/a"}</code></p>
              <p>linked draft: <code className="rounded bg-zinc-100 px-1">{proposal.linkedDraftId ?? "n/a"}</code></p>
              <p>linked recommendation: <code className="rounded bg-zinc-100 px-1">{proposal.linkedRecommendationId ?? "n/a"}</code></p>
            </>
          ) : (
            <>
              <p>current: <code className="rounded bg-zinc-100 px-1">{proposal.currentConfigSummary ?? "n/a"}</code></p>
              <p>suggested: <code className="rounded bg-zinc-100 px-1">{proposal.suggestedConfigSummary ?? "n/a"}</code></p>
              {proposal.appliedConfigSummary ? <p>applied: <code className="rounded bg-zinc-100 px-1">{proposal.appliedConfigSummary}</code></p> : null}
            </>
          )}
        </div>
        <p className="mt-3 text-sm text-zinc-600">impact: {proposal.expectedImpact}</p>
        {proposal.applyHowTo ? <p className="mt-2 text-xs text-zinc-500">how to: {proposal.applyHowTo}</p> : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">Status timeline</p>
          <div className="mt-4 space-y-3">
            {(proposal.statusTimeline ?? []).map((item) => (
              <div key={`${item.label}:${item.at}`} className="rounded-xl bg-zinc-50 px-3 py-2">
                <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {item.at} {item.by ? `· ${item.by}` : ""}
                </p>
                {item.note ? <p className="mt-1 text-xs text-zinc-600">{item.note}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">{proposal.type === "incident_followup" ? "Incident context" : "Config validation"}</p>
          {proposal.type === "incident_followup" ? (
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <p>target: {proposal.targetType}:{proposal.targetId}</p>
              <p>severity: {proposal.severity ?? "warning"}</p>
              <p>last seen: {proposal.lastSeenAt ?? "n/a"}</p>
            </div>
          ) : proposal.appliedConfigCheck ? (
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <p>
                status: <span className="font-medium text-zinc-900">{proposal.appliedConfigCheck.status}</span>
              </p>
              <p>{proposal.appliedConfigCheck.reason}</p>
              {proposal.appliedConfigCheck.diff ? (
                <div className="space-y-1 text-xs text-zinc-600">
                  {proposal.appliedConfigCheck.diff.missingKeys?.length ? (
                    <p>missing keys: {proposal.appliedConfigCheck.diff.missingKeys.join(", ")}</p>
                  ) : null}
                  {proposal.appliedConfigCheck.diff.extraKeys?.length ? (
                    <p>extra keys: {proposal.appliedConfigCheck.diff.extraKeys.join(", ")}</p>
                  ) : null}
                  {Object.keys(proposal.appliedConfigCheck.diff.mismatched ?? {}).length ? (
                    <p>
                      mismatched:{" "}
                      {Object.entries(proposal.appliedConfigCheck.diff.mismatched)
                        .map(([key, value]) => `${key} (${JSON.stringify(value.applied)} != ${JSON.stringify(value.current)})`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No applied config check yet.</p>
          )}
          {proposal.ruleMeta?.validation?.warnings?.length ? (
            <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {proposal.ruleMeta.validation.warnings.join(" · ")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm font-medium text-zinc-900">{proposal.type === "incident_followup" ? "Next action" : "Post-apply review"}</p>
          {proposal.type === "incident_followup" ? (
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <p>{proposal.reviewSummary?.recommendation ?? "Prepare a repair draft before the next publish."}</p>
              <p>
                source: draft {proposal.sourceDraftId ?? "n/a"} · ref {proposal.sourceContentRef ?? "n/a"}
              </p>
            </div>
          ) : proposal.postApplyEffect ? (
          <div className="mt-3 space-y-2 text-sm text-zinc-700">
            <p>computed: {proposal.postApplyEffect.computedAt}</p>
            <p>
              window: pre [{proposal.postApplyEffect.window.preStart} ~ {proposal.postApplyEffect.window.preEnd}] · post [
              {proposal.postApplyEffect.window.postStart} ~ {proposal.postApplyEffect.window.postEnd}]
            </p>
            <p>
              coverage:{" "}
              {proposal.postApplyEffect.coverage.postWindowComplete
                ? "complete"
                : `partial (${proposal.postApplyEffect.coverage.postObservedDays}d observed, planned until ${proposal.postApplyEffect.coverage.plannedPostEnd})`}
            </p>
            <p>
              effect: pre {fmtRate(proposal.postApplyEffect.pre.improvementRate)} · post {fmtRate(proposal.postApplyEffect.post.improvementRate)} ·
              delta {fmtPtsFromRate(proposal.postApplyEffect.delta.improvementRate)}
            </p>
            {proposal.postApplyEffect.triggerSim && proposal.postApplyEffect.triggerDelta ? (
              <p>
                trigger sim: pre {proposal.postApplyEffect.triggerSim.pre.triggers}/{proposal.postApplyEffect.triggerSim.pre.snapshots} ·
                post {proposal.postApplyEffect.triggerSim.post.triggers}/{proposal.postApplyEffect.triggerSim.post.snapshots} · delta{" "}
                {proposal.postApplyEffect.triggerDelta.triggers >= 0 ? "+" : ""}
                {proposal.postApplyEffect.triggerDelta.triggers}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No post-apply review yet.</p>
        )}
      </div>
    </div>
  );
}
