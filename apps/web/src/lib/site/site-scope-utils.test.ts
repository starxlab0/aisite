import test from "node:test";
import assert from "node:assert/strict";
import { filterBySiteScopeValue, matchesSiteScopeValue } from "./site-scope-utils.ts";

test("matchesSiteScopeValue 在未设置 siteKeys 时默认所有站点可见", () => {
  assert.equal(matchesSiteScopeValue({}, "cn-store"), true);
  assert.equal(matchesSiteScopeValue({ siteKeys: [] }, "us-store"), true);
});

test("matchesSiteScopeValue 只在命中 siteKeys 时返回 true", () => {
  assert.equal(matchesSiteScopeValue({ siteKeys: ["cn-store", "jp-store"] }, "cn-store"), true);
  assert.equal(matchesSiteScopeValue({ siteKeys: ["cn-store", "jp-store"] }, "us-store"), false);
});

test("filterBySiteScopeValue 会过滤掉不属于当前站点的项", () => {
  const filtered = filterBySiteScopeValue(
    [
      { slug: "a", siteKeys: ["cn-store"] },
      { slug: "b", siteKeys: ["us-store"] },
      { slug: "c" },
    ],
    "cn-store",
  );

  assert.deepEqual(
    filtered.map((item) => item.slug),
    ["a", "c"],
  );
});
