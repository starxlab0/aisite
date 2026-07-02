export type ActionSignalSource =
  | "search_console"
  | "analytics"
  | "ad_platform"
  | "crm"
  | "support"
  | "manual";

export type ActionStatus =
  | "queued"
  | "planning"
  | "generating"
  | "review"
  | "approved"
  | "published"
  | "rolled_back"
  | "failed";

export type ActionPriority = "low" | "medium" | "high";

export type ActionTargetType = "page" | "module" | "faq" | "guide" | "collection";

export type ActionOperation =
  | "create"
  | "rewrite"
  | "expand"
  | "optimize"
  | "publish"
  | "rollback";

export type ActionTarget = {
  type: ActionTargetType;
  id?: string;
  slug?: string;
  path?: string;
  locale?: string;
};

export type ActionRunInput = {
  siteId: string;
  objective: string;
  source: ActionSignalSource;
  priority: ActionPriority;
  target: ActionTarget;
  operation: ActionOperation;
  model?: string;
  knowledgeAssetIds: string[];
  triggerSignals: string[];
  constraints?: string[];
};

export type ReviewDecision = {
  reviewer: string;
  decision: "approve" | "reject" | "needs_revision";
  notes?: string;
  decidedAt: string;
};

export type PublishPayload = {
  targetPath: string;
  contentRef: string;
  checksum?: string;
  publishedAt?: string;
};

export type RollbackPayload = {
  targetPath: string;
  rollbackToRef: string;
  reason: string;
  rolledBackAt?: string;
};

export type ActionRun = {
  id: string;
  input: ActionRunInput;
  status: ActionStatus;
  transitionHistory: Array<{
    from: ActionStatus | null;
    to: ActionStatus;
    at: string;
    note?: string;
  }>;
  review?: ReviewDecision;
  publishPayload?: PublishPayload;
  rollbackPayload?: RollbackPayload;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationSnapshot = {
  actionRunId: string;
  window: "24h" | "7d" | "28d";
  impressions?: number;
  clicks?: number;
  ctr?: number;
  addToCartRate?: number;
  conversionRate?: number;
  notes?: string;
};

export type ActionTransitionRule = {
  from: ActionStatus;
  to: ActionStatus[];
};
