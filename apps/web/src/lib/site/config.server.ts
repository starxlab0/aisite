import "server-only";

import { headers } from "next/headers";
import { tenantRegistry } from "@/lib/site/site-registry";
import { isFeaturePathEnabledForFeatures } from "@/lib/site/feature-utils";
import { listAvailableSiteKeysForContext } from "@/lib/site/site-config-utils";
import type { ActiveSiteConfig, SiteContext } from "@/lib/site/types";
import { fallbackSiteContext, resolveSiteConfig } from "@/lib/site/config";

async function readRequestSiteContext(): Promise<SiteContext> {
  const headerStore = await headers();
  const headerSiteKey = headerStore.get("x-site-key")?.trim();
  const headerLocaleKey = headerStore.get("x-site-locale")?.trim();

  const tenantKey = process.env.SITE_TENANT_KEY?.trim() || fallbackSiteContext.tenantKey;
  const brandKey = process.env.SITE_BRAND_KEY?.trim() || fallbackSiteContext.brandKey;
  const siteKey = headerSiteKey || process.env.SITE_KEY?.trim() || fallbackSiteContext.siteKey;
  const localeKey = headerLocaleKey || process.env.SITE_DEFAULT_LOCALE?.trim() || fallbackSiteContext.localeKey;

  return { tenantKey, brandKey, siteKey, localeKey };
}

export async function getActiveSiteContext(): Promise<SiteContext> {
  return readRequestSiteContext();
}

export async function getActiveSiteConfig(): Promise<ActiveSiteConfig> {
  return resolveSiteConfig(await readRequestSiteContext());
}

export async function getSiteConfigForLocale(localeKey?: string): Promise<ActiveSiteConfig> {
  const context = await readRequestSiteContext();
  const nextLocaleKey = (typeof localeKey === "string" ? localeKey.trim() : "") || context.localeKey;
  return resolveSiteConfig({
    ...context,
    localeKey: nextLocaleKey,
  });
}

export async function listAvailableSiteKeys(context?: SiteContext) {
  const resolvedContext = context || (await readRequestSiteContext());
  return listAvailableSiteKeysForContext(tenantRegistry, resolvedContext);
}

export async function isSiteFeatureEnabled(feature: keyof ActiveSiteConfig["site"]["features"], localeKey?: string) {
  return Boolean((await getSiteConfigForLocale(localeKey)).site.features[feature]);
}

export async function isFeaturePathEnabled(pathname: string, localeKey?: string) {
  return isFeaturePathEnabledForFeatures(pathname, (await getSiteConfigForLocale(localeKey)).site.features);
}

export async function filterFeatureEnabledNavItems<T extends { href: string }>(items: T[], localeKey?: string) {
  const features = (await getSiteConfigForLocale(localeKey)).site.features;
  return items.filter((item) => isFeaturePathEnabledForFeatures(item.href, features));
}

