import test from "node:test";
import assert from "node:assert/strict";
import { buildCreateCartPayload, getDisplayLineTotal } from "./cart-logic.ts";

test("buildCreateCartPayload 只保留 Medusa create cart 接受的字段", () => {
  assert.deepEqual(
    buildCreateCartPayload({
      regionId: "reg_123",
      countryCode: "cn",
    }),
    {
      region_id: "reg_123",
    },
  );
});

test("buildCreateCartPayload 在没有 regionId 时返回空对象", () => {
  assert.deepEqual(
    buildCreateCartPayload({
      countryCode: "cn",
    }),
    {},
  );
});

test("getDisplayLineTotal 优先使用后端已返回的单行总价", () => {
  assert.equal(getDisplayLineTotal(1000, 2, 3000, 3000), 3000);
});

test("getDisplayLineTotal 在单行总价缺失时回退到单价乘数量", () => {
  assert.equal(getDisplayLineTotal(1000, 2, 0, 2000), 2000);
});

test("getDisplayLineTotal 在购物车为空或输入非法时不做错误回退", () => {
  assert.equal(getDisplayLineTotal(1000, 2, 0, 0), 0);
  assert.equal(getDisplayLineTotal(0, 2, 0, 2000), 0);
  assert.equal(getDisplayLineTotal(1000, 0, 0, 2000), 0);
});
