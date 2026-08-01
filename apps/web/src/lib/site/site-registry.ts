import { xiaoBrandCnStore } from "@/lib/site/sites/xiao-brand-cn-store";
import { xiaoBrandJpStore } from "@/lib/site/sites/xiao-brand-jp-store";
import { xiaoBrandUsStore } from "@/lib/site/sites/xiao-brand-us-store";
import type { TenantConfig } from "@/lib/site/types";

export const tenantRegistry: Record<string, TenantConfig> = {
  xiao: {
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
          "cn-store": xiaoBrandCnStore,
          "jp-store": xiaoBrandJpStore,
          "us-store": xiaoBrandUsStore,
        },
      },
    },
  },
};
