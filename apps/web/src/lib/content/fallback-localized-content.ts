import type { ResolvedFaqContent } from "@/lib/content/resolvers/faq";
import type { GuideArticle } from "@/types/guide";
import type { ProductContent } from "@/types/product";

export const fallbackProductContentBySlug: Record<string, ProductContent> = {
  "kokocang-x": {
    productSlug: "kokocang-x",
    siteKeys: ["cn-store", "us-store"],
    title: "口口舱X",
    subtitle: "入门友好、隐私克制、可 App 控制",
    shortDescription:
      "适合第一次购买者的外部刺激产品，优先把隐私、连接稳定性和上手门槛讲清楚，帮助你先判断值不值得买。",
    hero: {
      eyebrow: "First-time friendly",
      headline: "先把购买前真正会犹豫的问题讲清楚",
      description:
        "如果你更在意隐私包装、连接顺不顺、第一次会不会太难上手，这页会先解决这些问题，再进入功能差异和参数。",
      media: [],
    },
    keyBenefits: [
      "适合第一次购买时先缩小范围，而不是一开始就被复杂参数拖住",
      "更强调隐私、安静感受和收纳友好，而不只是一味讲强度",
      "支持 App Control，适合想要更细节节奏控制或情侣互动的人",
    ],
    whoItsFor: [
      "第一次购买，希望先从更容易理解的路线开始的人",
      "在意隐私包装、收纳方式和使用门槛的人",
      "想要 App Control，但又不想先碰太复杂进阶玩法的人",
    ],
    whyItFeelsDifferent: [
      "页面会先解释为什么值得买，而不只是堆刺激参数",
      "对隐私、清洁、连接稳定性这些真实购买前顾虑交代得更前置",
      "更适合作为第一次从 guide / FAQ 走进商品页后的判断入口",
    ],
    careInstructions: ["使用前后分开清洁并彻底晾干", "独立收纳，避免与尖锐物品长期挤压放置"],
    whatsInBox: ["主机", "充电线", "基础使用说明"],
    seo: {
      title: "口口舱X｜第一次购买更容易判断的 App 控制产品",
      description: "适合第一次购买时从隐私、连接和上手门槛开始判断，再决定是否进入下单。",
    },
    locales: {
      en: {
        title: "Kokocang X",
        subtitle: "Beginner-friendly, discreet, and app-enabled",
        shortDescription:
          "An external stim toy designed for first-time buyers who want clear guidance on privacy, setup, and ease of use before comparing deeper specs.",
        hero: {
          eyebrow: "First-time friendly",
          headline: "Answer the real purchase questions before diving into specs",
          description:
            "If you care most about discreet delivery, stable pairing, and whether it feels easy enough for a first purchase, this page is built to help you decide faster.",
        },
        keyBenefits: [
          "Made for narrowing down quickly instead of overwhelming first-time buyers with feature overload",
          "Frames privacy, quiet use, and storage comfort before intensity claims",
          "App Control gives you finer pacing and pattern control without forcing an overly advanced setup",
        ],
        whoItsFor: [
          "First-time buyers who want a clearer path before comparing multiple products",
          "People who care about discreet packaging, storage, and a lower learning curve",
          "Shoppers who want App Control without jumping straight into a more advanced route",
        ],
        whyItFeelsDifferent: [
          "It explains why the purchase makes sense before stacking technical claims",
          "It surfaces privacy, cleaning, and pairing concerns earlier in the decision flow",
          "It works well as the next step after reading a guide or FAQ and narrowing the route",
        ],
        careInstructions: [
          "Clean before and after use, then dry thoroughly before storing",
          "Store it separately and avoid long-term pressure from sharp or heavy objects",
        ],
        whatsInBox: ["Main device", "Charging cable", "Quick-start guide"],
        seo: {
          title: "Kokocang X | A clearer first-purchase path with app control",
          description:
            "A beginner-friendly product page that helps you judge privacy, pairing, and ease of use before deciding to buy.",
        },
      },
      zh: {
        seo: {
          title: "口口舱X｜第一次购买更容易判断的 App 控制产品",
          description: "适合第一次购买时从隐私、连接和上手门槛开始判断，再决定是否进入下单。",
        },
      },
    },
  },
  haili: {
    productSlug: "haili",
    siteKeys: ["cn-store", "us-store", "jp-store"],
    title: "海狸",
    subtitle: "可穿戴、低打扰、适合异地与日常移动场景",
    shortDescription:
      "更适合先从 wearable 路线判断的人，重点解释佩戴感、安静度、App 控制和收纳便利性，而不是只看参数。",
    hero: {
      eyebrow: "Wearable route",
      headline: "先确认它是否真的适合“穿戴”这件事",
      description:
        "如果你在意是否够轻、是否更低调、是否适合异地或日常移动场景，这页会先回答这些问题，再去谈更细的差异。",
      media: [],
    },
    keyBenefits: [
      "适合把 wearable 作为优先条件来缩小范围",
      "更强调轻负担、低调和移动场景中的舒适度",
      "支持 App Control，适合情侣互动或远程节奏控制",
    ],
    whoItsFor: [
      "想先看 wearable 路线而不是传统手持路线的人",
      "在意安静、隐私和可穿戴舒适度的人",
      "异地互动、情侣使用或想减少手持负担的人",
    ],
    whyItFeelsDifferent: [
      "它的判断重点不只是强度，而是是否适合真正长期佩戴",
      "更适合从场景和舒适度切入，而不是只比参数表",
      "对 App 控制和移动场景的价值更直观",
    ],
    careInstructions: ["佩戴前后保持清洁和干燥", "穿戴使用后单独收纳，避免长期挤压变形"],
    whatsInBox: ["主机", "充电线", "基础说明"],
    seo: {
      title: "海狸｜从 wearable 体验出发做第一次判断",
      description: "适合先确认穿戴舒适度、隐私和远程控制价值，再决定是否下单。",
    },
    locales: {
      en: {
        title: "Haili",
        subtitle: "Wearable, discreet, and built for long-distance or on-the-go use",
        shortDescription:
          "A wearable-first route for shoppers who care more about comfort, quiet use, and app-based interaction than raw feature density.",
        hero: {
          eyebrow: "Wearable route",
          headline: "Decide whether wearable use is truly the right path first",
          description:
            "If you care about lightness, discretion, and whether it works well for long-distance or everyday movement, this page helps you judge that before going deeper into specs.",
        },
        keyBenefits: [
          "Best for narrowing down by wearable use before comparing traditional handheld formats",
          "Frames comfort, discretion, and everyday ease before intensity claims",
          "App Control makes it easier to use for partner interaction or remote pacing",
        ],
        whoItsFor: [
          "Shoppers who want to start from the wearable route rather than a standard handheld route",
          "People who care about quiet use, privacy, and wearing comfort",
          "Couples, long-distance users, or anyone who wants less hand-held effort",
        ],
        whyItFeelsDifferent: [
          "The real decision point is whether wearable use fits your life, not just whether the feature list looks exciting",
          "It makes more sense to compare it by scenario and comfort than by a raw spec sheet",
          "Its value in app-based and on-the-go use is easier to understand earlier in the funnel",
        ],
        careInstructions: [
          "Clean and dry it thoroughly before and after wearable use",
          "Store it separately after use to avoid long-term compression or shape distortion",
        ],
        whatsInBox: ["Main device", "Charging cable", "Basic guide"],
        seo: {
          title: "Haili | Start by judging wearable comfort and control",
          description:
            "A wearable-first product page focused on comfort, discretion, and remote-control value before purchase.",
        },
      },
      zh: {
        seo: {
          title: "海狸｜从 wearable 体验出发做第一次判断",
          description: "适合先确认穿戴舒适度、隐私和远程控制价值，再决定是否下单。",
        },
      },
    },
  },
  handou: {
    productSlug: "handou",
    siteKeys: ["us-store"],
    title: "含豆",
    subtitle: "双重刺激路线，更适合想直接比较反馈强度的人",
    shortDescription:
      "适合已经明确想看 dual stimulation 路线的人，重点解释组合刺激、连接方式和进阶购买判断，而不是再回到入门问题。",
    hero: {
      eyebrow: "Dual route",
      headline: "当你已经想看更完整刺激组合时，从这里开始比较",
      description:
        "如果你不是在找最保守的入门款，而是想知道双重刺激路线值不值得，这页会先把判断重点放在体验结构和控制方式上。",
      media: [],
    },
    keyBenefits: [
      "更适合已经明确在比较 dual stimulation 路线的人",
      "可以把插入与外部反馈放在同一个判断框架里看",
      "支持 App Control，便于比较节奏控制和更进阶玩法",
    ],
    whoItsFor: [
      "已经知道自己不只看入门款的人",
      "想比较更完整刺激组合和更强反馈的人",
      "更愿意花时间比较控制方式、节奏和路线差异的人",
    ],
    whyItFeelsDifferent: [
      "更强调组合刺激结构，而不是单一刺激点",
      "适合从体验目标切入，而不是只问“够不够强”",
      "对双重刺激和控制方式的判断更集中",
    ],
    careInstructions: ["使用后分区清洁并保持干燥", "若经常使用 App 控制，先确认电量与连接状态再收纳"],
    whatsInBox: ["主机", "充电线", "基础说明"],
    seo: {
      title: "含豆｜双重刺激路线的集中判断页",
      description: "适合比较 dual stimulation、控制方式和更完整反馈，再决定是否下单。",
    },
    locales: {
      en: {
        title: "Handou",
        subtitle: "A dual-stimulation route for shoppers comparing fuller feedback",
        shortDescription:
          "Built for shoppers who already know they want to compare dual-stimulation options and need clearer guidance on control style, pairing, and overall route fit.",
        hero: {
          eyebrow: "Dual route",
          headline: "Start here when you already know you want a fuller stimulation route",
          description:
            "If you are no longer looking for the most conservative beginner path, this page helps you judge whether a dual-stimulation route is worth the extra complexity.",
        },
        keyBenefits: [
          "Best for people already comparing dual-stimulation options rather than first-step basics",
          "Lets you judge internal and external feedback as one combined route",
          "App Control makes it easier to compare pacing, modes, and a more advanced interaction style",
        ],
        whoItsFor: [
          "Shoppers who already know they want more than a simple beginner route",
          "People comparing fuller stimulation and stronger combined feedback",
          "Anyone willing to spend more time judging control style, rhythm, and route fit",
        ],
        whyItFeelsDifferent: [
          "It centers combined stimulation rather than one isolated sensation type",
          "It is easier to judge by experience goal than by asking only whether it feels stronger",
          "It makes dual-route tradeoffs and control style easier to compare in one place",
        ],
        careInstructions: [
          "Clean each contact area carefully after use and dry fully before storing",
          "If you use app control often, confirm battery and pairing state before putting it away",
        ],
        whatsInBox: ["Main device", "Charging cable", "Basic guide"],
        seo: {
          title: "Handou | A clearer decision page for dual stimulation",
          description:
            "A route-focused product page for comparing dual stimulation, control style, and fuller feedback before buying.",
        },
      },
      zh: {
        seo: {
          title: "含豆｜双重刺激路线的集中判断页",
          description: "适合比较 dual stimulation、控制方式和更完整反馈，再决定是否下单。",
        },
      },
    },
  },
};

export const fallbackGuideBySlug: Record<string, GuideArticle> = {
  "how-to-choose": {
    slug: "how-to-choose",
    siteKeys: ["cn-store", "us-store"],
    title: "第一次买怎么选",
    excerpt: "从场景、隐私、连接与清洁四个维度，帮助第一次购买者缩小范围。",
    category: "buying-guide",
    body: [
      "先不要急着背参数。第一次购买时，更有效的顺序通常是先确认使用场景，再确认自己最在意的顾虑，比如隐私、连接稳定性和是否容易上手。",
      "如果你还没想清楚自己更在意什么，先从 collection 或 quiz 进入，比直接在商品页之间来回跳更容易做决定。",
      "当范围已经缩小到 1 到 2 个商品后，再回到商品页看 FAQ、价格、配送和连接说明，最后一步的犹豫会少很多。",
    ],
    relatedProductSlugs: ["kokocang-x"],
    relatedCollectionSlugs: ["first-time"],
    seo: {
      title: "第一次买怎么选｜先按场景和顾虑缩小范围",
      description: "给第一次购买者的导购入口：先按场景缩小范围，再进入 collection、product 和 FAQ 做最后判断。",
    },
    locales: {
      en: {
        title: "How to Choose Your First Toy",
        excerpt:
          "A practical path for first-time buyers: start with scenario, privacy, pairing, and cleaning concerns before comparing products.",
        body: [
          "Don’t start by memorizing specs. For a first purchase, it is usually more effective to identify your scenario first and then narrow down the concerns that matter most, such as privacy, pairing stability, and ease of use.",
          "If you are still unsure what matters most to you, start from a collection or the quiz instead of bouncing between product pages too early.",
          "Once you have narrowed the choice to one or two products, return to the product page and compare FAQ, pricing, shipping, and pairing details. That usually removes the last layer of hesitation.",
        ],
        seo: {
          title: "How to Choose Your First Toy | Narrow down by scenario first",
          description:
            "A buying guide for first-time shoppers: start with scenario and common concerns, then move into collection, product, and FAQ pages.",
        },
      },
      zh: {
        seo: {
          title: "第一次买怎么选｜先按场景和顾虑缩小范围",
          description: "给第一次购买者的导购入口：先按场景缩小范围，再进入 collection、product 和 FAQ 做最后判断。",
        },
      },
    },
  },
  "wearable-or-not": {
    slug: "wearable-or-not",
    siteKeys: ["us-store", "jp-store"],
    title: "要不要先看 wearable 路线",
    excerpt: "如果你在手持、可穿戴和异地互动之间犹豫，这篇会先帮你判断 wearable 到底是不是正确方向。",
    category: "buying-guide",
    body: [
      "wearable 不是“看起来更新奇”就一定更适合你。真正该先判断的是你是不是需要更轻负担、更低调，或者更适合异地和移动场景的体验。",
      "如果你本质上想要的是更直接、更强反馈的路线，wearable 未必是最先看的方向。反过来，如果你更在意轻便、安静和穿戴舒适度，那么 wearable 往往更值得先缩小范围。",
      "先把这一步判断清楚，再回到商品页比较佩戴感、隐私、连接和 FAQ，会比直接比参数省时间得多。",
    ],
    relatedProductSlugs: ["haili"],
    relatedCollectionSlugs: ["wearable"],
    seo: {
      title: "要不要先看 wearable 路线｜先判断场景再看产品",
      description: "先判断 wearable 是否适合你的使用场景，再进入商品页比较舒适度、连接与隐私信息。",
    },
    locales: {
      en: {
        title: "Should You Start with a Wearable Route?",
        excerpt:
          "A guide for shoppers deciding between handheld, wearable, and long-distance routes before comparing products.",
        body: [
          "A wearable route is not automatically better just because it looks newer or more flexible. The real question is whether you want something lighter, more discreet, or better suited to long-distance and everyday movement.",
          "If what you truly want is more direct and more intense feedback, wearable may not be the first direction to compare. But if comfort, quiet use, and wearing ease matter more, wearable often deserves to be your first filter.",
          "Make that decision first, then return to product pages to compare comfort, privacy, pairing, and FAQ details. It usually saves far more time than jumping into specs too early.",
        ],
        seo: {
          title: "Should You Start with a Wearable Route? | Decide by scenario first",
          description:
            "A guide to help shoppers decide whether wearable use fits their scenario before comparing comfort, privacy, and pairing details.",
        },
      },
    },
  },
  "app-control-for-beginners": {
    slug: "app-control-for-beginners",
    siteKeys: ["us-store"],
    title: "第一次买，要不要直接选 App Control",
    excerpt: "如果你担心 App Control 会不会太复杂，这篇会先判断它到底是降低门槛，还是增加门槛。",
    category: "buying-guide",
    body: [
      "App Control 并不一定代表更复杂。对一部分人来说，它反而意味着节奏更细、控制更直观，或者更适合情侣互动和异地场景。",
      "真正要先确认的是：你是否介意配对步骤、权限设置和连接稳定性。如果这些会让你明显犹豫，那就应该优先看页面有没有把这类信息解释清楚。",
      "如果你能接受这些前置步骤，App Control 往往不是负担，而是帮助你更精细判断体验差异的一种方式。",
    ],
    relatedProductSlugs: ["kokocang-x", "handou"],
    relatedCollectionSlugs: ["app-controlled"],
    seo: {
      title: "第一次买，要不要直接选 App Control｜先判断复杂度再看功能",
      description: "帮助第一次购买者判断 App Control 是降低门槛还是增加门槛，再进入商品页做最后比较。",
    },
    locales: {
      en: {
        title: "Should a First-Time Buyer Choose App Control?",
        excerpt:
          "A guide for first-time shoppers deciding whether app control lowers friction or adds too much complexity.",
        body: [
          "App control does not always mean a more complicated route. For some shoppers, it actually means clearer pacing, finer control, or a better fit for partner use and long-distance interaction.",
          "The first thing to judge is whether pairing steps, permissions, and connection stability feel like a real source of hesitation. If they do, the product page should explain those concerns clearly before you buy.",
          "If you can accept those setup steps, app control is often not extra friction at all. It can be the feature that makes experience differences easier to understand and compare.",
        ],
        seo: {
          title: "Should a First-Time Buyer Choose App Control? | Judge setup friction first",
          description:
            "A guide to help first-time shoppers decide whether app control is a helpful feature or an unnecessary source of hesitation.",
        },
      },
    },
  },
};

export const fallbackFaqContent: ResolvedFaqContent = {
  source: "fallback",
  groups: [
    {
      source: "control-plane-draft",
      title: "FAQ: kokocang-x",
      siteKeys: ["cn-store", "us-store"],
      contentRef: "fallback:faq:kokocang-x",
      targetPath: "/product/kokocang-x",
      items: [
        {
          id: "fallback-kokocang-x-1",
          question: "这款更适合第一次购买的人吗？",
          answer: "如果你更希望先从隐私、连接和上手门槛开始判断，而不是直接追求复杂功能，这款更适合作为第一次缩小范围的候选。",
          category: "product",
          locales: {
            en: {
              question: "Is this a good fit for a first purchase?",
              answer:
                "Yes, especially if you want to start by judging privacy, pairing, and ease of use instead of jumping straight into more complex features.",
            },
          },
        },
        {
          id: "fallback-kokocang-x-2",
          question: "连接 App 会不会很麻烦？",
          answer: "如果你之前没接触过这类产品，最重要的是确认权限、蓝牙和配对顺序。这类页面更适合把连接顾虑提前解释清楚，再决定是否下单。",
          category: "app-control",
          locales: {
            en: {
              question: "Is app pairing complicated?",
              answer:
                "It shouldn’t be difficult, but first-time buyers usually care most about Bluetooth permissions, pairing order, and whether troubleshooting is clearly explained before they buy.",
            },
          },
        },
        {
          id: "fallback-kokocang-x-3",
          question: "如果我更在意隐私和收纳，购买前应该看什么？",
          answer: "优先确认包装是否低调、使用后是否容易清洁和收纳，以及页面有没有把这些信息放在购买路径前面，而不是只讲功能点。",
          category: "privacy",
          locales: {
            en: {
              question: "What should I check first if I care about privacy and storage?",
              answer:
                "Look at discreet packaging, how easy it is to clean and store after use, and whether those concerns are explained before the feature list takes over.",
            },
          },
        },
      ],
    },
    {
      source: "control-plane-draft",
      title: "FAQ: how-to-choose",
      siteKeys: ["cn-store", "us-store"],
      contentRef: "fallback:faq:how-to-choose",
      targetPath: "/guides/how-to-choose",
      items: [
        {
          id: "fallback-guide-1",
          question: "第一次买时，应该先看参数还是先看场景？",
          answer: "更推荐先看场景。先知道自己更在意隐私、连接、安静感受还是上手门槛，再去看参数，判断会快很多。",
          category: "selection",
          locales: {
            en: {
              question: "For a first purchase, should I compare specs first or start with scenario?",
              answer:
                "Start with scenario. Once you know whether privacy, pairing, quiet use, or ease of use matters most, comparing specs becomes much easier.",
            },
          },
        },
      ],
    },
    {
      source: "control-plane-draft",
      title: "FAQ: haili",
      siteKeys: ["cn-store", "us-store", "jp-store"],
      contentRef: "fallback:faq:haili",
      targetPath: "/product/haili",
      items: [
        {
          id: "fallback-haili-1",
          question: "wearable 路线更适合什么样的人？",
          answer: "如果你更在意轻负担、低调、安静和移动场景中的灵活性，wearable 往往比传统手持路线更值得先看。",
          category: "wearable",
          locales: {
            en: {
              question: "Who is a wearable route best for?",
              answer:
                "It is often a better first route for shoppers who care more about lightness, discretion, quiet use, and flexibility during movement than raw intensity.",
            },
          },
        },
        {
          id: "fallback-haili-2",
          question: "买 wearable 前最应该确认什么？",
          answer: "优先看穿戴舒适度、隐私性、收纳方式和连接稳定性，而不是只看功能表里写了多少模式。",
          category: "selection",
          locales: {
            en: {
              question: "What matters most before buying a wearable product?",
              answer:
                "Comfort, discretion, storage, and pairing stability matter more than a long feature list when you are deciding whether wearable use truly fits.",
            },
          },
        },
      ],
    },
    {
      source: "control-plane-draft",
      title: "FAQ: handou",
      siteKeys: ["us-store"],
      contentRef: "fallback:faq:handou",
      targetPath: "/product/handou",
      items: [
        {
          id: "fallback-handou-1",
          question: "双重刺激路线更适合什么时候开始看？",
          answer: "当你已经明确自己不是在看最保守的入门款，而是开始比较更完整的刺激组合时，再看 dual 路线会更有效。",
          category: "dual",
          locales: {
            en: {
              question: "When does it make sense to start comparing dual-stimulation products?",
              answer:
                "Once you know you are no longer looking for the most conservative beginner route and want to compare fuller stimulation combinations instead.",
            },
          },
        },
        {
          id: "fallback-handou-2",
          question: "买这类产品时，应该先看强度还是先看控制方式？",
          answer: "更推荐先看控制方式和体验目标。只有先知道自己想要怎样的节奏和组合反馈，强度比较才有意义。",
          category: "control",
          locales: {
            en: {
              question: "Should I compare intensity first or control style first?",
              answer:
                "Control style and experience goal usually matter first. Intensity only becomes meaningful once you know what kind of pacing and combined feedback you want.",
            },
          },
        },
      ],
    },
    {
      source: "control-plane-draft",
      title: "FAQ: wearable-or-not",
      siteKeys: ["us-store", "jp-store"],
      contentRef: "fallback:faq:wearable-or-not",
      targetPath: "/guides/wearable-or-not",
      items: [
        {
          id: "fallback-guide-wearable-1",
          question: "如果我主要在家使用，还需要先看 wearable 吗？",
          answer: "不一定。如果你更在意直接反馈而不是穿戴舒适度，wearable 未必是第一优先路线。",
          category: "guide",
          locales: {
            en: {
              question: "If I mainly use it at home, do I still need to start with a wearable route?",
              answer:
                "Not always. If direct feedback matters more to you than wearing comfort, wearable may not be your first route to compare.",
            },
          },
        },
      ],
    },
    {
      source: "control-plane-draft",
      title: "FAQ: app-control-for-beginners",
      siteKeys: ["us-store"],
      contentRef: "fallback:faq:app-control-for-beginners",
      targetPath: "/guides/app-control-for-beginners",
      items: [
        {
          id: "fallback-guide-app-1",
          question: "App Control 会不会让第一次购买更复杂？",
          answer: "不一定。关键不在于有没有 App，而在于页面是否把配对、权限和连接稳定性讲清楚。",
          category: "guide",
          locales: {
            en: {
              question: "Does app control make a first purchase more complicated?",
              answer:
                "Not necessarily. The real issue is whether the page explains pairing, permissions, and connection stability clearly enough before purchase.",
            },
          },
        },
      ],
    },
  ],
};
