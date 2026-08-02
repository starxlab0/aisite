import type { SiteDefinition } from "@/lib/site/types";

export const xiaoBrandJpStore: SiteDefinition = {
  siteId: "brand-jp",
  navigation: {
    header: [
      { href: "/shop", label: "Shop" },
      { href: "/collection/first-time", label: "Start Here" },
      { href: "/guides", label: "Guides" },
      { href: "/bundles", label: "Bundles" },
      { href: "/faq", label: "Support" },
    ],
    footer: [
      { href: "/privacy", label: "Privacy" },
      { href: "/shipping", label: "Shipping" },
      { href: "/returns", label: "Returns" },
      { href: "/contact", label: "Contact" },
    ],
  },
  commerce: {
    defaultCollectionSlug: "first-time",
    supportEmail: "support-jp@example.com",
    marketCode: "jp",
  },
  theme: {
    accent: "bg-rose-700",
    accentForeground: "text-white",
    surface: "bg-white",
  },
  features: {
    guides: true,
    bundles: true,
    appControl: false,
    quiz: true,
  },
  merchandising: {
    homeFeaturedProductSlugs: ["haili"],
    homeCollectionCards: [
      {
        href: "/collection/wearable",
        title: "Wearable route",
        summary: "Start from lighter, more discreet, and more everyday-friendly use.",
        locales: {
          zh: {
            title: "可穿戴路线",
            summary: "先从更轻负担、更低调、更适合日常场景的路线开始。",
          },
        },
      },
      {
        href: "/collection/first-time",
        title: "Starter route",
        summary: "Best for a smaller, easier first catalog before expanding into more advanced routes.",
        locales: {
          zh: {
            title: "入门路线",
            summary: "更适合先从更小、更容易判断的商品集开始。",
          },
        },
      },
      {
        href: "/guides",
        title: "Read guides first",
        summary: "If product choice still feels unclear, start from guide articles before browsing more products.",
        locales: {
          zh: {
            title: "先看导购",
            summary: "如果还不确定怎么选，先从 guide 文章进入，再继续看商品。",
          },
        },
      },
    ],
    shopIntro: {
      eyebrow: "Storefront",
      title: "A smaller catalog, organized around wearable and easier first decisions",
      description:
        "This site keeps the initial catalog tighter and leads with wearable and beginner-friendlier routes before expanding further.",
      locales: {
        zh: {
          eyebrow: "正式选购区",
          title: "先从更小、更容易判断的商品集开始",
          description: "这个站点优先围绕 wearable 和更容易做第一次判断的路线组织，不会一开始给出太多选择。",
        },
      },
    },
    shopQuickLinks: [
      { href: "/collection/wearable", label: "Wearable", locales: { zh: { label: "可穿戴" } } },
      { href: "/collection/first-time", label: "Starter route", locales: { zh: { label: "入门路线" } } },
      { href: "/guides", label: "Guides", locales: { zh: { label: "Guides" } } },
    ],
    shopAdviceCards: [
      {
        title: "How to begin",
        copy: "Start from wearable fit and everyday comfort before comparing more complex routes.",
        locales: {
          zh: {
            title: "怎么开始看",
            copy: "先看 wearable 是否适合自己，再决定是否继续比较更复杂的路线。",
          },
        },
      },
      {
        title: "How to narrow down",
        copy: "Use the smaller catalog to compare shape, comfort, and discretion before worrying about bigger feature sets.",
        locales: {
          zh: {
            title: "怎么缩小范围",
            copy: "先在更小的商品集中比较形态、舒适度和低打扰体验，再考虑更复杂的功能。",
          },
        },
      },
      {
        title: "How to decide",
        copy: "If the product route is still unclear, go through the quiz or guides before making a final product decision.",
        locales: {
          zh: {
            title: "怎么做最后决定",
            copy: "如果还不确定具体路线，先通过 quiz 或 guides 再进入具体商品页判断。",
          },
        },
      },
    ],
    collectionOverrides: {
      wearable: {
        heroTitle: "Start from the wearable route",
        heroSummary:
          "This site leads with lighter, more discreet wearable options first so shoppers can make a simpler first decision.",
        sections: [
          {
            key: "jp-wearable-1",
            title: "Why this route comes first",
            content:
              "For this site, wearable fit and lower-friction everyday use matter more than presenting a large catalog up front.",
            locales: {
              zh: {
                title: "为什么先看这条路线",
                content: "这个站点优先展示 wearable 和更低负担的日常使用路线，而不是一开始就铺开完整目录。",
              },
            },
          },
        ],
        internalLinks: ["/guides", "/quiz", "/collection/first-time"],
        featuredProductSlugs: ["haili"],
        ctaLinks: [
          { href: "/guides", label: "Read guides first", locales: { zh: { label: "先看导购" } } },
          { href: "/quiz?src=collection-wearable", label: "Take the quiz", locales: { zh: { label: "先做问答" } } },
        ],
      },
      "first-time": {
        heroTitle: "A smaller starter route",
        heroSummary:
          "This collection keeps the first decision simpler by focusing on easier, lower-friction choices before expanding further.",
        internalLinks: ["/guides", "/collection/wearable", "/faq"],
        featuredProductSlugs: ["haili"],
        ctaLinks: [
          { href: "/guides", label: "Browse guides", locales: { zh: { label: "浏览 Guides" } } },
          { href: "/quiz?src=collection-first-time", label: "Take the quiz", locales: { zh: { label: "先做问答" } } },
        ],
      },
    },
  },
};
