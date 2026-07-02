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
    CMS_ADAPTER: "local",
  };
  const previous = {
    SIGNALS_STATE_FILE: process.env.SIGNALS_STATE_FILE,
    SIGNALS_RULES_FILE: process.env.SIGNALS_RULES_FILE,
    OPS_STATE_FILE: process.env.OPS_STATE_FILE,
    OPS_ROLLBACK_POLICY_FILE: process.env.OPS_ROLLBACK_POLICY_FILE,
    CMS_ADAPTER: process.env.CMS_ADAPTER,
  };
  Object.assign(process.env, env);
  t.after(() => {
    process.env.SIGNALS_STATE_FILE = previous.SIGNALS_STATE_FILE;
    process.env.SIGNALS_RULES_FILE = previous.SIGNALS_RULES_FILE;
    process.env.OPS_STATE_FILE = previous.OPS_STATE_FILE;
    process.env.OPS_ROLLBACK_POLICY_FILE = previous.OPS_ROLLBACK_POLICY_FILE;
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
        metrics: { views: 200, ctaClicks: 2, addToCart: 1 },
        source: "test",
      },
      {
        id: "sig_post_after",
        capturedAt: "2026-06-29T18:00:00.000Z",
        windowDays: 7,
        targetType: "product",
        targetId: "prod_1",
        contentRef: "post_after",
        metrics: { views: 200, ctaClicks: 6, addToCart: 3 },
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
            metrics: { views: 200, ctaClicks: 2, addToCart: 1 },
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
            metrics: { views: 200, ctaClicks: 2, addToCart: 1 },
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
  assert.ok(proposal.reviewSummary.signals.some((item) => item.includes("Post-apply window is complete")));
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
