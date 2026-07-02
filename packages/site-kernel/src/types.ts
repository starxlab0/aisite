export type SiteNavItem = {
  label: string;
  href: string;
};

export type SiteFooterLink = {
  label: string;
  href: string;
};

export type SiteBrand = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  defaultLocale: string;
};

export type SiteThemeTokens = {
  accent: string;
  accentForeground: string;
  surface: string;
};

export type SiteBrand = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  defaultLocale: string;
};

export type SiteLocaleConfig = {
  key: string;
  label: string;
  lang: string;
  currency: string;
  markets: string[];
};

export type SiteFeatureFlags = {
  guides: boolean;
  bundles: boolean;
  appControl: boolean;
  quiz: boolean;
};

export type SiteCommerceConfig = {
  defaultCollectionSlug: string;
  supportEmail?: string;
  marketCode: string;
};

export type SiteDefinition = {
  siteId: string;
  navigation: {
    header: SiteNavItem[];
    footer: SiteFooterLink[];
  };
  commerce: SiteCommerceConfig;
  theme: SiteThemeTokens;
  features: SiteFeatureFlags;
};

export type BrandDefinition = {
  key: string;
  profile: SiteBrand;
  sites: Record<string, SiteDefinition>;
};

export type TenantDefinition = {
  key: string;
  name: string;
  brands: Record<string, BrandDefinition>;
  locales: Record<string, SiteLocaleConfig>;
};

export type SiteContext = {
  tenantKey: string;
  brandKey: string;
  siteKey: string;
  localeKey: string;
};

export type ResolvedSiteConfig = {
  context: SiteContext;
  tenant: {
    key: string;
    name: string;
  };
  brand: SiteBrand;
  site: SiteDefinition;
  locale: SiteLocaleConfig;
};
