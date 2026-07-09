import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createPreview,
  generateOpsDraft,
  getOpsAuthStatus,
  getRecommendations,
  getOpsTargetDetail,
  listRepoChanges,
  listRuleTuningProposals,
  publishOpsDraft,
  revokePreview,
  resolveRecommendation,
  reviewOpsDraft,
  rollbackOpsTarget,
  submitOpsDraft,
  updateOpsDraft,
} from "@/lib/control-plane/ops";
import { getDiffSections } from "@/lib/control-plane/ops-diff";
import { PublishResultPanel } from "../../../components/publish-result-panel";
import { GovernanceBadge, governanceToneClass, proposalStatusMeta, repoChangeMeta } from "../../../components/governance-ui";

type Props = {
  params: Promise<{ targetType: string; targetId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function deriveTargetGovernanceState({
  activeDraft,
  latestPublishedOpsDraft,
  latestRollbackEvent,
}: {
  activeDraft: any;
  latestPublishedOpsDraft: any;
  latestRollbackEvent: any;
}) {
  const verificationLevel = latestPublishedOpsDraft?.published?.verification?.level ?? null;
  const rollbackReason = latestRollbackEvent?.triggerReason ?? null;
  if (latestRollbackEvent && (latestRollbackEvent.trigger === "auto" || rollbackReason === "verification-warning-threshold")) {
    return { label: "暂停发布中", tone: "warning", detail: "最近发生自动回退，先确认根因和修复方案，再继续发布。" };
  }
  if (verificationLevel === "blocked") {
    return { label: "需要立即处理", tone: "critical", detail: "最新发布校验被 blocked，必须先修复问题后再发布。" };
  }
  if (activeDraft?.status === "needs_review") {
    return { label: "需要立即审核", tone: "ready", detail: "当前 draft 已提交，等待内容审核。" };
  }
  if (activeDraft?.status === "approved") {
    return { label: "需要立即处理", tone: "critical", detail: "当前 draft 已审核通过，建议尽快完成发布或继续后续处理。" };
  }
  if (verificationLevel === "warning") {
    return { label: "可观察后重发", tone: "progress", detail: "最近发布有 warning，可继续观察，但下次发布前应确认问题已收敛。" };
  }
  return { label: "继续排查", tone: "warning", detail: "当前没有明确的发布治理信号，先结合 audit 与 recommendation 继续判断。" };
}

function repoLaneHref(targetId: string) {
  const params = new URLSearchParams();
  params.set("type", "faq");
  params.set("q", targetId);
  return `/ops?${params.toString()}#repo-publish-queue`;
}

function recommendationGovernance(rec: any, proposal: any, repoChange: any) {
  const repoStep = String(repoChange?.recommendedNextStep?.code || "");
  if (proposal?.status === "draft" || repoStep === "ready_for_review") {
    return { label: "需要立即审核", tone: "ready", detail: "这条 recommendation 已经形成提案或进入 review 阶段。", actionLabel: "Open proposal" };
  }
  if (
    rec.ruleId === "publish-verification-followup" ||
    rec.preparedDraft ||
    rec.stale ||
    proposal?.status === "approved" ||
    ["auto_revert_ready", "investigate_ci"].includes(repoStep) ||
    rec.severity === "critical"
  ) {
    return { label: "需要立即处理", tone: "critical", detail: "这条 recommendation 已经进入修复或阻断处理阶段。", actionLabel: "Handle now" };
  }
  if (["blocked_auto_merge_policy", "blocked_revert_policy"].includes(repoStep)) {
    return { label: "暂停发布中", tone: "warning", detail: "相关 repo change 被策略门控拦住，先处理策略或人工确认。", actionLabel: "Inspect policy block" };
  }
  if (rec.status === "in_progress" || ["wait_ci", "wait_ci_start", "ready_auto_merge"].includes(repoStep)) {
    return { label: "等待外部结果", tone: "progress", detail: "这条 recommendation 已进入处理中，先等待 review / CI / merge 结果。", actionLabel: "Track progress" };
  }
  return { label: "继续排查", tone: "warning", detail: "当前还没有形成明确处理链，先看 audit、signals 与 recommendation context。", actionLabel: "Investigate" };
}

// proposalStatusMeta / repoChangeMeta 已抽到共享组件 `governance-ui.tsx`

export default async function OpsFaqDetailPage({ params, searchParams }: Props) {
  const { targetType, targetId } = await params;
  const id = `${targetType}:${targetId}`;
  const sp = (await searchParams) ?? {};
  const activeDraftId = typeof sp.draft === "string" ? sp.draft : undefined;
  const previewUrl = typeof sp.previewUrl === "string" ? sp.previewUrl : undefined;
  const err = typeof sp.err === "string" ? sp.err : undefined;
  const intent = typeof sp.intent === "string" ? sp.intent : undefined;

  const detail = await getOpsTargetDetail("faq", id);
  const drafts = [...detail.opsDrafts].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const activeDraft = activeDraftId ? drafts.find((d) => d.id === activeDraftId) : drafts[0];
  const latestPublished = detail.publishedDrafts[0] ?? null;
  const latestPublishedOpsDraft = drafts.find((d) => d.status === "published" && d.published) ?? null;
  const latestRollbackEvent = detail.events.find((event) => event.action === "rollback") ?? null;
  const governanceState = deriveTargetGovernanceState({ activeDraft, latestPublishedOpsDraft, latestRollbackEvent });
  const diffSections = getDiffSections("faq", latestPublished?.payload, activeDraft?.payload);
  const previewTokens = detail.previewTokens.filter((token) => !activeDraft || token.draftId === activeDraft.id);
  const recommendations = await getRecommendations({ status: "open,in_progress", targetType: "faq", targetId });
  const [proposalData, repoChangeData] = await Promise.all([
    listRuleTuningProposals({ limit: 20 }),
    listRepoChanges({ targetType: "faq", targetId, limit: 5 }),
  ]);
  const relatedProposal =
    proposalData.items
      .filter((item) => item.type === "incident_followup" && item.targetType === "faq" && item.targetId === targetId)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] ?? null;
  const relatedRepoChange = repoChangeData.items[0] ?? null;
  const proposalByRecommendationId = new Map(
    proposalData.items.filter((item) => item.linkedRecommendationId).map((item) => [item.linkedRecommendationId, item]),
  );
  const repoChangeByRecommendationId = new Map(
    repoChangeData.items.filter((item) => item.linkedRecommendationId).map((item) => [item.linkedRecommendationId, item]),
  );
  const authStatus = await getOpsAuthStatus();
  const canManageContent = authStatus.capabilities.includes("manage_content");
  const canPreviewContent = authStatus.capabilities.includes("preview_content");
  const canReviewContent = authStatus.capabilities.includes("review_content");
  const canPublishContent = authStatus.capabilities.includes("publish_content");
  const canManageRecommendations = authStatus.capabilities.includes("manage_recommendations");
  const basePath = `/ops/faq/${targetType}/${targetId}`;
  const detailPath = (extra?: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (activeDraft?.id) params.set("draft", activeDraft.id);
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
    }
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  async function onGenerate() {
    "use server";
    try {
      const draft = await generateOpsDraft("faq", id);
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${draft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generate failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onSubmit() {
    "use server";
    if (!activeDraft) return;
    try {
      await submitOpsDraft(activeDraft.id);
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submit failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onApprove() {
    "use server";
    if (!activeDraft) return;
    try {
      await reviewOpsDraft(activeDraft.id, { decision: "approve" });
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approve failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onRequestChanges() {
    "use server";
    if (!activeDraft) return;
    try {
      await reviewOpsDraft(activeDraft.id, { decision: "request_changes" });
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request changes failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onPreview() {
    "use server";
    if (!activeDraft) return;
    try {
      const p = await createPreview(activeDraft.id);
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}&previewUrl=${encodeURIComponent(p.previewUrl)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onPublish() {
    "use server";
    if (!activeDraft) return;
    redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}&intent=publish`);
  }

  async function onConfirmPublish(formData: FormData) {
    "use server";
    if (!activeDraft) return;
    const reason = String(formData.get("reason") ?? "").trim();
    const confirmed = formData.get("confirmed") === "on";
    if (!reason || !confirmed) {
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}&err=${encodeURIComponent("Publish requires reason and confirmation")}`);
    }
    try {
      await publishOpsDraft(activeDraft.id, { reason, confirmed: true });
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed";
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}&err=${encodeURIComponent(message)}`);
    }
  }

  async function onRollback() {
    "use server";
    redirect(`/ops/faq/${targetType}/${targetId}${activeDraft ? `?draft=${activeDraft.id}&intent=rollback` : "?intent=rollback"}`);
  }

  async function onConfirmRollback(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "").trim();
    const confirmed = formData.get("confirmed") === "on";
    if (!reason || !confirmed) {
      redirect(`/ops/faq/${targetType}/${targetId}${activeDraft ? `?draft=${activeDraft.id}&err=${encodeURIComponent("Rollback requires reason and confirmation")}` : `?err=${encodeURIComponent("Rollback requires reason and confirmation")}`}`);
    }
    try {
      await rollbackOpsTarget("faq", id, { reason, confirmed: true });
      redirect(`/ops/faq/${targetType}/${targetId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rollback failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onRevokePreview(formData: FormData) {
    "use server";
    const token = String(formData.get("token") ?? "");
    if (!token) return;
    try {
      await revokePreview(token);
      redirect(`/ops/faq/${targetType}/${targetId}${activeDraft ? `?draft=${activeDraft.id}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revoke preview failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onSaveDraft(formData: FormData) {
    "use server";
    if (!activeDraft) return;

    const title = String(formData.get("title") ?? "").trim();
    const patch: Record<string, unknown> = {};
    if (title) patch.title = title;

    const existingItems = activeDraft.payload?.items ?? [];
    const items = existingItems.map((item: any, index: number) => {
      const question = String(formData.get(`q_${index}`) ?? item.question ?? "").trim();
      const answer = String(formData.get(`a_${index}`) ?? item.answer ?? "").trim();
      const category = String(formData.get(`c_${index}`) ?? item.intent ?? "").trim();
      return {
        ...item,
        question,
        answer,
        intent: category || item.intent,
      };
    });

    if (!title) {
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}&err=${encodeURIComponent("Title is required")}`);
    }

    const invalidItem = items.findIndex((item: any) => !item.question || !item.answer);
    if (invalidItem >= 0) {
      redirect(
        `/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}&err=${encodeURIComponent(
          `FAQ item #${invalidItem + 1} question and answer are required`,
        )}`,
      );
    }

    patch.items = items;

    try {
      await updateOpsDraft(activeDraft.id, patch);
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save draft failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onAddItem() {
    "use server";
    if (!activeDraft) return;
    const items = [
      ...(activeDraft.payload?.items ?? []),
      {
        id: `faq-${Date.now()}`,
        question: "",
        answer: "",
        intent: "product",
      },
    ];
    try {
      await updateOpsDraft(activeDraft.id, { items });
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Add item failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onDeleteItem(formData: FormData) {
    "use server";
    if (!activeDraft) return;
    const index = Number(formData.get("index"));
    const items = [...(activeDraft.payload?.items ?? [])];
    if (Number.isNaN(index) || index < 0 || index >= items.length) return;
    items.splice(index, 1);
    try {
      await updateOpsDraft(activeDraft.id, { items });
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete item failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onResolveRecommendation(formData: FormData) {
    "use server";
    const recommendationId = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "") as "in_progress" | "resolved" | "dismissed";
    const note = String(formData.get("note") ?? "").trim();
    if (!recommendationId || !status) return;
    try {
      await resolveRecommendation(recommendationId, { status, note: note || undefined });
      redirect(`/ops/faq/${targetType}/${targetId}${activeDraft ? `?draft=${activeDraft.id}` : ""}#recommendations`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resolve recommendation failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onMoveItem(formData: FormData) {
    "use server";
    if (!activeDraft) return;
    const index = Number(formData.get("index"));
    const direction = String(formData.get("direction") ?? "");
    const items = [...(activeDraft.payload?.items ?? [])];
    if (Number.isNaN(index) || index < 0 || index >= items.length) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const [item] = items.splice(index, 1);
    items.splice(nextIndex, 0, item);
    try {
      await updateOpsDraft(activeDraft.id, { items });
      redirect(`/ops/faq/${targetType}/${targetId}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Move item failed";
      redirect(detailPath({ err: message }));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      {err ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          操作失败：{err}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-zinc-500">
            <Link className="underline underline-offset-4" href="/ops">
              Ops Console
            </Link>{" "}
            / faq / <code className="rounded bg-zinc-100 px-1">{id}</code>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{detail.target.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Target: <code className="rounded bg-zinc-100 px-1">{detail.target.targetPath}</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={onGenerate}>
            <button disabled={!canManageContent} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50">Generate</button>
          </form>
          <form action={onSubmit}>
            <button disabled={!activeDraft || !canManageContent} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50">
              Submit
            </button>
          </form>
          <form action={onApprove}>
            <button disabled={!activeDraft || !canReviewContent} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50">
              Approve
            </button>
          </form>
          <form action={onRequestChanges}>
            <button disabled={!activeDraft || !canReviewContent} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50">
              Request changes
            </button>
          </form>
          <form action={onPreview}>
            <button disabled={!activeDraft || !canPreviewContent} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50">
              Preview
            </button>
          </form>
          <form action={onPublish}>
            <button disabled={!activeDraft || !canPublishContent} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50">
              Publish
            </button>
          </form>
          <form action={onRollback}>
            <button disabled={!canPublishContent} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50">Rollback</button>
          </form>
        </div>
      </div>

      <div id="governance-state" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Action permissions</p>
            <p className="mt-1 text-xs text-zinc-500">当前角色：<code className="rounded bg-zinc-100 px-1">{authStatus.role}</code></p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 ${canManageContent ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>manage_content</span>
            <span className={`rounded-full px-2.5 py-1 ${canReviewContent ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>review_content</span>
            <span className={`rounded-full px-2.5 py-1 ${canPreviewContent ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>preview_content</span>
            <span className={`rounded-full px-2.5 py-1 ${canPublishContent ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>publish_content</span>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-xs text-zinc-600">
          {!canManageContent ? <p>当前角色不能 Generate / Edit / Submit。</p> : null}
          {!canReviewContent ? <p>当前角色不能 Approve / Request changes。</p> : null}
          {!canPreviewContent ? <p>当前角色不能 Preview / Revoke preview。</p> : null}
          {!canPublishContent ? <p>当前角色不能 Publish / Rollback。</p> : null}
        </div>
        <div className={`mt-4 rounded-xl border p-3 ${governanceToneClass(governanceState.tone)}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">Governance state</p>
            <span className="rounded border border-current/20 px-2 py-0.5 text-xs">{governanceState.label}</span>
          </div>
          <p className="mt-2 text-xs">{governanceState.detail}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {relatedProposal ? (
              <Link className="underline" href={`/ops/proposals/${relatedProposal.id}`}>
                Open proposal
              </Link>
            ) : null}
            {relatedRepoChange ? (
              <Link className="underline" href={repoLaneHref(targetId)}>
                Open repo change lane
              </Link>
            ) : null}
            <Link className="underline" href={`/ops/audit?targetType=faq&targetId=${encodeURIComponent(id)}`}>
              Open audit
            </Link>
            <Link className="underline" href="/ops/monitoring">
              Open monitoring
            </Link>
          </div>
        </div>
      </div>

      {intent === "publish" ? (
        <form action={onConfirmPublish} className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">确认发布</p>
          <div className="mt-3">
            <label className="text-xs font-medium text-amber-900">原因</label>
            <select name="reason" className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
              <option value="">请选择原因</option>
              <option value="review-approved">审核通过</option>
              <option value="campaign-ready">活动上线</option>
              <option value="content-refresh">内容更新</option>
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-amber-900">
            <input name="confirmed" type="checkbox" />
            我确认要发布该版本
          </label>
          <div className="mt-4 flex gap-3">
            <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">Confirm publish</button>
            <Link className="rounded-lg border border-amber-200 px-3 py-2 text-sm" href={`/ops/faq/${targetType}/${targetId}${activeDraft ? `?draft=${activeDraft.id}` : ""}`}>Cancel</Link>
          </div>
        </form>
      ) : null}

      {intent === "rollback" ? (
        <form action={onConfirmRollback} className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">确认回滚</p>
          <div className="mt-3">
            <label className="text-xs font-medium text-amber-900">原因</label>
            <select name="reason" className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
              <option value="">请选择原因</option>
              <option value="quality-issue">内容质量问题</option>
              <option value="approval-mistake">误发布</option>
              <option value="business-change">业务策略变化</option>
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-amber-900">
            <input name="confirmed" type="checkbox" />
            我确认要执行回滚
          </label>
          <div className="mt-4 flex gap-3">
            <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">Confirm rollback</button>
            <Link className="rounded-lg border border-amber-200 px-3 py-2 text-sm" href={`/ops/faq/${targetType}/${targetId}${activeDraft ? `?draft=${activeDraft.id}` : ""}`}>Cancel</Link>
          </div>
        </form>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Drafts</p>
          <ul className="mt-4 space-y-3">
            {drafts.length ? (
              drafts.map((d) => (
                <li key={d.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-sm font-medium text-zinc-900">
                    <Link className="underline underline-offset-4" href={`/ops/faq/${targetType}/${targetId}?draft=${d.id}`}>
                      {d.id}
                    </Link>{" "}
                    <span className="ml-2 text-xs text-zinc-500">{d.status}</span>
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">Updated: {d.updatedAt}</p>
                </li>
              ))
            ) : (
              <li className="text-sm text-zinc-600">No drafts yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Published</p>
          {latestPublished ? (
            <>
              <p className="mt-2 text-xs text-zinc-500">
                Ref: <code className="rounded bg-zinc-100 px-1">{latestPublished.contentRef}</code>
              </p>
              <div className="mt-4">
                <PublishResultPanel published={latestPublishedOpsDraft?.published} latestRollback={latestRollbackEvent} />
              </div>
              <pre className="mt-4 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800">
                {JSON.stringify(latestPublished.payload, null, 2)}
              </pre>
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">No published content yet.</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div id="recommendations" className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Recommendations</p>
            <span className={`rounded border px-2 py-0.5 text-xs ${governanceToneClass(governanceState.tone)}`}>{governanceState.label}</span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">当 signal 命中规则时，会生成一条 FAQ 优化建议。</p>
          {recommendations.items.length ? (
            <div className="mt-4 space-y-3">
              {recommendations.items.slice(0, 5).map((rec) => {
                const linkedProposal = proposalByRecommendationId.get(rec.id) ?? null;
                const linkedRepoChange = repoChangeByRecommendationId.get(rec.id) ?? null;
                const recGovernance = recommendationGovernance(rec, linkedProposal, linkedRepoChange);
                return (
                  <div key={rec.id} className="rounded-xl border border-zinc-200 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <GovernanceBadge label={recGovernance.label} tone={recGovernance.tone} />
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{recGovernance.actionLabel}</span>
                      </div>
                      {linkedProposal ? (
                        <Link className="text-xs underline" href={`/ops/proposals/${linkedProposal.id}`}>
                          Open proposal
                        </Link>
                      ) : linkedRepoChange ? (
                        <Link className="text-xs underline" href={repoLaneHref(targetId)}>
                          Open repo change lane
                        </Link>
                      ) : rec.preparedDraft ? (
                        <Link className="text-xs underline" href={`/ops/faq/${targetType}/${targetId}?draft=${rec.preparedDraft.draftId}`}>
                          Open prepared draft
                        </Link>
                      ) : (
                        <Link className="text-xs underline" href={`/ops/audit?targetType=faq&targetId=${encodeURIComponent(id)}`}>
                          Open audit
                        </Link>
                      )}
                    </div>
                    <p className="mb-2 text-xs text-zinc-500">{recGovernance.detail}</p>
                    {linkedProposal || linkedRepoChange || rec.preparedDraft ? (
                      <div className="mb-2 rounded-lg bg-zinc-50 p-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {proposalStatusMeta(linkedProposal) ? (
                            <GovernanceBadge
                              label={proposalStatusMeta(linkedProposal)!.label}
                              tone={proposalStatusMeta(linkedProposal)!.tone}
                            />
                          ) : null}
                          {repoChangeMeta(linkedRepoChange) ? (
                            <GovernanceBadge label={repoChangeMeta(linkedRepoChange)!.label} tone={repoChangeMeta(linkedRepoChange)!.tone} />
                          ) : null}
                          {rec.preparedDraft ? (
                            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
                              draft · {rec.preparedDraft.draftId}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <p className="text-sm font-medium text-zinc-900">{rec.ruleId}</p>
                    <p className="mt-1 text-xs text-zinc-500">{rec.createdAt}</p>
                    {rec.status === "in_progress" && rec.startedAt ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        已自动进入处理中：{rec.startedAt}
                        {rec.startedBy ? ` · ${rec.startedBy}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-zinc-700">{rec.reason}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Suggested workflow: <code className="rounded bg-zinc-100 px-1">{rec.suggestedWorkflow}</code>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {rec.stale ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">stale</span> : null}
                      {rec.severity ? <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{rec.severity}</span> : null}
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{rec.status}</span>
                    </div>
                    {rec.preparedDraft ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        Draft ready:{" "}
                        <Link className="underline underline-offset-4" href={`/ops/faq/${targetType}/${targetId}?draft=${rec.preparedDraft.draftId}`}>
                          <code className="rounded bg-emerald-50 px-1">{rec.preparedDraft.draftId}</code>
                        </Link>
                        {" · "}
                        {rec.preparedDraft.reused ? "reused existing draft" : "prepared automatically"}
                      </p>
                    ) : null}
                    {rec.preparedDraftError ? <p className="mt-2 text-xs text-rose-700">{rec.preparedDraftError}</p> : null}
                    {typeof rec.occurrences === "number" ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        近期开启次数：{rec.occurrences}
                        {rec.lastSeenAt ? ` · 最近触发：${rec.lastSeenAt}` : ""}
                      </p>
                    ) : null}
                    {rec.effectivePriorityReason || rec.priorityReason ? (
                      <p className="mt-2 text-xs text-zinc-500">{rec.effectivePriorityReason ?? rec.priorityReason}</p>
                    ) : null}
                    {rec.context?.actionHints?.length ? <p className="mt-2 text-xs text-zinc-500">建议：{rec.context.actionHints.join("；")}</p> : null}
                    {rec.successPattern ? <p className="mt-2 text-xs text-zinc-500">成功模式：{rec.successPattern.summary}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rec.preparedDraft ? (
                        <Link className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm" href={`/ops/faq/${targetType}/${targetId}?draft=${rec.preparedDraft.draftId}`}>
                          Open prepared draft
                        </Link>
                      ) : (
                        <form action={onGenerate}>
                          <button disabled={!canManageContent} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50" type="submit">
                            Generate draft
                          </button>
                        </form>
                      )}
                      <form action={onResolveRecommendation} className="flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={rec.id} />
                        <input name="note" placeholder="处理备注（可选）" className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm" />
                        {rec.status !== "in_progress" ? (
                          <button disabled={!canManageRecommendations} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50" name="status" value="in_progress" type="submit">
                            Start
                          </button>
                        ) : null}
                        <button disabled={!canManageRecommendations} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50" name="status" value="resolved" type="submit">
                          Resolve
                        </button>
                        <button disabled={!canManageRecommendations} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50" name="status" value="dismissed" type="submit">
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">No open recommendations.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-900">Edit draft</p>
            <span className="text-xs text-zinc-500">
              {activeDraft ? `Draft: ${activeDraft.id} · ${activeDraft.status}` : "No active draft"}
            </span>
          </div>

          {activeDraft ? (
            <form action={onSaveDraft} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-700">Title</label>
                <input
                  name="title"
                  defaultValue={activeDraft.payload?.title ?? ""}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">Items</label>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">支持新增、删除与上下移动；question/answer 必填。</p>
                  <form action={onAddItem}>
                    <button disabled={!canManageContent} className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs disabled:opacity-50" type="submit">
                      Add item
                    </button>
                  </form>
                </div>
                <div className="mt-3 space-y-3">
                  {(activeDraft.payload?.items ?? []).map((item: any, index: number) => (
                    <div key={item.id ?? index} className="rounded-xl border border-zinc-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-medium text-zinc-700">Item #{index + 1}</p>
                        <div className="flex gap-2">
                          <form action={onMoveItem}>
                            <input type="hidden" name="index" value={index} />
                            <input type="hidden" name="direction" value="up" />
                            <button
                              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs disabled:opacity-50"
                              disabled={!canManageContent || index === 0}
                              type="submit"
                            >
                              ↑
                            </button>
                          </form>
                          <form action={onMoveItem}>
                            <input type="hidden" name="index" value={index} />
                            <input type="hidden" name="direction" value="down" />
                            <button
                              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs disabled:opacity-50"
                              disabled={!canManageContent || index === (activeDraft.payload?.items ?? []).length - 1}
                              type="submit"
                            >
                              ↓
                            </button>
                          </form>
                          <form action={onDeleteItem}>
                            <input type="hidden" name="index" value={index} />
                            <button disabled={!canManageContent} className="rounded-lg border border-zinc-200 px-2 py-1 text-xs disabled:opacity-50" type="submit">
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                      <label className="text-xs font-medium text-zinc-700">Question</label>
                      <input
                        name={`q_${index}`}
                        defaultValue={item.question ?? ""}
                        className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      />
                      <label className="mt-3 block text-xs font-medium text-zinc-700">Answer</label>
                      <textarea
                        name={`a_${index}`}
                        defaultValue={item.answer ?? ""}
                        className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                        rows={4}
                      />
                      <label className="mt-3 block text-xs font-medium text-zinc-700">Category</label>
                      <input
                        name={`c_${index}`}
                        defaultValue={item.intent ?? ""}
                        className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button disabled={!canManageContent} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50" type="submit">
                Save draft
              </button>
              <p className="text-xs text-zinc-500">Title 必填；每条 FAQ 的 question/answer 必填。</p>
            </form>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">Generate a draft first.</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Active draft (raw)</p>
          <pre className="mt-4 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800">
            {activeDraft ? JSON.stringify(activeDraft.payload, null, 2) : "No active draft"}
          </pre>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Diff</p>
          {diffSections.length ? (
            <div className="mt-4 space-y-4">
              {diffSections.map((section) => (
                <div key={section.title} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-sm font-semibold text-zinc-900">{section.title}</p>
                  <div className="mt-3 space-y-3">
                    {section.rows.map((row) => (
                      <div key={row.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <p className="text-sm font-medium text-zinc-900">{row.label}</p>
                        {row.added?.length ? (
                          <p className="mt-2 text-xs text-emerald-700">Added: {row.added.join(" · ")}</p>
                        ) : null}
                        {row.removed?.length ? (
                          <p className="mt-1 text-xs text-rose-700">Removed: {row.removed.join(" · ")}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-zinc-500">Published</p>
                        <pre className="mt-1 overflow-auto rounded bg-white p-2 text-[11px] text-zinc-700">
                          {row.published}
                        </pre>
                        <p className="mt-2 text-xs text-zinc-500">Draft</p>
                        <pre className="mt-1 overflow-auto rounded bg-white p-2 text-[11px] text-zinc-700">
                          {row.draft}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">No diff to show.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Preview tokens</p>
          {previewUrl ? (
            <p className="mt-2 text-sm text-zinc-900">
              Latest preview:{" "}
              <a className="underline underline-offset-4" href={previewUrl}>
                {previewUrl}
              </a>
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            {previewTokens.length ? (
              previewTokens.map((token) => {
                const href = `${detail.target.targetPath}?preview=${token.token}`;
                const expired = Date.now() > token.expiresAt;
                return (
                  <div key={token.token} className="rounded-xl border border-zinc-200 p-3">
                    <p className="text-xs text-zinc-500">
                      Token: <code className="rounded bg-zinc-100 px-1">{token.token}</code>
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Created: {token.createdAt} · Expires: {new Date(token.expiresAt).toISOString()}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Status: {token.revokedAt ? "revoked" : expired ? "expired" : "active"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a className="text-sm underline underline-offset-4" href={href}>
                        Open preview
                      </a>
                      {!token.revokedAt && !expired ? (
                        <form action={onRevokePreview}>
                          <input type="hidden" name="token" value={token.token} />
                          <button className="text-sm underline underline-offset-4" type="submit">
                            Revoke
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-zinc-600">No preview tokens yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Timeline</p>
          <div className="mt-4 space-y-3">
            {detail.events.length ? (
              detail.events.map((event) => (
                <div key={event.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-sm font-medium text-zinc-900">{event.action}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {event.at} · {event.actor}
                  </p>
                  {event.note ? <p className="mt-2 text-sm text-zinc-600">{event.note}</p> : null}
                  {event.linkedDocuments?.length ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      Linked: {event.linkedDocuments.map((d) => d.id).join(", ")}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-600">No events yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
