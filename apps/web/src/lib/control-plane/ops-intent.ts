export type ResolvedOpsIntent = {
  href: string;
  lane:
    | "product"
    | "content"
    | "page"
    | "publish"
    | "governance"
    | "strategy"
    | "workspace";
  label: string;
  query?: string;
  summary: string;
  impact: string[];
  nextStep: string;
  plan?: {
    kind:
      | "none"
      | "open_entry"
      | "set_site_keys_product"
      | "set_site_keys_content"
    | "toggle_feature"
    | "update_collection_featured_products"
    | "update_collection_cta";
    targetType?: "product" | "guide" | "faq" | "collection" | "feature";
    targetId?: string;
    sites?: string[];
    fields?: Record<string, unknown>;
    affectedPaths: string[];
    risks: string[];
    requires: string[];
  };
};

function extractEntity(prompt: string) {
  const quoted =
    prompt.match(/["'`“”‘’]([^"'`“”‘’]{2,80})["'`“”‘’]/)?.[1] ??
    prompt.match(/\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/i)?.[1] ??
    prompt.match(/\b([a-z][a-z0-9-]{2,30})\b/i)?.[1];
  return quoted?.trim() || "";
}

function extractSiteKeys(prompt: string): string[] | null {
  const normalized = prompt.toLowerCase();
  const keys = new Set<string>();
  const add = (key: string) => keys.add(key);

  if (/(cn|china|中国|中站|cn 站|cn站)/i.test(prompt)) add("cn-store");
  if (/(us|usa|united states|美国|美站|us 站|us站)/i.test(prompt)) add("us-store");
  if (/(jp|japan|日本|日站|jp 站|jp站)/i.test(prompt)) add("jp-store");

  if (normalized.includes("三站") || normalized.includes("全站") || normalized.includes("全部站点")) {
    add("cn-store");
    add("us-store");
    add("jp-store");
  }

  const result = Array.from(keys);
  return result.length ? result : null;
}

function extractFeatureKey(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  if (lower.includes("app-control") || prompt.includes("app control")) return "appControl";
  if (lower.includes("bundles") || prompt.includes("套餐")) return "bundles";
  if (lower.includes("guides") || prompt.includes("导购") || prompt.includes("指南")) return "guides";
  if (lower.includes("quiz") || prompt.includes("问答")) return "quiz";
  return null;
}

function extractCollectionTarget(prompt: string): string | null {
  const direct = prompt.match(/\b([a-z0-9]+(?:-[a-z0-9]+)*)\s+collection\b/i)?.[1];
  if (direct) return direct;
  return null;
}

function extractPromotedProduct(prompt: string): string | null {
  const direct =
    prompt.match(/(?:主推|推荐|主打)\s+([a-z0-9]+(?:-[a-z0-9]+)*)/i)?.[1] ??
    prompt.match(/(?:feature|promote)\s+([a-z0-9]+(?:-[a-z0-9]+)*)/i)?.[1];
  return direct || null;
}

function extractCtaTarget(prompt: string): { href: string; label: string } | null {
  if (/(quiz|问答)/i.test(prompt)) return { href: "/quiz", label: "Start quiz" };
  if (/(guides|导购|指南)/i.test(prompt)) return { href: "/guides", label: "Browse guides" };
  if (/(shop|商店|商品列表)/i.test(prompt)) return { href: "/shop", label: "Browse products" };
  if (/(app-control|app control)/i.test(prompt)) return { href: "/app-control", label: "Explore App Control" };
  return null;
}

function buildOpsSearch(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/ops?${query}` : "/ops";
}

export function resolveOpsIntent(prompt: string): ResolvedOpsIntent {
  const normalized = prompt.trim();
  const lower = normalized.toLowerCase();
  const entity = extractEntity(normalized);
  const siteKeys = extractSiteKeys(normalized);

  if (!normalized) {
    return {
      href: "/ops",
      lane: "workspace",
      label: "工作台首页",
      summary: "还没有识别到明确动作，先回到工作台首页。",
      impact: ["不会直接改动数据", "可从首页继续选择任务入口"],
      nextStep: "回到工作台首页",
      plan: {
        kind: "none",
        affectedPaths: [],
        risks: [],
        requires: [],
      },
    };
  }

  if (
    /(发布|回滚|审核|预览|上线|queue|publish|rollback|review|preview)/i.test(normalized)
  ) {
    return {
      href: "/ops/queue",
      lane: "publish",
      label: "发布中心",
      summary: "识别为发布/审核/回滚相关请求。",
      impact: ["进入发布队列", "优先查看待审核、回滚或阻塞发布项"],
      nextStep: "打开发布中心",
      plan: {
        kind: "open_entry",
        targetType: "feature",
        affectedPaths: ["/ops/queue"],
        risks: [],
        requires: [],
      },
    };
  }

  if (
    /(监控|告警|报警|故障|支持|通知|support|alert|monitor|feedback|audit)/i.test(normalized)
  ) {
    return {
      href: "/ops/monitoring",
      lane: "governance",
      label: "系统治理",
      summary: "识别为监控、告警、支持或审计相关请求。",
      impact: ["进入运行监控", "优先查看告警、支持案例或治理项"],
      nextStep: "打开系统治理",
      plan: {
        kind: "open_entry",
        targetType: "feature",
        affectedPaths: ["/ops/monitoring"],
        risks: [],
        requires: [],
      },
    };
  }

  if (
    /(站点策略|feature|features|app-control|bundles|guides 开关|quiz 开关|导航|站点定位)/i.test(normalized)
  ) {
    const featureKey = extractFeatureKey(normalized);
    return {
      href: "/ops",
      lane: "strategy",
      label: "站点策略",
      summary: "识别为站点策略或 feature 开关相关请求。",
      impact: ["需要进一步确认站点与开关范围", "当前先回到工作台首页统一处理"],
      nextStep: "回到工作台首页，继续进入站点策略",
      plan: featureKey
        ? {
            kind: "toggle_feature",
            targetType: "feature",
            targetId: featureKey,
            sites: siteKeys ?? undefined,
            fields: {
              feature: featureKey,
              op: /(关闭|disable|off)/i.test(normalized) ? "disable" : "enable",
            },
            affectedPaths: [
              featureKey === "guides" ? "/guides" : featureKey === "bundles" ? "/bundles" : featureKey === "quiz" ? "/quiz" : "/app-control",
              "/sitemap.xml",
            ],
            risks: ["需要修改站点配置并重新部署对应站点"],
            requires: ["代码变更（站点配置）", "部署"],
          }
        : {
            kind: "none",
            affectedPaths: [],
            risks: [],
            requires: [],
          },
    };
  }

  if (
    /(faq|guide|文章|内容|正文|文案|collection page|content|站点可见|归属内容)/i.test(normalized)
  ) {
    if (/faq/i.test(lower)) {
      return {
        href: buildOpsSearch({ type: "faq", q: entity || undefined }),
        lane: "content",
        label: "FAQ 内容",
        query: entity || undefined,
        summary: `识别为 FAQ 内容请求${entity ? `，目标可能是 ${entity}` : ""}。`,
        impact: ["进入 FAQ 内容入口", "可继续处理站点可见范围、正文和发布动作"],
        nextStep: "打开 FAQ 内容入口",
        plan: siteKeys
          ? {
              kind: "set_site_keys_content",
              targetType: "faq",
              targetId: entity || undefined,
              sites: siteKeys,
              fields: { siteKeys },
              affectedPaths: ["/faq"],
              risks: ["站点可见范围会变化，可能导致部分站点不再展示该 FAQ"],
              requires: ["在内容入口确认具体对象并保存", "发布/审核（如有）"],
            }
          : {
              kind: "open_entry",
              targetType: "faq",
              targetId: entity || undefined,
              affectedPaths: ["/faq"],
              risks: [],
              requires: ["在内容入口选择对象并编辑"],
            },
      };
    }
    if (/guide|文章/i.test(normalized)) {
      return {
        href: buildOpsSearch({ type: "guide", q: entity || undefined }),
        lane: "content",
        label: "Guide 内容",
        query: entity || undefined,
        summary: `识别为 Guide / 文章内容请求${entity ? `，目标可能是 ${entity}` : ""}。`,
        impact: ["进入 Guide 内容入口", "可继续处理站点归属、正文和审核发布"],
        nextStep: "打开 Guide 内容入口",
        plan: siteKeys
          ? {
              kind: "set_site_keys_content",
              targetType: "guide",
              targetId: entity || undefined,
              sites: siteKeys,
              fields: { siteKeys },
              affectedPaths: entity ? [`/guides/${entity}`, "/guides"] : ["/guides"],
              risks: ["站点可见范围会变化，可能导致部分站点不再展示该 guide"],
              requires: ["在内容入口确认具体对象并保存", "发布/审核（如有）"],
            }
          : {
              kind: "open_entry",
              targetType: "guide",
              targetId: entity || undefined,
              affectedPaths: entity ? [`/guides/${entity}`, "/guides"] : ["/guides"],
              risks: [],
              requires: ["在内容入口选择对象并编辑"],
            },
      };
    }
    return {
      href: buildOpsSearch({ type: "collection", q: entity || undefined }),
      lane: "content",
      label: "内容归属",
      query: entity || undefined,
      summary: `识别为内容归属请求${entity ? `，目标可能是 ${entity}` : ""}。`,
      impact: ["进入内容工作台", "可继续处理正文、站点可见范围和发布动作"],
      nextStep: "打开内容归属入口",
      plan: siteKeys
        ? {
            kind: "set_site_keys_content",
            targetType: "collection",
            targetId: entity || undefined,
            sites: siteKeys,
            fields: { siteKeys },
            affectedPaths: entity ? [`/collection/${entity}`] : ["/collection/[slug]"],
            risks: ["站点可见范围会变化，可能影响部分站点的 collection 页面"],
            requires: ["在内容入口确认具体对象并保存", "发布/审核（如有）"],
          }
        : {
            kind: "open_entry",
            targetType: "collection",
            targetId: entity || undefined,
            affectedPaths: entity ? [`/collection/${entity}`] : ["/collection/[slug]"],
            risks: [],
            requires: ["在内容入口选择对象并编辑"],
          },
    };
  }

  if (
    /(首页|cta|导流|主推|运营|recommendation|collection|页面|落地页|运营位)/i.test(normalized)
  ) {
    const collectionSlug = extractCollectionTarget(normalized) || entity || undefined;
    const featuredProduct = extractPromotedProduct(normalized);
    const ctaTarget = extractCtaTarget(normalized);
    if (collectionSlug && featuredProduct) {
      return {
        href: buildOpsSearch({ type: "collection", q: collectionSlug }),
        lane: "page",
        label: "页面运营",
        query: collectionSlug,
        summary: `识别为 collection 主推商品调整，请求目标可能是 ${collectionSlug}。`,
        impact: ["进入 Collection / 页面运营入口", "会更新 featuredProductSlugs 并影响对应 collection 页展示"],
        nextStep: "打开页面运营入口",
        plan: {
          kind: "update_collection_featured_products",
          targetType: "collection",
          targetId: collectionSlug,
          fields: { featuredProductSlugs: [featuredProduct] },
          affectedPaths: [`/collection/${collectionSlug}`],
          risks: ["会改变 collection 页的主推商品，可能影响当前转化与导购结构"],
          requires: ["生成 collection draft 并人工审核", "必要时补充推荐原因与 CTA 协同调整"],
        },
      };
    }
    if (collectionSlug && ctaTarget) {
      return {
        href: buildOpsSearch({ type: "collection", q: collectionSlug }),
        lane: "page",
        label: "页面运营",
        query: collectionSlug,
        summary: `识别为 collection CTA 调整，请求目标可能是 ${collectionSlug}。`,
        impact: ["进入 Collection / 页面运营入口", "会更新 ctaLinks 并影响对应 collection 页主导流按钮"],
        nextStep: "打开页面运营入口",
        plan: {
          kind: "update_collection_cta",
          targetType: "collection",
          targetId: collectionSlug,
          fields: { ctaLinks: [ctaTarget] },
          affectedPaths: [`/collection/${collectionSlug}`],
          risks: ["会改变 collection 页导流方向，建议同步复核主推商品与导购文案"],
          requires: ["生成 collection draft 并人工审核", "确认 CTA 文案与目标页匹配"],
        },
      };
    }
    return {
      href: buildOpsSearch({ type: "collection", q: collectionSlug || undefined }),
      lane: "page",
      label: "页面运营",
      query: collectionSlug || undefined,
      summary: `识别为页面运营请求${collectionSlug ? `，目标可能是 ${collectionSlug}` : ""}。`,
      impact: ["进入 Collection / 页面运营入口", "可继续处理主推商品、CTA 和导流结构"],
      nextStep: "打开页面运营入口",
      plan: {
        kind: "open_entry",
        targetType: "collection",
        targetId: collectionSlug || undefined,
        affectedPaths: collectionSlug ? [`/collection/${collectionSlug}`] : ["/collection/[slug]"],
        risks: [],
        requires: ["在页面运营入口进一步确认要改的模块（主推商品/CTA/导流结构）"],
      },
    };
  }

  if (
    /(商品|product|sku|卖|上架|下架|库存|价格|sitekeys|在哪些站点|可售|只放到|放到.*站|在哪个站点卖)/i.test(normalized)
  ) {
    return {
      href: buildOpsSearch({ type: "product", q: entity || undefined }),
      lane: "product",
      label: "商品归属",
      query: entity || undefined,
      summary: `识别为商品归属请求${entity ? `，目标可能是 ${entity}` : ""}。`,
      impact: ["进入商品工作台", "可继续处理站点可售范围、内容草稿和审核发布"],
      nextStep: "打开商品归属入口",
      plan: siteKeys
        ? {
            kind: "set_site_keys_product",
            targetType: "product",
            targetId: entity || undefined,
            sites: siteKeys,
            fields: { siteKeys },
            affectedPaths: entity ? ["/shop", `/product/${entity}`] : ["/shop"],
            risks: ["该商品会在未包含的站点中不可见，可能影响已有链接/投放落地页"],
            requires: ["在商品工作台确认目标商品", "同步更新 Medusa 商品 metadata.siteKeys（若尚未补齐）", "发布/审核（如有）"],
          }
        : {
            kind: "open_entry",
            targetType: "product",
            targetId: entity || undefined,
            affectedPaths: entity ? ["/shop", `/product/${entity}`] : ["/shop"],
            risks: [],
            requires: ["在商品工作台确认目标商品并编辑站点范围"],
          },
    };
  }

  return {
    href: "/ops",
    lane: "workspace",
    label: "工作台首页",
    query: entity || undefined,
    summary: "暂时没有识别到明确任务类型，先回到工作台首页。",
    impact: ["不会直接改动数据", "建议从商品、内容、页面、发布这四类任务继续选择"],
    nextStep: "回到工作台首页",
    plan: {
      kind: "none",
      affectedPaths: [],
      risks: [],
      requires: [],
    },
  };
}
