import type {
  ActionRun,
  ActionRunInput,
  ActionSignalSource,
  ActionStatus,
  ActionTransitionRule,
  EvaluationSnapshot,
  PublishPayload,
  ReviewDecision,
  RollbackPayload,
} from "./types";

const timestamp = new Date("2026-06-28T00:00:00.000Z").toISOString();

export const actionTransitionRules: ActionTransitionRule[] = [
  { from: "queued", to: ["planning", "failed"] },
  { from: "planning", to: ["generating", "failed"] },
  { from: "generating", to: ["review", "failed"] },
  { from: "review", to: ["approved", "failed"] },
  { from: "approved", to: ["published", "failed"] },
  { from: "published", to: ["rolled_back"] },
  { from: "rolled_back", to: [] },
  { from: "failed", to: [] },
];

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  const rule = actionTransitionRules.find((item) => item.from === from);
  return Boolean(rule?.to.includes(to));
}

export function createActionRun(id: string, input: ActionRunInput): ActionRun {
  return {
    id,
    input,
    status: "queued",
    transitionHistory: [
      {
        from: null,
        to: "queued",
        at: timestamp,
        note: "Action run created",
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function transitionActionRun(
  actionRun: ActionRun,
  nextStatus: ActionStatus,
  note?: string,
): ActionRun {
  if (!canTransition(actionRun.status, nextStatus)) {
    throw new Error(`Invalid transition: ${actionRun.status} -> ${nextStatus}`);
  }

  return {
    ...actionRun,
    status: nextStatus,
    updatedAt: timestamp,
    transitionHistory: [
      ...actionRun.transitionHistory,
      {
        from: actionRun.status,
        to: nextStatus,
        at: timestamp,
        note,
      },
    ],
  };
}

export function applyReviewDecision(
  actionRun: ActionRun,
  review: ReviewDecision,
): ActionRun {
  return {
    ...actionRun,
    review,
    updatedAt: review.decidedAt,
  };
}

export function attachPublishPayload(
  actionRun: ActionRun,
  publishPayload: PublishPayload,
): ActionRun {
  return {
    ...actionRun,
    publishPayload,
    updatedAt: publishPayload.publishedAt ?? actionRun.updatedAt,
  };
}

export function attachRollbackPayload(
  actionRun: ActionRun,
  rollbackPayload: RollbackPayload,
): ActionRun {
  return {
    ...actionRun,
    rollbackPayload,
    updatedAt: rollbackPayload.rolledBackAt ?? actionRun.updatedAt,
  };
}

export const sampleActionRunInput: ActionRunInput = {
  siteId: "brand-cn",
  objective: "扩写 first-time collection 的 FAQ 与 buying guide 内链",
  source: "manual",
  priority: "high",
  target: {
    type: "collection",
    id: "first-time",
    slug: "first-time",
    path: "/collection/first-time",
    locale: "en",
  },
  operation: "expand",
  model: "gpt-5-class",
  knowledgeAssetIds: ["rule-product-faq-depth", "template-collection-guide"],
  triggerSignals: ["manual-strategy-request"],
  constraints: ["保持品牌语气克制", "避免医疗承诺表达"],
};

export const sampleActionRun: ActionRun = transitionActionRun(
  createActionRun("run-seo-001", sampleActionRunInput),
  "planning",
  "Planner accepted initial objective",
);

export type {
  ActionRun,
  ActionRunInput,
  ActionSignalSource,
  ActionStatus,
  EvaluationSnapshot,
  PublishPayload,
  ReviewDecision,
  RollbackPayload,
} from "./types";
