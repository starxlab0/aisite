import type { Metadata } from "next";
import { isFeaturePathEnabledForFeatures } from "@/lib/site/feature-utils";
import { buildLocalePath, SUPPORTED_LOCALE_KEYS, type SupportedLocaleKey } from "@/lib/site/locale-routing";
import { tenantRegistry } from "@/lib/site/site-registry";
import { getActiveSiteContext } from "@/lib/site/config.server";
import { getSiteBaseUrl } from "@/lib/seo/url";
import { getSiteUrlBySiteKey } from "@/lib/site/site-url-map";

type BuildAlternatesInput = {
  path: string;
  canonicalPath: string;
  siteKeys?: string[];
  featurePath?: string | null;
};

function toAbsoluteUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/$/, "")}${normalized}`;
}

function buildHreflang(siteKey: string, localeKey: SupportedLocaleKey) {
  if (siteKey === "cn-store") return localeKey === "zh" ? "zh-CN" : "en-CN";
  if (siteKey === "jp-store") return localeKey === "zh" ? "zh-JP" : "en-JP";
  return localeKey === "zh" ? "zh-US" : "en-US";
}

export async function buildSeoAlternates(input: BuildAlternatesInput): Promise<Metadata["alternates"]> {
  const context = await getActiveSiteContext();
  const currentBaseUrl = getSiteBaseUrl();
  const defaultBaseUrl = getSiteUrlBySiteKey("us-store") || currentBaseUrl;
  const tenant = tenantRegistry[context.tenantKey];
  const brand = tenant?.brands?.[context.brandKey];
  const siteEntries = Object.entries(brand?.sites ?? {});

  const eligibleSites = siteEntries.filter(([siteKey, siteDefinition]) => {
    if (input.siteKeys?.length && !input.siteKeys.includes(siteKey)) return false;
    if (input.featurePath && !isFeaturePathEnabledForFeatures(input.featurePath, siteDefinition.features)) return false;
    return true;
  });

  const languages: Record<string, string> = {};

  for (const [siteKey] of eligibleSites) {
    const baseUrl = siteKey === context.siteKey ? currentBaseUrl : getSiteUrlBySiteKey(siteKey);
    if (!baseUrl) continue;

    for (const localeKey of SUPPORTED_LOCALE_KEYS) {
      const hreflang = buildHreflang(siteKey, localeKey);
      languages[hreflang] = toAbsoluteUrl(baseUrl, buildLocalePath(input.path, localeKey));
    }
  }

  languages["x-default"] = toAbsoluteUrl(defaultBaseUrl, buildLocalePath(input.path, "en"));

  return {
    canonical: toAbsoluteUrl(currentBaseUrl, input.canonicalPath),
    languages,
  };
}
