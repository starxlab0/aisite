import test from "node:test";
import assert from "node:assert/strict";
import { buildGeoSignals, getCountryCodeFromHeaders, preferredLocaleFromGeo, recommendSiteKeyFromCountry } from "./geo-utils.ts";

test("getCountryCodeFromHeaders 优先读取常见 geo header 并规范化", () => {
  const headers = new Headers({
    "x-vercel-ip-country": "cn",
  });
  assert.equal(getCountryCodeFromHeaders(headers), "CN");
});

test("recommendSiteKeyFromCountry 能把 CN/JP/US 映射到现有站点", () => {
  assert.equal(recommendSiteKeyFromCountry("CN"), "cn-store");
  assert.equal(recommendSiteKeyFromCountry("JP"), "jp-store");
  assert.equal(recommendSiteKeyFromCountry("US"), "us-store");
});

test("preferredLocaleFromGeo 会参考 accept-language 或国家", () => {
  assert.equal(preferredLocaleFromGeo({ country: "US", acceptLanguage: "zh-CN,zh;q=0.9" }), "zh");
  assert.equal(preferredLocaleFromGeo({ country: "CN", acceptLanguage: "" }), "zh");
  assert.equal(preferredLocaleFromGeo({ country: "US", acceptLanguage: "" }), "en");
});

test("buildGeoSignals 会同时给出 country / recommendedSiteKey / preferredLocale", () => {
  const headers = new Headers({
    "cf-ipcountry": "JP",
    "accept-language": "en-US,en;q=0.9",
  });
  const geo = buildGeoSignals({ headers });
  assert.deepEqual(geo, {
    country: "JP",
    recommendedSiteKey: "jp-store",
    preferredLocale: "en",
  });
});

