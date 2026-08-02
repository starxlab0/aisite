import test from "node:test";
import assert from "node:assert/strict";
import { pickCollectionCtaLinks, pickCollectionProducts } from "./collection-merchandising.ts";

const products = [
  {
    slug: "kokocang-x",
    beginnerLevel: 5,
    appControl: true,
    wearable: false,
    stimulationType: ["single"],
    collections: ["first-time", "app-control"],
  },
  {
    slug: "haili",
    beginnerLevel: 4,
    appControl: false,
    wearable: true,
    stimulationType: ["single"],
    collections: ["first-time", "wearable"],
  },
  {
    slug: "handou",
    beginnerLevel: 2,
    appControl: false,
    wearable: false,
    stimulationType: ["dual"],
    collections: ["dual-stimulation"],
  },
];

test("pickCollectionProducts 优先使用内容层 featuredProductSlugs，其次才是站点 override", () => {
  const result = pickCollectionProducts(products, "first-time", ["haili"], ["kokocang-x"]);
  assert.deepEqual(
    result.map((item) => item.slug),
    ["haili"],
  );
});

test("pickCollectionProducts 在没有显式推荐时回退到 collection 默认筛选", () => {
  const result = pickCollectionProducts(products, "dual-stimulation");
  assert.deepEqual(
    result.map((item) => item.slug),
    ["handou"],
  );
});

test("pickCollectionCtaLinks 优先使用内容层 CTA，并过滤掉未启用 feature 的路径", () => {
  const result = pickCollectionCtaLinks(
    [
      { href: "/quiz", label: "问答" },
      { href: "/app-control", label: "App Control" },
    ],
    [{ href: "/guides", label: "导购" }],
    (pathname) => pathname !== "/app-control",
  );

  assert.deepEqual(result, [{ href: "/quiz", label: "问答" }]);
});
