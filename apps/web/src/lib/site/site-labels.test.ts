import test from "node:test";
import assert from "node:assert/strict";
import { getSiteLabel } from "./site-labels.ts";

test("getSiteLabel returns Chinese labels for zh", () => {
  assert.equal(getSiteLabel("cn-store", "zh"), "中国站");
  assert.equal(getSiteLabel("jp-store", "zh"), "日本站");
  assert.equal(getSiteLabel("us-store", "zh"), "美国站");
});

test("getSiteLabel returns short labels for en", () => {
  assert.equal(getSiteLabel("cn-store", "en"), "CN");
  assert.equal(getSiteLabel("jp-store", "en"), "JP");
  assert.equal(getSiteLabel("us-store", "en"), "US");
});

test("getSiteLabel falls back to siteKey if it is unknown", () => {
  assert.equal(getSiteLabel("unknown", "en"), "unknown");
  assert.equal(getSiteLabel("unknown", "zh"), "unknown");
});
