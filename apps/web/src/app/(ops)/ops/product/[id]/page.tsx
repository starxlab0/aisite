import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createPreview,
  generateOpsDraft,
  createSnapshotFromEvents,
  getOpsAuthStatus,
  getSignalOverviewForTarget,
  getRecommendations,
  getSignals,
  getOpsTargetDetail,
  publishOpsDraft,
  revokePreview,
  reviewOpsDraft,
  rollbackOpsTarget,
  submitOpsDraft,
  updateOpsDraft,
  resolveRecommendation,
} from "@/lib/control-plane/ops";
import { getDiffSections } from "@/lib/control-plane/ops-diff";
import { PublishResultPanel } from "../../components/publish-result-panel";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OpsProductDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const activeDraftId = typeof sp.draft === "string" ? sp.draft : undefined;
  const previewUrl = typeof sp.previewUrl === "string" ? sp.previewUrl : undefined;
  const err = typeof sp.err === "string" ? sp.err : undefined;
  const intent = typeof sp.intent === "string" ? sp.intent : undefined;

  const detail = await getOpsTargetDetail("product", id);
  const drafts = [...detail.opsDrafts].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const activeDraft = activeDraftId ? drafts.find((d) => d.id === activeDraftId) : drafts[0];
  const latestPublished = detail.publishedDrafts[0] ?? null;
  const latestPublishedOpsDraft = drafts.find((d) => d.status === "published" && d.published) ?? null;
  const latestRollbackEvent = detail.events.find((event) => event.action === "rollback") ?? null;
  const diffSections = getDiffSections("product", latestPublished?.payload, activeDraft?.payload);
  const previewTokens = detail.previewTokens.filter((token) => !activeDraft || token.draftId === activeDraft.id);
  const signals = await getSignals({ targetType: "product", targetId: id });
  const recommendations = await getRecommendations({ status: "open,in_progress", targetType: "product", targetId: id });
  const signalOverview = await getSignalOverviewForTarget("product", id);
  const authStatus = await getOpsAuthStatus();
  const canManageContent = authStatus.capabilities.includes("manage_content");
  const canPreviewContent = authStatus.capabilities.includes("preview_content");
  const canReviewContent = authStatus.capabilities.includes("review_content");
  const canPublishContent = authStatus.capabilities.includes("publish_content");
  const canManageRecommendations = authStatus.capabilities.includes("manage_recommendations");
  const canCaptureSignalsSnapshot = authStatus.capabilities.includes("capture_signals_snapshot");
  const basePath = `/ops/product/${id}`;
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

  const fmtPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const fmtPts = (value: number) => `${value * 100 >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pts`;
  const focusLabel = (key: string) => {
    const map: Record<string, string> = {
      hero_title: "Hero 标题",
      selling_points: "卖点",
      cta_copy: "CTA 文案",
      faq_coverage: "FAQ 覆盖",
      hero_summary: "Hero 摘要",
      sections_structure: "分段结构",
      internal_links: "内部链接",
      question_coverage: "问题覆盖",
      answer_tone: "回答语气",
      ordering: "排序",
      duplication: "去重",
      content_quality: "内容质量",
    };
    return map[key] ?? key;
  };
  const priorityBadge = (rec: any) => {
    const level = rec.effectivePriorityLevel ?? rec.priorityLevel ?? "p3";
    const map: Record<string, string> = {
      p0: "border-rose-200 bg-rose-50 text-rose-800",
      p1: "border-amber-200 bg-amber-50 text-amber-800",
      p2: "border-zinc-200 bg-zinc-50 text-zinc-700",
      p3: "border-zinc-200 bg-white text-zinc-500",
    };
    return (
      <span className={`rounded border px-2 py-0.5 text-xs ${map[level] ?? map.p3}`}>
        {level.toUpperCase()}
        {typeof (rec.effectivePriorityScore ?? rec.priorityScore) === "number"
          ? ` · ${rec.effectivePriorityScore ?? rec.priorityScore}`
          : ""}
      </span>
    );
  };
  const staleBadge = (rec: any) => {
    if (!rec?.stale) return null;
    const days = typeof rec.staleDays === "number" ? rec.staleDays : 0;
    return (
      <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-800">
        STALE · {days}d
      </span>
    );
  };
  const effectBadge = (rec: any) => {
    if (!rec?.effect) return null;
    const status = rec.effect.status;
    const map: Record<string, string> = {
      improved: "border-emerald-200 bg-emerald-50 text-emerald-800",
      neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
      worsened: "border-rose-200 bg-rose-50 text-rose-800",
      unknown: "border-zinc-200 bg-white text-zinc-500",
    };
    return <span className={`rounded border px-2 py-0.5 text-xs ${map[status] ?? map.unknown}`}>EFFECT · {status}</span>;
  };

  async function onGenerate() {
    "use server";
    try {
      const draft = await generateOpsDraft("product", id);
      redirect(`/ops/product/${id}?draft=${draft.id}`);
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
      redirect(`/ops/product/${id}?draft=${activeDraft.id}`);
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
      redirect(`/ops/product/${id}?draft=${activeDraft.id}`);
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
      redirect(`/ops/product/${id}?draft=${activeDraft.id}`);
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
      redirect(`/ops/product/${id}?draft=${activeDraft.id}&previewUrl=${encodeURIComponent(p.previewUrl)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onPublish() {
    "use server";
    if (!activeDraft) return;
    redirect(`/ops/product/${id}?draft=${activeDraft.id}&intent=publish`);
  }

  async function onConfirmPublish(formData: FormData) {
    "use server";
    if (!activeDraft) return;
    const reason = String(formData.get("reason") ?? "").trim();
    const confirmed = formData.get("confirmed") === "on";
    if (!reason || !confirmed) {
      redirect(`/ops/product/${id}?draft=${activeDraft.id}&err=${encodeURIComponent("Publish requires reason and confirmation")}`);
    }
    try {
      await publishOpsDraft(activeDraft.id, { reason, confirmed: true });
      redirect(`/ops/product/${id}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed";
      redirect(`/ops/product/${id}?draft=${activeDraft.id}&err=${encodeURIComponent(message)}`);
    }
  }

  async function onRollback() {
    "use server";
    redirect(`/ops/product/${id}${activeDraft ? `?draft=${activeDraft.id}&intent=rollback` : "?intent=rollback"}`);
  }

  async function onConfirmRollback(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "").trim();
    const confirmed = formData.get("confirmed") === "on";
    if (!reason || !confirmed) {
      redirect(`/ops/product/${id}${activeDraft ? `?draft=${activeDraft.id}&err=${encodeURIComponent("Rollback requires reason and confirmation")}` : `?err=${encodeURIComponent("Rollback requires reason and confirmation")}`}`);
    }
    try {
      await rollbackOpsTarget("product", id, { reason, confirmed: true });
      redirect(`/ops/product/${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rollback failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onResolveRecommendation(formData: FormData) {
    "use server";
    const recId = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "resolved") as "in_progress" | "resolved" | "dismissed";
    const note = String(formData.get("note") ?? "").trim();
    if (!recId) return;
    try {
      await resolveRecommendation(recId, { status, note: note || undefined });
      redirect(`/ops/product/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recommendation update failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onCaptureSnapshot() {
    "use server";
    try {
      await createSnapshotFromEvents({
        targetType: "product",
        targetId: id,
        contentRef: latestPublished?.contentRef ?? null,
        windowDays: 7,
      });
      redirect(`/ops/product/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capture snapshot failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onRevokePreview(formData: FormData) {
    "use server";
    const token = String(formData.get("token") ?? "");
    if (!token) return;
    try {
      await revokePreview(token);
      redirect(`/ops/product/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revoke preview failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onSaveDraft(formData: FormData) {
    "use server";
    if (!activeDraft) return;

    const title = String(formData.get("title") ?? "").trim();
    const subtitle = String(formData.get("subtitle") ?? "").trim();
    const shortDescription = String(formData.get("shortDescription") ?? "").trim();

    const patch: Record<string, unknown> = {};
    if (title) patch.title = title;
    if (subtitle) patch.subtitle = subtitle;
    if (shortDescription) patch.shortDescription = shortDescription;

    const listFields = [
      "keyBenefits",
      "whoItsFor",
      "whyItFeelsDifferent",
      "careInstructions",
      "whatsInBox",
    ] as const;

    listFields.forEach((field) => {
      const raw = String(formData.get(field) ?? "").trim();
      if (!raw) return;
      patch[field] = raw
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
    });

    try {
      await updateOpsDraft(activeDraft.id, patch);
      redirect(`/ops/product/${id}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save draft failed";
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
            / product / <code className="rounded bg-zinc-100 px-1">{id}</code>
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
            <button
              disabled={!activeDraft || !canManageContent}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              Submit
            </button>
          </form>
          <form action={onApprove}>
            <button
              disabled={!activeDraft || !canReviewContent}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              Approve
            </button>
          </form>
          <form action={onRequestChanges}>
            <button
              disabled={!activeDraft || !canReviewContent}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              Request changes
            </button>
          </form>
          <form action={onPreview}>
            <button
              disabled={!activeDraft || !canPreviewContent}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              Preview
            </button>
          </form>
          <form action={onPublish}>
            <button
              disabled={!activeDraft || !canPublishContent}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50"
            >
              Publish
            </button>
          </form>
          <form action={onRollback}>
            <button disabled={!canPublishContent} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50">Rollback</button>
          </form>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
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
            <Link className="rounded-lg border border-amber-200 px-3 py-2 text-sm" href={`/ops/product/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`}>Cancel</Link>
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
            我确认要回滚到上一已发布版本
          </label>
          <div className="mt-4 flex gap-3">
            <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">Confirm rollback</button>
            <Link className="rounded-lg border border-amber-200 px-3 py-2 text-sm" href={`/ops/product/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`}>Cancel</Link>
          </div>
        </form>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Drafts</p>
          <p className="mt-2 text-xs text-zinc-500">选择一个 draft 后再 Submit/Review/Preview/Publish。</p>
          <ul className="mt-4 space-y-3">
            {drafts.length ? (
              drafts.map((d) => (
                <li key={d.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-sm font-medium text-zinc-900">
                    <Link className="underline underline-offset-4" href={`/ops/product/${id}?draft=${d.id}`}>
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
                <label className="text-xs font-medium text-zinc-700">Subtitle</label>
                <input
                  name="subtitle"
                  defaultValue={activeDraft.payload?.subtitle ?? ""}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">Short description</label>
                <textarea
                  name="shortDescription"
                  defaultValue={activeDraft.payload?.shortDescription ?? ""}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  rows={3}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-700">Key benefits (one per line)</label>
                  <textarea
                    name="keyBenefits"
                    defaultValue={(activeDraft.payload?.keyBenefits ?? []).join("\n")}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={6}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700">Who it’s for (one per line)</label>
                  <textarea
                    name="whoItsFor"
                    defaultValue={(activeDraft.payload?.whoItsFor ?? []).join("\n")}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={6}
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-700">Why it feels different (one per line)</label>
                  <textarea
                    name="whyItFeelsDifferent"
                    defaultValue={(activeDraft.payload?.whyItFeelsDifferent ?? []).join("\n")}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={6}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700">Care instructions (one per line)</label>
                  <textarea
                    name="careInstructions"
                    defaultValue={(activeDraft.payload?.careInstructions ?? []).join("\n")}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={6}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">What’s in box (one per line)</label>
                <textarea
                  name="whatsInBox"
                  defaultValue={(activeDraft.payload?.whatsInBox ?? []).join("\n")}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  rows={5}
                />
              </div>

              <button disabled={!canManageContent} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50" type="submit">
                Save draft
              </button>
              <p className="text-xs text-zinc-500">
                提示：为空的字段不会覆盖草稿；列表字段以“每行一条”保存。
              </p>
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
          <p className="text-sm font-medium text-zinc-900">Signals</p>
          <p className="mt-2 text-xs text-zinc-500">版本表现快照（MVP）。</p>
          <form action={onCaptureSnapshot} className="mt-3">
            <button disabled={!canCaptureSignalsSnapshot} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm disabled:opacity-50" type="submit">
              Capture snapshot (7d)
            </button>
          </form>
          {signals.items.length ? (
            <ul className="mt-4 space-y-3">
              {signals.items.slice(0, 5).map((s) => (
                <li key={s.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500">
                    {s.capturedAt} · {s.windowDays}d · ref:{" "}
                    <code className="rounded bg-zinc-100 px-1">{s.contentRef ?? "∅"}</code>
                  </p>
                  <p className="mt-2 text-sm text-zinc-900">
                    Views: {s.metrics.views} · CTA: {s.metrics.ctaClicks} · ATC: {s.metrics.addToCart}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">No signals yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Performance compare</p>
          {signalOverview?.comparison ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-xs text-zinc-500">Views</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">{signalOverview.comparison.current.views}</p>
                {signalOverview.comparison.delta ? (
                  <p
                    className={`mt-1 text-xs ${
                      signalOverview.comparison.delta.views >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {signalOverview.comparison.delta.views >= 0 ? "+" : ""}
                    {signalOverview.comparison.delta.views} vs previous version
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-xs text-zinc-500">CTA rate</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">
                  {(signalOverview.comparison.current.ctaRate * 100).toFixed(2)}%
                </p>
                {signalOverview.comparison.delta ? (
                  <p
                    className={`mt-1 text-xs ${
                      signalOverview.comparison.delta.ctaRate >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {signalOverview.comparison.delta.ctaRate >= 0 ? "+" : ""}
                    {(signalOverview.comparison.delta.ctaRate * 100).toFixed(2)} pts
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl bg-zinc-50 p-3">
                <p className="text-xs text-zinc-500">ATC rate</p>
                <p className="mt-1 text-sm font-medium text-zinc-900">
                  {(signalOverview.comparison.current.addToCartRate * 100).toFixed(2)}%
                </p>
                {signalOverview.comparison.delta ? (
                  <p
                    className={`mt-1 text-xs ${
                      signalOverview.comparison.delta.addToCartRate >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {signalOverview.comparison.delta.addToCartRate >= 0 ? "+" : ""}
                    {(signalOverview.comparison.delta.addToCartRate * 100).toFixed(2)} pts
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">Not enough snapshots to compare versions yet.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Recommendations</p>
          <p className="mt-2 text-xs text-zinc-500">当 signal 命中规则时，会生成一条建议。</p>
          {recommendations.items.length ? (
            <div className="mt-4 space-y-3">
              {recommendations.items.slice(0, 5).map((rec) => (
                <div key={rec.id} className="rounded-xl border border-zinc-200 p-3">
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
                    {priorityBadge(rec)}
                    {staleBadge(rec)}
                    {effectBadge(rec)}
                    {rec.severity ? (
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{rec.severity}</span>
                    ) : null}
                  </div>
                  {rec.preparedDraft ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      Draft ready:{" "}
                      <Link
                        className="underline underline-offset-4"
                        href={`/ops/product/${id}?draft=${rec.preparedDraft.draftId}`}
                      >
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
                  {rec.effect?.summary ? <p className="mt-2 text-xs text-zinc-500">效果：{rec.effect.summary}</p> : null}
                  {rec.context ? (
                    <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
                      <p>
                        Window {rec.context.snapshot.windowDays}d · Views {rec.context.snapshot.metrics.views} · CTA{" "}
                        {fmtPercent(rec.context.snapshot.rates.ctaRate)} · ATC {fmtPercent(rec.context.snapshot.rates.addToCartRate)}
                      </p>
                      {rec.context.delta ? (
                        <p className="mt-1">
                          vs prev: CTA {fmtPts(rec.context.delta.rates.ctaRate)} · ATC {fmtPts(rec.context.delta.rates.addToCartRate)}
                        </p>
                      ) : (
                        <p className="mt-1">vs prev: n/a</p>
                      )}
                      {rec.context.focusAreas?.length ? (
                        <p className="mt-2">关注点：{rec.context.focusAreas.map(focusLabel).join("、")}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rec.preparedDraft ? (
                      <Link
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                        href={`/ops/product/${id}?draft=${rec.preparedDraft.draftId}`}
                      >
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
                      <input
                        name="note"
                        placeholder="处理备注（可选）"
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                      />
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
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-600">No open recommendations.</p>
          )}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Recommendation state</p>
          <p className="mt-2 text-xs text-zinc-500">B2.5 引入处理中状态，避免 recommendation 只有“开/关”两种状态。</p>
          <div className="mt-4 space-y-3 text-sm text-zinc-700">
            <p><code className="rounded bg-zinc-100 px-1">open</code>：待处理。</p>
            <p><code className="rounded bg-zinc-100 px-1">in_progress</code>：已经开始生成/评估新草稿。</p>
            <p><code className="rounded bg-zinc-100 px-1">resolved</code>：问题已处理完成。</p>
            <p><code className="rounded bg-zinc-100 px-1">dismissed</code>：本次不采纳。</p>
          </div>
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
