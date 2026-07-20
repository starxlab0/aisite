export type GovernanceTone = "ready" | "progress" | "warning" | "critical" | "neutral";

export function governanceToneClass(tone: string) {
  if (tone === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "progress") return "border-sky-200 bg-sky-50 text-sky-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (tone === "neutral") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export function GovernanceBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: GovernanceTone | string;
  className?: string;
}) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${governanceToneClass(tone)} ${className ?? ""}`.trim()}>{label}</span>
  );
}

export function proposalStatusMeta(proposal: any) {
  if (!proposal) return null;
  const map: Record<string, { label: string; tone: GovernanceTone }> = {
    draft: { label: "proposal · 待审核", tone: "ready" },
    approved: { label: "proposal · 已批准", tone: "critical" },
    applied: { label: "proposal · 已应用", tone: "progress" },
    rejected: { label: "proposal · 已拒绝", tone: "warning" },
  };
  return map[String(proposal.status)] ?? { label: `proposal · ${proposal.status}`, tone: "warning" };
}

export function repoChangeMeta(repoChange: any) {
  if (!repoChange) return null;
  const next = repoChange?.recommendedNextStep?.label ? ` · ${repoChange.recommendedNextStep.label}` : "";
  const status = repoChange?.status ? `repo · ${repoChange.status}` : "repo · linked";
  let tone: GovernanceTone = "progress";
  if (["ci_failed", "revert_candidate"].includes(String(repoChange?.status || ""))) tone = "critical";
  else if (["pr_opened", "ready_for_review"].includes(String(repoChange?.status || ""))) tone = "ready";
  else if (String(repoChange?.recommendedNextStep?.code || "").includes("blocked")) tone = "warning";
  return { label: `${status}${next}`, tone };
}

export function verificationMeta(level: string | null | undefined) {
  const v = String(level ?? "unknown");
  if (v === "pass") return { label: "pass", tone: "ready" as const };
  if (v === "warning") return { label: "warning", tone: "warning" as const };
  if (v === "blocked") return { label: "blocked", tone: "critical" as const };
  if (v === "skipped") return { label: "skipped", tone: "neutral" as const };
  return { label: v, tone: "neutral" as const };
}

export function VerificationBadge({ level, className }: { level: string | null | undefined; className?: string }) {
  const meta = verificationMeta(level);
  return <GovernanceBadge label={meta.label} tone={meta.tone} className={className} />;
}

export function rollbackTriggerMeta(trigger: string | null | undefined) {
  const t = trigger === "auto" ? "auto" : trigger === "manual" ? "manual" : String(trigger ?? "unknown");
  if (t === "auto") return { label: "auto", tone: "critical" as const };
  if (t === "manual") return { label: "manual", tone: "neutral" as const };
  return { label: t, tone: "neutral" as const };
}

export function RollbackTriggerBadge({ trigger, className }: { trigger: string | null | undefined; className?: string }) {
  const meta = rollbackTriggerMeta(trigger);
  return <GovernanceBadge label={meta.label} tone={meta.tone} className={className} />;
}

export function dependencyStatusMeta(status: string | null | undefined) {
  const s = String(status ?? "unknown");
  if (s === "healthy") return { label: "healthy", tone: "ready" as const };
  if (s === "degraded") return { label: "degraded", tone: "critical" as const };
  return { label: s, tone: "warning" as const };
}

export function DependencyStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = dependencyStatusMeta(status);
  return <GovernanceBadge label={meta.label} tone={meta.tone} className={className} />;
}
