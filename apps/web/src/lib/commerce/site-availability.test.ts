import test from "node:test";
import assert from "node:assert/strict";
import { parseSiteKeysValue } from "./site-availability.ts";

test("parseSiteKeysValue 支持数组形式的 metadata.siteKeys", () => {
  assert.deepEqual(parseSiteKeysValue(["cn-store", " us-store "]), ["cn-store", "us-store"]);
});

test("parseSiteKeysValue 支持逗号分隔字符串形式的 metadata.siteKeys", () => {
  assert.deepEqual(parseSiteKeysValue("cn-store, us-store, jp-store"), ["cn-store", "us-store", "jp-store"]);
});

test("parseSiteKeysValue 在无效输入时返回 undefined", () => {
  assert.equal(parseSiteKeysValue(null), undefined);
  assert.equal(parseSiteKeysValue(123), undefined);
});
