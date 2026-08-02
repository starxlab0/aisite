import test from "node:test";
import assert from "node:assert/strict";
import { resolveOpsIntent } from "./ops-intent.ts";

test("商品归属指令会跳到商品工作台并带查询词", () => {
  const result = resolveOpsIntent("把 handou 只放到 US 站");
  assert.equal(result.lane, "product");
  assert.equal(result.href, "/ops?type=product&q=handou");
  assert.match(result.summary, /商品归属/);
  assert.equal(result.nextStep, "打开商品归属入口");
  assert.equal(result.plan?.kind, "set_site_keys_product");
  assert.deepEqual(result.plan?.sites, ["us-store"]);
});

test("发布相关指令会跳到发布中心", () => {
  const result = resolveOpsIntent("查看发布队列");
  assert.equal(result.lane, "publish");
  assert.equal(result.href, "/ops/queue");
  assert.equal(result.nextStep, "打开发布中心");
});

test("页面运营指令会跳到 collection 运营入口", () => {
  const result = resolveOpsIntent("US 站 first-time collection 主推 haili");
  assert.equal(result.lane, "page");
  assert.equal(result.href, "/ops?type=collection&q=first-time");
  assert.match(result.summary, /主推商品调整/);
  assert.equal(result.plan?.kind, "update_collection_featured_products");
  assert.deepEqual(result.plan?.fields, { featuredProductSlugs: ["haili"] });
});

test("collection CTA 指令会生成 CTA patch", () => {
  const result = resolveOpsIntent("把 first-time collection CTA 改成 quiz");
  assert.equal(result.lane, "page");
  assert.equal(result.href, "/ops?type=collection&q=first-time");
  assert.equal(result.plan?.kind, "update_collection_cta");
  assert.deepEqual(result.plan?.fields, {
    ctaLinks: [{ href: "/quiz", label: "Start quiz" }],
  });
});

test("站点策略指令先回到工作台首页", () => {
  const result = resolveOpsIntent("JP 站关闭 app-control");
  assert.equal(result.lane, "strategy");
  assert.equal(result.href, "/ops");
  assert.match(result.summary, /站点策略/);
});
