import test from "node:test";
import assert from "node:assert/strict";
import { parseCollectionCtaLinks, parseMultilineList } from "./collection-draft-form.ts";

test("parseMultilineList 会去空白并过滤空行", () => {
  assert.deepEqual(parseMultilineList("a\n b \n\nc "), ["a", "b", "c"]);
});

test("parseCollectionCtaLinks 解析 href | label 格式，并在 label 缺失时回退到 href", () => {
  assert.deepEqual(parseCollectionCtaLinks("/quiz | 先做问答\n/guides"), [
    { href: "/quiz", label: "先做问答" },
    { href: "/guides", label: "/guides" },
  ]);
});

test("parseCollectionCtaLinks 会忽略空 href 的无效输入", () => {
  assert.deepEqual(parseCollectionCtaLinks(" | 空\n\n/app-control | App"), [
    { href: "/app-control", label: "App" },
  ]);
});
