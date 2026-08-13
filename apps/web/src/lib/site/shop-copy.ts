import type { SupportedLocaleKey } from "@/lib/site/locale-routing";

export type ShopPageCopy = {
  primaryCta: string;
  secondaryCta: string;
  routesEyebrow: string;
  routesTitle: string;
  routesDescription: string;
  aiHandoffEyebrow: string;
  aiHandoffDescription: string;
  routeCardCta: string;
  inventoryTitle: string;
  inventoryDescription: string;
  inventoryStats: {
    available: string;
    wearable: string;
    appControl: string;
    beginnerFriendly: string;
  };
  quickLinksTitle: string;
  allProductsTitle: string;
};

export function getShopPageCopy(localeKey: SupportedLocaleKey): ShopPageCopy {
  if (localeKey === "en") {
    return {
      primaryCta: "Take the quiz first",
      secondaryCta: "View shipping info",
      routesEyebrow: "Browse by route",
      routesTitle: "Start from the route that reduces hesitation fastest",
      routesDescription:
        "If you already know the scenario or feature you care about most, jump into a route first instead of comparing every product from zero.",
      aiHandoffEyebrow: "Still not sure?",
      aiHandoffDescription:
        "If the route cards still feel too broad, use AI Concierge as the fallback. Answer a few quick questions first, then come back with a narrower shortlist.",
      routeCardCta: "View this route →",
      inventoryTitle: "Live inventory snapshot",
      inventoryDescription:
        "See how many products are currently available, wearable, app-enabled, and more beginner-friendly before diving deeper.",
      inventoryStats: {
        available: "Available to order",
        wearable: "Wearable",
        appControl: "App-enabled",
        beginnerFriendly: "Beginner friendly",
      },
      quickLinksTitle: "Quick links",
      allProductsTitle: "All products",
    };
  }

  return {
    primaryCta: "先做选购问答",
    secondaryCta: "查看配送说明",
    routesEyebrow: "按路线进入",
    routesTitle: "先走最能减少犹豫的选购路线",
    routesDescription: "如果你已经知道自己更在意的场景或功能，先进入对应路线，会比从全部商品里逐个比较更快。",
    aiHandoffEyebrow: "还没想清楚？",
    aiHandoffDescription: "如果看完这些路线还是拿不准，就把场景、顾虑和偏好交给 AI 导购。它更适合作为兜底入口，先帮你缩小范围，再回来继续看商品。",
    routeCardCta: "去看这条路线 →",
    inventoryTitle: "当前可售概览",
    inventoryDescription: "先快速看清可下单、可穿戴、支持 App 和更适合新手的商品数量，再决定往下怎么筛选。",
    inventoryStats: {
      available: "可下单商品",
      wearable: "可穿戴",
      appControl: "支持 App",
      beginnerFriendly: "新手友好",
    },
    quickLinksTitle: "快捷入口",
    allProductsTitle: "全部商品",
  };
}
