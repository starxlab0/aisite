import test from "node:test";
import assert from "node:assert/strict";
import { appendGeoPreferenceParams } from "./geo-switch-url.ts";

test("appendGeoPreferenceParams 能给相对路径追加站点与语言参数", () => {
  assert.equal(
    appendGeoPreferenceParams("/shop", { siteKey: "us-store", localeKey: "en" }),
    "/shop?geo_site_choice=us-store&geo_locale_choice=en",
  );
});

test("appendGeoPreferenceParams 能给绝对 URL 追加参数并保留原路径", () => {
  assert.equal(
    appendGeoPreferenceParams("https://us.example.com/zh/product/demo", { siteKey: "us-store", localeKey: "zh" }),
    "https://us.example.com/zh/product/demo?geo_site_choice=us-store&geo_locale_choice=zh",
  );
});

test("appendGeoPreferenceParams 能生成关闭 banner 参数", () => {
  assert.equal(
    appendGeoPreferenceParams("/guides", { dismissBanner: true }),
    "/guides?geo_dismiss_banner=1",
  );
});

