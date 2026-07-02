type SiteNavItem = {
  label: string;
  href: string;
};

type SiteFooterLink = {
  label: string;
  href: string;
};

type SiteDefinition = {
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
};

type TenantConfig = {
  key: string;
  name: string;
  locales: Record<
    string,
    {
      key: string;
      label: string;
      lang: string;
      currency: string;
      markets: string[];
    }
  >;
  brands: Record<
    string,
    {
      key: string;
      profile: {
        key: string;
        name: string;
        tagline: string;
        description: string;
        defaultLocale: string;
      };
      sites: Record<string, SiteDefinition>;
    }
  >;
};

type SiteContext = {
  tenantKey: string;
  brandKey: string;
  siteKey: string;
  localeKey: string;
};

type ActiveSiteConfig = {
  context: SiteContext;
  tenant: {
    key: string;
    name: string;
  };
  brand: TenantConfig["brands"][string]["profile"];
  site: SiteDefinition;
  locale: TenantConfig["locales"][string];
};

const tenantConfig: TenantConfig = {
  key: "xiao",
  name: "Xiao Commerce Lab",
  locales: {
    en: {
      key: "en",
      label: "English",
      lang: "en",
      currency: "USD",
      markets: ["us", "global"],
    },
    zh: {
      key: "zh",
      label: "简体中文",
      lang: "zh-CN",
      currency: "CNY",
      markets: ["cn"],
    },
  },
  brands: {
    brand: {
      key: "brand",
      profile: {
        key: "brand",
        name: "Brand Store",
        tagline: "AI-native intimacy storefront",
        description:
          "AI-native storefront skeleton for intelligent intimacy products and long-distance play.",
        defaultLocale: "en",
      },
      sites: {
        "cn-store": {
          siteId: "brand-cn",
          navigation: {
            header: [
              { href: "/shop", label: "Shop" },
              { href: "/collection/first-time", label: "By Need" },
              { href: "/app-control", label: "App Control" },
              { href: "/bundles", label: "Bundles" },
              { href: "/guides", label: "Guides" },
              { href: "/faq", label: "Support" },
            ],
            footer: [
              { href: "/privacy", label: "Privacy" },
              { href: "/shipping", label: "Shipping" },
              { href: "/returns", label: "Returns" },
            ],
          },
          commerce: {
            defaultCollectionSlug: "first-time",
            supportEmail: "support@example.com",
            marketCode: "cn",
          },
          theme: {
            accent: "bg-zinc-900",
            accentForeground: "text-white",
            surface: "bg-white",
          },
          features: {
            guides: true,
            bundles: true,
            appControl: true,
            quiz: true,
          },
        },
      },
    },
  },
};

const defaultContext: SiteContext = {
  tenantKey: "xiao",
  brandKey: "brand",
  siteKey: "cn-store",
  localeKey: "en",
};

function resolveSiteConfig(context: SiteContext): ActiveSiteConfig {
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
  return defaultContext;
}

export function getActiveSiteConfig() {
  return resolveSiteConfig(defaultContext);
}
