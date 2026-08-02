import type { LocalizedByLocale } from "@/types/i18n";

export type SiteNavItem = {
  label: string;
  href: string;
};

export type SiteFooterLink = {
  label: string;
  href: string;
};

export type SiteDefinition = {
  siteId: string;
  navigation: {
    header: SiteNavItem[];
    footer: SiteFooterLink[];
  };
  commerce: {
    defaultCollectionSlug: string;
    supportEmail?: string;
    marketCode: string;
  };
  theme: {
    accent: string;
    accentForeground: string;
    surface: string;
  };
  features: {
    guides: boolean;
    bundles: boolean;
    appControl: boolean;
    quiz: boolean;
  };
  merchandising: {
    homeFeaturedProductSlugs: string[];
    homeCollectionCards: Array<{
      href: string;
      title: string;
      summary: string;
      locales?: LocalizedByLocale<{
        title?: string;
        summary?: string;
      }>;
    }>;
    shopIntro: {
      eyebrow: string;
      title: string;
      description: string;
      locales?: LocalizedByLocale<{
        eyebrow?: string;
        title?: string;
        description?: string;
      }>;
    };
    shopQuickLinks: Array<{
      href: string;
      label: string;
      locales?: LocalizedByLocale<{
        label?: string;
      }>;
    }>;
    shopAdviceCards: Array<{
      title: string;
      copy: string;
      locales?: LocalizedByLocale<{
        title?: string;
        copy?: string;
      }>;
    }>;
    collectionOverrides?: Record<
      string,
      {
        heroTitle?: string;
        heroSummary?: string;
        sections?: Array<{
          key: string;
          title: string;
          content: string;
          locales?: LocalizedByLocale<{
            title?: string;
            content?: string;
          }>;
        }>;
        internalLinks?: string[];
        featuredProductSlugs?: string[];
        ctaLinks?: Array<{
          href: string;
          label: string;
          locales?: LocalizedByLocale<{
            label?: string;
          }>;
        }>;
        locales?: LocalizedByLocale<{
          heroTitle?: string;
          heroSummary?: string;
        }>;
      }
    >;
  };
};

export type LocaleDefinition = {
  key: string;
  label: string;
  lang: string;
  currency: string;
  markets: string[];
};

export type BrandProfile = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  defaultLocale: string;
};

export type BrandDefinition = {
  key: string;
  profile: BrandProfile;
  sites: Record<string, SiteDefinition>;
};

export type TenantConfig = {
  key: string;
  name: string;
  locales: Record<string, LocaleDefinition>;
  brands: Record<string, BrandDefinition>;
};

export type SiteContext = {
  tenantKey: string;
  brandKey: string;
  siteKey: string;
  localeKey: string;
};

export type ActiveSiteConfig = {
  context: SiteContext;
  tenant: {
    key: string;
    name: string;
  };
  brand: BrandProfile;
  site: SiteDefinition;
  locale: LocaleDefinition;
};
