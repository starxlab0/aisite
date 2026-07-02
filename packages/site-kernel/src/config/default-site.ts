import type { SiteContext, TenantDefinition } from "../types";

export const defaultSiteContext: SiteContext = {
  tenantKey: "xiao",
  brandKey: "brand",
  siteKey: "cn-store",
  localeKey: "en",
};

export const defaultTenantConfig: TenantDefinition = {
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
