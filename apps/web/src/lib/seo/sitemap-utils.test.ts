import test from "node:test";
import assert from "node:assert/strict";
import { buildFeatureEnabledSitemapRoutes } from "./sitemap-utils.ts";

test("buildFeatureEnabledSitemapRoutes 会过滤关闭 feature 的静态路由与 collection 路由", () => {
  const routes = buildFeatureEnabledSitemapRoutes(
    {
      guides: false,
      bundles: false,
      appControl: false,
      quiz: true,
    },
    ["/product/haili"],
    ["/guides/how-to-choose"],
  );

  assert.equal(routes.includes("/guides"), false);
  assert.equal(routes.includes("/bundles"), false);
  assert.equal(routes.includes("/app-control"), false);
  assert.equal(routes.includes("/collection/app-control"), false);
  assert.equal(routes.includes("/quiz"), true);
  assert.equal(routes.includes("/product/haili"), true);
  assert.equal(routes.includes("/guides/how-to-choose"), false);
});

test("buildFeatureEnabledSitemapRoutes 在 guides 开启时会保留 guide 路由", () => {
  const routes = buildFeatureEnabledSitemapRoutes(
    {
      guides: true,
      bundles: true,
      appControl: true,
      quiz: true,
    },
    [],
    ["/guides/app-control-for-beginners"],
  );

  assert.equal(routes.includes("/guides"), true);
  assert.equal(routes.includes("/guides/app-control-for-beginners"), true);
});
