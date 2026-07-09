const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function resetControlPlaneModules() {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes(`${path.sep}apps${path.sep}control-plane${path.sep}src${path.sep}signals${path.sep}`)) {
      delete require.cache[key];
    }
    if (key.includes(`${path.sep}apps${path.sep}control-plane${path.sep}src${path.sep}ops${path.sep}`)) {
      delete require.cache[key];
    }
    if (key.includes(`${path.sep}apps${path.sep}control-plane${path.sep}src${path.sep}cms-adapters${path.sep}`)) {
      delete require.cache[key];
    }
    if (key.includes(`${path.sep}apps${path.sep}control-plane${path.sep}src${path.sep}publish${path.sep}`)) {
      delete require.cache[key];
    }
    if (key.includes(`${path.sep}apps${path.sep}control-plane${path.sep}src${path.sep}drafts${path.sep}`)) {
      delete require.cache[key];
    }
    if (key.includes(`${path.sep}apps${path.sep}control-plane${path.sep}src${path.sep}workflows${path.sep}`)) {
      delete require.cache[key];
    }
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function withTempEnv(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-signals-test-"));
  const env = {
    SIGNALS_STATE_FILE: path.join(dir, "signals-state.json"),
    SIGNALS_RULES_FILE: path.join(dir, "signals-rules.json"),
    OPS_STATE_FILE: path.join(dir, "ops-state.json"),
    OPS_ROLLBACK_POLICY_FILE: path.join(dir, "ops-rollback-policy.json"),
    OPS_AUTO_ACTION_POLICY_FILE: path.join(dir, "ops-auto-action-policy.json"),
    CMS_ADAPTER: "local",
  };
  const previous = {
    SIGNALS_STATE_FILE: process.env.SIGNALS_STATE_FILE,
    SIGNALS_RULES_FILE: process.env.SIGNALS_RULES_FILE,
    OPS_STATE_FILE: process.env.OPS_STATE_FILE,
    OPS_ROLLBACK_POLICY_FILE: process.env.OPS_ROLLBACK_POLICY_FILE,
    OPS_AUTO_ACTION_POLICY_FILE: process.env.OPS_AUTO_ACTION_POLICY_FILE,
    CMS_ADAPTER: process.env.CMS_ADAPTER,
  };
  Object.assign(process.env, env);
  t.after(() => {
    process.env.SIGNALS_STATE_FILE = previous.SIGNALS_STATE_FILE;
    process.env.SIGNALS_RULES_FILE = previous.SIGNALS_RULES_FILE;
    process.env.OPS_STATE_FILE = previous.OPS_STATE_FILE;
    process.env.OPS_ROLLBACK_POLICY_FILE = previous.OPS_ROLLBACK_POLICY_FILE;
    process.env.OPS_AUTO_ACTION_POLICY_FILE = previous.OPS_AUTO_ACTION_POLICY_FILE;
    process.env.CMS_ADAPTER = previous.CMS_ADAPTER;
    resetControlPlaneModules();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return env;
}

test("rules-config normalizes invalid rule overrides with warnings", (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_RULES_FILE, {
    "low-cta-rate": {
      description: "",
      severity: "broken",
      targetTypes: ["product", "bad-target"],
      workflows: {},
      params: {
        minViews: 0,
        maxRate: 2,
      },
    },
  });
  resetControlPlaneModules();
  const { getRuleDefinition } = require(path.join(repoRoot, "src/signals/rules-config.js"));
  const def = getRuleDefinition("low-cta-rate");

  assert.equal(def.severity, "warning");
  assert.deepEqual(def.targetTypes, ["product"]);
  assert.equal(def.workflows.product, "product-rewrite");
  assert.equal(def.params.minViews, 100);
  assert.equal(def.params.maxRate, 1);
  assert.ok(def.validation.warnings.length > 0);
});

test("low purchase rate rule definition is available with purchase config", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { getRuleDefinition } = require(path.join(repoRoot, "src/signals/rules-config.js"));

  const def = getRuleDefinition("low-purchase-rate");

  assert.equal(def.kind, "low-rate");
  assert.equal(def.rate, "purchase");
  assert.deepEqual(def.targetTypes, ["product", "collection"]);
  assert.equal(def.params.minViews, 150);
  assert.equal(def.params.maxRate, 0.003);
});

test("purchase diagnostics summarizes source counts and snapshot gap", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, ingestSnapshot, getPurchaseDiagnostics } = require(path.join(repoRoot, "src/signals/store.js"));

  trackEvent({
    at: "2026-07-01T00:00:00.000Z",
    targetType: "product",
    targetId: "kokocang-x",
    eventType: "purchase",
    source: "web",
    dedupeKey: "order:1:product:kokocang-x",
  });
  trackEvent({
    at: "2026-07-02T00:00:00.000Z",
    targetType: "product",
    targetId: "kokocang-x",
    eventType: "purchase",
    source: "medusa_webhook",
    dedupeKey: "order:2:product:kokocang-x",
  });
  ingestSnapshot({
    capturedAt: "2026-07-03T00:00:00.000Z",
    targetType: "product",
    targetId: "kokocang-x",
    windowDays: 7,
    metrics: {
      views: 100,
      ctaClicks: 10,
      addToCart: 5,
      purchases: 0,
    },
    source: "aggregated",
  });

  const summary = getPurchaseDiagnostics({ targetType: "product", targetId: "kokocang-x" });

  assert.equal(summary.status, "snapshot_behind");
  assert.equal(summary.eventPurchaseCount, 2);
  assert.equal(summary.snapshotPurchaseCount, 0);
  assert.equal(summary.gap, 2);
  assert.deepEqual(
    summary.bySource.map((item) => [item.source, item.count]),
    [
      ["medusa_webhook", 1],
      ["web", 1],
    ],
  );
});

test("monitoring summary aggregates stale workflow, publish anomalies, and purchase gaps", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, ingestSnapshot } = require(path.join(repoRoot, "src/signals/store.js"));
  const { createEvent } = require(path.join(repoRoot, "src/ops/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  process.env.NEXT_PUBLIC_MEDUSA_URL = "https://medusa.example.com";
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test";
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "proj123";
  process.env.NEXT_PUBLIC_SANITY_DATASET = "production";
  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes("medusa.example.com")) {
      return { ok: true, status: 200, statusText: "OK" };
    }
    if (href.includes(".api.sanity.io/")) {
      return { ok: true, status: 200, statusText: "OK" };
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.NEXT_PUBLIC_MEDUSA_URL;
    delete process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_SANITY_DATASET;
  });

  trackEvent({
    at: "2026-07-01T00:00:00.000Z",
    targetType: "product",
    targetId: "kokocang-x",
    eventType: "purchase",
    source: "web",
    dedupeKey: "order:11:product:kokocang-x",
  });
  trackEvent({
    at: "2026-07-02T00:00:00.000Z",
    targetType: "product",
    targetId: "kokocang-x",
    eventType: "purchase",
    source: "medusa_webhook",
    dedupeKey: "order:12:product:kokocang-x",
  });
  ingestSnapshot({
    capturedAt: new Date().toISOString(),
    targetType: "product",
    targetId: "kokocang-x",
    windowDays: 7,
    metrics: {
      views: 100,
      ctaClicks: 10,
      addToCart: 5,
      purchases: 0,
    },
    source: "aggregated",
  });

  createEvent({
    actor: "ops:test",
    action: "publish",
    target: { type: "product", id: "kokocang-x" },
    verification: { level: "warning" },
  });
  createEvent({
    actor: "ops:test",
    action: "rollback",
    target: { type: "product", id: "kokocang-x" },
    trigger: "manual",
  });

  const env = process.env.SIGNALS_STATE_FILE;
  const persisted = JSON.parse(fs.readFileSync(env, "utf8"));
  persisted.recommendations = [
    {
      id: "rec_stale_monitor",
      status: "in_progress",
      createdAt: "2026-07-01T00:00:00.000Z",
      startedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      targetType: "product",
      targetId: "kokocang-x",
      contentRef: "kokocang-x:v1",
      ruleId: "low-purchase-rate",
      reason: "purchase low",
      suggestedWorkflow: "product-rewrite",
      severity: "warning",
      priorityScore: 1900,
      priorityLevel: "p1",
      preparedDraft: { draftId: "draft_1" },
    },
    {
      id: "rec_publish_followup",
      status: "open",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      targetType: "product",
      targetId: "kokocang-x",
      contentRef: "kokocang-x:v2",
      ruleId: "publish-verification-followup",
      reason: "publish blocked",
      suggestedWorkflow: "product-rewrite",
      severity: "critical",
      priorityScore: 2800,
      priorityLevel: "p0",
      context: { verificationLevel: "blocked" },
      preparedDraft: { draftId: "draft_2" },
    },
  ];
  fs.writeFileSync(env, JSON.stringify(persisted, null, 2));

  resetControlPlaneModules();
  const { buildMonitoringSummary: buildSummaryAfterState } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const summary = await buildSummaryAfterState({});

  assert.equal(summary.workflow.staleCount, 1);
  assert.equal(summary.publishing.warningPublishes24h, 1);
  assert.equal(summary.publishing.rollbacks24h, 1);
  assert.equal(summary.publishing.blockedFollowupsOpen, 1);
  assert.equal(summary.purchase.misalignedTargetsCount, 1);
  assert.equal(summary.runtime.dependencies.medusa.status, "healthy");
  assert.equal(summary.runtime.dependencies.sanity.status, "healthy");
  assert.equal(summary.workflow.thresholds.warning, 1);
  assert.ok(summary.publishing.cases.length >= 1);
  assert.ok(summary.publishing.cases.some((item) => typeof item.nextAction === "string" && item.nextAction.length > 0));
  assert.ok(
    summary.publishing.cases.some(
      (item) =>
        Object.prototype.hasOwnProperty.call(item, "incidentProposalId") &&
        Object.prototype.hasOwnProperty.call(item, "repoChangeId"),
    ),
  );
  assert.ok(
    summary.publishing.cases.some(
      (item) => typeof item.actionCode === "string" && typeof item.actionLabel === "string" && typeof item.actionTone === "string",
    ),
  );
  assert.ok(summary.publishing.queue);
  assert.ok(Array.isArray(summary.publishing.queue.top));
  assert.ok(summary.publishing.queue.top.length >= 1);
  assert.ok(
    summary.publishing.queue.top.some(
      (item) => typeof item.stateCode === "string" && typeof item.stateLabel === "string" && typeof item.stateTone === "string",
    ),
  );
  assert.ok(summary.alerts.some((item) => item.title.includes("Workflow")));
  assert.ok(summary.alerts.some((item) => item.title.includes("Purchase reconciliation")));
});

test("monitoring summary creates AI concierge tuning recommendation for low entry ctr", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, listRecommendations, listRuleTuningProposals } = require(path.join(repoRoot, "src/signals/store.js"));
  const { listRepoChanges } = require(path.join(repoRoot, "src/ops/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  process.env.NEXT_PUBLIC_MEDUSA_URL = "https://medusa.example.com";
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test";
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "proj123";
  process.env.NEXT_PUBLIC_SANITY_DATASET = "production";
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.NEXT_PUBLIC_MEDUSA_URL;
    delete process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_SANITY_DATASET;
  });

  const nowTs = Date.now();
  const entryViewAt = new Date(nowTs - 2 * 60 * 60 * 1000).toISOString();
  const entryClickAt = new Date(nowTs - 90 * 60 * 1000).toISOString();

  for (let i = 0; i < 60; i += 1) {
    trackEvent({
      at: entryViewAt,
      targetType: "collection",
      targetId: "ai-concierge",
      eventType: "view",
      source: "ai_concierge",
      dedupeKey: `ai-entry-view:${i}`,
      metadata: {
        stage: "entry_view",
        experiment: "ai_concierge_v1",
        bucket: "A",
      },
    });
  }
  for (let i = 0; i < 2; i += 1) {
    trackEvent({
      at: entryClickAt,
      targetType: "collection",
      targetId: "ai-concierge",
      eventType: "cta",
      source: "ai_concierge",
      dedupeKey: `ai-entry-click:${i}`,
      metadata: {
        stage: "entry_click",
        experiment: "ai_concierge_v1",
        bucket: "A",
      },
    });
  }

  const summary = await buildMonitoringSummary({});
  const recs = listRecommendations({ targetType: "collection", targetId: "ai-concierge" });
  const proposals = listRuleTuningProposals({ ruleId: "ai-concierge-strategy", limit: 5 });
  const repoChanges = listRepoChanges({ proposalId: proposals.items[0]?.id });

  assert.ok(summary.alerts.some((item) => item.title.includes("AI concierge entry CTR is low")));
  assert.ok(summary.aiConcierge.recommendations.length > 0);
  assert.ok(summary.aiConcierge.proposals.length > 0);
  assert.ok(summary.aiConcierge.governance);
  assert.ok(typeof summary.aiConcierge.governance.counts.mainNeedsDecision === "number");
  assert.ok(Array.isArray(summary.governanceGroups));
  assert.ok(summary.governanceGroups.some((group) => group.key === "ai_concierge"));
  assert.ok(recs.some((item) => item.ruleId === "ai-concierge-funnel-dropoff" && item.context?.metricKey === "entry_ctr"));
  assert.ok(proposals.items.some((item) => item.ruleId === "ai-concierge-strategy"));
  assert.ok(repoChanges.length > 0);
  assert.ok(typeof repoChanges[0]?.prDraft?.title === "string" && repoChanges[0].prDraft.title.includes("AI concierge"));
  assert.ok(Array.isArray(repoChanges[0]?.prDraft?.checklist) && repoChanges[0].prDraft.checklist.length > 0);
});

test("monitoring summary includes commerce checkout funnel metrics", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const at = new Date().toISOString();
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_checkout_1",
    eventType: "checkout_start",
    source: "web",
    dedupeKey: "cart-1:checkout_start:product:prod_checkout_1",
    metadata: { stage: "checkout_start", attribution: { src: "guide" } },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_checkout_2",
    eventType: "checkout_start",
    source: "web",
    dedupeKey: "cart-1:checkout_start:product:prod_checkout_2",
    metadata: { stage: "checkout_start", attribution: { src: "guide" } },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_checkout_1",
    eventType: "checkout_complete",
    source: "web",
    dedupeKey: "order-1:checkout_complete:product:prod_checkout_1",
    metadata: { stage: "checkout_complete", attribution: { src: "guide" } },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_checkout_1",
    eventType: "purchase",
    source: "web",
    dedupeKey: "order-1:purchase:product:prod_checkout_1",
    metadata: { stage: "purchase", attribution: { src: "guide" } },
  });

  const summary = await buildMonitoringSummary({});
  assert.equal(summary.commerceCheckout.checkoutStarts, 2);
  assert.equal(summary.commerceCheckout.checkoutCompletes, 1);
  assert.equal(summary.commerceCheckout.checkoutDropoff, 1);
  assert.equal(summary.commerceCheckout.purchases24h, 1);
  assert.equal(summary.commerceCheckout.checkoutCompletionRate, 0.5);
});

test("monitoring summary creates SEO/GEO content recommendations and prepares drafts", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));
  const { getOpsDraft } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  await buildMonitoringSummary({});
  const recs = listRecommendations({ statuses: ["open", "in_progress"] });

  const faqGap = recs.find((item) => item.ruleId === "content-gap" && item.targetType === "faq" && item.targetId === "product:kokocang-x");
  const guideThin = recs.find((item) => item.ruleId === "thin-content" && item.targetType === "guide" && item.targetId === "how-to-choose");
  const collectionLinkGap = recs.find((item) => item.ruleId === "internal-link-gap" && item.targetType === "collection" && item.targetId === "first-time");

  assert.ok(faqGap);
  assert.equal(faqGap.suggestedWorkflow, "faq-expansion");
  assert.ok(faqGap.preparedDraft?.draftId);
  const faqDraft = getOpsDraft(faqGap.preparedDraft.draftId);
  assert.ok(faqDraft);
  assert.ok(Array.isArray(faqDraft.payload?.items));
  assert.ok(faqDraft.payload.items.length > 5);
  assert.ok(Array.isArray(faqDraft.payload?.schemaHints));
  assert.ok(faqDraft.payload.schemaHints.includes("FAQPage"));
  assert.ok(Array.isArray(faqDraft.payload?.structuredData));
  assert.ok(faqDraft.payload.structuredData.some((item) => item?.["@type"] === "FAQPage"));

  assert.ok(guideThin);
  assert.equal(guideThin.suggestedWorkflow, "guide-article");
  assert.ok(guideThin.preparedDraft?.draftId);
  const guideDraft = getOpsDraft(guideThin.preparedDraft.draftId);
  assert.ok(guideDraft);
  assert.equal(guideDraft.workflow, "guide-article");
  assert.ok(Array.isArray(guideDraft.payload?.body));
  assert.ok(guideDraft.payload.body.some((line) => String(line).includes("结论先说")));
  assert.ok(Array.isArray(guideDraft.payload?.schemaHints));
  assert.ok(guideDraft.payload.schemaHints.includes("Article"));
  assert.ok(guideDraft.payload.schemaHints.includes("BreadcrumbList"));
  assert.ok(Array.isArray(guideDraft.payload?.structuredData));
  assert.ok(guideDraft.payload.structuredData.some((item) => item?.["@type"] === "HowTo"));

  assert.ok(collectionLinkGap);
  assert.equal(collectionLinkGap.suggestedWorkflow, "collection-rewrite");
  assert.ok(collectionLinkGap.preparedDraft?.draftId);
  const collectionDraft = getOpsDraft(collectionLinkGap.preparedDraft.draftId);
  assert.ok(collectionDraft);
  assert.ok(Array.isArray(collectionDraft.payload?.sections));
  assert.ok(collectionDraft.payload.sections.some((section) => section.key === "guide-links"));
  assert.ok(Array.isArray(collectionDraft.payload?.internalLinks));
  assert.ok(collectionDraft.payload.internalLinks.some((path) => String(path).includes("/guides/how-to-choose")));
  assert.ok(Array.isArray(collectionDraft.payload?.schemaHints));
  assert.ok(collectionDraft.payload.schemaHints.includes("CollectionPage"));
  assert.ok(Array.isArray(collectionDraft.payload?.structuredData));
  assert.ok(collectionDraft.payload.structuredData.some((item) => item?.["@type"] === "CollectionPage"));
});

test("monitoring summary creates SEO performance recommendations from ingested metrics", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { ingestSeoMetrics } = require(path.join(repoRoot, "src/ops/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const today = new Date().toISOString().slice(0, 10);
  const prev = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  ingestSeoMetrics({
    actor: "ops:test",
    source: "test",
    rows: [
      { date: today, targetType: "product", targetId: "kokocang-x", impressions: 120, clicks: 1, position: 10.2 },
      { date: prev, targetType: "product", targetId: "kokocang-x", impressions: 140, clicks: 12, position: 3.1 },
    ],
  });

  const summary = await buildMonitoringSummary({});
  const recs = listRecommendations({ statuses: ["open", "in_progress"] });
  const lowCtr = recs.find((item) => item.ruleId === "seo-low-ctr" && item.targetType === "product" && item.targetId === "kokocang-x");
  const posDrop = recs.find((item) => item.ruleId === "seo-position-drop" && item.targetType === "product" && item.targetId === "kokocang-x");
  assert.ok(lowCtr);
  assert.ok(posDrop);
  assert.ok(lowCtr.preparedDraft?.draftId);
  assert.ok(Array.isArray(lowCtr.context?.actionHints));
  assert.ok(lowCtr.context.actionHints.length >= 3);
  assert.ok(summary.seoPerformance?.targets?.length);
  const first = summary.seoPerformance.targets[0];
  assert.ok(typeof first.issueScore === "number");
});

test("monitoring summary includes payment result signals and deduplicates by order id", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const at = new Date().toISOString();
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_pay_1",
    eventType: "payment_paid",
    source: "medusa_webhook",
    dedupeKey: "order-200:payment_paid:product:prod_pay_1",
    metadata: { orderId: "order-200", paymentStatus: "paid", paymentDetail: "paid", paymentIssueReason: "completed" },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_pay_2",
    eventType: "payment_paid",
    source: "medusa_webhook",
    dedupeKey: "order-200:payment_paid:product:prod_pay_2",
    metadata: { orderId: "order-200", paymentStatus: "paid", paymentDetail: "paid", paymentIssueReason: "completed" },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_pay_3",
    contentRef: "prod-pay-3",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-201:payment_failed:product:prod_pay_3",
    metadata: { orderId: "order-201", paymentStatus: "failed", paymentDetail: "failed", paymentIssueReason: "declined" },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_pay_4",
    eventType: "payment_canceled",
    source: "payment_webhook",
    dedupeKey: "order-202:payment_canceled:product:prod_pay_4",
    metadata: { orderId: "order-202", paymentStatus: "failed", paymentDetail: "canceled", paymentIssueReason: "customer_abandon" },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_pay_5",
    eventType: "payment_requires_action",
    source: "payment_webhook",
    dedupeKey: "order-203:payment_requires_action:product:prod_pay_5",
    metadata: { orderId: "order-203", paymentStatus: "pending", paymentDetail: "requires_action", paymentIssueReason: "action_required" },
  });

  const summary = await buildMonitoringSummary({});
  assert.equal(summary.paymentResults24h.paid, 1);
  assert.equal(summary.paymentResults24h.failed, 1);
  assert.equal(summary.paymentResults24h.canceled, 1);
  assert.equal(summary.paymentResults24h.requiresAction, 1);
  assert.equal(summary.paymentResults24h.issues, 3);
  assert.equal(summary.paymentResults24h.issueRate, 1);
  assert.equal(summary.paymentResults24h.recoveryLanes.providerReview, 1);
  assert.equal(summary.paymentResults24h.recoveryLanes.customerRetry, 1);
  assert.equal(summary.paymentResults24h.recoveryLanes.customerAction, 1);
  assert.equal(summary.paymentResults24h.recoveryLanes.fulfillmentReady, 1);
  assert.equal(summary.paymentResults24h.topReasons.payment_failed[0]?.reason, "declined");
  assert.equal(summary.paymentResults24h.topReasons.payment_failed[0]?.label, "declined");
  assert.ok(Array.isArray(summary.paymentResults24h.recommendations));
  assert.ok(summary.paymentResults24h.recommendations.some((item) => item.ruleId === "payment-result-issue"));
  const paymentRec = summary.paymentResults24h.recommendations.find((item) => item.targetId === "payment_failed");
  assert.ok(paymentRec);
  assert.equal(paymentRec.context?.observedCount, 1);
  assert.equal(paymentRec.context?.recoveryLane, "provider_review");
  assert.equal(paymentRec.context?.paymentIssueReason, "declined");
  assert.equal(paymentRec.context?.paymentIssueReasonLabel, "declined");
  assert.equal(summary.paymentResults24h.topTargets.payment_failed[0]?.targetPath, "/products/prod-pay-3");
  assert.equal(paymentRec.context?.weakestPath?.targetPath, "/products/prod-pay-3");
  assert.ok(Array.isArray(summary.paymentResults24h.proposals));
  const paymentProposal = summary.paymentResults24h.proposals.find((item) => item.anomalyKind === "payment_result_issue");
  assert.ok(paymentProposal);
  assert.equal(paymentProposal.targetType, "journey");
  assert.equal(paymentProposal.targetId, "payment_failed");
  assert.equal(paymentProposal.linkedRecommendationId, paymentRec.id);
});

test("monitoring summary includes fulfillment result signals", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const at = new Date().toISOString();
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_ful_1",
    contentRef: "prod-ful-1",
    eventType: "fulfillment_processing",
    source: "medusa_webhook",
    dedupeKey: "order-300:fulfillment_processing:product:prod_ful_1",
    metadata: { orderId: "order-300", fulfillmentStatus: "processing" },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_ful_2",
    contentRef: "prod-ful-2",
    eventType: "fulfillment_shipped",
    source: "medusa_webhook",
    dedupeKey: "order-301:fulfillment_shipped:product:prod_ful_2",
    metadata: { orderId: "order-301", fulfillmentStatus: "shipped" },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_ful_3",
    contentRef: "prod-ful-3",
    eventType: "fulfillment_delivered",
    source: "medusa_webhook",
    dedupeKey: "order-302:fulfillment_delivered:product:prod_ful_3",
    metadata: { orderId: "order-302", fulfillmentStatus: "delivered" },
  });

  const summary = await buildMonitoringSummary({});
  assert.equal(summary.fulfillmentResults24h.processing, 1);
  assert.equal(summary.fulfillmentResults24h.shipped, 1);
  assert.equal(summary.fulfillmentResults24h.delivered, 1);
  assert.equal(summary.fulfillmentResults24h.topTargets.fulfillment_processing[0]?.targetPath, "/products/prod-ful-1");
});

test("monitoring summary creates fulfillment backlog recommendation when processing accumulates", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const at = new Date().toISOString();
  ["order-400", "order-401", "order-402"].forEach((orderId, index) => {
    trackEvent({
      at,
      targetType: "product",
      targetId: `prod_ful_backlog_${index + 1}`,
      contentRef: `prod-ful-backlog-${index + 1}`,
      eventType: "fulfillment_processing",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:fulfillment_processing:product:${index + 1}`,
      metadata: { orderId, fulfillmentStatus: "processing" },
    });
  });

  const summary = await buildMonitoringSummary({});
  assert.ok(Array.isArray(summary.fulfillmentResults24h.recommendations));
  const fulfillmentRec = summary.fulfillmentResults24h.recommendations.find((item) => item.ruleId === "fulfillment-backlog");
  assert.ok(fulfillmentRec);
  assert.equal(fulfillmentRec.context?.processingCount, 3);
  assert.equal(fulfillmentRec.context?.shippedCount, 0);
  assert.equal(fulfillmentRec.context?.weakestPath?.targetPath, "/products/prod-ful-backlog-1");
  assert.ok(Array.isArray(summary.fulfillmentResults24h.proposals));
  const fulfillmentProposal = summary.fulfillmentResults24h.proposals.find((item) => item.anomalyKind === "fulfillment_backlog");
  assert.ok(fulfillmentProposal);
  assert.equal(fulfillmentProposal.targetType, "journey");
  assert.equal(fulfillmentProposal.targetId, "fulfillment_processing");
  assert.equal(fulfillmentProposal.linkedRecommendationId, fulfillmentRec.id);
});

test("fulfillment backlog proposal exposes post-apply observation after follow-up is applied", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, transitionRuleTuningProposal, getRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  ["ful-pre-1", "ful-pre-2", "ful-pre-3"].forEach((orderId, index) => {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `prod_ful_apply_${index + 1}`,
      contentRef: `prod-ful-apply-${index + 1}`,
      eventType: "fulfillment_processing",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:fulfillment_processing:${index + 1}`,
      metadata: { orderId, fulfillmentStatus: "processing" },
    });
  });

  const summary = await buildMonitoringSummary({ actor: "ops:test" });
  const proposal = summary.fulfillmentResults24h.proposals.find((item) => item.targetId === "fulfillment_processing");
  assert.ok(proposal);

  let transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "approved",
    note: "approve fulfillment recovery proposal",
  });
  assert.equal(transitioned.status, "ok");

  transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "ship fulfillment handoff fix",
  });
  assert.equal(transitioned.status, "ok");

  const postAt = new Date().toISOString();
  ["ful-post-1", "ful-post-2", "ful-post-3", "ful-post-4"].forEach((orderId) => {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: "prod_ful_apply_done",
      contentRef: "prod-ful-apply-done",
      eventType: "fulfillment_shipped",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:fulfillment_shipped`,
      metadata: { orderId, fulfillmentStatus: "shipped" },
    });
  });

  const refreshed = getRuleTuningProposal(proposal.id);
  assert.equal(refreshed.status, "applied");
  assert.equal(refreshed.postApplyEffect?.mode, "fulfillment_backlog_window");
  assert.ok(Number(refreshed.postApplyEffect?.delta?.processingBacklogRate ?? 0) < 0);
  assert.ok(["observe", "steady", "success"].includes(String(refreshed.reviewSummary?.state || "")));
  assert.ok(refreshed.reviewSummary?.signals?.some((item) => String(item).includes("backlog rate pre")));
});

test("monitoring summary creates fulfillment observation follow-up recommendation when applied fulfillment proposal stays risky", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, transitionRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listSupportCases } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  ["fur-pre-1", "fur-pre-2", "fur-pre-3"].forEach((orderId, index) => {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `prod_ful_risk_${index + 1}`,
      contentRef: `prod-ful-risk-${index + 1}`,
      eventType: "fulfillment_processing",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:fulfillment_processing:${index + 1}`,
      metadata: { orderId, fulfillmentStatus: "processing" },
    });
  });

  const first = await buildMonitoringSummary({ actor: "ops:test" });
  const proposal = first.fulfillmentResults24h.proposals.find((item) => item.targetId === "fulfillment_processing");
  assert.ok(proposal);
  assert.equal(
    transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "approved", note: "approve fulfillment risk fix" }).status,
    "ok",
  );
  assert.equal(
    transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "applied", note: "ship first fulfillment risk fix" }).status,
    "ok",
  );

  const postAt = new Date().toISOString();
  ["fur-post-1", "fur-post-2"].forEach((orderId, index) => {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `prod_ful_risk_post_${index + 1}`,
      contentRef: `prod-ful-risk-post-${index + 1}`,
      eventType: "fulfillment_processing",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:fulfillment_processing:post:${index + 1}`,
      metadata: { orderId, fulfillmentStatus: "processing" },
    });
  });

  const second = await buildMonitoringSummary({ actor: "ops:test" });
  const followup = second.fulfillmentResults24h.recommendations.find((item) => item.ruleId === "fulfillment-observation-followup");
  assert.ok(followup);
  assert.equal(followup.targetType, "journey");
  assert.equal(followup.targetId, "fulfillment_processing");
  assert.equal(followup.context?.parentProposalId, proposal.id);
  const supportCases = listSupportCases({ status: "open", limit: 20 }).items;
  assert.ok(supportCases.some((item) => item.kind === "fulfillment_followup_review" && item.target?.id === "fulfillment_processing"));
});

test("monitoring summary upserts customer notification intents from order signals", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const at = new Date().toISOString();
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_notify_1",
    contentRef: "prod-notify-1",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-900:payment_failed:product:prod_notify_1",
    metadata: { orderId: "order-900", email: "customer@example.com", paymentStatus: "failed", paymentDetail: "failed" },
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_notify_1",
    contentRef: "prod-notify-1",
    eventType: "fulfillment_processing",
    source: "medusa_webhook",
    dedupeKey: "order-900:fulfillment_processing:product:prod_notify_1",
    metadata: { orderId: "order-900", email: "customer@example.com", fulfillmentStatus: "processing" },
  });

  await buildMonitoringSummary({ actor: "ops:test" });
  const { items } = listCustomerNotifications({ status: "open", limit: 20 });
  const found = items.find((n) => n.orderId === "order-900");
  assert.ok(found);
  assert.equal(found.to, "customer@example.com");
  assert.equal(found.kind, "payment_failed");
  assert.equal(found.title, "Retry payment for your order");
  assert.equal(found.ctaLabel, "Retry payment");
  assert.ok(String(found.detail || "").includes("shipping may take longer than usual"));
  const filtered = listCustomerNotifications({ status: "open", q: "order-900", limit: 20 }).items;
  assert.ok(filtered.length >= 1);
});

test("customer notification templates differentiate payment failed and requires action", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  trackEvent({
    at: new Date().toISOString(),
    targetType: "product",
    targetId: "prod_notify_tpl_1",
    contentRef: "prod-notify-tpl-1",
    eventType: "payment_requires_action",
    source: "payment_webhook",
    dedupeKey: "order-907:payment_requires_action:product:prod_notify_tpl_1",
    metadata: { orderId: "order-907", email: "customer8@example.com", paymentStatus: "requires_action" },
  });
  trackEvent({
    at: new Date().toISOString(),
    targetType: "product",
    targetId: "prod_notify_tpl_2",
    contentRef: "prod-notify-tpl-2",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-908:payment_failed:product:prod_notify_tpl_2",
    metadata: { orderId: "order-908", email: "customer9@example.com", paymentStatus: "failed" },
  });

  await buildMonitoringSummary({ actor: "ops:test" });
  const items = listCustomerNotifications({ status: "open", limit: 20 }).items;
  const requiresAction = items.find((n) => n.orderId === "order-907");
  const paymentFailed = items.find((n) => n.orderId === "order-908");
  assert.ok(requiresAction);
  assert.ok(paymentFailed);
  assert.equal(requiresAction.title, "Complete your payment verification");
  assert.equal(requiresAction.ctaLabel, "Complete verification");
  assert.ok(String(requiresAction.detail || "").includes("extra payment confirmation step"));
  assert.equal(paymentFailed.title, "Retry payment for your order");
  assert.equal(paymentFailed.ctaLabel, "Retry payment");
  assert.ok(String(paymentFailed.detail || "").includes("switch to a different payment method"));
});

test("customer notification upsert rate-limits re-creation within one hour after send", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.RESEND_API_KEY = "test_key";
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications, sendCustomerNotification, ackCustomerNotification } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ id: "msg_test_1" }),
  });
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.RESEND_API_KEY;
  });

  const at = new Date().toISOString();
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_notify_rl_1",
    contentRef: "prod-notify-rl-1",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-901:payment_failed:product:prod_notify_rl_1",
    metadata: { orderId: "order-901", email: "customer2@example.com", paymentStatus: "failed", paymentDetail: "failed" },
  });

  await buildMonitoringSummary({ actor: "ops:test" });
  const firstOpen = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-901");
  assert.ok(firstOpen);
  assert.equal(firstOpen.kind, "payment_failed");

  const sendResult = await sendCustomerNotification({ id: firstOpen.id, actor: "ops:test" });
  assert.ok(sendResult);
  assert.equal(sendResult.status, "sent");

  const acked = ackCustomerNotification({ id: firstOpen.id, actor: "ops:test", note: "acked after send" });
  assert.ok(acked);
  assert.equal(acked.status, "acked");

  await buildMonitoringSummary({ actor: "ops:test" });
  const secondOpen = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-901" && n.kind === "payment_failed");
  assert.ok(!secondOpen);
});

test("customer notification upsert enforces order-level cooldown but allows priority upgrade", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.RESEND_API_KEY = "test_key";
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications, sendCustomerNotification, ackCustomerNotification } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ id: "msg_test_2" }),
  });
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.RESEND_API_KEY;
  });

  const at = new Date().toISOString();
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_notify_upgrade_1",
    contentRef: "prod-notify-upgrade-1",
    eventType: "fulfillment_processing",
    source: "medusa_webhook",
    dedupeKey: "order-902:fulfillment_processing:product:prod_notify_upgrade_1",
    metadata: { orderId: "order-902", email: "customer3@example.com", fulfillmentStatus: "processing" },
  });
  await buildMonitoringSummary({ actor: "ops:test" });
  const firstOpen = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-902");
  assert.ok(firstOpen);
  assert.equal(firstOpen.kind, "fulfillment_delay");
  assert.equal((await sendCustomerNotification({ id: firstOpen.id, actor: "ops:test" })).status, "sent");
  assert.equal(ackCustomerNotification({ id: firstOpen.id, actor: "ops:test", note: "acked after send" }).status, "acked");

  // Within cooldown, a lower/equal priority notification should be blocked.
  await buildMonitoringSummary({ actor: "ops:test" });
  const noneYet = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-902" && n.kind === "fulfillment_delay");
  assert.ok(!noneYet);

  // A higher priority issue should still create a new notification (upgrade).
  trackEvent({
    at: new Date().toISOString(),
    targetType: "product",
    targetId: "prod_notify_upgrade_1",
    contentRef: "prod-notify-upgrade-1",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-902:payment_failed:product:prod_notify_upgrade_1",
    metadata: { orderId: "order-902", email: "customer3@example.com", paymentStatus: "failed", paymentDetail: "failed" },
  });
  await buildMonitoringSummary({ actor: "ops:test" });
  const upgraded = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-902" && n.kind === "payment_failed");
  assert.ok(upgraded);
});

test("order-level cooldown blocks lower priority notifications after payment notice is sent", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.RESEND_API_KEY = "test_key";
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications, sendCustomerNotification, ackCustomerNotification } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ id: "msg_test_3" }),
  });
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.RESEND_API_KEY;
  });

  const at = new Date().toISOString();
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_notify_downgrade_1",
    contentRef: "prod-notify-downgrade-1",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-903:payment_failed:product:prod_notify_downgrade_1",
    metadata: { orderId: "order-903", email: "customer4@example.com", paymentStatus: "failed", paymentDetail: "failed" },
  });
  await buildMonitoringSummary({ actor: "ops:test" });
  const firstOpen = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-903");
  assert.ok(firstOpen);
  assert.equal(firstOpen.kind, "payment_failed");
  assert.equal((await sendCustomerNotification({ id: firstOpen.id, actor: "ops:test" })).status, "sent");
  assert.equal(ackCustomerNotification({ id: firstOpen.id, actor: "ops:test", note: "acked after send" }).status, "acked");

  // Later fulfillment processing should not create a new notification within the order cooldown window.
  trackEvent({
    at: new Date().toISOString(),
    targetType: "product",
    targetId: "prod_notify_downgrade_1",
    contentRef: "prod-notify-downgrade-1",
    eventType: "fulfillment_processing",
    source: "medusa_webhook",
    dedupeKey: "order-903:fulfillment_processing:product:prod_notify_downgrade_1",
    metadata: { orderId: "order-903", email: "customer4@example.com", fulfillmentStatus: "processing" },
  });
  await buildMonitoringSummary({ actor: "ops:test" });
  const secondOpen = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-903" && n.kind === "fulfillment_delay");
  assert.ok(!secondOpen);
});

test("customer notifications stay pending by default even when resend is configured", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.RESEND_API_KEY = "test_key";
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ id: "msg_test_auto_default" }),
  });
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_ENABLED;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_KINDS;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_EMAIL_DOMAINS;
  });

  trackEvent({
    at: new Date().toISOString(),
    targetType: "product",
    targetId: "prod_notify_auto_default",
    contentRef: "prod-notify-auto-default",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-904:payment_failed:product:prod_notify_auto_default",
    metadata: { orderId: "order-904", email: "customer5@example.com", paymentStatus: "failed" },
  });
  await buildMonitoringSummary({ actor: "ops:test" });
  const item = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-904");
  assert.ok(item);
  assert.equal(item.notify?.status, "pending");
  assert.equal(item.notify?.sentAt, null);
});

test("customer notifications auto-send when kind and domain whitelist match", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.RESEND_API_KEY = "test_key";
  process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_ENABLED = "true";
  process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_KINDS = "payment_failed,payment_requires_action";
  process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_EMAIL_DOMAINS = "example.com";
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ id: "msg_test_auto_allowed" }),
  });
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_ENABLED;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_KINDS;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_EMAIL_DOMAINS;
  });

  trackEvent({
    at: new Date().toISOString(),
    targetType: "product",
    targetId: "prod_notify_auto_allowed",
    contentRef: "prod-notify-auto-allowed",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-905:payment_failed:product:prod_notify_auto_allowed",
    metadata: { orderId: "order-905", email: "customer6@example.com", paymentStatus: "failed" },
  });
  await buildMonitoringSummary({ actor: "ops:test" });
  const item = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-905");
  assert.ok(item);
  assert.equal(item.notify?.status, "sent");
  assert.ok(item.notify?.sentAt);
});

test("customer notifications do not auto-send when email domain is not whitelisted", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.RESEND_API_KEY = "test_key";
  process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_ENABLED = "true";
  process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_KINDS = "payment_failed";
  process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_EMAIL_DOMAINS = "vip.example.com";
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listCustomerNotifications } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ id: "msg_test_auto_domain_blocked" }),
  });
  t.after(() => {
    global.fetch = previousFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_ENABLED;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_KINDS;
    delete process.env.OPS_CUSTOMER_NOTIFY_AUTO_SEND_EMAIL_DOMAINS;
  });

  trackEvent({
    at: new Date().toISOString(),
    targetType: "product",
    targetId: "prod_notify_auto_blocked",
    contentRef: "prod-notify-auto-blocked",
    eventType: "payment_failed",
    source: "payment_webhook",
    dedupeKey: "order-906:payment_failed:product:prod_notify_auto_blocked",
    metadata: { orderId: "order-906", email: "customer7@example.com", paymentStatus: "failed" },
  });
  await buildMonitoringSummary({ actor: "ops:test" });
  const item = listCustomerNotifications({ status: "open", limit: 20 }).items.find((n) => n.orderId === "order-906");
  assert.ok(item);
  assert.equal(item.notify?.status, "pending");
  assert.equal(item.notify?.sentAt, null);
});

test("monitoring summary includes refund result signals and backlog", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listSupportCases } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const at = new Date().toISOString();
  ["order-r1", "order-r2", "order-r3"].forEach((orderId, index) => {
    trackEvent({
      at: index === 2 ? new Date(Date.now() + 1000).toISOString() : at,
      targetType: "product",
      targetId: `prod_ref_${index + 1}`,
      contentRef: `prod-ref-${index + 1}`,
      eventType: "refund_requested",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:refund_requested`,
      metadata: { orderId, email: `refund${index + 1}@example.com` },
    });
  });
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_ref_4",
    contentRef: "prod-ref-4",
    eventType: "refund_refunded",
    source: "medusa_webhook",
    dedupeKey: "order-r4:refund_refunded",
    metadata: { orderId: "order-r4", email: "refund4@example.com" },
  });

  const summary = await buildMonitoringSummary({});
  assert.equal(summary.refundResults24h.requested, 3);
  assert.equal(summary.refundResults24h.refunded, 1);
  assert.equal(summary.refundResults24h.backlog, 2);
  assert.equal(summary.refundResults24h.topTargets.refund_requested[0]?.targetPath, "/products/prod-ref-1");
  const supportCases = listSupportCases({ status: "open", limit: 20 }).items;
  const refundBacklogCase = supportCases.find((item) => item.kind === "refund_backlog_review" && item.target?.id === "refund_backlog");
  assert.ok(refundBacklogCase);
  assert.equal(refundBacklogCase.context?.orderId, "order-r3");
});

test("support cases support assignment and overdue filtering", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const { listSupportCases, assignSupportCase } = require(path.join(repoRoot, "src/ops/store.js"));
  const previousFetch = global.fetch;
  const originalDateNow = Date.now;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
    Date.now = originalDateNow;
  });

  const preAt = new Date(originalDateNow() - 2 * 60 * 60 * 1000).toISOString();
  ["sr-1", "sr-2", "sr-3"].forEach((orderId, index) => {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `prod_support_assign_${index + 1}`,
      contentRef: `prod-support-assign-${index + 1}`,
      eventType: "refund_requested",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:refund_requested:prod_support_assign`,
      metadata: { orderId, email: `support${index + 1}@example.com` },
    });
  });
  trackEvent({
    at: new Date(originalDateNow() - 60 * 60 * 1000).toISOString(),
    targetType: "product",
    targetId: "prod_support_assign_done",
    contentRef: "prod-support-assign-done",
    eventType: "refund_refunded",
    source: "medusa_webhook",
    dedupeKey: "sr-4:refund_refunded:prod_support_assign_done",
    metadata: { orderId: "sr-4", email: "support4@example.com" },
  });

  await buildMonitoringSummary({ actor: "ops:test" });
  const openCases = listSupportCases({ status: "open", limit: 20 }).items;
  const caseItem = openCases.find((item) => item.kind === "refund_backlog_review");
  assert.ok(caseItem);
  const assigned = assignSupportCase({ id: caseItem.id, actor: "ops:test", owner: "ops-a", note: "take ownership" });
  assert.ok(assigned);
  assert.equal(assigned.owner, "ops-a");

  const owned = listSupportCases({ status: "open", owner: "ops-a", limit: 20 }).items;
  assert.ok(owned.some((item) => item.id === caseItem.id));
  const summaryAfterAssign = listSupportCases({ status: "open", limit: 20 }).summary;
  assert.ok(summaryAfterAssign.byOwner.some((item) => item.owner === "ops-a" && item.count >= 1));

  Date.now = () => originalDateNow() + 13 * 60 * 60 * 1000;
  const overdue = listSupportCases({ status: "open", overdue: true, limit: 20 }).items;
  assert.ok(overdue.some((item) => item.id === caseItem.id));
  const bySeverity = listSupportCases({ status: "open", severity: "warning", limit: 20 }).items;
  assert.ok(bySeverity.some((item) => item.id === caseItem.id));
  const byQuery = listSupportCases({ status: "open", q: "refund_backlog", limit: 20 }).items;
  assert.ok(byQuery.some((item) => item.id === caseItem.id));
  const unassigned = listSupportCases({ status: "open", owner: "unassigned", limit: 20 }).items;
  assert.ok(unassigned.every((item) => !item.owner));
});

test("support cases expose suggested owner and sort urgent items first", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.OPS_SUPPORT_OWNERS = "ops-a,ops-b";
  const { upsertSupportCasesFromMonitoring, listSupportCases } = require(path.join(repoRoot, "src/ops/store.js"));
  t.after(() => {
    delete process.env.OPS_SUPPORT_OWNERS;
  });

  upsertSupportCasesFromMonitoring({
    actor: "ops:test",
    cases: [
      {
        kind: "refund_backlog_review",
        severity: "warning",
        title: "Unassigned urgent refund case",
        detail: "Needs assignment",
        target: { type: "journey", id: "refund_backlog" },
      },
    ],
  });
  upsertSupportCasesFromMonitoring({
    actor: "ops:test",
    cases: [
      {
        kind: "payment_recovery_review",
        severity: "critical",
        title: "Owned critical payment case",
        detail: "Already owned",
        target: { type: "journey", id: "payment_requires_action" },
        owner: "ops-a",
      },
    ],
  });

  const items = listSupportCases({ status: "open", limit: 10 }).items;
  assert.equal(items[0].kind, "payment_recovery_review");
  const refundCase = items.find((item) => item.kind === "refund_backlog_review");
  assert.ok(refundCase);
  assert.equal(refundCase.suggestedOwner, "ops-b");
});

test("payment issue proposal exposes post-apply observation after follow-up is applied", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, transitionRuleTuningProposal, getRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  ["pf-pre-1", "pf-pre-2"].forEach((orderId) => {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: "prod_payment_pre",
      eventType: "payment_failed",
      source: "payment_webhook",
      dedupeKey: `${orderId}:payment_failed:product:prod_payment_pre`,
      metadata: { orderId, paymentStatus: "failed", paymentDetail: "failed" },
    });
  });
  ["pf-pre-3", "pf-pre-4"].forEach((orderId) => {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: "prod_payment_pre",
      eventType: "payment_paid",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:payment_paid:product:prod_payment_pre`,
      metadata: { orderId, paymentStatus: "paid", paymentDetail: "paid" },
    });
  });

  const summary = await buildMonitoringSummary({ actor: "ops:test" });
  const proposal = summary.paymentResults24h.proposals.find((item) => item.targetId === "payment_failed");
  assert.ok(proposal);

  let transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "approved",
    note: "approve payment recovery proposal",
  });
  assert.equal(transitioned.status, "ok");

  transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "updated payment recovery messaging and retry guidance",
  });
  assert.equal(transitioned.status, "ok");

  const postAt = new Date().toISOString();
  ["pf-post-1", "pf-post-2", "pf-post-3", "pf-post-4"].forEach((orderId) => {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: "prod_payment_post",
      eventType: "payment_paid",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:payment_paid:product:prod_payment_post`,
      metadata: { orderId, paymentStatus: "paid", paymentDetail: "paid" },
    });
  });

  const refreshed = getRuleTuningProposal(proposal.id);
  assert.equal(refreshed.status, "applied");
  assert.equal(refreshed.postApplyEffect?.mode, "payment_issue_window");
  assert.ok(Number(refreshed.postApplyEffect?.delta?.targetedIssueRate ?? 0) < 0);
  assert.ok(["observe", "steady", "success"].includes(String(refreshed.reviewSummary?.state || "")));
  assert.ok(refreshed.reviewSummary?.signals?.some((item) => String(item).includes("payment failed rate pre")));
});

test("monitoring summary creates payment observation follow-up recommendation when applied payment proposal stays risky", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, transitionRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  ["pfr-pre-1", "pfr-pre-2"].forEach((orderId) => {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: "prod_payment_risk",
      eventType: "payment_failed",
      source: "payment_webhook",
      dedupeKey: `${orderId}:payment_failed:product:prod_payment_risk`,
      metadata: { orderId, paymentStatus: "failed", paymentDetail: "failed" },
    });
  });
  ["pfr-pre-3", "pfr-pre-4"].forEach((orderId) => {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: "prod_payment_risk",
      eventType: "payment_paid",
      source: "medusa_webhook",
      dedupeKey: `${orderId}:payment_paid:product:prod_payment_risk`,
      metadata: { orderId, paymentStatus: "paid", paymentDetail: "paid" },
    });
  });

  const first = await buildMonitoringSummary({ actor: "ops:test" });
  const proposal = first.paymentResults24h.proposals.find((item) => item.targetId === "payment_failed");
  assert.ok(proposal);
  assert.equal(
    transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "approved", note: "approve payment risk fix" }).status,
    "ok",
  );
  assert.equal(
    transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "applied", note: "ship first payment risk fix" }).status,
    "ok",
  );

  const postAt = new Date().toISOString();
  ["pfr-post-1", "pfr-post-2"].forEach((orderId) => {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: "prod_payment_risk",
      eventType: "payment_failed",
      source: "payment_webhook",
      dedupeKey: `${orderId}:payment_failed:product:prod_payment_risk:post`,
      metadata: { orderId, paymentStatus: "failed", paymentDetail: "failed" },
    });
  });

  const second = await buildMonitoringSummary({ actor: "ops:test" });
  const followup = second.paymentResults24h.recommendations.find((item) => item.ruleId === "payment-observation-followup");
  assert.ok(followup);
  assert.equal(followup.targetType, "journey");
  assert.equal(followup.targetId, "payment_failed");
  assert.equal(followup.context?.parentProposalId, proposal.id);
  assert.ok(second.paymentResults24h.governance);
  assert.ok(second.paymentResults24h.governance.counts.followupRisk >= 1);
  assert.ok(Array.isArray(second.paymentResults24h.governance.top.followupRisk));
  assert.equal(second.paymentResults24h.governance.top.followupRisk[0]?.source, "payment_failed");
});

test("monitoring summary groups commerce funnel by attribution source and flags weak completion", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const at = new Date().toISOString();
  for (let i = 0; i < 4; i += 1) {
    trackEvent({
      at,
      targetType: "product",
      targetId: `prod_guide_${i}`,
      eventType: "checkout_start",
      source: "web",
      dedupeKey: `guide-start-${i}`,
      metadata: { stage: "checkout_start", attribution: { src: "guide" } },
    });
  }
  trackEvent({
    at,
    targetType: "product",
    targetId: "prod_guide_0",
    eventType: "checkout_complete",
    source: "web",
    dedupeKey: "guide-complete-0",
    metadata: { stage: "checkout_complete", attribution: { src: "guide" } },
  });
  for (let i = 0; i < 2; i += 1) {
    trackEvent({
      at,
      targetType: "product",
      targetId: `prod_ai_${i}`,
      eventType: "checkout_start",
      source: "web",
      dedupeKey: `ai-start-${i}`,
      metadata: { stage: "checkout_start", attribution: { src: "ai_concierge" } },
    });
    trackEvent({
      at,
      targetType: "product",
      targetId: `prod_ai_${i}`,
      eventType: "checkout_complete",
      source: "web",
      dedupeKey: `ai-complete-${i}`,
      metadata: { stage: "checkout_complete", attribution: { src: "ai_concierge" } },
    });
  }

  const summary = await buildMonitoringSummary({});
  const guide = summary.commerceCheckout.bySource.find((item) => item.source === "guide");
  const ai = summary.commerceCheckout.bySource.find((item) => item.source === "ai_concierge");
  assert.ok(guide);
  assert.equal(guide.checkoutStarts, 4);
  assert.equal(guide.checkoutCompletes, 1);
  assert.equal(guide.checkoutDropoff, 3);
  assert.equal(guide.checkoutCompletionRate, 0.25);
  assert.ok(Array.isArray(guide.paths));
  assert.equal(guide.paths[0]?.targetType, "product");
  assert.ok(ai);
  assert.equal(ai.checkoutStarts, 2);
  assert.equal(ai.checkoutCompletes, 2);
  assert.ok(summary.alerts.some((item) => item.title.includes("Checkout completion is low for source guide")));
  assert.ok(Array.isArray(summary.commerceCheckout.recommendations));
  const commerceRec = summary.commerceCheckout.recommendations.find((item) => item.ruleId === "checkout-completion-dropoff");
  assert.ok(commerceRec);
  assert.equal(commerceRec.targetType, "journey");
  assert.equal(commerceRec.targetId, "guide");
  assert.equal(commerceRec.context?.sourceKey, "guide");
  assert.equal(commerceRec.context?.checkoutStarts, 4);
  assert.equal(commerceRec.context?.checkoutCompletes, 1);
  assert.equal(commerceRec.context?.checkoutDropoff, 3);
  assert.equal(commerceRec.context?.weakestPath?.targetType, "product");
  assert.ok(String(commerceRec.context?.weakestPath?.targetId || "").startsWith("prod_guide_"));
  assert.ok(Array.isArray(summary.commerceCheckout.proposals));
  const commerceProposal = summary.commerceCheckout.proposals.find((item) => item.anomalyKind === "checkout_completion_dropoff");
  assert.ok(commerceProposal);
  assert.equal(commerceProposal.targetType, "journey");
  assert.equal(commerceProposal.targetId, "guide");
  assert.equal(commerceProposal.linkedRecommendationId, commerceRec.id);
});

test("commerce journey proposal exposes post-apply observation after incident follow-up is applied", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, transitionRuleTuningProposal, getRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 4; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `journey-pre-${i}`,
      eventType: "checkout_start",
      source: "web",
      dedupeKey: `journey-pre-start-${i}`,
      metadata: { stage: "checkout_start", attribution: { src: "guide" } },
    });
  }
  trackEvent({
    at: preAt,
    targetType: "product",
    targetId: "journey-pre-0",
    eventType: "checkout_complete",
    source: "web",
    dedupeKey: "journey-pre-complete-0",
    metadata: { stage: "checkout_complete", attribution: { src: "guide" } },
  });

  const summary = await buildMonitoringSummary({ actor: "ops:test" });
  const proposal = summary.commerceCheckout.proposals.find((item) => item.targetId === "guide");
  assert.ok(proposal);

  let transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "approved",
    note: "approve journey follow-up",
  });
  assert.equal(transitioned.status, "ok");

  transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "updated guide handoff copy and trust cues",
  });
  assert.equal(transitioned.status, "ok");

  const postAt = new Date().toISOString();
  for (let i = 0; i < 4; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `journey-post-${i}`,
      eventType: "checkout_start",
      source: "web",
      dedupeKey: `journey-post-start-${i}`,
      metadata: { stage: "checkout_start", attribution: { src: "guide" } },
    });
  }
  for (let i = 0; i < 3; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `journey-post-${i}`,
      eventType: "checkout_complete",
      source: "web",
      dedupeKey: `journey-post-complete-${i}`,
      metadata: { stage: "checkout_complete", attribution: { src: "guide" } },
    });
  }

  const refreshed = getRuleTuningProposal(proposal.id);
  assert.equal(refreshed.status, "applied");
  assert.equal(refreshed.postApplyEffect?.mode, "commerce_checkout_source");
  assert.ok(refreshed.postApplyEffect?.delta?.checkoutCompletionRate > 0);
  assert.ok(["steady", "success", "observe"].includes(String(refreshed.reviewSummary?.state || "")));
  assert.ok(refreshed.reviewSummary?.signals?.some((item) => String(item).includes("checkout completion pre")));
});

test("monitoring summary creates commerce observation follow-up recommendation when applied journey stays risky", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { trackEvent, transitionRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, statusText: "OK" });
  t.after(() => {
    global.fetch = previousFetch;
  });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 4; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `risk-pre-${i}`,
      eventType: "checkout_start",
      source: "web",
      dedupeKey: `risk-pre-start-${i}`,
      metadata: { stage: "checkout_start", attribution: { src: "guide" } },
    });
  }
  trackEvent({
    at: preAt,
    targetType: "product",
    targetId: "risk-pre-0",
    eventType: "checkout_complete",
    source: "web",
    dedupeKey: "risk-pre-complete-0",
    metadata: { stage: "checkout_complete", attribution: { src: "guide" } },
  });

  const first = await buildMonitoringSummary({ actor: "ops:test" });
  const proposal = first.commerceCheckout.proposals.find((item) => item.targetId === "guide");
  assert.ok(proposal);
  assert.equal(
    transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "approved", note: "approve guide journey fix" }).status,
    "ok",
  );
  assert.equal(
    transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "applied", note: "ship first guide journey fix" }).status,
    "ok",
  );

  const postAt = new Date().toISOString();
  for (let i = 0; i < 4; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `risk-post-${i}`,
      eventType: "checkout_start",
      source: "web",
      dedupeKey: `risk-post-start-${i}`,
      metadata: { stage: "checkout_start", attribution: { src: "guide" } },
    });
  }
  const second = await buildMonitoringSummary({ actor: "ops:test" });
  const followup = second.commerceCheckout.recommendations.find((item) => item.ruleId === "checkout-completion-observation-followup");
  assert.ok(followup);
  assert.equal(followup.targetType, "journey");
  assert.equal(followup.targetId, "guide");
  assert.equal(followup.context?.parentProposalId, proposal.id);
  assert.ok(second.commerceCheckout.governance);
  assert.ok(second.commerceCheckout.governance.counts.followupRisk >= 1);
  assert.ok(second.commerceCheckout.governance.counts.mainNeedsDecision >= 1);
  assert.ok(Array.isArray(second.commerceCheckout.governance.top.followupRisk));
  assert.equal(second.commerceCheckout.governance.top.followupRisk[0]?.source, "guide");
  assert.ok(String(second.commerceCheckout.governance.top.followupRisk[0]?.path || "").includes("product:"));
});

test("approved AI concierge strategy proposal auto-opens a draft PR during monitoring sync", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_MEDUSA_URL = "https://medusa.example.com";
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test";
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "proj123";
  process.env.NEXT_PUBLIC_SANITY_DATASET = "production";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
    delete process.env.NEXT_PUBLIC_MEDUSA_URL;
    delete process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_SANITY_DATASET;
  });
  const { trackEvent, listRuleTuningProposals, transitionRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { listRepoChanges } = require(path.join(repoRoot, "src/ops/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });

    if (input.endsWith("/pulls?state=all&head=starxlab0%3Aai%2Fconcierge-strategy")) {
      return { ok: true, json: async () => [] };
    }
    if (input.endsWith("/repos/starxlab0/aisite")) {
      return { ok: true, json: async () => ({ default_branch: "main" }) };
    }
    if (input.endsWith("/branches/ai%2Fconcierge-strategy")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.endsWith("/git/ref/heads/main")) {
      return { ok: true, json: async () => ({ object: { sha: "base-sha-1" } }) };
    }
    if (input.endsWith("/git/ref/heads/ai%2Fconcierge-strategy")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.endsWith("/git/refs")) {
      return { ok: true, json: async () => ({ ref: "refs/heads/ai/concierge-strategy" }) };
    }
    if (input.includes("/contents/.ops/repo-changes/") && input.includes("?ref=ai%2Fconcierge-strategy")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json?ref=ai%2Fconcierge-strategy")) {
      return {
        ok: true,
        json: async () => ({
          sha: "override-base-sha",
          content: Buffer.from(JSON.stringify({ product: {}, collection: {} }, null, 2), "utf8").toString("base64"),
        }),
      };
    }
    if (input.includes("/contents/.ops/repo-changes/")) {
      return { ok: true, json: async () => ({ commit: { sha: "commit-sha-1" } }) };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json")) {
      return { ok: true, json: async () => ({ commit: { sha: "commit-sha-2" } }) };
    }
    if (input.endsWith("/pulls")) {
      return {
        ok: true,
        json: async () => ({
          number: 44,
          html_url: "https://github.com/starxlab0/aisite/pull/44",
          state: "open",
          head: { sha: "commit-sha-2" },
        }),
      };
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => ({}) };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const nowTs = Date.now();
  const entryViewAt = new Date(nowTs - 2 * 60 * 60 * 1000).toISOString();
  const entryClickAt = new Date(nowTs - 90 * 60 * 1000).toISOString();
  for (let i = 0; i < 60; i += 1) {
    trackEvent({
      at: entryViewAt,
      targetType: "collection",
      targetId: "ai-concierge",
      eventType: "view",
      source: "ai_concierge",
      dedupeKey: `auto-pr-entry-view:${i}`,
      metadata: { stage: "entry_view", experiment: "ai_concierge_v1", bucket: "A" },
    });
  }
  for (let i = 0; i < 2; i += 1) {
    trackEvent({
      at: entryClickAt,
      targetType: "collection",
      targetId: "ai-concierge",
      eventType: "cta",
      source: "ai_concierge",
      dedupeKey: `auto-pr-entry-click:${i}`,
      metadata: { stage: "entry_click", experiment: "ai_concierge_v1", bucket: "A" },
    });
  }

  await buildMonitoringSummary({ actor: "ops:test" });
  const proposal = listRuleTuningProposals({ ruleId: "ai-concierge-strategy", limit: 1 }).items[0];
  const transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "approved",
    note: "approve AI concierge strategy proposal",
  });
  assert.equal(transitioned.status, "ok");

  await buildMonitoringSummary({ actor: "ops:test" });
  const repoChange = listRepoChanges({ proposalId: proposal.id })[0];

  assert.equal(repoChange?.status, "pr_opened");
  assert.equal(repoChange?.prUrl, "https://github.com/starxlab0/aisite/pull/44");
  assert.ok(requests.some((item) => item.url.endsWith("/pulls") && item.method === "POST"));
});

test("applied AI concierge strategy proposal reports post-apply funnel effect", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const {
    trackEvent,
    createAiConciergeFunnelRecommendation,
    syncAiConciergeTuningProposal,
    transitionRuleTuningProposal,
    getRuleTuningProposal,
  } = require(path.join(repoRoot, "src/signals/store.js"));

  // Seed a recommendation so the proposal exists.
  createAiConciergeFunnelRecommendation({
    metricKey: "purchase_view_rate",
    metricLabel: "Purchase / product view",
    observedRate: 0.005,
    threshold: 0.01,
    sampleSize: 100,
  });
  const proposal = syncAiConciergeTuningProposal({ actor: "ops:test" });
  transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "approved", note: "approve tuning" });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `p${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `pre:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  trackEvent({
    at: preAt,
    targetType: "product",
    targetId: "p0",
    eventType: "purchase",
    source: "web",
    dedupeKey: "pre:purchase:0",
    metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
  });

  transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "shipped strategy",
    appliedConfig: { version: "v1", note: "ship ai concierge changes" },
  });

  const postAt = new Date(Date.now()).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `p${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `post:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  for (let i = 0; i < 3; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `p${i}`,
      eventType: "purchase",
      source: "web",
      dedupeKey: `post:purchase:${i}`,
      metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
    });
  }

  const refreshed = getRuleTuningProposal(proposal.id);
  assert.equal(refreshed.status, "applied");
  assert.equal(refreshed.postApplyEffect?.mode, "ai_concierge_funnel");
  assert.ok(refreshed.postApplyEffect?.delta?.purchaseRateFromView > 0);
  assert.ok(refreshed.reviewSummary?.signals?.some((s) => String(s).includes("Purchase/view")));
});

test("risky AI concierge applied proposal auto-creates conservative follow-up proposal", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const {
    trackEvent,
    createAiConciergeFunnelRecommendation,
    syncAiConciergeTuningProposal,
    transitionRuleTuningProposal,
    getRuleTuningProposal,
    createAiConciergeRiskFollowupProposal,
    listRuleTuningProposals,
  } = require(path.join(repoRoot, "src/signals/store.js"));

  createAiConciergeFunnelRecommendation({
    metricKey: "purchase_view_rate",
    metricLabel: "Purchase / product view",
    observedRate: 0.005,
    threshold: 0.01,
    sampleSize: 100,
  });
  const proposal = syncAiConciergeTuningProposal({ actor: "ops:test" });
  transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "approved", note: "approve tuning" });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `risk-pre-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `risk-pre:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  for (let i = 0; i < 4; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `risk-pre-${i}`,
      eventType: "purchase",
      source: "web",
      dedupeKey: `risk-pre:purchase:${i}`,
      metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
    });
  }

  transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "shipped risky strategy",
    appliedConfig: { version: "v-risky", note: "aggressive ranking" },
  });

  const postAt = new Date(Date.now()).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `risk-post-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `risk-post:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  trackEvent({
    at: postAt,
    targetType: "product",
    targetId: "risk-post-0",
    eventType: "purchase",
    source: "web",
    dedupeKey: "risk-post:purchase:0",
    metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
  });

  const refreshed = getRuleTuningProposal(proposal.id);
  assert.equal(refreshed.reviewSummary?.state, "risk");

  const followup = createAiConciergeRiskFollowupProposal({ sourceProposalId: proposal.id, actor: "ops:test" });
  const proposals = listRuleTuningProposals({ ruleId: "ai-concierge-strategy", limit: 10 }).items;
  const followupListed = proposals.find((item) => item.id === followup?.id);

  assert.ok(followup);
  assert.equal(followupListed?.context?.source, "ai-concierge-followup");
  assert.equal(followupListed?.context?.parentProposalId, proposal.id);
  assert.equal(followupListed?.status, "draft");
});

test("risky AI concierge follow-up proposal auto-opens a draft PR during monitoring sync", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_MEDUSA_URL = "https://medusa.example.com";
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test";
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "proj123";
  process.env.NEXT_PUBLIC_SANITY_DATASET = "production";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
    delete process.env.NEXT_PUBLIC_MEDUSA_URL;
    delete process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_SANITY_DATASET;
  });

  const {
    trackEvent,
    createAiConciergeFunnelRecommendation,
    syncAiConciergeTuningProposal,
    transitionRuleTuningProposal,
    resolveRecommendation,
    listRuleTuningProposals,
  } = require(path.join(repoRoot, "src/signals/store.js"));
  const { listRepoChanges } = require(path.join(repoRoot, "src/ops/store.js"));
  const { buildMonitoringSummary } = require(path.join(repoRoot, "src/ops/monitoring.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });

    if (input.includes("/pulls?state=all&head=")) return { ok: true, json: async () => [] };
    if (input.endsWith("/repos/starxlab0/aisite")) return { ok: true, json: async () => ({ default_branch: "main" }) };
    if (input.includes("/branches/ai%2F")) return { ok: false, status: 404, text: async () => "Not Found" };
    if (input.endsWith("/git/ref/heads/main")) return { ok: true, json: async () => ({ object: { sha: "base-sha-1" } }) };
    if (input.includes("/git/ref/heads/ai%2F")) return { ok: false, status: 404, text: async () => "Not Found" };
    if (input.endsWith("/git/refs")) return { ok: true, json: async () => ({ ref: "refs/heads/ai/concierge-strategy-followup" }) };
    if (input.includes("/contents/.ops/repo-changes/") && input.includes("?ref=ai%2F")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json?ref=ai%2F")) {
      return {
        ok: true,
        json: async () => ({
          sha: "override-base-sha",
          content: Buffer.from(JSON.stringify({ product: {}, collection: {} }, null, 2), "utf8").toString("base64"),
        }),
      };
    }
    if (input.includes("/contents/.ops/repo-changes/")) return { ok: true, json: async () => ({ commit: { sha: "commit-sha-1" } }) };
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json"))
      return { ok: true, json: async () => ({ commit: { sha: "commit-sha-2" } }) };
    if (input.endsWith("/pulls")) {
      return {
        ok: true,
        json: async () => ({ number: 81, html_url: "https://github.com/starxlab0/aisite/pull/81", state: "open", head: { sha: "commit-sha-2" } }),
      };
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => ({}) };
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const rec = createAiConciergeFunnelRecommendation({
    metricKey: "purchase_view_rate",
    metricLabel: "Purchase / product view",
    observedRate: 0.005,
    threshold: 0.01,
    sampleSize: 100,
  });
  const proposal = syncAiConciergeTuningProposal({ actor: "ops:test" });
  transitionRuleTuningProposal({ id: proposal.id, actor: "ops:test", nextStatus: "approved", note: "approve tuning" });

  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `mon-pre-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `mon-pre:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  for (let i = 0; i < 5; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `mon-pre-${i}`,
      eventType: "purchase",
      source: "web",
      dedupeKey: `mon-pre:purchase:${i}`,
      metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
    });
  }

  transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "ship risky strategy",
    appliedConfig: { version: "v-risky", note: "aggressive changes" },
  });

  const postAt = new Date(Date.now()).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `mon-post-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `mon-post:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  // Only 1 purchase post-apply (worse).
  trackEvent({
    at: postAt,
    targetType: "product",
    targetId: "mon-post-0",
    eventType: "purchase",
    source: "web",
    dedupeKey: "mon-post:purchase:0",
    metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
  });

  // Resolve the original funnel recommendation so we don't spawn a fresh active proposal on sync.
  if (rec?.id) resolveRecommendation({ id: rec.id, actor: "ops:test", status: "resolved", note: "handled by rollout" });

  await buildMonitoringSummary({ actor: "ops:test" });

  const followup = listRuleTuningProposals({ ruleId: "ai-concierge-strategy", limit: 10 }).items.find(
    (p) => p.context?.source === "ai-concierge-followup" && p.context?.parentProposalId === proposal.id,
  );
  assert.ok(followup);
  const repoChange = listRepoChanges({ proposalId: followup.id })[0];
  assert.equal(repoChange?.status, "pr_opened");
  assert.equal(repoChange?.prUrl, "https://github.com/starxlab0/aisite/pull/81");
  assert.ok(requests.some((item) => item.url.endsWith("/pulls") && item.method === "POST"));
});

test("risk follow-up repo change stays draft and is labeled for manual review during sync", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 91,
            html_url: "https://github.com/starxlab0/aisite/pull/91",
            state: "open",
            draft: true,
            head: { sha: "risk-followup-sha" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [{ name: "control-plane", status: "completed", conclusion: "success" }],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({
          statuses: [{ context: "web", state: "success" }],
        }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 191,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/191",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "risk-followup-sha",
              updated_at: "2026-07-03T00:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/191/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [{ name: "control-plane", status: "completed", conclusion: "success" }],
        }),
      };
    }
    if (input.includes("/issues/91/labels")) {
      const body = JSON.parse(String(init.body || "{}"));
      return {
        ok: true,
        json: async () => (Array.isArray(body.labels) ? body.labels.map((name) => ({ name })) : []),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    kind: "ai_concierge_strategy_followup",
    title: "Conservative AI concierge follow-up",
    summary: "Keep draft and block auto-merge",
    targetType: "collection",
    targetId: "ai-concierge",
    branchName: "ai/concierge-strategy-followup-prop_123",
    ciStatus: "not_started",
    prUrl: "https://github.com/starxlab0/aisite/pull/91",
    prNumber: 91,
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "merge_candidate");
  assert.equal(synced.repoChange.prIsDraft, true);
  assert.ok(Array.isArray(synced.repoChange.prLabels));
  assert.ok(synced.repoChange.prLabels.includes("risk-followup"));
  assert.ok(synced.repoChange.prLabels.includes("manual-review-only"));
  assert.equal(synced.repoChange.recommendedNextStep?.code, "hold_risk_followup");
  assert.ok(!requests.some((item) => item.url.endsWith("/ready_for_review") && item.method === "POST"));
});

test("follow-up proposal reflects repo lane execution status", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createAiConciergeRiskFollowupProposal, getRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const { createRepoChange, updateRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));

  // Seed a minimal source proposal directly into runtime through existing API path.
  const { createAiConciergeFunnelRecommendation, syncAiConciergeTuningProposal, transitionRuleTuningProposal, trackEvent } = require(
    path.join(repoRoot, "src/signals/store.js"),
  );
  createAiConciergeFunnelRecommendation({
    metricKey: "purchase_view_rate",
    metricLabel: "Purchase / product view",
    observedRate: 0.005,
    threshold: 0.01,
    sampleSize: 100,
  });
  const parent = syncAiConciergeTuningProposal({ actor: "ops:test" });
  transitionRuleTuningProposal({ id: parent.id, actor: "ops:test", nextStatus: "approved", note: "approve tuning" });
  const preAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `exec-pre-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `exec-pre:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  for (let i = 0; i < 5; i += 1) {
    trackEvent({
      at: preAt,
      targetType: "product",
      targetId: `exec-pre-${i}`,
      eventType: "purchase",
      source: "web",
      dedupeKey: `exec-pre:purchase:${i}`,
      metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
    });
  }
  transitionRuleTuningProposal({
    id: parent.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "ship risky strategy",
    appliedConfig: { version: "v-risky" },
  });
  const postAt = new Date(Date.now()).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: postAt,
      targetType: "product",
      targetId: `exec-post-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `exec-post:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  trackEvent({
    at: postAt,
    targetType: "product",
    targetId: "exec-post-0",
    eventType: "purchase",
    source: "web",
    dedupeKey: "exec-post:purchase:0",
    metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
  });

  const followup = createAiConciergeRiskFollowupProposal({ sourceProposalId: parent.id, actor: "ops:test" });
  const repo = createRepoChange({
    actor: "ops:test",
    kind: "ai_concierge_strategy_followup",
    proposalId: followup.id,
    targetType: "collection",
    targetId: "ai-concierge",
    title: "Conservative AI concierge follow-up",
    summary: "Manual review only",
    branchName: "ai/concierge-strategy-followup-test",
    ciStatus: "success",
  });
  updateRepoChange(repo.id, {
    prUrl: "https://github.com/starxlab0/aisite/pull/99",
    prNumber: 99,
    prIsDraft: true,
    prLabels: ["risk-followup", "manual-review-only", "keep-draft"],
    recommendedNextStep: { code: "hold_risk_followup", label: "keep draft for manual risk review", tone: "warning" },
    autoActionGate: {
      autoMerge: { allowed: false, reasons: ["risk follow-up must stay in draft manual review"] },
      autoRevert: { allowed: false, reasons: [] },
    },
  });

  const enriched = getRuleTuningProposal(followup.id);
  assert.equal(enriched.followupExecution?.repoChangeId, repo.id);
  assert.equal(enriched.followupExecution?.prUrl, "https://github.com/starxlab0/aisite/pull/99");
  assert.equal(enriched.followupExecution?.prIsDraft, true);
  assert.equal(enriched.followupExecution?.recommendedNextStep?.code, "hold_risk_followup");
  assert.equal(enriched.followupExecution?.autoMergeAllowed, false);
  assert.equal(enriched.reviewSummary?.state, "pending");
  assert.ok(String(enriched.reviewSummary?.headline || "").includes("manual review"));
});

test("merged follow-up proposal enters observation window and auto-judges success", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const {
    createAiConciergeFunnelRecommendation,
    syncAiConciergeTuningProposal,
    transitionRuleTuningProposal,
    trackEvent,
    createAiConciergeRiskFollowupProposal,
    getRuleTuningProposal,
  } = require(path.join(repoRoot, "src/signals/store.js"));
  const { listRepoChanges, updateRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));

  createAiConciergeFunnelRecommendation({
    metricKey: "purchase_view_rate",
    metricLabel: "Purchase / product view",
    observedRate: 0.005,
    threshold: 0.01,
    sampleSize: 100,
  });
  const parent = syncAiConciergeTuningProposal({ actor: "ops:test" });
  transitionRuleTuningProposal({ id: parent.id, actor: "ops:test", nextStatus: "approved", note: "approve tuning" });

  const riskyPreAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: riskyPreAt,
      targetType: "product",
      targetId: `obs-risk-pre-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `obs-risk-pre:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  for (let i = 0; i < 5; i += 1) {
    trackEvent({
      at: riskyPreAt,
      targetType: "product",
      targetId: `obs-risk-pre-${i}`,
      eventType: "purchase",
      source: "web",
      dedupeKey: `obs-risk-pre:purchase:${i}`,
      metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
    });
  }
  transitionRuleTuningProposal({
    id: parent.id,
    actor: "ops:test",
    nextStatus: "applied",
    note: "ship risky strategy",
    appliedConfig: { version: "v-risky" },
  });
  const riskyPostAt = new Date(Date.now()).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: riskyPostAt,
      targetType: "product",
      targetId: `obs-risk-post-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `obs-risk-post:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  trackEvent({
    at: riskyPostAt,
    targetType: "product",
    targetId: "obs-risk-post-0",
    eventType: "purchase",
    source: "web",
    dedupeKey: "obs-risk-post:purchase:0",
    metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
  });

  const followup = createAiConciergeRiskFollowupProposal({ sourceProposalId: parent.id, actor: "ops:test" });
  const repo = listRepoChanges({ proposalId: followup.id })[0];
  const mergedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  updateRepoChange(repo.id, {
    status: "merged",
    mergedAt,
    prUrl: "https://github.com/starxlab0/aisite/pull/120",
    prIsDraft: false,
    ciStatus: "success",
    recommendedNextStep: { code: "done_merged", label: "merged manually; monitor target stability", tone: "neutral" },
    autoActionGate: { autoMerge: { allowed: false, reasons: ["already merged"] }, autoRevert: { allowed: false, reasons: [] } },
  });

  const preObsAt = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: preObsAt,
      targetType: "product",
      targetId: `obs-pre-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `obs-pre:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  trackEvent({
    at: preObsAt,
    targetType: "product",
    targetId: "obs-pre-0",
    eventType: "purchase",
    source: "web",
    dedupeKey: "obs-pre:purchase:0",
    metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
  });

  const postObsAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 100; i += 1) {
    trackEvent({
      at: postObsAt,
      targetType: "product",
      targetId: `obs-post-${i}`,
      eventType: "view",
      source: "web",
      dedupeKey: `obs-post:view:${i}`,
      metadata: { stage: "product_view", attribution: { src: "ai_concierge" } },
    });
  }
  for (let i = 0; i < 4; i += 1) {
    trackEvent({
      at: postObsAt,
      targetType: "product",
      targetId: `obs-post-${i}`,
      eventType: "purchase",
      source: "web",
      dedupeKey: `obs-post:purchase:${i}`,
      metadata: { stage: "purchase", attribution: { src: "ai_concierge" } },
    });
  }

  const enriched = getRuleTuningProposal(followup.id);
  assert.equal(enriched.followupExecution?.state, "repo_merged");
  assert.equal(enriched.followupExecution?.observationComplete, true);
  assert.equal(enriched.postApplyEffect?.mode, "ai_concierge_followup_observation");
  assert.equal(enriched.reviewSummary?.state, "success");
  assert.ok(String(enriched.reviewSummary?.headline || "").includes("stabilized"));
});

test("rollback policy normalizes invalid warning threshold and supports env override", (t) => {
  const env = withTempEnv(t);
  writeJson(env.OPS_ROLLBACK_POLICY_FILE, {
    product: {
      blocked: { enabled: true },
      warning: { enabled: true, threshold: -4 },
    },
  });
  process.env.OPS_ROLLBACK_PRODUCT_WARNING_THRESHOLD = "3";
  t.after(() => {
    delete process.env.OPS_ROLLBACK_PRODUCT_WARNING_THRESHOLD;
  });
  resetControlPlaneModules();
  const { getRollbackPolicy } = require(path.join(repoRoot, "src/ops/rollback-policy.js"));
  const policy = getRollbackPolicy("product");

  assert.equal(policy.blocked.enabled, true);
  assert.equal(policy.warning.enabled, true);
  assert.equal(policy.warning.threshold, 3);
});

test("auto action policy persists whitelist updates and matches trigger fallback", (t) => {
  const env = withTempEnv(t);
  writeJson(env.OPS_AUTO_ACTION_POLICY_FILE, {
    autoMerge: {
      enabled: true,
      allowedTargetTypes: ["product", "bad-target"],
      allowedTriggers: ["incident_followup"],
      allowedTargetIds: ["safe-one"],
    },
    autoRevert: {
      enabled: true,
      allowedTargetTypes: ["product"],
      allowedTriggers: ["incident_followup"],
      allowedTargetIds: [],
      minRiskCount: 3,
    },
  });
  resetControlPlaneModules();
  const {
    getAutoActionPolicy,
    matchesActionPolicy,
    updateAutoActionPolicy,
  } = require(path.join(repoRoot, "src/ops/auto-action-policy.js"));

  const initial = getAutoActionPolicy();
  assert.deepEqual(initial.autoMerge.allowedTargetTypes, ["product"]);
  assert.equal(
    matchesActionPolicy(initial.autoMerge, {
      targetType: "product",
      targetId: "safe-one",
      kind: "incident_followup",
    }),
    true,
  );

  const updated = updateAutoActionPolicy({
    autoMerge: {
      enabled: true,
      allowedTargetTypes: ["collection"],
      allowedTriggers: ["warning_threshold"],
      allowedTargetIds: ["collection-a"],
    },
  });
  assert.deepEqual(updated.autoMerge.allowedTargetTypes, ["collection"]);
  assert.equal(
    matchesActionPolicy(updated.autoMerge, {
      targetType: "collection",
      targetId: "collection-a",
      trigger: "warning_threshold",
    }),
    true,
  );
  assert.equal(
    matchesActionPolicy(updated.autoMerge, {
      targetType: "product",
      targetId: "safe-one",
      kind: "incident_followup",
    }),
    false,
  );
});

test("ops events support category filters for auto-action and gate views", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { createEvent, listEvents } = require(path.join(repoRoot, "src/ops/store.js"));

  createEvent({
    actor: "ops:test",
    action: "auto_merge_gate_hold",
    target: { type: "product", id: "gate-target" },
    note: "auto-merge gate hold · targetId blocked",
  });
  createEvent({
    actor: "ops:test",
    action: "repo_change_auto_merged",
    target: { type: "product", id: "gate-target" },
    note: "repo change auto merged",
  });
  createEvent({
    actor: "ops:test",
    action: "publish",
    target: { type: "product", id: "gate-target" },
    note: "manual publish",
  });

  const autoAction = listEvents({ category: "auto-action" });
  const gate = listEvents({ category: "gate" });
  const gateByPrefix = listEvents({ actionPrefix: "auto_merge_gate_" });
  const repoPublish = listEvents({ category: "repo-publish" });

  assert.equal(autoAction.some((item) => item.action === "auto_merge_gate_hold"), true);
  assert.equal(autoAction.some((item) => item.action === "repo_change_auto_merged"), true);
  assert.equal(autoAction.some((item) => item.action === "publish"), false);
  assert.deepEqual(gate.map((item) => item.action), ["auto_merge_gate_hold"]);
  assert.deepEqual(gateByPrefix.map((item) => item.action), ["auto_merge_gate_hold"]);
  assert.equal(repoPublish.some((item) => item.action === "repo_change_auto_merged"), true);
  assert.equal(repoPublish.some((item) => item.action === "publish"), false);
});

test("purchase events are aggregated into snapshots and overview rates", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const {
    compareSnapshots,
    createSnapshotFromEvents,
    ingestSnapshot,
    trackEvent,
    buildTargetSummary,
  } = require(path.join(repoRoot, "src/signals/store.js"));

  trackEvent({ targetType: "product", targetId: "purchase-product", eventType: "view", at: "2026-07-05T00:00:00.000Z" });
  trackEvent({ targetType: "product", targetId: "purchase-product", eventType: "view", at: "2026-07-05T00:10:00.000Z" });
  trackEvent({ targetType: "product", targetId: "purchase-product", eventType: "cta", at: "2026-07-05T00:20:00.000Z" });
  trackEvent({ targetType: "product", targetId: "purchase-product", eventType: "add_to_cart", at: "2026-07-05T00:30:00.000Z" });
  trackEvent({ targetType: "product", targetId: "purchase-product", eventType: "purchase", at: "2026-07-05T00:40:00.000Z" });

  const baseline = ingestSnapshot({
    targetType: "product",
    targetId: "purchase-product",
    contentRef: "baseline",
    windowDays: 7,
    capturedAt: "2026-07-04T00:00:00.000Z",
    metrics: {
      views: 10,
      ctaClicks: 2,
      addToCart: 1,
      purchases: 0,
    },
    source: "manual",
  });

  const created = createSnapshotFromEvents({
    targetType: "product",
    targetId: "purchase-product",
    contentRef: null,
    windowDays: 7,
    untilAt: "2026-07-05T01:00:00.000Z",
  });
  const comparison = compareSnapshots(created.snapshot, baseline.snapshot);
  const summary = buildTargetSummary({ targetType: "product", targetId: "purchase-product" });

  assert.equal(created.snapshot.metrics.purchases, 1);
  assert.equal(comparison.current.purchaseRate, 0.5);
  assert.equal(comparison.delta.purchaseRate, 0.5);
  assert.equal(summary.comparison.current.purchaseRate, 0.5);
  assert.equal(summary.comparison.delta.purchaseRate, 0.5);
});

test("trackEvent deduplicates repeated purchase events by dedupeKey", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { aggregateMetricsFromEvents, trackEvent } = require(path.join(repoRoot, "src/signals/store.js"));

  const first = trackEvent({
    targetType: "product",
    targetId: "dedupe-product",
    eventType: "purchase",
    dedupeKey: "order:1:product:dedupe-product",
  });
  const second = trackEvent({
    targetType: "product",
    targetId: "dedupe-product",
    eventType: "purchase",
    dedupeKey: "order:1:product:dedupe-product",
  });
  const metrics = aggregateMetricsFromEvents({
    targetType: "product",
    targetId: "dedupe-product",
    windowDays: 7,
  });

  assert.equal(first.id, second.id);
  assert.equal(metrics.purchases, 1);
});

test("low purchase rate creates recommendation for high-traffic low-conversion product", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { ingestSnapshot, listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));

  const created = ingestSnapshot({
    targetType: "product",
    targetId: "purchase-low-rate",
    contentRef: "purchase-low-rate:v1",
    windowDays: 7,
    metrics: {
      views: 300,
      ctaClicks: 18,
      addToCart: 9,
      purchases: 0,
    },
    source: "manual",
  });
  const rec = listRecommendations({ targetType: "product", targetId: "purchase-low-rate", statuses: ["open", "in_progress"] }).find(
    (item) => item.ruleId === "low-purchase-rate",
  );

  assert.ok(created.recommendationsCreated.some((item) => item.ruleId === "low-purchase-rate"));
  assert.ok(rec);
  assert.match(rec.reason, /PURCHASE rate/i);
  assert.equal(rec.suggestedWorkflow, "product-rewrite");
  assert.deepEqual(rec.context.focusAreas, ["selling_points", "pricing_offer", "trust_signals", "faq_coverage"]);
  assert.match(rec.context.optimizationGoal, /purchase conversion/i);
  assert.equal(Array.isArray(rec.context.actionHints), true);
  assert.ok(rec.context.actionHints.length >= 2);
});

test("low purchase rate prepares product draft with conversion-focused copy guidance", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { ingestSnapshot, listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));
  const { getOpsDraft } = require(path.join(repoRoot, "src/ops/store.js"));

  ingestSnapshot({
    targetType: "product",
    targetId: "kokocang-x",
    contentRef: "kokocang-x:v2",
    windowDays: 7,
    metrics: {
      views: 320,
      ctaClicks: 22,
      addToCart: 11,
      purchases: 0,
    },
    source: "manual",
  });

  const rec = listRecommendations({ targetType: "product", targetId: "kokocang-x", statuses: ["open", "in_progress"] }).find(
    (item) => item.ruleId === "low-purchase-rate",
  );
  const draft = rec?.preparedDraft?.draftId ? getOpsDraft(rec.preparedDraft.draftId) : null;

  assert.ok(rec?.preparedDraft?.draftId);
  assert.ok(draft?.payload?.title?.includes("值不值得买"));
  assert.ok(draft?.payload?.hero?.headline?.includes("价格"));
  assert.ok(Array.isArray(draft?.payload?.authoringNotes));
  assert.ok(draft.payload.authoringNotes.some((item) => item.includes("值不值得买")));
});

test("resolved low-purchase recommendation auto-creates purchase effect follow-up when conversion stays flat", (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [],
    recommendations: [
      {
        id: "rec_purchase_done",
        status: "resolved",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        resolvedAt: "2026-07-02T00:00:00.000Z",
        resolvedBy: "ops:test",
        resolutionNote: "published",
        targetType: "product",
        targetId: "kokocang-x",
        contentRef: "kokocang-x:v1",
        ruleId: "low-purchase-rate",
        severity: "warning",
        reason: "purchase low",
        suggestedWorkflow: "product-rewrite",
        context: {
          snapshot: {
            id: "snap_base",
            capturedAt: "2026-07-01T00:00:00.000Z",
            windowDays: 7,
            contentRef: "kokocang-x:v1",
            metrics: { views: 200, ctaClicks: 20, addToCart: 10, purchases: 0 },
            rates: { ctaRate: 0.1, addToCartRate: 0.05, purchaseRate: 0 },
          },
          previous: null,
          delta: null,
          focusAreas: ["selling_points", "pricing_offer", "trust_signals", "faq_coverage"],
          suggestedWorkflow: "product-rewrite",
          optimizationGoal: "Improve purchase conversion.",
          actionHints: ["clarify value", "add trust"],
        },
      },
    ],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  writeJson(env.OPS_STATE_FILE, { drafts: [], events: [], previewTokens: [] });

  resetControlPlaneModules();
  const { ingestSnapshot, listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));

  const created = ingestSnapshot({
    targetType: "product",
    targetId: "kokocang-x",
    contentRef: "kokocang-x:v2",
    windowDays: 7,
    capturedAt: "2026-07-03T00:00:00.000Z",
    metrics: {
      views: 220,
      ctaClicks: 24,
      addToCart: 12,
      purchases: 0,
    },
    source: "manual",
  });
  const followup = listRecommendations({ targetType: "product", targetId: "kokocang-x", statuses: ["open", "in_progress"] }).find(
    (item) => item.ruleId === "purchase-effect-followup",
  );

  assert.equal(created.followupsCreated.length, 1);
  assert.ok(followup);
  assert.equal(followup.followupContext.sourceRecommendationId, "rec_purchase_done");
  assert.match(followup.reason, /flat/i);
  assert.ok(followup.preparedDraft?.draftId);
});

test("successful purchase recommendation becomes reusable pattern for later drafts", (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [
      {
        id: "sig_success_after",
        capturedAt: "2026-07-02T12:00:00.000Z",
        windowDays: 7,
        targetType: "product",
        targetId: "kokocang-x",
        contentRef: "kokocang-x:success",
        metrics: { views: 220, ctaClicks: 24, addToCart: 12, purchases: 3 },
        source: "test",
      },
    ],
    recommendations: [
      {
        id: "rec_purchase_success",
        status: "resolved",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        resolvedAt: "2026-07-02T00:00:00.000Z",
        resolvedBy: "ops:test",
        resolutionNote: "published",
        targetType: "product",
        targetId: "kokocang-x",
        contentRef: "kokocang-x:base",
        ruleId: "low-purchase-rate",
        severity: "warning",
        reason: "purchase low",
        suggestedWorkflow: "product-rewrite",
        context: {
          snapshot: {
            id: "snap_success_base",
            capturedAt: "2026-07-01T00:00:00.000Z",
            windowDays: 7,
            contentRef: "kokocang-x:base",
            metrics: { views: 200, ctaClicks: 20, addToCart: 10, purchases: 0 },
            rates: { ctaRate: 0.1, addToCartRate: 0.05, purchaseRate: 0 },
          },
          previous: null,
          delta: null,
          focusAreas: ["selling_points", "pricing_offer", "trust_signals", "faq_coverage"],
          suggestedWorkflow: "product-rewrite",
          optimizationGoal: "Improve purchase conversion.",
          actionHints: ["clarify value proposition", "add trust cues"],
        },
      },
    ],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  writeJson(env.OPS_STATE_FILE, { drafts: [], events: [], previewTokens: [] });

  resetControlPlaneModules();
  const { ingestSnapshot, listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));
  const { getOpsDraft } = require(path.join(repoRoot, "src/ops/store.js"));

  ingestSnapshot({
    targetType: "product",
    targetId: "kokocang-x",
    contentRef: "kokocang-x:new-low",
    windowDays: 7,
    capturedAt: "2026-07-03T00:00:00.000Z",
    metrics: {
      views: 260,
      ctaClicks: 22,
      addToCart: 11,
      purchases: 0,
    },
    source: "manual",
  });

  const rec = listRecommendations({ targetType: "product", targetId: "kokocang-x", statuses: ["open", "in_progress"] }).find(
    (item) => item.ruleId === "low-purchase-rate",
  );
  const draft = rec?.preparedDraft?.draftId ? getOpsDraft(rec.preparedDraft.draftId) : null;

  assert.ok(rec?.context?.referencePattern);
  assert.equal(rec.context.referencePattern.sourceRecommendationId, "rec_purchase_success");
  assert.match(rec.context.referencePattern.summary, /lifted purchase/i);
  assert.ok(draft?.payload?.authoringNotes?.some((item) => item.includes("参考已验证模式")));
});

test("reference purchase pattern boosts priority for later low-purchase recommendation", (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [
      {
        id: "sig_collection_success_after",
        capturedAt: "2026-07-02T12:00:00.000Z",
        windowDays: 7,
        targetType: "collection",
        targetId: "first-time",
        contentRef: "first-time:success",
        metrics: { views: 200, ctaClicks: 20, addToCart: 10, purchases: 1 },
        source: "test",
      },
    ],
    recommendations: [
      {
        id: "rec_collection_purchase_success",
        status: "resolved",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        resolvedAt: "2026-07-02T00:00:00.000Z",
        resolvedBy: "ops:test",
        resolutionNote: "published",
        targetType: "collection",
        targetId: "first-time",
        contentRef: "first-time:base",
        ruleId: "low-purchase-rate",
        severity: "warning",
        reason: "purchase low",
        suggestedWorkflow: "collection-rewrite",
        context: {
          snapshot: {
            id: "snap_collection_success_base",
            capturedAt: "2026-07-01T00:00:00.000Z",
            windowDays: 7,
            contentRef: "first-time:base",
            metrics: { views: 200, ctaClicks: 20, addToCart: 10, purchases: 0 },
            rates: { ctaRate: 0.1, addToCartRate: 0.05, purchaseRate: 0 },
          },
          previous: null,
          delta: null,
          focusAreas: ["hero_summary", "pricing_offer", "trust_signals", "internal_links"],
          suggestedWorkflow: "collection-rewrite",
          optimizationGoal: "Improve purchase conversion.",
          actionHints: ["tighten value framing", "surface trust cues"],
        },
      },
    ],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  writeJson(env.OPS_STATE_FILE, { drafts: [], events: [], previewTokens: [] });

  resetControlPlaneModules();
  const { ingestSnapshot, listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));

  ingestSnapshot({
    targetType: "collection",
    targetId: "first-time",
    contentRef: "first-time:new-low",
    windowDays: 7,
    capturedAt: "2026-07-03T00:00:00.000Z",
    metrics: {
      views: 160,
      ctaClicks: 10,
      addToCart: 5,
      purchases: 0,
    },
    source: "manual",
  });

  const rec = listRecommendations({ targetType: "collection", targetId: "first-time", statuses: ["open", "in_progress"] }).find(
    (item) => item.ruleId === "low-purchase-rate",
  );

  assert.ok(rec?.context?.referencePattern);
  assert.equal(rec.priorityLevel, "p0");
  assert.match(rec.priorityReason, /ref purchase \+0\.5pts/i);
});

test("strong purchase reference pattern fast-tracks p1 recommendation into in_progress", (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [
      {
        id: "sig_collection_pattern_after",
        capturedAt: "2026-07-02T12:00:00.000Z",
        windowDays: 7,
        targetType: "collection",
        targetId: "first-time",
        contentRef: "first-time:success",
        metrics: { views: 500, ctaClicks: 50, addToCart: 25, purchases: 1 },
        source: "test",
      },
    ],
    recommendations: [
      {
        id: "rec_collection_pattern_success",
        status: "resolved",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        resolvedAt: "2026-07-02T00:00:00.000Z",
        resolvedBy: "ops:test",
        resolutionNote: "published",
        targetType: "collection",
        targetId: "first-time",
        contentRef: "first-time:base",
        ruleId: "low-purchase-rate",
        severity: "warning",
        reason: "purchase low",
        suggestedWorkflow: "collection-rewrite",
        context: {
          snapshot: {
            id: "snap_collection_pattern_base",
            capturedAt: "2026-07-01T00:00:00.000Z",
            windowDays: 7,
            contentRef: "first-time:base",
            metrics: { views: 500, ctaClicks: 50, addToCart: 25, purchases: 0 },
            rates: { ctaRate: 0.1, addToCartRate: 0.05, purchaseRate: 0 },
          },
          previous: null,
          delta: null,
          focusAreas: ["hero_summary", "pricing_offer", "trust_signals", "internal_links"],
          suggestedWorkflow: "collection-rewrite",
          optimizationGoal: "Improve purchase conversion.",
          actionHints: ["tighten value framing", "surface trust cues"],
        },
      },
    ],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  writeJson(env.OPS_STATE_FILE, { drafts: [], events: [], previewTokens: [] });

  resetControlPlaneModules();
  const { ingestSnapshot, listRecommendations } = require(path.join(repoRoot, "src/signals/store.js"));
  const { getOpsDraft } = require(path.join(repoRoot, "src/ops/store.js"));

  ingestSnapshot({
    targetType: "collection",
    targetId: "first-time",
    contentRef: "first-time:new-low",
    windowDays: 7,
    capturedAt: "2026-07-03T00:00:00.000Z",
    metrics: {
      views: 150,
      ctaClicks: 15,
      addToCart: 7,
      purchases: 0,
    },
    source: "manual",
  });

  const rec = listRecommendations({ targetType: "collection", targetId: "first-time", statuses: ["open", "in_progress"] }).find(
    (item) => item.ruleId === "low-purchase-rate",
  );
  const draft = rec?.preparedDraft?.draftId ? getOpsDraft(rec.preparedDraft.draftId) : null;

  assert.ok(rec?.context?.referencePattern);
  assert.equal(rec.priorityLevel, "p1");
  assert.equal(rec.status, "in_progress");
  assert.match(rec.startNote, /purchase pattern policy/i);
  assert.equal(rec.preparedDraft?.priority, "priority");
  assert.equal(draft?.draftPreparationPriority, "priority");
  assert.equal(draft?.draftPreparationPolicy, "purchase_pattern_policy");
});

test("custom evaluator and strategy registration coexists with generic low-rate path", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { getRuleDefinition } = require(path.join(repoRoot, "src/signals/rules-config.js"));
  const { getRuleEvaluator, registerRuleEvaluator } = require(path.join(repoRoot, "src/signals/rules-evaluators.js"));
  const { getRuleStrategy, registerRuleStrategy } = require(path.join(repoRoot, "src/signals/rules-strategies.js"));

  const genericDef = getRuleDefinition("low-cta-rate");
  assert.ok(getRuleEvaluator(genericDef));
  assert.ok(getRuleStrategy(genericDef));

  registerRuleEvaluator("custom-demo", () => ({
    match() {
      return true;
    },
    buildHit() {
      return { ruleId: "custom-demo", reason: "ok", suggestedWorkflow: "product-rewrite", severity: "warning" };
    },
  }));
  registerRuleStrategy("custom-demo", () => ({
    buildProposalSuggestion() {
      return { suggestedConfig: { demo: true }, expectedImpact: "demo" };
    },
  }));

  assert.ok(getRuleEvaluator({ ruleId: "custom-demo" }));
  assert.ok(getRuleStrategy({ ruleId: "custom-demo" }));
});

test("applied proposal exposes success-oriented review summary when config matches and post-apply effect improves", (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [
      {
        id: "sig_pre_after",
        capturedAt: "2026-06-28T18:00:00.000Z",
        windowDays: 7,
        targetType: "product",
        targetId: "prod_1",
        contentRef: "pre_after",
        metrics: { views: 200, ctaClicks: 2, addToCart: 1, purchases: 0 },
        source: "test",
      },
      {
        id: "sig_post_after",
        capturedAt: "2026-06-29T18:00:00.000Z",
        windowDays: 7,
        targetType: "product",
        targetId: "prod_1",
        contentRef: "post_after",
        metrics: { views: 200, ctaClicks: 6, addToCart: 3, purchases: 2 },
        source: "test",
      },
    ],
    recommendations: [
      {
        id: "rec_pre",
        status: "resolved",
        createdAt: "2026-06-28T01:00:00.000Z",
        updatedAt: "2026-06-28T12:00:00.000Z",
        resolvedAt: "2026-06-28T12:00:00.000Z",
        resolvedBy: "ops:test",
        resolutionNote: "done",
        targetType: "product",
        targetId: "prod_1",
        contentRef: "pre_base",
        ruleId: "low-cta-rate",
        severity: "warning",
        reason: "pre",
        suggestedWorkflow: "product-rewrite",
        context: {
          snapshot: {
            id: "ctx_pre",
            capturedAt: "2026-06-28T00:00:00.000Z",
            windowDays: 7,
            contentRef: "pre_base",
            metrics: { views: 200, ctaClicks: 2, addToCart: 1, purchases: 0 },
          },
        },
      },
      {
        id: "rec_post",
        status: "resolved",
        createdAt: "2026-06-29T06:00:00.000Z",
        updatedAt: "2026-06-29T12:00:00.000Z",
        resolvedAt: "2026-06-29T12:00:00.000Z",
        resolvedBy: "ops:test",
        resolutionNote: "done",
        targetType: "product",
        targetId: "prod_1",
        contentRef: "post_base",
        ruleId: "low-cta-rate",
        severity: "warning",
        reason: "post",
        suggestedWorkflow: "product-rewrite",
        context: {
          snapshot: {
            id: "ctx_post",
            capturedAt: "2026-06-29T06:00:00.000Z",
            windowDays: 7,
            contentRef: "post_base",
            metrics: { views: 200, ctaClicks: 2, addToCart: 1, purchases: 0 },
          },
        },
      },
    ],
    proposals: [
      {
        id: "prop_success",
        type: "rule_tuning",
        status: "applied",
        createdAt: "2026-06-27T00:00:00.000Z",
        createdBy: "ops:test",
        ruleId: "low-cta-rate",
        sinceDays: 1,
        currentConfig: { minViews: 100, maxRate: 0.02 },
        suggestedConfig: { minViews: 150, maxRate: 0.018 },
        expectedImpact: "test",
        quality: "weak",
        suggestion: "monitor",
        improvementRate: 0.3,
        worsenedRate: 0.1,
        evaluated: 2,
        lastSeenAt: "2026-06-29T12:00:00.000Z",
        note: null,
        approvedAt: "2026-06-28T00:00:00.000Z",
        approvedBy: "ops:test",
        approvalNote: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionNote: null,
        appliedAt: "2026-06-29T00:00:00.000Z",
        appliedBy: "ops:test",
        appliedNote: "applied",
        appliedConfig: { minViews: 100, maxRate: 0.02 },
      },
    ],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  writeJson(env.OPS_STATE_FILE, { drafts: [], events: [], previewTokens: [] });

  resetControlPlaneModules();
  const { getRuleTuningProposal } = require(path.join(repoRoot, "src/signals/store.js"));
  const proposal = getRuleTuningProposal("prop_success");

  assert.equal(proposal.reviewSummary.state, "success");
  assert.match(proposal.reviewSummary.headline, /successful/i);
  assert.ok(proposal.reviewSummary.signals.some((item) => item.includes("matches current rules config")));
  assert.ok(proposal.reviewSummary.signals.some((item) => item.includes("Effectiveness improved")));
  assert.ok(proposal.reviewSummary.signals.some((item) => item.includes("Purchase rate improved")));
  assert.ok(proposal.reviewSummary.signals.some((item) => item.includes("Post-apply window is complete")));
  assert.equal(proposal.postApplyEffect.pre.purchaseAfterRate, 0);
  assert.equal(proposal.postApplyEffect.post.purchaseAfterRate, 0.01);
  assert.equal(proposal.postApplyEffect.delta.purchaseRate, 0.01);
});

test("custom post-click-dropoff rule exposes evaluator and strategy through default registration", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { getRuleDefinition } = require(path.join(repoRoot, "src/signals/rules-config.js"));
  const { getRuleEvaluator } = require(path.join(repoRoot, "src/signals/rules-evaluators.js"));
  const { getRuleStrategy } = require(path.join(repoRoot, "src/signals/rules-strategies.js"));

  const def = getRuleDefinition("weak-post-click-conversion");
  const evaluator = getRuleEvaluator(def);
  const strategy = getRuleStrategy(def);

  assert.equal(def.kind, "post-click-dropoff");
  assert.ok(evaluator);
  assert.ok(strategy);
  assert.equal(
    evaluator.match(
      { targetType: "product", metrics: { views: 200, ctaClicks: 40, addToCart: 2 } },
      def.params,
    ),
    true,
  );
  assert.deepEqual(strategy.buildProposalSuggestion(def.params, { quality: "risky" }), {
    suggestedConfig: {
      minViews: 150,
      minCtaClicks: 30,
      maxPostClickAtcRate: 0.12,
    },
    expectedImpact: "Reduce false-positive post-click friction alerts and focus on deeper funnel drop-off with stronger click volume.",
  });
});

test("local cms publish returns planned revalidate paths for product content", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { createContentDraft } = require(path.join(repoRoot, "src/cms-adapters/index.js"));

  return createContentDraft({
    id: "draft-prod-publish",
    schemaType: "productContentDraft",
    entityType: "product-content",
    targetType: "product",
    targetId: "demo-product",
    targetPath: "/product/demo-product",
    contentRef: "product-demo-v1",
    status: "published",
    payload: {
      productSlug: "demo-product",
      title: "Demo Product",
      shortDescription: "A short but valid description.",
      hero: {
        headline: "Demo headline",
        description: "Demo hero description",
        media: [],
      },
      keyBenefits: ["Benefit 1"],
      whoItsFor: ["Audience 1"],
      whyItFeelsDifferent: ["Difference 1"],
      whatsInBox: ["Item 1"],
      seo: {
        title: "Demo Product SEO",
        description: "SEO description",
      },
    },
  }).then((result) => {
    assert.equal(result.revalidate.skipped, true);
    assert.deepEqual(result.revalidate.requested, ["/product/demo-product"]);
    assert.equal(result.verification.skipped, true);
    assert.equal(result.verification.level, "skipped");
    assert.deepEqual(result.verification.requested, ["/product/demo-product"]);
  });
});

test("publish validators block non-whitelisted fields", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { validateDocumentShape } = require(path.join(repoRoot, "src/publish/index.js"));
  const result = validateDocumentShape({
    _id: "productContent.demo",
    _type: "productContent",
    productSlug: "demo",
    title: "Demo",
    shortDescription: "ok",
    seo: {
      title: "SEO",
      description: "SEO desc",
    },
    forbiddenField: "nope",
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes("forbiddenField")));
});

test("verification classifier returns blocked warning pass and skipped levels", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { classifyVerification } = require(path.join(repoRoot, "src/publish/index.js"));

  assert.equal(
    classifyVerification(
      [{ ok: false, statusCode: 404, checks: { statusOk: false, titlePresent: false, descriptionPresent: false } }],
      {},
    ).level,
    "blocked",
  );

  assert.equal(
    classifyVerification(
      [{ ok: false, statusCode: 200, checks: { statusOk: true, titlePresent: true, descriptionPresent: true, contentMatched: false } }],
      {},
    ).level,
    "warning",
  );

  assert.equal(
    classifyVerification(
      [{ ok: true, statusCode: 200, checks: { statusOk: true, titlePresent: true, descriptionPresent: true, titleMatched: true, descriptionMatched: true, contentMatched: true } }],
      {},
    ).level,
    "pass",
  );

  assert.equal(classifyVerification([], { skipped: true, reason: "local-adapter" }).level, "skipped");
});

test("verification classifier treats seo structure mismatch as warning instead of blocked", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { classifyVerification } = require(path.join(repoRoot, "src/publish/index.js"));

  const result = classifyVerification([
    {
      ok: false,
      statusCode: 200,
      checks: {
        statusOk: true,
        titlePresent: true,
        descriptionPresent: true,
        canonicalPresent: true,
        canonicalMatched: false,
        robotsPresent: true,
        robotsMatched: true,
        schemaPresent: true,
        schemaMatched: false,
        internalLinksMatched: false,
      },
    },
  ]);

  assert.equal(result.level, "warning");
});

test("verification follow-up recommendation is created for blocked publish result", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { createVerificationFollowupRecommendation, listRecommendations } = require(path.join(
    repoRoot,
    "src/signals/store.js",
  ));

  const rec = createVerificationFollowupRecommendation({
    targetType: "product",
    targetId: "kokocang-x",
    contentRef: "product-kokocang-x-v9",
    level: "blocked",
    verification: {
      level: "blocked",
      summary: "page unavailable or critical metadata missing",
      results: [{ path: "/product/kokocang-x", ok: false, statusCode: 404 }],
    },
  });

  const items = listRecommendations({ targetType: "product", targetId: "kokocang-x", statuses: ["open", "in_progress"] });
  assert.equal(rec?.ruleId, "publish-verification-followup");
  assert.equal(rec?.severity, "critical");
  assert.equal(rec?.priorityLevel, "p0");
  assert.ok(rec?.preparedDraft?.draftId);
  assert.equal(items[0]?.id, rec?.id);
});

test("incident follow-up proposal is created for publishing anomaly", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { createIncidentFollowupProposal, listRuleTuningProposals } = require(path.join(repoRoot, "src/signals/store.js"));

  const proposal = createIncidentFollowupProposal({
    actor: "ai:proposal",
    targetType: "product",
    targetId: "kokocang-x",
    anomalyKind: "blocked_publish",
    severity: "critical",
    summary: "Blocked publish requires repair proposal",
    linkedDraftId: "draft_123",
  });

  const listed = listRuleTuningProposals({ limit: 10 }).items.find((item) => item.id === proposal.id);
  assert.equal(proposal.type, "incident_followup");
  assert.equal(proposal.status, "draft");
  assert.equal(listed?.type, "incident_followup");
  assert.equal(listed?.linkedDraftId, "draft_123");
});

test("incident proposal approval seeds repo publish candidate", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { createIncidentFollowupProposal, transitionRuleTuningProposal } = require(path.join(
    repoRoot,
    "src/signals/store.js",
  ));
  const { listRepoChanges } = require(path.join(repoRoot, "src/ops/store.js"));

  const proposal = createIncidentFollowupProposal({
    actor: "ai:proposal",
    targetType: "product",
    targetId: "kokocang-x",
    anomalyKind: "auto_rollback",
    severity: "critical",
    summary: "Auto rollback should open repo change candidate",
    linkedDraftId: "draft_fix_1",
  });

  const transitioned = transitionRuleTuningProposal({
    id: proposal.id,
    actor: "ops:test",
    nextStatus: "approved",
    note: "approve repair proposal",
  });

  const repoChange = listRepoChanges({ proposalId: proposal.id })[0];
  assert.equal(transitioned.status, "ok");
  assert.equal(repoChange?.proposalId, proposal.id);
  assert.equal(repoChange?.status, "draft");
  assert.equal(repoChange?.targetType, "product");
});

test("product rewrite publish returns workflow-level revalidate info", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { publishProductRewriteDraft } = require(path.join(repoRoot, "src/workflows/product-rewrite.js"));

  const result = await publishProductRewriteDraft({ targetId: "kokocang-x" });

  assert.equal(result.status, "published");
  assert.deepEqual(result.revalidate?.requested, ["/product/kokocang-x"]);
  assert.equal(result.draftRecord.revalidate?.skipped, true);
});

test("product rewrite rollback restores previous published snapshot through adapter", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { createContentDraft } = require(path.join(repoRoot, "src/cms-adapters/index.js"));

  await createContentDraft({
    id: "draft-product-kokocang-x-v1",
    schemaType: "productContentDraft",
    entityType: "product-content",
    targetType: "product",
    targetId: "kokocang-x",
    targetPath: "/product/kokocang-x",
    contentRef: "product-kokocang-x-v1",
    status: "published",
    payload: {
      productSlug: "kokocang-x",
      title: "口口舱X v1",
      shortDescription: "v1 description",
      hero: { headline: "v1", description: "v1", media: [] },
      keyBenefits: ["v1"],
      whoItsFor: ["v1"],
      whyItFeelsDifferent: ["v1"],
      whatsInBox: ["v1"],
      seo: { title: "v1 seo", description: "v1 seo desc" },
    },
  });

  await createContentDraft({
    id: "draft-product-kokocang-x-v2",
    schemaType: "productContentDraft",
    entityType: "product-content",
    targetType: "product",
    targetId: "kokocang-x",
    targetPath: "/product/kokocang-x",
    contentRef: "product-kokocang-x-v2",
    status: "published",
    payload: {
      productSlug: "kokocang-x",
      title: "口口舱X v2",
      shortDescription: "v2 description",
      hero: { headline: "v2", description: "v2", media: [] },
      keyBenefits: ["v2"],
      whoItsFor: ["v2"],
      whyItFeelsDifferent: ["v2"],
      whatsInBox: ["v2"],
      seo: { title: "v2 seo", description: "v2 seo desc" },
    },
  });

  const { rollbackProductRewrite } = require(path.join(repoRoot, "src/workflows/product-rewrite.js"));
  const result = await rollbackProductRewrite({ targetId: "kokocang-x" });

  assert.equal(result.status, "rolled_back");
  assert.deepEqual(result.revalidate?.requested, ["/product/kokocang-x"]);
  assert.ok(Array.isArray(result.restoredDocuments));
});

test("guide article publish returns guides revalidate paths", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { publishGuideArticleDraft } = require(path.join(repoRoot, "src/workflows/guide-article.js"));

  const result = await publishGuideArticleDraft({ targetId: "how-to-choose" });

  assert.equal(result.status, "published");
  assert.deepEqual(result.revalidate?.requested, ["/guides", "/guides/how-to-choose"]);
  assert.equal(result.draftRecord.revalidate?.skipped, true);
  const { listDrafts } = require(path.join(repoRoot, "src/cms-adapters/index.js"));
  const published = await listDrafts({ targetId: "how-to-choose", status: "published" });
  const guideRecord = published.find((item) => item.entityType === "guide-article");
  assert.ok(guideRecord);
  assert.ok(Array.isArray(guideRecord.payload?.schemaHints));
  assert.ok(guideRecord.payload.schemaHints.includes("Article"));
  assert.ok(Array.isArray(guideRecord.payload?.structuredData));
  assert.ok(guideRecord.payload.structuredData.some((item) => item?.["@type"] === "BreadcrumbList"));
});

test("ops publish auto rolls back product when verification is blocked", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const cmsAdapters = require(path.join(repoRoot, "src/cms-adapters/index.js"));
  const originalCreateContentDraft = cmsAdapters.createContentDraft;

  await originalCreateContentDraft({
    id: "draft-product-kokocang-x-v1-seed",
    schemaType: "productContentDraft",
    entityType: "product-content",
    targetType: "product",
    targetId: "kokocang-x",
    targetPath: "/product/kokocang-x",
    contentRef: "product-kokocang-x-v1-seed",
    status: "published",
    payload: {
      productSlug: "kokocang-x",
      title: "seed version",
      shortDescription: "seed description",
      hero: { headline: "seed hero", description: "seed hero", media: [] },
      keyBenefits: ["seed"],
      whoItsFor: ["seed"],
      whyItFeelsDifferent: ["seed"],
      whatsInBox: ["seed"],
      seo: { title: "seed seo", description: "seed seo desc" },
    },
  });

  cmsAdapters.createContentDraft = async (input) => {
    const result = await originalCreateContentDraft(input);
    if (input?.meta?.opsDraftId && input?.status === "published" && input?.entityType === "product-content") {
      return {
        ...result,
        verification: {
          ok: false,
          skipped: false,
          level: "blocked",
          summary: "forced blocked verification for test",
          requested: ["/product/kokocang-x"],
          results: [
            {
              path: "/product/kokocang-x",
              ok: false,
              statusCode: 500,
              checks: {
                statusOk: false,
                titlePresent: true,
                descriptionPresent: true,
              },
            },
          ],
        },
      };
    }
    return result;
  };

  const { generateOpsDraft, reviewOpsDraft, publishOpsDraft, listOpsDrafts } = require(path.join(
    repoRoot,
    "src/ops/drafts.js",
  ));
  const { listEvents } = require(path.join(repoRoot, "src/ops/store.js"));
  const { listRuleTuningProposals } = require(path.join(repoRoot, "src/signals/store.js"));

  const draft = await generateOpsDraft({ type: "product", id: "kokocang-x", actor: "ops:test" });
  await reviewOpsDraft({ draftId: draft.id, actor: "ops:test", decision: "approve" });
  const published = await publishOpsDraft({ draftId: draft.id, actor: "ops:test", reason: "publish blocked draft" });

  const updatedDraft = listOpsDrafts({ type: "product", id: "kokocang-x" }).find((item) => item.id === draft.id);
  const rollbackEvent = listEvents({ targetType: "product", targetId: "kokocang-x" }).find(
    (item) => item.action === "rollback",
  );
  const incidentProposal = listRuleTuningProposals({ limit: 10 }).items.find(
    (item) => item.type === "incident_followup" && item.targetType === "product" && item.targetId === "kokocang-x",
  );

  assert.equal(published.status, "published_with_auto_rollback");
  assert.equal(published.autoRollback?.status, "rolled_back");
  assert.equal(published.autoRollback?.trigger, "auto");
  assert.equal(published.autoRollback?.triggerReason, "verification-blocked");
  assert.equal(published.incidentProposal?.type, "incident_followup");
  assert.equal(published.incidentProposal?.anomalyKind, "auto_rollback");
  assert.equal(updatedDraft?.published?.autoRollback?.trigger, "auto");
  assert.equal(rollbackEvent?.trigger, "auto");
  assert.equal(rollbackEvent?.triggerReason, "verification-blocked");
  assert.equal(incidentProposal?.type, "incident_followup");
});

test("ops publish auto rolls back product when warning threshold is reached", async (t) => {
  const env = withTempEnv(t);
  writeJson(env.OPS_ROLLBACK_POLICY_FILE, {
    product: {
      blocked: { enabled: true },
      warning: { enabled: true, threshold: 2 },
    },
    collection: {
      blocked: { enabled: true },
      warning: { enabled: true, threshold: 2 },
    },
  });
  resetControlPlaneModules();
  const cmsAdapters = require(path.join(repoRoot, "src/cms-adapters/index.js"));
  const originalCreateContentDraft = cmsAdapters.createContentDraft;

  await originalCreateContentDraft({
    id: "draft-product-kokocang-x-v1-base",
    schemaType: "productContentDraft",
    entityType: "product-content",
    targetType: "product",
    targetId: "kokocang-x",
    targetPath: "/product/kokocang-x",
    contentRef: "product-kokocang-x-v1-base",
    status: "published",
    payload: {
      productSlug: "kokocang-x",
      title: "base version",
      shortDescription: "base description",
      hero: { headline: "base hero", description: "base hero", media: [] },
      keyBenefits: ["base"],
      whoItsFor: ["base"],
      whyItFeelsDifferent: ["base"],
      whatsInBox: ["base"],
      seo: { title: "base seo", description: "base seo desc" },
    },
  });

  cmsAdapters.createContentDraft = async (input) => {
    const result = await originalCreateContentDraft(input);
    if (input?.meta?.opsDraftId && input?.status === "published" && input?.entityType === "product-content") {
      return {
        ...result,
        verification: {
          ok: false,
          skipped: false,
          level: "warning",
          summary: "forced warning verification for test",
          requested: ["/product/kokocang-x"],
          results: [
            {
              path: "/product/kokocang-x",
              ok: false,
              statusCode: 200,
              checks: {
                statusOk: true,
                titlePresent: true,
                descriptionPresent: true,
                contentMatched: false,
              },
            },
          ],
        },
      };
    }
    return result;
  };

  const { generateOpsDraft, reviewOpsDraft, publishOpsDraft } = require(path.join(repoRoot, "src/ops/drafts.js"));
  const { listEvents } = require(path.join(repoRoot, "src/ops/store.js"));
  const { listRuleTuningProposals } = require(path.join(repoRoot, "src/signals/store.js"));

  const draft1 = await generateOpsDraft({ type: "product", id: "kokocang-x", actor: "ops:test" });
  await reviewOpsDraft({ draftId: draft1.id, actor: "ops:test", decision: "approve" });
  const publish1 = await publishOpsDraft({ draftId: draft1.id, actor: "ops:test", reason: "publish warning draft 1" });
  assert.equal(publish1.status, "published");
  assert.equal(publish1.autoRollback, null);

  const draft2 = await generateOpsDraft({ type: "product", id: "kokocang-x", actor: "ops:test" });
  await reviewOpsDraft({ draftId: draft2.id, actor: "ops:test", decision: "approve" });
  const publish2 = await publishOpsDraft({ draftId: draft2.id, actor: "ops:test", reason: "publish warning draft 2" });
  const rollbackEvent = listEvents({ targetType: "product", targetId: "kokocang-x" }).find(
    (item) => item.action === "rollback" && item.triggerReason === "verification-warning-threshold",
  );
  const incidentProposal = listRuleTuningProposals({ limit: 10 }).items.find(
    (item) =>
      item.type === "incident_followup" &&
      item.targetType === "product" &&
      item.targetId === "kokocang-x" &&
      item.anomalyKind === "warning_threshold",
  );

  assert.equal(publish2.status, "published_with_auto_rollback");
  assert.equal(publish2.autoRollback?.triggerReason, "verification-warning-threshold");
  assert.equal(publish2.incidentProposal?.anomalyKind, "warning_threshold");
  assert.equal(rollbackEvent?.trigger, "auto");
  assert.equal(incidentProposal?.type, "incident_followup");
});

test("repo change transition enforces minimal state machine", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { createRepoChange, transitionRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));

  const change = createRepoChange({
    actor: "ops:test",
    kind: "incident_followup",
    title: "Fix metadata template",
    targetType: "product",
    targetId: "kokocang-x",
    branchName: "ai/product/kokocang-x",
    ciStatus: "not_started",
  });

  const prOpened = transitionRepoChange({
    id: change.id,
    actor: "ops:test",
    nextStatus: "pr_opened",
    patch: { prUrl: "https://github.com/starxlab0/aisite/pull/1" },
  });
  const ciRunning = transitionRepoChange({
    id: change.id,
    actor: "ops:test",
    nextStatus: "ci_running",
    patch: { ciStatus: "in_progress" },
  });
  const blocked = transitionRepoChange({
    id: change.id,
    actor: "ops:test",
    nextStatus: "reverted",
  });

  assert.equal(prOpened?.status, "pr_opened");
  assert.equal(ciRunning?.status, "ci_running");
  assert.equal(ciRunning?.ciStatus, "in_progress");
  assert.equal(blocked?.status, "blocked");
});

test("github check normalization resolves queued and success states", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { normalizeCiStatus } = require(path.join(repoRoot, "src/ops/github.js"));

  const queued = normalizeCiStatus(
    [{ name: "control-plane", status: "queued", conclusion: null }],
    [],
  );
  const success = normalizeCiStatus(
    [{ name: "web", status: "completed", conclusion: "success" }],
    [{ context: "legacy", state: "success" }],
  );

  assert.equal(queued.ciStatus, "queued");
  assert.equal(success.ciStatus, "success");
  assert.equal(success.ciConclusion, "success");
});

test("seo override copy adapts to anomaly trigger", (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { buildSeoOverrideEntry } = require(path.join(repoRoot, "src/ops/github.js"));

  const blocked = buildSeoOverrideEntry({
    id: "repo_blocked",
    targetType: "product",
    targetId: "kokocang-x",
    trigger: "blocked_publish",
    summary: "Blocked publish requires metadata clarification",
  });
  const rollback = buildSeoOverrideEntry({
    id: "repo_rollback",
    targetType: "product",
    targetId: "kokocang-x",
    trigger: "auto_rollback",
    summary: "Automatic rollback triggered after verification issue",
  });
  const warning = buildSeoOverrideEntry({
    id: "repo_warning",
    targetType: "collection",
    targetId: "first-time",
    trigger: "warning_threshold",
    summary: "Repeated warnings suggest the collection metadata should be clarified",
  });

  assert.equal(blocked.product["kokocang-x"].title, "Kokocang X | Verified product details");
  assert.match(blocked.product["kokocang-x"].description, /blocked publish verification/i);
  assert.equal(blocked.product["kokocang-x"].canonical, "/product/kokocang-x");
  assert.deepEqual(blocked.product["kokocang-x"].robots, { index: true, follow: true });
  assert.equal(rollback.product["kokocang-x"].title, "Kokocang X | Updated product guidance");
  assert.match(rollback.product["kokocang-x"].description, /automatic rollback/i);
  assert.equal(warning.collection["first-time"].title, undefined);
  assert.match(warning.collection["first-time"].description, /repeated verification warnings/i);
  assert.equal(warning.collection["first-time"].canonical, undefined);
});

test("repo change sync pulls github pr and ci metadata into store", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const input = String(url);
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 7,
            html_url: "https://github.com/starxlab0/aisite/pull/7",
            state: "open",
            head: { sha: "abc123def456" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [{ name: "control-plane", status: "completed", conclusion: "success" }],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({
          statuses: [{ context: "web", state: "success" }],
        }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 99,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/99",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "abc123def456",
              updated_at: "2026-07-03T00:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/99/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [{ name: "control-plane", status: "completed", conclusion: "success" }],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    kind: "incident_followup",
    title: "Fix product metadata",
    targetType: "product",
    targetId: "kokocang-x",
    branchName: "ai/product/kokocang-x",
    ciStatus: "not_started",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.prNumber, 7);
  assert.equal(synced.repoChange.prUrl, "https://github.com/starxlab0/aisite/pull/7");
  assert.equal(synced.repoChange.commitSha, "abc123def456");
  assert.equal(synced.repoChange.ciStatus, "success");
  assert.equal(synced.repoChange.status, "merge_candidate");
  assert.equal(synced.repoChange.syncState, "ok");
  assert.ok(synced.repoChange.readyForReviewAt);
  assert.equal(synced.repoChange.workflowRunId, 99);
  assert.equal(synced.repoChange.workflowRunUrl, "https://github.com/starxlab0/aisite/actions/runs/99");
  assert.equal(synced.repoChange.workflowName, "ci");
});

test("repo change sync promotes low-risk successful pr to merge candidate", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const input = String(url);
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 41,
            html_url: "https://github.com/starxlab0/aisite/pull/41",
            state: "open",
            head: { sha: "candidate-sha-1" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 410,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/410",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "candidate-sha-1",
              updated_at: "2026-07-04T13:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/410/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    title: "Candidate repo change",
    kind: "incident_followup",
    branchName: "ai/product/candidate",
    status: "pr_opened",
    targetType: "product",
    targetId: "candidate",
    prUrl: "https://github.com/starxlab0/aisite/pull/41",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "merge_candidate");
  assert.equal(synced.repoChange.prNumber, 41);
  assert.equal(synced.repoChange.ciStatus, "success");
  assert.ok(synced.repoChange.readyForReviewAt);
});

test("repo change sync marks merge candidate draft pr ready for review", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET" });
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 51,
            html_url: "https://github.com/starxlab0/aisite/pull/51",
            state: "open",
            draft: true,
            head: { sha: "ready-sha-1" },
          },
        ],
      };
    }
    if (input.endsWith("/pulls/51/ready_for_review")) {
      return {
        ok: true,
        json: async () => ({
          number: 51,
          html_url: "https://github.com/starxlab0/aisite/pull/51",
          state: "open",
          draft: false,
        }),
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 510,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/510",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "ready-sha-1",
              updated_at: "2026-07-04T14:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/510/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    title: "Ready for review candidate",
    kind: "incident_followup",
    branchName: "ai/product/ready",
    status: "merge_candidate",
    targetType: "product",
    targetId: "ready",
    prNumber: 51,
    prUrl: "https://github.com/starxlab0/aisite/pull/51",
    prIsDraft: true,
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "merge_candidate");
  assert.equal(synced.repoChange.prIsDraft, false);
  assert.ok(synced.repoChange.readyForReviewAt);
  assert.equal(synced.repoChange.syncMessage, "Draft PR marked ready for review.");
  assert.ok(requests.some((item) => item.url.endsWith("/pulls/51/ready_for_review") && item.method === "POST"));
});

test("repo change sync labels ready pr as auto-merge candidate", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 61,
            html_url: "https://github.com/starxlab0/aisite/pull/61",
            state: "open",
            draft: false,
            labels: [],
            head: { sha: "auto-merge-sha-1" },
          },
        ],
      };
    }
    if (input.endsWith("/issues/61/labels")) {
      return {
        ok: true,
        json: async () => [
          { name: "low-risk" },
          { name: "merge-candidate" },
          { name: "auto-merge-candidate" },
          { name: "seo-fix" },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 610,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/610",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "auto-merge-sha-1",
              updated_at: "2026-07-04T15:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/610/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    title: "Auto merge candidate",
    kind: "incident_followup",
    branchName: "ai/product/auto-merge",
    status: "merge_candidate",
    targetType: "product",
    targetId: "auto-merge",
    prNumber: 61,
    prUrl: "https://github.com/starxlab0/aisite/pull/61",
    prIsDraft: false,
    readyForReviewAt: "2026-07-04T14:30:00.000Z",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "auto_merge_candidate");
  assert.ok(synced.repoChange.autoMergeCandidateAt);
  assert.deepEqual(synced.repoChange.prLabels, [
    "low-risk",
    "merge-candidate",
    "auto-merge-candidate",
    "seo-fix",
  ]);
  assert.equal(synced.repoChange.syncMessage, "PR labeled and promoted to auto-merge candidate.");
  assert.ok(requests.some((item) => item.url.endsWith("/issues/61/labels") && item.method === "POST"));
});

test("repo change sync auto-merges low-risk ready candidate", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 71,
            html_url: "https://github.com/starxlab0/aisite/pull/71",
            state: "open",
            draft: false,
            labels: [
              { name: "low-risk" },
              { name: "merge-candidate" },
              { name: "auto-merge-candidate" },
              { name: "seo-fix" },
            ],
            head: { sha: "merge-exec-sha-1" },
          },
        ],
      };
    }
    if (input.endsWith("/pulls/71/merge")) {
      return {
        ok: true,
        json: async () => ({
          merged: true,
          sha: "merge-commit-sha-71",
          message: "Pull Request successfully merged",
        }),
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 710,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/710",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "merge-exec-sha-1",
              updated_at: "2026-07-04T16:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/710/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    title: "Auto merge execution",
    kind: "incident_followup",
    branchName: "ai/product/auto-merge-exec",
    status: "auto_merge_candidate",
    targetType: "product",
    targetId: "auto-merge-exec",
    prNumber: 71,
    prUrl: "https://github.com/starxlab0/aisite/pull/71",
    prIsDraft: false,
    prLabels: ["low-risk", "merge-candidate", "auto-merge-candidate", "seo-fix"],
    autoMergeCandidateAt: "2026-07-04T15:30:00.000Z",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "merged");
  assert.equal(synced.repoChange.mergeMethod, "squash");
  assert.equal(synced.repoChange.mergeCommitSha, "merge-commit-sha-71");
  assert.ok(synced.repoChange.autoMergedAt);
  assert.equal(synced.repoChange.prState, "closed");
  assert.equal(synced.repoChange.syncMessage, "PR auto-merged after low-risk checks passed.");
  assert.ok(requests.some((item) => item.url.endsWith("/pulls/71/merge") && item.method === "PUT"));
});

test("auto-merge respects action policy target whitelist", async (t) => {
  const env = withTempEnv(t);
  writeJson(env.OPS_AUTO_ACTION_POLICY_FILE, {
    autoMerge: {
      enabled: true,
      allowedTargetTypes: ["product"],
      allowedTriggers: ["incident_followup"],
      allowedTargetIds: ["whitelisted-target"],
    },
    autoRevert: {
      enabled: true,
      allowedTargetTypes: ["product"],
      allowedTriggers: ["incident_followup"],
      allowedTargetIds: [],
      minRiskCount: 2,
    },
  });
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange, listEvents } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET" });
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 72,
            html_url: "https://github.com/starxlab0/aisite/pull/72",
            state: "open",
            draft: false,
            labels: [
              { name: "low-risk" },
              { name: "merge-candidate" },
              { name: "auto-merge-candidate" },
              { name: "seo-fix" },
            ],
            head: { sha: "merge-policy-sha-1" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return { ok: true, json: async () => ({ statuses: [] }) };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 720,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/720",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "merge-policy-sha-1",
              updated_at: "2026-07-04T16:10:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/720/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    title: "Policy denied auto merge",
    kind: "incident_followup",
    trigger: "incident_followup",
    branchName: "ai/product/not-whitelisted",
    status: "auto_merge_candidate",
    targetType: "product",
    targetId: "not-whitelisted",
    prNumber: 72,
    prUrl: "https://github.com/starxlab0/aisite/pull/72",
    prIsDraft: false,
    prLabels: ["low-risk", "merge-candidate", "auto-merge-candidate", "seo-fix"],
    autoMergeCandidateAt: "2026-07-04T15:30:00.000Z",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "auto_merge_candidate");
  assert.equal(synced.repoChange.mergeCommitSha, undefined);
  assert.equal(synced.repoChange.autoActionGate.autoMerge.allowed, false);
  assert.match(synced.repoChange.autoActionGate.autoMerge.reasons.join(" "), /targetId:not-whitelisted blocked/i);
  assert.equal(synced.repoChange.autoActionGate.autoMerge.snapshot.policy.ok, false);
  assert.match(synced.repoChange.autoActionGate.autoMerge.snapshot.policy.detail, /targetId:not-whitelisted blocked/i);
  assert.equal(synced.repoChange.autoActionGate.autoMerge.snapshot.labels.ok, true);
  assert.equal(synced.repoChange.recommendedNextStep.code, "blocked_auto_merge_policy");
  assert.match(synced.repoChange.recommendedNextStep.label, /blocked by policy/i);
  const gateEvent = listEvents({ targetType: "product", targetId: "not-whitelisted" }).find((item) => item.action === "auto_merge_gate_hold");
  assert.ok(gateEvent);
  assert.match(String(gateEvent?.note || ""), /targetId:not-whitelisted blocked/i);
  assert.ok(!requests.some((item) => item.url.endsWith("/pulls/72/merge") && item.method === "PUT"));
});

test("repo change sync marks auto-merged repo change as revert candidate when critical post-merge anomaly appears", async (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [],
    recommendations: [
      {
        id: "rec_post_merge_1",
        status: "open",
        createdAt: "2026-07-04T17:00:00.000Z",
        updatedAt: "2026-07-04T17:00:00.000Z",
        targetType: "product",
        targetId: "auto-merge-exec",
        contentRef: "post_merge",
        ruleId: "publish-verification-followup",
        severity: "critical",
        reason: "Blocked verification returned after auto-merge",
        suggestedWorkflow: "product-rewrite",
        context: {},
      },
    ],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const input = String(url);
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 81,
            html_url: "https://github.com/starxlab0/aisite/pull/81",
            state: "closed",
            draft: false,
            labels: [
              { name: "low-risk" },
              { name: "merge-candidate" },
              { name: "auto-merge-candidate" },
              { name: "seo-fix" },
            ],
            merged_at: "2026-07-04T16:00:00.000Z",
            head: { sha: "post-merge-risk-sha" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 810,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/810",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "post-merge-risk-sha",
              updated_at: "2026-07-04T16:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/810/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    title: "Post merge anomaly",
    kind: "incident_followup",
    branchName: "ai/product/auto-merge-exec",
    status: "merged",
    targetType: "product",
    targetId: "auto-merge-exec",
    prNumber: 81,
    prUrl: "https://github.com/starxlab0/aisite/pull/81",
    prIsDraft: false,
    prLabels: ["low-risk", "merge-candidate", "auto-merge-candidate", "seo-fix"],
    autoMergedAt: "2026-07-04T16:00:00.000Z",
    mergedAt: "2026-07-04T16:00:00.000Z",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "revert_candidate");
  assert.ok(synced.repoChange.postMergeRiskAt);
  assert.equal(synced.repoChange.postMergeRiskSummary, "Blocked verification returned after auto-merge");
  assert.deepEqual(synced.repoChange.postMergeRecommendationIds, ["rec_post_merge_1"]);
  assert.equal(synced.repoChange.postMergeRiskCount, 1);
});

test("repo change sync auto-creates revert pr after repeated critical post-merge risk", async (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [],
    recommendations: [
      {
        id: "rec_post_merge_2",
        status: "open",
        createdAt: "2026-07-04T18:00:00.000Z",
        updatedAt: "2026-07-04T18:00:00.000Z",
        targetType: "product",
        targetId: "auto-revert",
        contentRef: "post_merge_repeat",
        ruleId: "publish-verification-followup",
        severity: "critical",
        reason: "Critical verification issue persists after auto-merge",
        suggestedWorkflow: "product-rewrite",
        context: {},
      },
    ],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 91,
            html_url: "https://github.com/starxlab0/aisite/pull/91",
            state: "closed",
            draft: false,
            labels: [
              { name: "low-risk" },
              { name: "merge-candidate" },
              { name: "auto-merge-candidate" },
              { name: "seo-fix" },
            ],
            merged_at: "2026-07-04T16:30:00.000Z",
            head: { sha: "auto-revert-risk-sha" },
          },
        ],
      };
    }
    if (input.endsWith("/repos/starxlab0/aisite")) {
      return { ok: true, json: async () => ({ default_branch: "main" }) };
    }
    if (input.endsWith("/git/ref/heads/main")) {
      return { ok: true, json: async () => ({ object: { sha: "base-sha-revert-auto" } }) };
    }
    if (input.endsWith("/git/ref/heads/ai%2Frevert%2Frepo_repeat_revert")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.endsWith("/git/refs")) {
      return { ok: true, json: async () => ({ ref: "refs/heads/ai/revert/repo_repeat_revert" }) };
    }
    if (input.includes("/contents/.ops/repo-changes/repo_repeat_revert.revert.md?ref=ai%2Frevert%2Frepo_repeat_revert")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.includes("/contents/.ops/repo-changes/repo_repeat_revert.revert.md")) {
      return { ok: true, json: async () => ({ commit: { sha: "repeat-revert-manifest-sha" } }) };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json?ref=ai%2Frevert%2Frepo_repeat_revert")) {
      return {
        ok: true,
        json: async () => ({
          sha: "override-base-sha-repeat",
          content: Buffer.from(
            JSON.stringify(
              {
                product: {
                  "auto-revert": {
                    title: "Auto Revert | Product details",
                    description: "Existing override",
                    sourceRepoChangeId: "repo_repeat_revert",
                  },
                },
                collection: {},
              },
              null,
              2,
            ),
            "utf8",
          ).toString("base64"),
        }),
      };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json")) {
      return { ok: true, json: async () => ({ commit: { sha: "repeat-revert-seo-sha" } }) };
    }
    if (input.endsWith("/pulls")) {
      return {
        ok: true,
        json: async () => ({
          number: 92,
          html_url: "https://github.com/starxlab0/aisite/pull/92",
          state: "open",
          head: { sha: "repeat-revert-seo-sha" },
        }),
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 910,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/910",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "auto-revert-risk-sha",
              updated_at: "2026-07-04T16:30:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/910/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    id: "repo_repeat_revert",
    actor: "ops:test",
    title: "Repeated post-merge anomaly",
    kind: "incident_followup",
    branchName: "ai/product/auto-revert",
    status: "revert_candidate",
    targetType: "product",
    targetId: "auto-revert",
    prNumber: 91,
    prUrl: "https://github.com/starxlab0/aisite/pull/91",
    prIsDraft: false,
    prLabels: ["low-risk", "merge-candidate", "auto-merge-candidate", "seo-fix"],
    autoMergedAt: "2026-07-04T16:30:00.000Z",
    mergedAt: "2026-07-04T16:30:00.000Z",
    postMergeRiskAt: "2026-07-04T17:30:00.000Z",
    postMergeRiskSummary: "Critical verification issue persists after auto-merge",
    postMergeRecommendationIds: ["rec_post_merge_2"],
    postMergeRiskCount: 1,
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "revert_candidate");
  assert.equal(synced.repoChange.postMergeRiskCount, 2);
  assert.equal(synced.repoChange.revertPrNumber, 92);
  assert.equal(synced.repoChange.revertPrUrl, "https://github.com/starxlab0/aisite/pull/92");
  assert.equal(synced.repoChange.syncMessage, "Draft revert PR created from merged repo change.");
  assert.ok(requests.some((item) => item.url.endsWith("/git/refs") && item.method === "POST"));
  assert.ok(requests.some((item) => item.url.endsWith("/pulls") && item.method === "POST"));
});

test("auto-revert respects action policy target whitelist", async (t) => {
  const env = withTempEnv(t);
  writeJson(env.SIGNALS_STATE_FILE, {
    events: [],
    snapshots: [],
    recommendations: [
      {
        id: "rec_post_merge_policy",
        status: "open",
        createdAt: "2026-07-04T18:00:00.000Z",
        updatedAt: "2026-07-04T18:00:00.000Z",
        targetType: "product",
        targetId: "policy-blocked-revert",
        contentRef: "post_merge_repeat",
        ruleId: "publish-verification-followup",
        severity: "critical",
        reason: "Critical verification issue persists after auto-merge",
        suggestedWorkflow: "product-rewrite",
        context: {},
      },
    ],
    proposals: [],
    meta: {
      lastBatchRun: null,
      batchRuns: [],
      consecutiveBatchFailures: 0,
    },
  });
  writeJson(env.OPS_AUTO_ACTION_POLICY_FILE, {
    autoMerge: {
      enabled: true,
      allowedTargetTypes: ["product"],
      allowedTriggers: ["incident_followup"],
      allowedTargetIds: [],
    },
    autoRevert: {
      enabled: true,
      allowedTargetTypes: ["product"],
      allowedTriggers: ["incident_followup"],
      allowedTargetIds: ["different-target"],
      minRiskCount: 2,
    },
  });
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET" });
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 93,
            html_url: "https://github.com/starxlab0/aisite/pull/93",
            state: "closed",
            draft: false,
            labels: [
              { name: "low-risk" },
              { name: "merge-candidate" },
              { name: "auto-merge-candidate" },
              { name: "seo-fix" },
            ],
            merged_at: "2026-07-04T16:30:00.000Z",
            head: { sha: "auto-revert-policy-sha" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    if (input.includes("/status")) {
      return { ok: true, json: async () => ({ statuses: [] }) };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 930,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/930",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "auto-revert-policy-sha",
              updated_at: "2026-07-04T16:30:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/930/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success" },
            { name: "web", status: "completed", conclusion: "success" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    id: "repo_policy_revert",
    actor: "ops:test",
    title: "Policy denied auto revert",
    kind: "incident_followup",
    trigger: "incident_followup",
    branchName: "ai/product/policy-blocked-revert",
    status: "revert_candidate",
    targetType: "product",
    targetId: "policy-blocked-revert",
    prNumber: 93,
    prUrl: "https://github.com/starxlab0/aisite/pull/93",
    prIsDraft: false,
    prLabels: ["low-risk", "merge-candidate", "auto-merge-candidate", "seo-fix"],
    autoMergedAt: "2026-07-04T16:30:00.000Z",
    mergedAt: "2026-07-04T16:30:00.000Z",
    postMergeRiskAt: "2026-07-04T17:30:00.000Z",
    postMergeRiskSummary: "Critical verification issue persists after auto-merge",
    postMergeRecommendationIds: ["rec_post_merge_policy"],
    postMergeRiskCount: 1,
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "revert_candidate");
  assert.equal(synced.repoChange.postMergeRiskCount, 2);
  assert.equal(synced.repoChange.revertPrNumber, null);
  assert.ok(!requests.some((item) => item.url.endsWith("/git/refs") && item.method === "POST"));
});

test("repo change sync marks repo change as merged when github pr is merged", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const input = String(url);
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 17,
            html_url: "https://github.com/starxlab0/aisite/pull/17",
            state: "closed",
            merged_at: "2026-07-04T10:00:00.000Z",
            head: { sha: "merged-sha-1" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [{ name: "control-plane", status: "completed", conclusion: "success" }],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({
          statuses: [{ context: "web", state: "success" }],
        }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 170,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/170",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "merged-sha-1",
              updated_at: "2026-07-04T10:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/170/jobs")) {
      return {
        ok: true,
        json: async () => ({ jobs: [{ name: "control-plane", status: "completed", conclusion: "success" }] }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    title: "Merged repo change",
    branchName: "ai/product/merged-one",
    status: "ci_passed",
    targetType: "product",
    targetId: "merged-one",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "merged");
  assert.equal(synced.repoChange.mergedAt, "2026-07-04T10:00:00.000Z");
  assert.equal(synced.repoChange.prState, "closed");
});

test("repo change sync captures failed workflow jobs", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const input = String(url);
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 8,
            html_url: "https://github.com/starxlab0/aisite/pull/8",
            state: "open",
            head: { sha: "def456ghi789" },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({ check_runs: [] }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 108,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/108",
              name: "ci",
              status: "completed",
              conclusion: "failure",
              head_sha: "def456ghi789",
              updated_at: "2026-07-03T01:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/108/jobs")) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            { name: "control-plane", status: "completed", conclusion: "success", html_url: "https://example.com/job1" },
            { name: "web", status: "completed", conclusion: "failure", html_url: "https://example.com/job2" },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    kind: "incident_followup",
    title: "Fix repo diagnostics",
    targetType: "product",
    targetId: "kokocang-x",
    branchName: "ai/product/kokocang-x",
    ciStatus: "not_started",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.workflowConclusion, "failure");
  assert.equal(synced.repoChange.ciStatus, "failure");
  assert.equal(synced.repoChange.status, "ci_failed");
  assert.equal(synced.repoChange.failedJobs?.[0]?.name, "web");
});

test("bulk repo change sync only processes active items", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncActiveRepoChangesFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const originalFetch = global.fetch;
  const requestedPulls = [];
  global.fetch = async (url) => {
    const input = String(url);
    if (input.includes("/pulls?")) {
      requestedPulls.push(input);
      const sha = input.includes("active-two") ? "sha-two" : "sha-one";
      const prNumber = input.includes("active-two") ? 12 : 11;
      return {
        ok: true,
        json: async () => [
          {
            number: prNumber,
            html_url: `https://github.com/starxlab0/aisite/pull/${prNumber}`,
            state: "open",
            head: { sha },
          },
        ],
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({ check_runs: [] }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({ statuses: [] }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({ workflow_runs: [] }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  createRepoChange({
    actor: "ops:test",
    title: "Active one",
    branchName: "ai/product/active-one",
    status: "draft",
    targetType: "product",
    targetId: "p1",
  });
  createRepoChange({
    actor: "ops:test",
    title: "Active two",
    branchName: "ai/product/active-two",
    status: "ci_failed",
    targetType: "product",
    targetId: "p2",
  });
  createRepoChange({
    actor: "ops:test",
    title: "Merged item",
    branchName: "ai/product/merged",
    status: "merged",
    targetType: "product",
    targetId: "p3",
  });

  const result = await syncActiveRepoChangesFromGitHub({ actor: "ops:test", limit: 5 });

  assert.equal(result.total, 2);
  assert.equal(requestedPulls.length, 2);
  assert.ok(requestedPulls.every((item) => !item.includes("merged")));
});

test("repo change can create a draft github pull request", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { createRepoChangePullRequest } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });

    if (input.endsWith("/pulls?state=all&head=starxlab0%3Aai%2Fproduct%2Fkokocang-x")) {
      return { ok: true, json: async () => [] };
    }
    if (input.endsWith("/repos/starxlab0/aisite")) {
      return { ok: true, json: async () => ({ default_branch: "main" }) };
    }
    if (input.endsWith("/branches/ai%2Fproduct%2Fkokocang-x")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.endsWith("/git/ref/heads/main")) {
      return { ok: true, json: async () => ({ object: { sha: "base-sha-1" } }) };
    }
    if (input.endsWith("/git/ref/heads/ai%2Fproduct%2Fkokocang-x")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.endsWith("/git/refs")) {
      return { ok: true, json: async () => ({ ref: "refs/heads/ai/product/kokocang-x" }) };
    }
    if (input.includes("/contents/.ops/repo-changes/") && input.includes("?ref=ai%2Fproduct%2Fkokocang-x")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json?ref=ai%2Fproduct%2Fkokocang-x")) {
      return {
        ok: true,
        json: async () => ({
          sha: "override-base-sha",
          content: Buffer.from(JSON.stringify({ product: {}, collection: {} }, null, 2), "utf8").toString("base64"),
        }),
      };
    }
    if (input.includes("/contents/.ops/repo-changes/")) {
      return { ok: true, json: async () => ({ commit: { sha: "commit-sha-9" } }) };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json")) {
      return { ok: true, json: async () => ({ commit: { sha: "commit-sha-10" } }) };
    }
    if (input.endsWith("/pulls")) {
      return {
        ok: true,
        json: async () => ({
          number: 21,
          html_url: "https://github.com/starxlab0/aisite/pull/21",
          state: "open",
          head: { sha: "commit-sha-9" },
        }),
      };
    }

    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    actor: "ops:test",
    kind: "incident_followup",
    title: "Fix product metadata",
    summary: "Prepare product metadata fix",
    targetType: "product",
    targetId: "kokocang-x",
    branchName: "ai/product/kokocang-x",
    ciStatus: "not_started",
  });

  const result = await createRepoChangePullRequest({ id: change.id, actor: "ops:test" });

  assert.equal(result.result.status, "created");
  assert.equal(result.repoChange.status, "pr_opened");
  assert.equal(result.repoChange.prNumber, 21);
  assert.equal(result.repoChange.prUrl, "https://github.com/starxlab0/aisite/pull/21");
  assert.equal(result.repoChange.commitSha, "commit-sha-10");
  const overrideRequest = requests.find(
    (item) => item.url.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json") && item.method === "PUT",
  );
  const overrideBody = JSON.parse(overrideRequest?.body ?? "{}");
  const overrideJson = JSON.parse(Buffer.from(String(overrideBody.content || ""), "base64").toString("utf8"));
  assert.ok(requests.some((item) => item.url.includes("/git/refs") && item.method === "POST"));
  assert.ok(requests.some((item) => item.url.includes("/contents/.ops/repo-changes/") && item.method === "PUT"));
  assert.equal(overrideJson.product["kokocang-x"].sourceRepoChangeId, change.id);
  assert.equal(overrideJson.product["kokocang-x"].title, "Kokocang X | Product details");
  assert.ok(requests.some((item) => item.url.endsWith("/pulls") && item.method === "POST"));
});

test("merged repo change can create a draft revert pull request", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  process.env.REPO_PUBLISH_GITHUB_TOKEN = "test-token";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
    delete process.env.REPO_PUBLISH_GITHUB_TOKEN;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { createRepoChangeRevertPullRequest } = require(path.join(repoRoot, "src/ops/github.js"));

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const input = String(url);
    requests.push({ url: input, method: init.method || "GET", body: init.body ? String(init.body) : "" });

    if (input.endsWith("/repos/starxlab0/aisite")) {
      return { ok: true, json: async () => ({ default_branch: "main" }) };
    }
    if (input.endsWith("/git/ref/heads/main")) {
      return { ok: true, json: async () => ({ object: { sha: "base-sha-revert" } }) };
    }
    if (input.endsWith("/git/ref/heads/ai%2Frevert%2Frepo_1")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.endsWith("/git/refs")) {
      return { ok: true, json: async () => ({ ref: "refs/heads/ai/revert/repo_1" }) };
    }
    if (input.includes("/contents/.ops/repo-changes/repo_1.revert.md?ref=ai%2Frevert%2Frepo_1")) {
      return { ok: false, status: 404, text: async () => "Not Found" };
    }
    if (input.includes("/contents/.ops/repo-changes/repo_1.revert.md")) {
      return { ok: true, json: async () => ({ commit: { sha: "revert-manifest-sha" } }) };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json?ref=ai%2Frevert%2Frepo_1")) {
      return {
        ok: true,
        json: async () => ({
          sha: "override-base-sha",
          content: Buffer.from(
            JSON.stringify(
              {
                product: {
                  "kokocang-x": {
                    title: "Kokocang X | Product details",
                    description: "Existing override",
                    sourceRepoChangeId: "repo_1",
                  },
                },
                collection: {},
              },
              null,
              2,
            ),
            "utf8",
          ).toString("base64"),
        }),
      };
    }
    if (input.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json")) {
      return { ok: true, json: async () => ({ commit: { sha: "revert-seo-sha" } }) };
    }
    if (input.endsWith("/pulls")) {
      return {
        ok: true,
        json: async () => ({
          number: 31,
          html_url: "https://github.com/starxlab0/aisite/pull/31",
          state: "open",
          head: { sha: "revert-seo-sha" },
        }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    id: "repo_1",
    actor: "ops:test",
    title: "Fix product metadata",
    summary: "Prepare product metadata fix",
    targetType: "product",
    targetId: "kokocang-x",
    branchName: "ai/product/kokocang-x",
    status: "merged",
    prNumber: 21,
    prUrl: "https://github.com/starxlab0/aisite/pull/21",
    mergedAt: "2026-07-04T10:00:00.000Z",
  });

  const result = await createRepoChangeRevertPullRequest({ id: change.id, actor: "ops:test" });

  const overrideRequest = requests.find(
    (item) => item.url.includes("/contents/apps/web/src/lib/seo/repo-change-overrides.json") && item.method === "PUT",
  );
  const overrideBody = JSON.parse(overrideRequest?.body ?? "{}");
  const overrideJson = JSON.parse(Buffer.from(String(overrideBody.content || ""), "base64").toString("utf8"));

  assert.equal(result.result.status, "created");
  assert.equal(result.repoChange.revertPrNumber, 31);
  assert.equal(result.repoChange.revertPrUrl, "https://github.com/starxlab0/aisite/pull/31");
  assert.equal(result.repoChange.revertBranchName, "ai/revert/repo_1");
  assert.equal(result.repoChange.revertCommitSha, "revert-seo-sha");
  assert.equal(overrideJson.product["kokocang-x"], undefined);
});

test("repo change sync marks repo change as reverted when revert pr is merged", async (t) => {
  withTempEnv(t);
  process.env.REPO_PUBLISH_GITHUB_OWNER = "starxlab0";
  process.env.REPO_PUBLISH_GITHUB_REPO = "aisite";
  t.after(() => {
    delete process.env.REPO_PUBLISH_GITHUB_OWNER;
    delete process.env.REPO_PUBLISH_GITHUB_REPO;
  });
  resetControlPlaneModules();
  const { createRepoChange } = require(path.join(repoRoot, "src/ops/store.js"));
  const { syncRepoChangeFromGitHub } = require(path.join(repoRoot, "src/ops/github.js"));

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const input = String(url);
    if (input.includes("/pulls?")) {
      return {
        ok: true,
        json: async () => [
          {
            number: 21,
            html_url: "https://github.com/starxlab0/aisite/pull/21",
            state: "closed",
            merged_at: "2026-07-04T10:00:00.000Z",
            head: { sha: "merged-sha-2" },
          },
        ],
      };
    }
    if (input.endsWith("/pulls/31")) {
      return {
        ok: true,
        json: async () => ({
          number: 31,
          html_url: "https://github.com/starxlab0/aisite/pull/31",
          state: "closed",
          merged_at: "2026-07-04T12:00:00.000Z",
        }),
      };
    }
    if (input.includes("/check-runs")) {
      return {
        ok: true,
        json: async () => ({
          check_runs: [{ name: "control-plane", status: "completed", conclusion: "success" }],
        }),
      };
    }
    if (input.includes("/status")) {
      return {
        ok: true,
        json: async () => ({
          statuses: [{ context: "web", state: "success" }],
        }),
      };
    }
    if (input.includes("/actions/runs?")) {
      return {
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 210,
              html_url: "https://github.com/starxlab0/aisite/actions/runs/210",
              name: "ci",
              status: "completed",
              conclusion: "success",
              head_sha: "merged-sha-2",
              updated_at: "2026-07-04T10:00:00.000Z",
            },
          ],
        }),
      };
    }
    if (input.includes("/actions/runs/210/jobs")) {
      return {
        ok: true,
        json: async () => ({ jobs: [{ name: "control-plane", status: "completed", conclusion: "success" }] }),
      };
    }
    throw new Error(`unexpected fetch ${input}`);
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const change = createRepoChange({
    id: "repo_sync_revert",
    actor: "ops:test",
    title: "Merged then reverted change",
    branchName: "ai/product/revert-me",
    status: "merged",
    targetType: "product",
    targetId: "revert-me",
    prNumber: 21,
    prUrl: "https://github.com/starxlab0/aisite/pull/21",
    mergedAt: "2026-07-04T10:00:00.000Z",
    revertPrNumber: 31,
    revertPrUrl: "https://github.com/starxlab0/aisite/pull/31",
  });

  const synced = await syncRepoChangeFromGitHub({ id: change.id, actor: "ops:test" });

  assert.equal(synced.repoChange.status, "reverted");
  assert.equal(synced.repoChange.revertedAt, "2026-07-04T12:00:00.000Z");
  assert.equal(synced.repoChange.revertPrState, "closed");
  assert.equal(synced.repoChange.revertPrMergedAt, "2026-07-04T12:00:00.000Z");
});

test("ops publish persists publish revalidate metadata on draft", async (t) => {
  withTempEnv(t);
  resetControlPlaneModules();
  const { generateOpsDraft, reviewOpsDraft, publishOpsDraft, listOpsDrafts } = require(path.join(
    repoRoot,
    "src/ops/drafts.js",
  ));

  const draft = await generateOpsDraft({ type: "product", id: "kokocang-x", actor: "ops:test" });
  await reviewOpsDraft({ draftId: draft.id, actor: "ops:test", decision: "approve" });
  const published = await publishOpsDraft({ draftId: draft.id, actor: "ops:test", reason: "publish for test" });
  const drafts = listOpsDrafts({ type: "product", id: "kokocang-x" });
  const publishedDraft = drafts.find((item) => item.id === draft.id);

  assert.equal(published.status, "published");
  assert.deepEqual(published.revalidate?.requested, ["/product/kokocang-x"]);
  assert.equal(published.verification?.skipped, true);
  assert.equal(published.verification?.level, "skipped");
  assert.deepEqual(publishedDraft?.published?.revalidate?.requested, ["/product/kokocang-x"]);
  assert.equal(publishedDraft?.published?.verification?.skipped, true);
  assert.equal(publishedDraft?.published?.verification?.level, "skipped");
});
