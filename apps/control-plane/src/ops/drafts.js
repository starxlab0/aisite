const {
  generateProductRewriteDraft,
  reviewProductRewriteDraft,
} = require("../workflows/product-rewrite");
const {
  generateCollectionRewriteDraft,
  reviewCollectionRewriteDraft,
} = require("../workflows/collection-rewrite");
const { generateFaqDraft, reviewFaqExpansionDraft } = require("../workflows/faq-expansion");

const { createContentDraft, listDrafts, recordRollback } = require("../cms-adapters");
const {
  createEvent,
  createOpsDraft,
  getOpsDraft,
  listOpsDrafts,
  updateOpsDraft,
} = require("./store");
const { evaluateRollbackPolicy, getRollbackPolicy } = require("./rollback-policy");

function inferWorkflowForTargetType(targetType) {
  if (targetType === "product") return "product-rewrite";
  if (targetType === "collection") return "collection-rewrite";
  if (targetType === "faq") return "faq-expansion";
  return "unknown";
}

function toTargetEventId(draftOrInput) {
  return draftOrInput.type === "faq"
    ? `${draftOrInput.targetType}:${draftOrInput.targetId}`
    : draftOrInput.targetId;
}

function getEntityMeta(type, id) {
  if (type === "product") {
    return {
      schemaType: "productContentDraft",
      entityType: "product-content",
      targetType: "product",
      targetId: id,
      targetPath: `/product/${id}`,
    };
  }
  if (type === "collection") {
    return {
      schemaType: "collectionPageDraft",
      entityType: "collection-page",
      targetType: "collection",
      targetId: id,
      targetPath: `/collection/${id}`,
    };
  }
  if (type === "faq") {
    const [faqTargetType, faqTargetId] = id.split(":");
    return {
      schemaType: "faqDraft",
      entityType: "faq",
      targetType: faqTargetType,
      targetId: faqTargetId,
      // FAQ 在里程碑 A 里先统一通过 /faq 预览与确认
      targetPath: "/faq",
    };
  }
  return null;
}

function buildInitialPayload(type, id) {
  if (type === "product") {
    const generated = generateProductRewriteDraft({ targetId: id });
    return generated?.draft ?? null;
  }
  if (type === "collection") {
    const generated = generateCollectionRewriteDraft({ targetId: id });
    if (!generated) return null;
    return {
      hero: generated.draft.hero,
      sections: generated.draft.sections,
      internalLinks: generated.draft.internalLinks,
      authoringNotes: generated.authoringNotes,
    };
  }
  if (type === "faq") {
    const [faqTargetType, faqTargetId] = id.split(":");
    const generated = generateFaqDraft({ targetType: faqTargetType, targetId: faqTargetId });
    if (!generated) return null;
    return {
      title: `${generated.target.title} FAQ Draft`,
      items: generated.draftItems,
      authoringNotes: generated.authoringNotes,
    };
  }
  return null;
}

function findReusableOpsDraft({ type, targetType, targetId, workflow }) {
  return listOpsDrafts({ targetType, targetId })
    .filter((draft) => draft.type === type && draft.workflow === workflow && draft.status !== "published")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
}

function createOpsDraftInternal({ type, id, actor, extra = {} }) {
  const meta = getEntityMeta(type, id);
  if (!meta) return null;

  const payload = buildInitialPayload(type, id);
  if (!payload) return null;

  const draft = createOpsDraft({
    workflow: inferWorkflowForTargetType(type),
    type,
    targetType: meta.targetType,
    targetId: meta.targetId,
    targetPath: meta.targetPath,
    schemaType: meta.schemaType,
    entityType: meta.entityType,
    payload,
    ...extra,
  });

  createEvent({
    actor,
    action: "generate",
    target: { type, id },
    draftId: draft.id,
  });

  return draft;
}

function runReview(type, id) {
  if (type === "product") return reviewProductRewriteDraft({ targetId: id });
  if (type === "collection") return reviewCollectionRewriteDraft({ targetId: id });
  if (type === "faq") {
    const [faqTargetType, faqTargetId] = id.split(":");
    return reviewFaqExpansionDraft({ targetType: faqTargetType, targetId: faqTargetId });
  }
  return null;
}

async function computeNextContentRef(meta) {
  const published = await listDrafts({
    entityType: meta.entityType,
    targetId: meta.targetId,
    status: "published",
  });
  const nextVersion = published.length + 1;

  if (meta.entityType === "product-content") {
    return `product-${meta.targetId}-v${nextVersion}`;
  }
  if (meta.entityType === "collection-page") {
    return `collection-${meta.targetId}-v${nextVersion}`;
  }
  if (meta.entityType === "faq") {
    return `faq-${meta.targetType}-${meta.targetId}-v${nextVersion}`;
  }
  return `content-${meta.targetType}-${meta.targetId}-v${nextVersion}`;
}

async function generateOpsDraft({ type, id, actor }) {
  return createOpsDraftInternal({ type, id, actor });
}

function prepareOpsDraftForRecommendation({ recommendation, actor = "ai:recommendation" }) {
  const type = recommendation.targetType;
  const id = recommendation.targetId;
  const meta = getEntityMeta(type, id);
  if (!meta) return null;

  const workflow = recommendation.suggestedWorkflow || inferWorkflowForTargetType(type);
  const existing = findReusableOpsDraft({
    type,
    targetType: meta.targetType,
    targetId: meta.targetId,
    workflow,
  });

  if (existing) {
    const sourceRecommendationIds = Array.from(
      new Set([...(Array.isArray(existing.sourceRecommendationIds) ? existing.sourceRecommendationIds : []), recommendation.id]),
    );
    const next = updateOpsDraft(existing.id, {
      autoPrepared: true,
      autoPreparedAt: new Date().toISOString(),
      sourceRecommendationIds,
      sourceContentRef: recommendation.contentRef ?? null,
      sourceRecommendationReason: recommendation.reason,
      autoPreparedContext: recommendation.context ?? null,
    });
    createEvent({
      actor,
      action: "prepare_recommendation_draft",
      target: { type, id },
      draftId: next.id,
      note: `recommendation ${recommendation.id} reused existing draft`,
    });
    return {
      draftId: next.id,
      status: next.status,
      preparedAt: next.autoPreparedAt,
      reused: true,
      targetPath: next.targetPath,
    };
  }

  const draft = createOpsDraftInternal({
    type,
    id,
    actor,
    extra: {
      autoPrepared: true,
      autoPreparedAt: new Date().toISOString(),
      sourceRecommendationIds: [recommendation.id],
      sourceContentRef: recommendation.contentRef ?? null,
      sourceRecommendationReason: recommendation.reason,
      autoPreparedContext: recommendation.context ?? null,
    },
  });
  if (!draft) return null;

  createEvent({
    actor,
    action: "prepare_recommendation_draft",
    target: { type, id },
    draftId: draft.id,
    note: `recommendation ${recommendation.id} prepared a new draft`,
  });

  return {
    draftId: draft.id,
    status: draft.status,
    preparedAt: draft.autoPreparedAt,
    reused: false,
    targetPath: draft.targetPath,
  };
}

async function submitOpsDraft({ draftId, actor }) {
  const draft = getOpsDraft(draftId);
  if (!draft) return null;

  const next = updateOpsDraft(draftId, { status: "needs_review" });
  createEvent({
    actor,
    action: "submit",
    target: { type: draft.type, id: draft.type === "faq" ? `${draft.targetType}:${draft.targetId}` : draft.targetId },
    draftId,
  });
  return next;
}

async function reviewOpsDraft({ draftId, decision, note, actor }) {
  const draft = getOpsDraft(draftId);
  if (!draft) return null;

  const nextStatus = decision === "approve" ? "approved" : "changes_requested";
  const next = updateOpsDraft(draftId, {
    status: nextStatus,
    review: {
      decision,
      note: note ?? null,
      at: new Date().toISOString(),
      actor,
    },
  });

  createEvent({
    actor,
    action: decision === "approve" ? "approve" : "request_changes",
    target: { type: draft.type, id: draft.type === "faq" ? `${draft.targetType}:${draft.targetId}` : draft.targetId },
    draftId,
    note,
  });

  return next;
}

async function updateOpsDraftPayload({ draftId, patch, actor }) {
  const draft = getOpsDraft(draftId);
  if (!draft) return null;

  const next = updateOpsDraft(draftId, {
    payload: {
      ...draft.payload,
      ...patch,
    },
  });

  createEvent({
    actor,
    action: "edit",
    target: { type: draft.type, id: draft.type === "faq" ? `${draft.targetType}:${draft.targetId}` : draft.targetId },
    draftId,
  });

  return next;
}

async function publishOpsDraft({ draftId, actor, reason }) {
  const draft = getOpsDraft(draftId);
  if (!draft) return null;

  if (draft.status !== "approved") {
    return {
      status: "blocked",
      message: "Draft must be approved before publish",
    };
  }

  const contentRef = await computeNextContentRef({
    entityType: draft.entityType,
    targetType: draft.targetType,
    targetId: draft.targetId,
  });

  const record = await createContentDraft({
    id: `draft-${contentRef}`,
    schemaType: draft.schemaType,
    entityType: draft.entityType,
    targetType: draft.targetType,
    targetId: draft.targetId,
    targetPath: draft.targetPath,
    contentRef,
    status: "published",
    payload: draft.payload,
    meta: {
      workflow: draft.workflow,
      opsDraftId: draft.id,
      publishReason: reason ?? null,
    },
  });

  updateOpsDraft(draftId, {
    status: "published",
    published: {
      at: new Date().toISOString(),
      contentRef,
      linkedDocuments: record.linkedDocuments ?? [],
      revalidate: record.revalidate ?? null,
      verification: record.verification ?? null,
      snapshotBeforeIds: Array.isArray(record.snapshotBefore)
        ? record.snapshotBefore.map((doc) => doc?._id).filter(Boolean)
        : [],
      autoRollback: null,
    },
  });

  const targetEventId = toTargetEventId(draft);

  createEvent({
    actor,
    action: "publish",
    target: { type: draft.type, id: targetEventId },
    draftId,
    linkedDocuments: record.linkedDocuments ?? [],
    revalidate: record.revalidate ?? null,
    verification: record.verification ?? null,
    note: reason ?? undefined,
  });

  const verificationLevel = record.verification?.level;
  let followupRecommendation = null;
  if (verificationLevel === "warning" || verificationLevel === "blocked") {
    const { createVerificationFollowupRecommendation } = require("../signals/store");
    followupRecommendation = createVerificationFollowupRecommendation({
      targetType: draft.type,
      targetId: targetEventId,
      contentRef,
      level: verificationLevel,
      verification: record.verification,
      reason:
        verificationLevel === "blocked"
          ? "Publish verification blocked after publish. Follow-up draft should inspect page rendering and metadata."
          : "Publish verification warning after publish. Follow-up draft should inspect metadata/content mismatch.",
    });
    if (followupRecommendation) {
      createEvent({
        actor: "ai:verification",
        action: "create_followup_recommendation",
        target: { type: draft.type, id: targetEventId },
        draftId: followupRecommendation.preparedDraft?.draftId,
        note: `recommendation ${followupRecommendation.id} created for verification ${verificationLevel}`,
      });
    }
  }

  let autoRollback = null;
  const rollbackDecision = evaluateRollbackPolicy({
    targetType: draft.type,
    targetId: targetEventId,
    verification: record.verification,
  });

  if (rollbackDecision.shouldRollback) {
    autoRollback = await rollbackTarget({
      type: draft.type,
      id: targetEventId,
      actor: "ai:rollback",
      reason:
        rollbackDecision.reason === "verification-warning-threshold"
          ? `Auto rollback triggered because publish verification warning threshold was reached (${rollbackDecision.consecutiveWarnings}/${rollbackDecision.policy?.warning?.threshold}).`
          : "Auto rollback triggered because publish verification reached blocked level.",
      trigger: "auto",
      triggerReason: rollbackDecision.reason,
      sourceDraftId: draft.id,
      sourceContentRef: contentRef,
    });

    if (autoRollback?.status === "rolled_back") {
      updateOpsDraft(draftId, {
        published: {
          at: new Date().toISOString(),
          contentRef,
          linkedDocuments: record.linkedDocuments ?? [],
          revalidate: record.revalidate ?? null,
          verification: record.verification ?? null,
          snapshotBeforeIds: Array.isArray(record.snapshotBefore)
            ? record.snapshotBefore.map((doc) => doc?._id).filter(Boolean)
            : [],
          autoRollback: {
            status: autoRollback.status,
            rollbackFromRef: autoRollback.rollbackFromRef ?? contentRef,
            rollbackToRef: autoRollback.rollbackToRef ?? autoRollback.publishedRef ?? null,
            publishedRef: autoRollback.publishedRef ?? null,
            trigger: "auto",
            triggerReason: rollbackDecision.reason,
          },
        },
      });
    }
  }

  let incidentProposal = null;
  if (verificationLevel === "blocked" || rollbackDecision.reason === "verification-warning-threshold" || autoRollback?.status === "rolled_back") {
    const { createIncidentFollowupProposal } = require("../signals/store");
    const anomalyKind =
      autoRollback?.status === "rolled_back"
        ? rollbackDecision.reason === "verification-warning-threshold"
          ? "warning_threshold"
          : "auto_rollback"
        : "blocked_publish";

    incidentProposal = createIncidentFollowupProposal({
      actor: "ai:proposal",
      targetType: draft.type,
      targetId: targetEventId,
      anomalyKind,
      severity: anomalyKind === "blocked_publish" ? "critical" : "critical",
      summary:
        anomalyKind === "warning_threshold"
          ? "Repeated warning-level verification failures reached the rollback threshold. A repair proposal should tighten content or template quality before the next publish."
          : anomalyKind === "auto_rollback"
            ? "Publish verification triggered an automatic rollback. A repair proposal is needed before republishing."
            : "Publish verification reached blocked level, but no automatic rollback was available. A repair proposal is required.",
      sourceDraftId: draft.id,
      sourceContentRef: contentRef,
      linkedRecommendationId: followupRecommendation?.id ?? null,
      linkedDraftId: followupRecommendation?.preparedDraft?.draftId ?? null,
      expectedImpact:
        anomalyKind === "warning_threshold"
          ? "Reduce repeated warning-level verification failures and prevent future threshold-triggered auto rollbacks."
          : "Restore publish stability and reduce blocked verification incidents for this target.",
      applyHowTo:
        followupRecommendation?.preparedDraft?.draftId
          ? "Open the linked prepared draft, fix content or template issues, then republish after verification passes."
          : "Prepare a follow-up draft, fix the issue, then republish after verification passes.",
    });
  }

  return {
    status: autoRollback?.status === "rolled_back" ? "published_with_auto_rollback" : "published",
    contentRef,
    linkedDocuments: record.linkedDocuments ?? [],
    revalidate: record.revalidate ?? null,
    verification: record.verification ?? null,
    followupRecommendation,
    autoRollback,
    incidentProposal,
    rollbackPolicy: getRollbackPolicy(draft.type),
    draftRecord: {
      id: record.id,
      schemaType: record.schemaType,
      status: record.status,
    },
  };
}

async function rollbackTarget({ type, id, actor, reason, trigger = "manual", triggerReason = null, sourceDraftId = null, sourceContentRef = null }) {
  const meta = getEntityMeta(type, id);
  if (!meta) return null;

  const published = await listDrafts({
    entityType: meta.entityType,
    targetId: meta.targetId,
    status: "published",
  });

  const latest = published[0] ?? null;
  const previous = published[1] ?? null;

  if (!latest) {
    return {
      status: "blocked",
      message: "No published version to rollback",
    };
  }

  // MVP: 只对 product 做“真回滚”——覆盖写入上一版本 payload，从而让 storefront 立刻可见回退。
  if (type === "product") {
    if (!previous) {
      return {
        status: "blocked",
        message: "No previous published version to rollback to",
      };
    }

    const rollbackRef = await computeNextContentRef({
      entityType: meta.entityType,
      targetType: meta.targetType,
      targetId: meta.targetId,
    });

    const restored = await createContentDraft({
      id: `draft-${rollbackRef}`,
      schemaType: meta.schemaType,
      entityType: meta.entityType,
      targetType: meta.targetType,
      targetId: meta.targetId,
      targetPath: meta.targetPath,
      contentRef: rollbackRef,
      status: "published",
      payload: previous.payload,
      meta: {
        workflow: inferWorkflowForTargetType(type),
        action: "rollback",
        rollbackFromRef: latest.contentRef,
        rollbackToRef: previous.contentRef,
        rollbackReason: reason ?? null,
      },
    });

    createEvent({
      actor,
      action: "rollback",
      target: { type, id },
      trigger,
      triggerReason,
      sourceDraftId,
      sourceContentRef,
      linkedDocuments: restored.linkedDocuments ?? [],
      revalidate: restored.revalidate ?? null,
      verification: restored.verification ?? null,
      note: `${reason ? `${reason} · ` : ""}rollback ${latest.contentRef} -> ${previous.contentRef}`,
    });

    return {
      status: "rolled_back",
      rollbackFromRef: latest.contentRef,
      rollbackToRef: previous.contentRef,
      publishedRef: rollbackRef,
      trigger,
      triggerReason,
      linkedDocuments: restored.linkedDocuments ?? [],
      revalidate: restored.revalidate ?? null,
      verification: restored.verification ?? null,
      sourceDraftId,
      sourceContentRef,
    };
  }

  // 里程碑 B1：collection 也做“真回滚”
  if (type === "collection") {
    if (!previous) {
      return {
        status: "blocked",
        message: "No previous published version to rollback to",
      };
    }

    const rollbackRef = await computeNextContentRef({
      entityType: meta.entityType,
      targetType: meta.targetType,
      targetId: meta.targetId,
    });

    const restored = await createContentDraft({
      id: `draft-${rollbackRef}`,
      schemaType: meta.schemaType,
      entityType: meta.entityType,
      targetType: meta.targetType,
      targetId: meta.targetId,
      targetPath: meta.targetPath,
      contentRef: rollbackRef,
      status: "published",
      payload: previous.payload,
      meta: {
        workflow: inferWorkflowForTargetType(type),
        action: "rollback",
        rollbackFromRef: latest.contentRef,
        rollbackToRef: previous.contentRef,
        rollbackReason: reason ?? null,
      },
    });

    createEvent({
      actor,
      action: "rollback",
      target: { type, id },
      trigger,
      triggerReason,
      sourceDraftId,
      sourceContentRef,
      linkedDocuments: restored.linkedDocuments ?? [],
      revalidate: restored.revalidate ?? null,
      verification: restored.verification ?? null,
      note: `${reason ? `${reason} · ` : ""}rollback ${latest.contentRef} -> ${previous.contentRef}`,
    });

    return {
      status: "rolled_back",
      rollbackFromRef: latest.contentRef,
      rollbackToRef: previous.contentRef,
      publishedRef: rollbackRef,
      trigger,
      triggerReason,
      linkedDocuments: restored.linkedDocuments ?? [],
      revalidate: restored.revalidate ?? null,
      verification: restored.verification ?? null,
      sourceDraftId,
      sourceContentRef,
    };
  }

  // 其他类型：仍然先记录回滚事件（后续再补“真回滚”）
  const rollback = await recordRollback({
    id: `draft-rollback-${meta.entityType}-${meta.targetId}-${latest.contentRef}`,
    schemaType: meta.schemaType,
    entityType: meta.entityType,
    targetType: meta.targetType,
    targetId: meta.targetId,
    targetPath: meta.targetPath,
    contentRef: latest.contentRef,
    payload: {
      action: "rollback",
      rollbackToRef: latest.contentRef,
      rollbackReason: reason ?? null,
    },
    meta: {
      workflow: inferWorkflowForTargetType(type),
    },
  });

  createEvent({
    actor,
    action: "rollback",
    target: { type, id },
    trigger,
    triggerReason,
    sourceDraftId,
    sourceContentRef,
    linkedDocuments: rollback.linkedDocuments ?? [],
    revalidate: rollback.revalidate ?? null,
    verification: rollback.verification ?? null,
    note: reason ?? undefined,
  });

  return {
    status: "rolled_back",
    rollbackToRef: latest.contentRef,
    draftRecord: {
      id: rollback.id,
      schemaType: rollback.schemaType,
      status: rollback.status,
    },
    trigger,
    triggerReason,
    linkedDocuments: rollback.linkedDocuments ?? [],
    revalidate: rollback.revalidate ?? null,
    verification: rollback.verification ?? null,
    sourceDraftId,
    sourceContentRef,
  };
}

module.exports = {
  generateOpsDraft,
  prepareOpsDraftForRecommendation,
  getOpsDraft,
  listOpsDrafts,
  submitOpsDraft,
  reviewOpsDraft,
  updateOpsDraftPayload,
  publishOpsDraft,
  rollbackTarget,
};
