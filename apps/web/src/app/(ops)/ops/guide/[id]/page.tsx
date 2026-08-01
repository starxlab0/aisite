import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createPreview,
  generateOpsDraft,
  getOpsAuthStatus,
  getOpsTargetDetail,
  publishOpsDraft,
  revokePreview,
  reviewOpsDraft,
  rollbackOpsTarget,
  submitOpsDraft,
  updateOpsDraft,
} from "@/lib/control-plane/ops";
import { getDiffSections } from "@/lib/control-plane/ops-diff";
import { listAvailableSiteKeys } from "@/lib/site/config";
import { PublishResultPanel } from "../../components/publish-result-panel";

type Props = {
  params: Promise<{ id: string }>;
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
  return { label: "继续排查", tone: "warning", detail: "当前没有明确的发布治理信号，先继续编辑和核对内容。" };
}

function governanceToneClass(tone: string) {
  if (tone === "critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (tone === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "progress") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default async function OpsGuideDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const activeDraftId = typeof sp.draft === "string" ? sp.draft : undefined;
  const previewUrl = typeof sp.previewUrl === "string" ? sp.previewUrl : undefined;
  const err = typeof sp.err === "string" ? sp.err : undefined;
  const intent = typeof sp.intent === "string" ? sp.intent : undefined;

  const detail = await getOpsTargetDetail("guide", id);
  const drafts = [...detail.opsDrafts].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const activeDraft = activeDraftId ? drafts.find((d) => d.id === activeDraftId) : drafts[0];
  const latestPublished = detail.publishedDrafts[0] ?? null;
  const latestPublishedOpsDraft = drafts.find((d) => d.status === "published" && d.published) ?? null;
  const latestRollbackEvent = detail.events.find((event) => event.action === "rollback") ?? null;
  const governanceState = deriveTargetGovernanceState({ activeDraft, latestPublishedOpsDraft, latestRollbackEvent });
  const diffSections = getDiffSections("guide", latestPublished?.payload, activeDraft?.payload);
  const previewTokens = detail.previewTokens.filter((token) => !activeDraft || token.draftId === activeDraft.id);
  const authStatus = await getOpsAuthStatus();
  const canManageContent = authStatus.capabilities.includes("manage_content");
  const canPreviewContent = authStatus.capabilities.includes("preview_content");
  const canReviewContent = authStatus.capabilities.includes("review_content");
  const canPublishContent = authStatus.capabilities.includes("publish_content");
  const basePath = `/ops/guide/${id}`;
  const availableSiteKeys = listAvailableSiteKeys();

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
      const draft = await generateOpsDraft("guide", id);
      redirect(`/ops/guide/${id}?draft=${draft.id}`);
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
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}`);
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
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}`);
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
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}`);
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
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}&previewUrl=${encodeURIComponent(p.previewUrl)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onPublish() {
    "use server";
    if (!activeDraft) return;
    redirect(`/ops/guide/${id}?draft=${activeDraft.id}&intent=publish`);
  }

  async function onConfirmPublish(formData: FormData) {
    "use server";
    if (!activeDraft) return;
    const reason = String(formData.get("reason") ?? "").trim();
    const confirmed = formData.get("confirmed") === "on";
    if (!reason || !confirmed) {
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}&err=${encodeURIComponent("Publish requires reason and confirmation")}`);
    }
    try {
      await publishOpsDraft(activeDraft.id, { reason, confirmed: true });
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed";
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}&err=${encodeURIComponent(message)}`);
    }
  }

  async function onRollback() {
    "use server";
    redirect(`/ops/guide/${id}${activeDraft ? `?draft=${activeDraft.id}&intent=rollback` : "?intent=rollback"}`);
  }

  async function onConfirmRollback(formData: FormData) {
    "use server";
    const reason = String(formData.get("reason") ?? "").trim();
    const confirmed = formData.get("confirmed") === "on";
    if (!reason || !confirmed) {
      redirect(`/ops/guide/${id}${activeDraft ? `?draft=${activeDraft.id}&err=${encodeURIComponent("Rollback requires reason and confirmation")}` : `?err=${encodeURIComponent("Rollback requires reason and confirmation")}`}`);
    }
    try {
      await rollbackOpsTarget("guide", id, { reason, confirmed: true });
      redirect(`/ops/guide/${id}`);
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
      redirect(`/ops/guide/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revoke preview failed";
      redirect(detailPath({ err: message }));
    }
  }

  async function onSaveDraft(formData: FormData) {
    "use server";
    if (!activeDraft) return;

    const requiredTitle = String(formData.get("title") ?? "").trim();
    const requiredExcerpt = String(formData.get("excerpt") ?? "").trim();
    const body = String(formData.get("body") ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!requiredTitle || !requiredExcerpt || body.length === 0) {
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}&err=${encodeURIComponent("Title, excerpt, and body are required")}`);
    }

    const patch: Record<string, unknown> = {
      title: requiredTitle,
      siteKeys: String(formData.get("siteKeys") ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      excerpt: requiredExcerpt,
      heroTitle: String(formData.get("heroTitle") ?? "").trim() || requiredTitle,
      heroSummary: String(formData.get("heroSummary") ?? "").trim() || requiredExcerpt,
      body,
      relatedProductSlugs: String(formData.get("relatedProductSlugs") ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      relatedCollectionSlugs: String(formData.get("relatedCollectionSlugs") ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      faqIds: String(formData.get("faqIds") ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      seo: {
        ...(activeDraft.payload?.seo ?? {}),
        title: String(formData.get("seoTitle") ?? "").trim() || requiredTitle,
        description: String(formData.get("seoDescription") ?? "").trim() || requiredExcerpt,
      },
    };

    const existingLocales = activeDraft.payload?.locales ?? {};
    const nextLocales: Record<string, any> = { ...existingLocales };
    (["en", "zh"] as const).forEach((locale) => {
      const title = String(formData.get(`${locale}_title`) ?? "").trim();
      const excerpt = String(formData.get(`${locale}_excerpt`) ?? "").trim();
      const localeBody = String(formData.get(`${locale}_body`) ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      const seoTitle = String(formData.get(`${locale}_seoTitle`) ?? "").trim();
      const seoDescription = String(formData.get(`${locale}_seoDescription`) ?? "").trim();
      if (!title && !excerpt && !localeBody.length && !seoTitle && !seoDescription) return;
      nextLocales[locale] = {
        ...(existingLocales?.[locale] ?? {}),
        ...(title ? { title } : {}),
        ...(excerpt ? { excerpt } : {}),
        ...(localeBody.length ? { body: localeBody } : {}),
        seo: {
          ...(existingLocales?.[locale]?.seo ?? {}),
          ...(seoTitle ? { title: seoTitle } : {}),
          ...(seoDescription ? { description: seoDescription } : {}),
        },
      };
    });
    if (Object.keys(nextLocales).length) patch.locales = nextLocales;

    try {
      await updateOpsDraft(activeDraft.id, patch);
      redirect(`/ops/guide/${id}?draft=${activeDraft.id}`);
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
            / guide / <code className="rounded bg-zinc-100 px-1">{id}</code>
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

      <div className={`mt-4 rounded-xl border p-4 ${governanceToneClass(governanceState.tone)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Governance state</p>
          <span className="rounded border border-current/20 px-2 py-0.5 text-xs">{governanceState.label}</span>
        </div>
        <p className="mt-2 text-xs">{governanceState.detail}</p>
      </div>

      {intent === "publish" ? (
        <form action={onConfirmPublish} className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">确认发布</p>
          <div className="mt-3">
            <label className="text-xs font-medium text-amber-900">原因</label>
            <select name="reason" className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
              <option value="">请选择原因</option>
              <option value="review-approved">审核通过</option>
              <option value="campaign-ready">内容可上线</option>
              <option value="content-refresh">导购内容更新</option>
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-amber-900">
            <input name="confirmed" type="checkbox" />
            我确认要发布该版本
          </label>
          <div className="mt-4 flex gap-3">
            <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">Confirm publish</button>
            <Link className="rounded-lg border border-amber-200 px-3 py-2 text-sm" href={`/ops/guide/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`}>Cancel</Link>
          </div>
        </form>
      ) : null}

      {intent === "rollback" ? (
        <form action={onConfirmRollback} className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-900">确认回滚</p>
          <div className="mt-3">
            <label className="text-xs font-medium text-rose-900">原因</label>
            <select name="reason" className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm">
              <option value="">请选择原因</option>
              <option value="quality-issue">内容质量问题</option>
              <option value="approval-mistake">误发布</option>
              <option value="business-change">业务策略变化</option>
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-rose-900">
            <input name="confirmed" type="checkbox" />
            我确认要回滚到上一已发布版本
          </label>
          <div className="mt-4 flex gap-3">
            <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white" type="submit">Confirm rollback</button>
            <Link className="rounded-lg border border-rose-200 px-3 py-2 text-sm" href={`/ops/guide/${id}${activeDraft ? `?draft=${activeDraft.id}` : ""}`}>Cancel</Link>
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
                    <Link className="underline underline-offset-4" href={`/ops/guide/${id}?draft=${d.id}`}>
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
                <label className="text-xs font-medium text-zinc-700">Applicable sites (one per line)</label>
                <textarea
                  name="siteKeys"
                  defaultValue={(activeDraft.payload?.siteKeys ?? []).join("\n")}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  rows={3}
                />
                <p className="mt-1 text-xs text-zinc-500">可用站点：{availableSiteKeys.join(" / ")}。留空表示所有站点可见。</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700">Excerpt</label>
                <textarea
                  name="excerpt"
                  defaultValue={activeDraft.payload?.excerpt ?? ""}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-700">Hero title</label>
                  <input
                    name="heroTitle"
                    defaultValue={activeDraft.payload?.heroTitle ?? ""}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700">Hero summary</label>
                  <textarea
                    name="heroSummary"
                    defaultValue={activeDraft.payload?.heroSummary ?? ""}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700">Body (one paragraph per line)</label>
                <textarea
                  name="body"
                  defaultValue={(activeDraft.payload?.body ?? []).join("\n")}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  rows={8}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-700">Related product slugs (one per line)</label>
                  <textarea
                    name="relatedProductSlugs"
                    defaultValue={(activeDraft.payload?.relatedProductSlugs ?? []).join("\n")}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700">Related collection slugs (one per line)</label>
                  <textarea
                    name="relatedCollectionSlugs"
                    defaultValue={(activeDraft.payload?.relatedCollectionSlugs ?? []).join("\n")}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={4}
                  />
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-700">FAQ ids (one per line)</label>
                  <textarea
                    name="faqIds"
                    defaultValue={(activeDraft.payload?.faqIds ?? []).join("\n")}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    rows={4}
                  />
                </div>
                <div className="grid gap-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-700">SEO title</label>
                    <input
                      name="seoTitle"
                      defaultValue={activeDraft.payload?.seo?.title ?? ""}
                      className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-700">SEO description</label>
                    <textarea
                      name="seoDescription"
                      defaultValue={activeDraft.payload?.seo?.description ?? ""}
                      className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-medium text-zinc-900">Localized content</p>
                <p className="mt-1 text-xs text-zinc-500">可选填写英文和中文版本；未填写的 locale 会继续回退默认字段。</p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {(["en", "zh"] as const).map((locale) => {
                    const localePayload = activeDraft.payload?.locales?.[locale] ?? {};
                    return (
                      <div key={locale} className="rounded-xl border border-zinc-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{locale}</p>
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="text-xs font-medium text-zinc-700">Title</label>
                            <input
                              name={`${locale}_title`}
                              defaultValue={localePayload.title ?? ""}
                              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-700">Excerpt</label>
                            <textarea
                              name={`${locale}_excerpt`}
                              defaultValue={localePayload.excerpt ?? ""}
                              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                              rows={3}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-700">Body (one paragraph per line)</label>
                            <textarea
                              name={`${locale}_body`}
                              defaultValue={(localePayload.body ?? []).join("\n")}
                              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                              rows={6}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-700">SEO title</label>
                            <input
                              name={`${locale}_seoTitle`}
                              defaultValue={localePayload.seo?.title ?? ""}
                              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-zinc-700">SEO description</label>
                            <textarea
                              name={`${locale}_seoDescription`}
                              defaultValue={localePayload.seo?.description ?? ""}
                              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                              rows={3}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button disabled={!canManageContent} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50" type="submit">
                Save draft
              </button>
              <p className="text-xs text-zinc-500">Title / Excerpt / Body 必填；正文以每行一个段落保存。</p>
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
                        {row.added?.length ? <p className="mt-2 text-xs text-emerald-700">Added: {row.added.join(" · ")}</p> : null}
                        {row.removed?.length ? <p className="mt-1 text-xs text-rose-700">Removed: {row.removed.join(" · ")}</p> : null}
                        <p className="mt-2 text-xs text-zinc-500">Published</p>
                        <pre className="mt-1 overflow-auto rounded bg-white p-2 text-[11px] text-zinc-700">{row.published}</pre>
                        <p className="mt-2 text-xs text-zinc-500">Draft</p>
                        <pre className="mt-1 overflow-auto rounded bg-white p-2 text-[11px] text-zinc-700">{row.draft}</pre>
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
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
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
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-600">No events yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
