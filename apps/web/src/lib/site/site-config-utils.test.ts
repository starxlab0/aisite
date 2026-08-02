import test from "node:test";
import assert from "node:assert/strict";
import { listAvailableSiteKeysForContext } from "./site-config-utils.ts";

const registry = {
  xiao: {
    key: "xiao",
    name: "Xiao",
    locales: {},
    brands: {
      brand: {
        key: "brand",
        profile: {
          key: "brand",
          name: "Brand",
          tagline: "",
          description: "",
          defaultLocale: "en",
        },
        sites: {
          "cn-store": {} as any,
          "us-store": {} as any,
        },
      },
    },
  },
} as any;

test("listAvailableSiteKeysForContext 返回当前 tenant/brand 下的站点 key", () => {
  assert.deepEqual(
    listAvailableSiteKeysForContext(registry, {
      tenantKey: "xiao",
      brandKey: "brand",
    }),
    ["cn-store", "us-store"],
  );
});

test("listAvailableSiteKeysForContext 在 tenant 或 brand 不存在时返回空数组", () => {
  assert.deepEqual(
    listAvailableSiteKeysForContext(registry, {
      tenantKey: "missing",
      brandKey: "brand",
    }),
    [],
  );
  assert.deepEqual(
    listAvailableSiteKeysForContext(registry, {
      tenantKey: "xiao",
      brandKey: "missing",
    }),
    [],
  );
});
