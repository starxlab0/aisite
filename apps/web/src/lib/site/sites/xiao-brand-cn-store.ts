import type { SiteDefinition } from "@/lib/site/types";

export const xiaoBrandCnStore: SiteDefinition = {
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
  merchandising: {
    homeFeaturedProductSlugs: ["kokocang-x", "haili"],
    homeCollectionCards: [
      {
        href: "/collection/first-time",
        title: "第一次先看这些",
        summary: "先从更容易理解、更低决策负担的路线开始。",
        locales: {
          en: {
            title: "Start with first-time picks",
            summary: "A lower-friction route for shoppers who want easier first decisions.",
          },
        },
      },
      {
        href: "/collection/app-control",
        title: "先比较 App 控制",
        summary: "如果你在意远程互动和节奏控制，先从这条路线进入。",
        locales: {
          en: {
            title: "Compare App Control first",
            summary: "Best for shoppers who care about remote interaction and finer pacing.",
          },
        },
      },
      {
        href: "/collection/wearable",
        title: "可穿戴路线",
        summary: "更适合在意低打扰、灵活和日常移动场景的人。",
        locales: {
          en: {
            title: "Wearable route",
            summary: "Best for lighter, more discreet, and more mobile use scenarios.",
          },
        },
      },
    ],
    shopIntro: {
      eyebrow: "正式选购区",
      title: "先从更容易下决定的路线开始看",
      description: "这个站点优先帮助第一次购买和需要 App 控制的人缩小范围，再进入商品详情页完成加购和结账。",
      locales: {
        en: {
          eyebrow: "Storefront",
          title: "Start from the easier-to-decide routes",
          description:
            "This site is organized first for first-time shoppers and app-control comparisons, then moves people into product detail and checkout.",
        },
      },
    },
    shopQuickLinks: [
      { href: "/collection/first-time", label: "适合第一次选", locales: { en: { label: "First-time picks" } } },
      { href: "/collection/app-control", label: "支持 App 控制", locales: { en: { label: "App-controlled" } } },
      { href: "/collection/wearable", label: "可穿戴", locales: { en: { label: "Wearable" } } },
    ],
    shopAdviceCards: [
      {
        title: "怎么开始看",
        copy: "先看新手友好度、是否支持 App、以及是否需要更安静或更低调的体验。",
        locales: {
          en: {
            title: "How to start",
            copy: "Start with beginner fit, app control, and whether you need a quieter or more discreet route.",
          },
        },
      },
      {
        title: "怎么下单",
        copy: "进入商品页确认规格、FAQ 和库存后，再加入购物车并完成结账。",
        locales: {
          en: {
            title: "How to order",
            copy: "Confirm specs, FAQ, and stock from the product page before adding to cart and checking out.",
          },
        },
      },
      {
        title: "怎么买得更放心",
        copy: "如果还没决定，先看配送、退换和 FAQ，再决定是否继续下单。",
        locales: {
          en: {
            title: "How to buy with confidence",
            copy: "If you are still unsure, review shipping, returns, and FAQ before placing the order.",
          },
        },
      },
    ],
    collectionOverrides: {
      "first-time": {
        heroTitle: "第一次买，先从更容易判断的路线开始",
        heroSummary: "这个合集优先帮助你从新手友好、隐私感、上手门槛和是否支持 App 来缩小范围，而不是一开始就陷进参数比较。",
        sections: [
          {
            key: "cn-first-time-1",
            title: "先看什么",
            content: "先确认你更在意的是新手友好、静音低调，还是希望后续还能继续探索 App 控制路线。",
            locales: {
              en: {
                title: "What to check first",
                content:
                  "Start with beginner fit, discretion, and whether you want to keep the door open for app-based interaction later.",
              },
            },
          },
          {
            key: "cn-first-time-2",
            title: "怎么继续缩小范围",
            content: "当路线变清楚后，再回到商品页看 FAQ、配送、退换和实际购买顾虑。",
            locales: {
              en: {
                title: "How to narrow down",
                content:
                  "Once the route is clearer, move into product pages to compare FAQ, shipping, returns, and real purchase concerns.",
              },
            },
          },
        ],
        internalLinks: ["/quiz", "/guides", "/faq"],
        featuredProductSlugs: ["kokocang-x", "haili"],
        ctaLinks: [
          { href: "/quiz?src=collection-first-time", label: "先做问答", locales: { en: { label: "Take the quiz" } } },
          { href: "/guides", label: "先看导购", locales: { en: { label: "Read guides" } } },
        ],
      },
      "app-control": {
        heroTitle: "先比较 App 控制路线，再决定具体商品",
        heroSummary: "如果你更在意远程互动、节奏控制和情侣场景，这个合集更适合作为第一站，而不是先从随机商品页开始看。",
        internalLinks: ["/app-control", "/quiz", "/bundles?plan=app-control"],
        featuredProductSlugs: ["kokocang-x", "haili"],
        ctaLinks: [
          { href: "/app-control", label: "看 App Control 导购", locales: { en: { label: "Open App Control guide" } } },
          { href: "/quiz?src=collection-app-control", label: "做问答", locales: { en: { label: "Take the quiz" } } },
        ],
      },
    },
  },
};
