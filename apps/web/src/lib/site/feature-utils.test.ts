import test from "node:test";
import assert from "node:assert/strict";
import { filterFeatureEnabledItemsForFeatures, isFeaturePathEnabledForFeatures, resolveFeatureForPath } from "./feature-utils.ts";

test("resolveFeatureForPath 能识别核心 feature 路径", () => {
  assert.equal(resolveFeatureForPath("/guides"), "guides");
  assert.equal(resolveFeatureForPath("/bundles?plan=app-control"), "bundles");
  assert.equal(resolveFeatureForPath("/app-control"), "appControl");
  assert.equal(resolveFeatureForPath("/collection/app-control"), "appControl");
  assert.equal(resolveFeatureForPath("/quiz"), "quiz");
  assert.equal(resolveFeatureForPath("/shop"), null);
});

test("isFeaturePathEnabledForFeatures 会按 feature map 过滤路径", () => {
  const features = {
    guides: false,
    bundles: true,
    appControl: false,
    quiz: true,
  };

  assert.equal(isFeaturePathEnabledForFeatures("/guides", features), false);
  assert.equal(isFeaturePathEnabledForFeatures("/collection/app-control", features), false);
  assert.equal(isFeaturePathEnabledForFeatures("/quiz?src=guides", features), true);
  assert.equal(isFeaturePathEnabledForFeatures("/shipping", features), true);
});

test("filterFeatureEnabledItemsForFeatures 会过滤掉 feature 已关闭的导航项", () => {
  const items = filterFeatureEnabledItemsForFeatures(
    [
      { href: "/guides", label: "Guides" },
      { href: "/quiz", label: "Quiz" },
      { href: "/contact", label: "Contact" },
    ],
    {
      guides: false,
      bundles: true,
      appControl: true,
      quiz: true,
    },
  );

  assert.deepEqual(
    items.map((item) => item.href),
    ["/quiz", "/contact"],
  );
});
