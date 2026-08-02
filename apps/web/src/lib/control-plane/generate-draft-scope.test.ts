import test from "node:test";
import assert from "node:assert/strict";
import { shouldAutoScopeGeneratedDraft } from "./generate-draft-scope.ts";

test("shouldAutoScopeGeneratedDraft 对支持的 entityType 且 siteKeys 为空时返回 true", () => {
  assert.equal(
    shouldAutoScopeGeneratedDraft({
      entityType: "collection-page",
      payload: {},
    }),
    true,
  );

  assert.equal(
    shouldAutoScopeGeneratedDraft({
      entityType: "faq",
      payload: { siteKeys: [] },
    }),
    true,
  );
});

test("shouldAutoScopeGeneratedDraft 在已有 siteKeys 或不支持的 entityType 时返回 false", () => {
  assert.equal(
    shouldAutoScopeGeneratedDraft({
      entityType: "guide-article",
      payload: { siteKeys: ["us-store"] },
    }),
    false,
  );

  assert.equal(
    shouldAutoScopeGeneratedDraft({
      entityType: "proposal",
      payload: {},
    }),
    false,
  );
});
