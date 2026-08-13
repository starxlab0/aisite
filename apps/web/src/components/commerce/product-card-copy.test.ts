import assert from "node:assert/strict";
import test from "node:test";
import { mockProducts } from "../../lib/commerce/mock.ts";
import {
  buildProductBadges,
  getProductCardCopy,
  getRuntimeLabel,
  getStockLabel,
  getWaterproofLabel,
} from "./product-card-copy.ts";

test("ProductCard 英文文案避免中文硬编码", () => {
  const product = mockProducts[1];

  assert.deepEqual(buildProductBadges(product, "en"), [
    "App Control",
    "Wearable",
    "Couples",
    "Dual stimulation",
  ]);
  assert.equal(getStockLabel(product, "en"), "In stock");
  assert.equal(getRuntimeLabel(product, "en"), "50 min");
  assert.equal(getWaterproofLabel(product, "en"), "IPX7");
  assert.equal(getProductCardCopy("en").viewDetails, "View details");
});

test("ProductCard 中文文案保持原有表达", () => {
  const product = mockProducts[1];

  assert.deepEqual(buildProductBadges(product, "zh"), ["App 控制", "可穿戴", "适合情侣", "双重刺激"]);
  assert.equal(getStockLabel(product, "zh"), "现货可下单");
  assert.equal(getRuntimeLabel(product, "zh"), "50 分钟");
  assert.equal(getWaterproofLabel(product, "zh"), "IPX7");
  assert.equal(getProductCardCopy("zh").viewDetails, "查看详情");
});

test("ProductCard 库存与缺省状态按语言返回", () => {
  const soldOut = { ...mockProducts[0], inventoryQuantity: 0, allowBackorder: false, runtimeMinutes: undefined, waterproof: "none" as const };
  const lowStock = { ...mockProducts[0], inventoryQuantity: 3, allowBackorder: false };
  const backorder = { ...mockProducts[0], inventoryQuantity: 0, allowBackorder: true };

  assert.equal(getStockLabel(soldOut, "en"), "Out of stock");
  assert.equal(getStockLabel(lowStock, "en"), "Only 3 left");
  assert.equal(getStockLabel(backorder, "en"), "Backorder available");
  assert.equal(getRuntimeLabel(soldOut, "en"), "See product page");
  assert.equal(getWaterproofLabel(soldOut, "en"), "Not waterproof");

  assert.equal(getStockLabel(soldOut, "zh"), "暂时缺货");
  assert.equal(getStockLabel(lowStock, "zh"), "仅剩 3 件");
  assert.equal(getStockLabel(backorder, "zh"), "支持预售");
  assert.equal(getRuntimeLabel(soldOut, "zh"), "详情页查看");
  assert.equal(getWaterproofLabel(soldOut, "zh"), "不支持防水");
});
