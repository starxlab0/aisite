import test from "node:test";
import assert from "node:assert/strict";
import { getChangeRequestExecutionTarget } from "./change-request-execution.ts";

test("商品 siteKeys 变更单可生成 product draft 执行目标", () => {
  const result = getChangeRequestExecutionTarget({
    id: "change_1",
    status: "draft",
    title: "商品归属 · handou",
    prompt: "把 handou 只放到 US 站",
    lane: "product",
    label: "商品归属",
    href: "/ops?type=product&q=handou",
    summary: "",
    impact: [],
    nextStep: "",
    actor: "tester",
    createdAt: "",
    updatedAt: "",
    plan: {
      kind: "set_site_keys_product",
      targetType: "product",
      targetId: "handou",
      sites: ["us-store"],
      fields: { siteKeys: ["us-store"] },
      affectedPaths: ["/shop", "/product/handou"],
      risks: [],
      requires: [],
    },
  });

  assert.deepEqual(result, {
    mode: "draft",
    targetType: "product",
    targetId: "handou",
    patch: { siteKeys: ["us-store"] },
    detailHrefBase: "/ops/product/handou",
  });
});

test("guide siteKeys 变更单可生成 guide draft 执行目标", () => {
  const result = getChangeRequestExecutionTarget({
    id: "change_2",
    status: "draft",
    title: "Guide 内容 · how-to-choose",
    prompt: "让 how-to-choose 只给 CN 看",
    lane: "content",
    label: "Guide 内容",
    href: "/ops?type=guide&q=how-to-choose",
    summary: "",
    impact: [],
    nextStep: "",
    actor: "tester",
    createdAt: "",
    updatedAt: "",
    plan: {
      kind: "set_site_keys_content",
      targetType: "guide",
      targetId: "how-to-choose",
      sites: ["cn-store"],
      fields: { siteKeys: ["cn-store"] },
      affectedPaths: ["/guides/how-to-choose"],
      risks: [],
      requires: [],
    },
  });

  assert.deepEqual(result, {
    mode: "draft",
    targetType: "guide",
    targetId: "how-to-choose",
    patch: { siteKeys: ["cn-store"] },
    detailHrefBase: "/ops/guide/how-to-choose",
  });
});

test("toggle_feature 变更单可生成 repo change 执行目标", () => {
  const result = getChangeRequestExecutionTarget({
    id: "change_3",
    status: "draft",
    title: "站点策略 · JP 站关闭 app-control",
    prompt: "JP 站关闭 app-control",
    lane: "strategy",
    label: "站点策略",
    href: "/ops",
    summary: "",
    impact: [],
    nextStep: "",
    actor: "tester",
    createdAt: "",
    updatedAt: "",
    plan: {
      kind: "toggle_feature",
      targetType: "feature",
      targetId: "appControl",
      sites: ["jp-store"],
      fields: { feature: "appControl", op: "disable" },
      affectedPaths: ["/app-control", "/sitemap.xml"],
      risks: [],
      requires: [],
    },
  });

  assert.deepEqual(result, {
    mode: "repo_change",
    title: "Disable appControl for jp-store",
    summary: "Disable feature appControl for site jp-store through site config repo change.",
    kind: "site_feature_toggle",
    targetType: "site-config",
    targetId: "jp-store:appControl",
    branchName: "ai/site-config/jp-store-appControl-disable",
    siteConfigChange: {
      siteKeys: ["jp-store"],
      feature: "appControl",
      op: "disable",
    },
    detailHrefBase: "/ops/queue",
  });
});

test("页面运营的 featured products 变更单可生成 collection draft 执行目标", () => {
  const result = getChangeRequestExecutionTarget({
    id: "change_4",
    status: "draft",
    title: "页面运营 · first-time",
    prompt: "US 站 first-time collection 主推 haili",
    lane: "page",
    label: "页面运营",
    href: "/ops?type=collection&q=first-time",
    summary: "",
    impact: [],
    nextStep: "",
    actor: "tester",
    createdAt: "",
    updatedAt: "",
    plan: {
      kind: "update_collection_featured_products",
      targetType: "collection",
      targetId: "first-time",
      fields: { featuredProductSlugs: ["haili"] },
      affectedPaths: ["/collection/first-time"],
      risks: [],
      requires: [],
    },
  });

  assert.deepEqual(result, {
    mode: "draft",
    targetType: "collection",
    targetId: "first-time",
    patch: { featuredProductSlugs: ["haili"] },
    detailHrefBase: "/ops/collection/first-time",
  });
});
