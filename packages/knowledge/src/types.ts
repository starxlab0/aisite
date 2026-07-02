export type KnowledgeAssetType =
  | "rule"
  | "template"
  | "case"
  | "experiment"
  | "playbook";

export type KnowledgeScope =
  | "global"
  | "industry"
  | "brand"
  | "site"
  | "locale";

export type KnowledgeStatus = "draft" | "active" | "archived";

export type KnowledgePriority = "low" | "medium" | "high";

export type KnowledgeTargetType =
  | "homepage"
  | "collection"
  | "product"
  | "guide"
  | "faq"
  | "module";

export type KnowledgeMetric =
  | "impressions"
  | "clicks"
  | "ctr"
  | "add_to_cart_rate"
  | "conversion_rate"
  | "revenue_per_session"
  | "time_on_page";

export type KnowledgeSourceRef = {
  type: "search_console" | "analytics" | "manual" | "crm" | "support";
  label: string;
};

export type KnowledgeCondition = {
  field: string;
  operator: "eq" | "neq" | "in" | "contains" | "gte" | "lte";
  value: string | number | boolean | string[];
};

export type KnowledgeGuardrail = {
  kind: "legal" | "tone" | "medical" | "privacy" | "brand";
  description: string;
};

export type KnowledgeAssetBase = {
  id: string;
  type: KnowledgeAssetType;
  scope: KnowledgeScope;
  title: string;
  summary: string;
  tags: string[];
  status: KnowledgeStatus;
  priority: KnowledgePriority;
  version: number;
  sourceRefs?: KnowledgeSourceRef[];
  updatedAt: string;
};

export type KnowledgeRule = KnowledgeAssetBase & {
  type: "rule";
  appliesTo: KnowledgeTargetType[];
  triggerSignals: string[];
  conditions: KnowledgeCondition[];
  recommendedActions: string[];
  guardrails: KnowledgeGuardrail[];
  expectedMetrics: KnowledgeMetric[];
};

export type KnowledgeTemplateSection = {
  id: string;
  name: string;
  required: boolean;
  purpose: string;
};

export type KnowledgeTemplate = KnowledgeAssetBase & {
  type: "template";
  target: KnowledgeTargetType;
  intent: string;
  sections: KnowledgeTemplateSection[];
  promptFrame: string;
  outputFormat: "markdown" | "richtext" | "module-config";
};

export type KnowledgeCase = KnowledgeAssetBase & {
  type: "case";
  context: string;
  action: string;
  outcome: string;
  metricsBefore?: Partial<Record<KnowledgeMetric, number>>;
  metricsAfter?: Partial<Record<KnowledgeMetric, number>>;
};

export type KnowledgeExperimentResult = KnowledgeAssetBase & {
  type: "experiment";
  target: KnowledgeTargetType;
  hypothesis: string;
  changeSummary: string;
  evaluationWindow: "24h" | "7d" | "28d";
  metricsBefore: Partial<Record<KnowledgeMetric, number>>;
  metricsAfter: Partial<Record<KnowledgeMetric, number>>;
  verdict: "win" | "loss" | "inconclusive";
};

export type KnowledgePlaybook = KnowledgeAssetBase & {
  type: "playbook";
  objective: string;
  steps: string[];
  entrySignals: string[];
};

export type KnowledgeAsset =
  | KnowledgeRule
  | KnowledgeTemplate
  | KnowledgeCase
  | KnowledgeExperimentResult
  | KnowledgePlaybook;

export type SiteProfile = {
  siteId: string;
  industry: string;
  audience: string[];
  tone: string[];
  geoMarkets: string[];
  seoFocus: string[];
  growthLoops: string[];
  contentPriorities: string[];
  prohibitedClaims: string[];
};
