import { tenantRegistry } from "@/lib/site/site-registry";
import { isFeaturePathEnabledForFeatures } from "@/lib/site/feature-utils";
import { listAvailableSiteKeysForContext } from "@/lib/site/site-config-utils";
import type { ActiveSiteConfig, SiteContext, TenantConfig } from "@/lib/site/types";

export const fallbackSiteContext: SiteContext = {
  tenantKey: "xiao",
  brandKey: "brand",
  siteKey: "cn-store",
  localeKey: "en",
};

function readRuntimeSiteContext(): SiteContext {
  const tenantKey = process.env.SITE_TENANT_KEY?.trim() || fallbackSiteContext.tenantKey;
  const brandKey = process.env.SITE_BRAND_KEY?.trim() || fallbackSiteContext.brandKey;
  const siteKey = process.env.SITE_KEY?.trim() || fallbackSiteContext.siteKey;
  const localeKey = process.env.SITE_DEFAULT_LOCALE?.trim() || fallbackSiteContext.localeKey;
  return { tenantKey, brandKey, siteKey, localeKey };
}

function normalizeLocaleKey(localeKey?: string) {
  const normalized = typeof localeKey === "string" ? localeKey.trim() : "";
  return normalized || readRuntimeSiteContext().localeKey;
}

export function resolveSiteConfig(context: SiteContext): ActiveSiteConfig {
  const tenantConfig: TenantConfig | undefined = tenantRegistry[context.tenantKey];
  if (!tenantConfig) {
    throw new Error(`Unknown tenantKey: ${context.tenantKey}`);
  }

  const brand = tenantConfig.brands[context.brandKey];
  if (!brand) {
    throw new Error(`Unknown brandKey: ${context.brandKey}`);
  }

  const site = brand.sites[context.siteKey];
  if (!site) {
    throw new Error(`Unknown siteKey: ${context.siteKey}`);
  }

  const locale =
    tenantConfig.locales[context.localeKey] ??
    tenantConfig.locales[brand.profile.defaultLocale];

  if (!locale) {
    throw new Error(`Unknown localeKey: ${context.localeKey}`);
  }

  return {
    context,
    tenant: {
      key: tenantConfig.key,
      name: tenantConfig.name,
    },
    brand: brand.profile,
    site,
    locale,
  };
}

export function getActiveSiteContext(): SiteContext {
  return readRuntimeSiteContext();
}

export function getActiveSiteConfig() {
  return resolveSiteConfig(readRuntimeSiteContext());
}

export function getSiteConfigForLocale(localeKey?: string) {
  const activeContext = readRuntimeSiteContext();
  return resolveSiteConfig({
    ...activeContext,
    localeKey: normalizeLocaleKey(localeKey),
  });
}

export function listAvailableSiteKeys(context = readRuntimeSiteContext()) {
  return listAvailableSiteKeysForContext(tenantRegistry, context);
}

export type SiteFeatureKey = keyof ActiveSiteConfig["site"]["features"];

export function isSiteFeatureEnabled(feature: SiteFeatureKey, localeKey?: string) {
  return Boolean(getSiteConfigForLocale(localeKey).site.features[feature]);
}

export function isFeaturePathEnabled(pathname: string, localeKey?: string) {
  return isFeaturePathEnabledForFeatures(pathname, getSiteConfigForLocale(localeKey).site.features);
}

export function filterFeatureEnabledNavItems<T extends { href: string }>(items: T[], localeKey?: string) {
  return items.filter((item) => isFeaturePathEnabled(item.href, localeKey));
}
