import type { SiteDefinition } from "@/lib/site/types";

export const xiaoBrandUsStore: SiteDefinition = {
  siteId: "brand-us",
  navigation: {
    header: [
      { href: "/shop", label: "Shop" },
      { href: "/collection/first-time", label: "Start Here" },
      { href: "/app-control", label: "App Control" },
      { href: "/bundles", label: "Bundles" },
      { href: "/guides", label: "Guides" },
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
    supportEmail: "support-us@example.com",
    marketCode: "us",
  },
  theme: {
    accent: "bg-blue-700",
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
    homeFeaturedProductSlugs: ["handou", "kokocang-x", "haili"],
    homeCollectionCards: [
      {
        href: "/collection/first-time",
        title: "First-time picks",
        summary: "Start from lower-friction products before comparing more advanced routes.",
        locales: {
          zh: {
            title: "第一次先看这些",
            summary: "先从更低门槛的路线开始，再比较更进阶的玩法。",
          },
        },
      },
      {
        href: "/collection/dual-stimulation",
        title: "Dual stimulation",
        summary: "A faster route for shoppers already comparing fuller stimulation and stronger feedback.",
        locales: {
          zh: {
            title: "双重刺激路线",
            summary: "更适合已经明确想比较更完整刺激组合的人。",
          },
        },
      },
      {
        href: "/collection/app-control",
        title: "App-controlled",
        summary: "Best for remote interaction, couples use, and finer-grained pacing.",
        locales: {
          zh: {
            title: "App 控制路线",
            summary: "适合远程互动、情侣使用和更细节节奏控制。",
          },
        },
      },
    ],
    shopIntro: {
      eyebrow: "Storefront",
      title: "Compare route fit before you compare everything else",
      description:
        "This site is organized first around beginner fit, dual-stimulation routes, and app-enabled comparison so shoppers can narrow down faster.",
      locales: {
        zh: {
          eyebrow: "正式选购区",
          title: "先比较路线，再比较具体商品",
          description: "这个站点会优先帮助用户比较新手友好度、双重刺激路线和 App 控制路线，再进入具体商品判断。",
        },
      },
    },
    shopQuickLinks: [
      { href: "/collection/first-time", label: "First-time picks", locales: { zh: { label: "适合第一次选" } } },
      { href: "/collection/dual-stimulation", label: "Dual stimulation", locales: { zh: { label: "双重刺激" } } },
      { href: "/collection/app-control", label: "App-controlled", locales: { zh: { label: "支持 App 控制" } } },
      { href: "/collection/wearable", label: "Wearable", locales: { zh: { label: "可穿戴" } } },
    ],
    shopAdviceCards: [
      {
        title: "How to compare",
        copy: "Start with route fit first: beginner-friendly, dual stimulation, or app-enabled interaction.",
        locales: {
          zh: {
            title: "怎么开始比",
            copy: "先比较路线是否合适：新手友好、双重刺激，还是更偏 App 互动。",
          },
        },
      },
      {
        title: "How to narrow down",
        copy: "Once the route is clearer, compare shape, feedback style, pricing, and learning curve from product pages.",
        locales: {
          zh: {
            title: "怎么继续缩小范围",
            copy: "当路线更清楚后，再回到商品页比较形态、反馈方式、价格和上手门槛。",
          },
        },
      },
      {
        title: "How to decide",
        copy: "Use quiz, FAQ, and product detail together so the purchase decision feels faster and more grounded.",
        locales: {
          zh: {
            title: "怎么更快决定",
            copy: "把问答、FAQ 和商品页一起看，能更快把选择落到具体商品上。",
          },
        },
      },
    ],
    collectionOverrides: {
      "first-time": {
        heroTitle: "Start with the easiest yes",
        heroSummary:
          "This collection is designed for shoppers who want beginner-friendlier picks before comparing more advanced stimulation or control routes.",
        sections: [
          {
            key: "us-first-time-1",
            title: "What this route solves",
            content:
              "It helps reduce first-purchase hesitation by making beginner fit, quietness, and learning curve easier to compare.",
            locales: {
              zh: {
                title: "这条路线解决什么",
                content: "它主要帮助第一次购买的人更快比较新手友好度、静音感受和学习成本。",
              },
            },
          },
          {
            key: "us-first-time-2",
            title: "Where to go next",
            content:
              "Once you narrow down here, move into product pages or the quiz instead of jumping randomly across the catalog.",
            locales: {
              zh: {
                title: "下一步该去哪里",
                content: "先在这里缩小范围，再去商品页或 quiz，而不是在全站商品里随机跳转。",
              },
            },
          },
        ],
        internalLinks: ["/quiz", "/guides", "/shop"],
        featuredProductSlugs: ["kokocang-x", "haili"],
        ctaLinks: [
          { href: "/quiz?src=collection-first-time", label: "Take the quiz", locales: { zh: { label: "先做问答" } } },
          { href: "/shop", label: "Compare all products", locales: { zh: { label: "看全部商品" } } },
        ],
      },
      "dual-stimulation": {
        heroTitle: "Compare fuller stimulation routes in one place",
        heroSummary:
          "This collection is for shoppers who already know they want stronger combined feedback and need a faster way to compare route fit.",
        internalLinks: ["/bundles?plan=dual", "/quiz", "/guides"],
        featuredProductSlugs: ["handou"],
        ctaLinks: [
          { href: "/bundles?plan=dual", label: "Open bundle route", locales: { zh: { label: "看 bundle 路线" } } },
          { href: "/quiz?src=collection-dual", label: "Retake quiz", locales: { zh: { label: "重新做问答" } } },
        ],
      },
      "app-control": {
        heroTitle: "App-enabled comparison starts here",
        heroSummary:
          "A faster route for shoppers comparing remote interaction, couple use, and finer pacing before moving into product pages.",
        internalLinks: ["/app-control", "/bundles?plan=app-control", "/quiz"],
        featuredProductSlugs: ["kokocang-x", "haili", "handou"],
        ctaLinks: [
          { href: "/app-control", label: "Open App Control route", locales: { zh: { label: "看 App Control 路线" } } },
          { href: "/bundles?plan=app-control", label: "Compare bundles", locales: { zh: { label: "比较 bundles" } } },
        ],
      },
    },
  },
};
