import test from "node:test";
import assert from "node:assert/strict";
import { getHeaderNavLabel } from "./copy.ts";

test("getHeaderNavLabel 在 zh 下按 href 命中中文导航标签", () => {
  const cases: Array<[string, string]> = [
    ["/shop", "选购"],
    ["/guides", "导购"],
    ["/faq", "支持"],
    ["/bundles", "套装"],
    ["/app-control", "App 控制"],
    ["/collection/first-time", "入门路线"],
    ["/privacy", "隐私"],
    ["/returns", "退换"],
    ["/shipping", "配送"],
    ["/contact", "联系"],
  ];

  for (const [href, expected] of cases) {
    assert.equal(getHeaderNavLabel(href, "FALLBACK", "zh"), expected);
  }
});

test("getHeaderNavLabel 在 zh 下未命中映射时回退到 fallback", () => {
  assert.equal(getHeaderNavLabel("/unknown", "未知", "zh"), "未知");
});

