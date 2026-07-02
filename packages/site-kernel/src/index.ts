import { defaultSiteContext, defaultTenantConfig } from "./config/default-site";
import type {
  BrandDefinition,
  ResolvedSiteConfig,
  SiteBrand,
  SiteCommerceConfig,
  SiteContext,
  SiteDefinition,
  SiteFeatureFlags,
  SiteFooterLink,
  SiteLocaleConfig,
  SiteNavItem,
  SiteThemeTokens,
  TenantDefinition,
} from "./types";

export function getTenantConfig(): TenantDefinition {
  return defaultTenantConfig;
}

export function getDefaultSiteContext(): SiteContext {
  return defaultSiteContext;
}

export function resolveSiteConfig(
  context: SiteContext = defaultSiteContext,
  tenant: TenantDefinition = defaultTenantConfig,
): ResolvedSiteConfig {
  const brand = tenant.brands[context.brandKey];
  if (!brand) {
    throw new Error(`Unknown brandKey: ${context.brandKey}`);
  }

  const site = brand.sites[context.siteKey];
  if (!site) {
    throw new Error(`Unknown siteKey: ${context.siteKey}`);
  }

  const locale =
    tenant.locales[context.localeKey] ??
    tenant.locales[brand.profile.defaultLocale];

  if (!locale) {
    throw new Error(`Unknown localeKey: ${context.localeKey}`);
  }

  return {
    context,
    tenant: {
      key: tenant.key,
      name: tenant.name,
    },
    brand: brand.profile,
    site,
    locale,
  };
}

export type {
  BrandDefinition,
  ResolvedSiteConfig,
  SiteBrand,
  SiteCommerceConfig,
  SiteContext,
  SiteDefinition,
  SiteFeatureFlags,
  SiteFooterLink,
  SiteLocaleConfig,
  SiteNavItem,
  SiteThemeTokens,
  TenantDefinition,
};
