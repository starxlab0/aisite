# 多站点独立部署

这套 `web` 应用现在支持同一套代码、多个站点分别部署。

## 当前模式

- 同一套代码仓库
- 多个站点配置共存
- 每个部署实例通过环境变量固定绑定一个站点
- 不依赖运行时按域名自动切站

## 站点配置位置

站点配置现在拆成了这几层：

- `src/lib/site/site-registry.ts`
  - 注册所有 tenant / brand / site
- `src/lib/site/sites/xiao-brand-cn-store.ts`
  - 中国站配置
- `src/lib/site/sites/xiao-brand-jp-store.ts`
  - 日本站配置
- `src/lib/site/sites/xiao-brand-us-store.ts`
  - 美国站配置
- `src/lib/site/config.ts`
  - 运行时读取环境变量并解析当前站点

## 必填环境变量

每个部署实例至少需要配置：

```env
SITE_TENANT_KEY=xiao
SITE_BRAND_KEY=brand
SITE_KEY=cn-store
SITE_DEFAULT_LOCALE=en
NEXT_PUBLIC_SITE_URL=https://cn.example.com
SITE_BASE_URL=https://cn.example.com
SITE_URL=https://cn.example.com
```

另一个站点可以这样配：

```env
SITE_TENANT_KEY=xiao
SITE_BRAND_KEY=brand
SITE_KEY=us-store
SITE_DEFAULT_LOCALE=en
NEXT_PUBLIC_SITE_URL=https://us.example.com
SITE_BASE_URL=https://us.example.com
SITE_URL=https://us.example.com
```

## 环境变量说明

### 站点识别

- `SITE_TENANT_KEY`
  - 当前部署属于哪个 tenant
- `SITE_BRAND_KEY`
  - 当前部署属于哪个 brand
- `SITE_KEY`
  - 当前部署绑定哪个 site
- `SITE_DEFAULT_LOCALE`
  - 当前站点默认 locale；未配置时回退到 `en`

### 站点 URL

- `NEXT_PUBLIC_SITE_URL`
  - 前台构建绝对 URL、SEO 与部分客户端逻辑使用
- `SITE_BASE_URL`
  - 服务器端 base URL 备用
- `SITE_URL`
  - 服务器端 base URL 备用

建议三者在同一个部署里保持一致。

## 站点级配置项

每个 site 当前支持这些配置：

### `siteId`

站点唯一 ID。

### `navigation.header`

顶部导航链接。

### `navigation.footer`

底部导航链接。

### `commerce.defaultCollectionSlug`

该站点的默认合集入口。

### `commerce.supportEmail`

站点客服邮箱；欢迎邮件和支持提示会读这个值。

### `commerce.marketCode`

站点所属市场，如 `cn`、`us`。

### `theme`

- `accent`
- `accentForeground`
- `surface`

当前主要用于主题预留，后续可以继续扩展到真正的站点皮肤。

### `features`

- `guides`
- `bundles`
- `appControl`
- `quiz`

可用于按站点启用或关闭特性。

### `merchandising`

用于定义站点自己的首页与商店信息架构，例如：

- `homeFeaturedProductSlugs`
- `homeCollectionCards`
- `shopIntro`
- `shopQuickLinks`
- `shopAdviceCards`
- `collectionOverrides`

这部分适合做站点差异化导购结构，而不是只改文案。

其中 `collectionOverrides` 可以为同一个 collection slug 按站点定义不同的：

- `heroTitle`
- `heroSummary`
- `sections`
- `internalLinks`
- `featuredProductSlugs`
- `ctaLinks`

## 如何新增一个站点

以新增 `jp-store` 为例：

1. 新建站点配置文件

例如：

- `src/lib/site/sites/xiao-brand-jp-store.ts`

2. 在文件里导出一个 `SiteDefinition`

3. 在 `src/lib/site/site-registry.ts` 中注册这个 site

```ts
sites: {
  "cn-store": xiaoBrandCnStore,
  "us-store": xiaoBrandUsStore,
  "jp-store": xiaoBrandJpStore,
}
```

4. 新增对应部署实例

```env
SITE_TENANT_KEY=xiao
SITE_BRAND_KEY=brand
SITE_KEY=jp-store
NEXT_PUBLIC_SITE_URL=https://jp.example.com
SITE_BASE_URL=https://jp.example.com
SITE_URL=https://jp.example.com
```

## 新增站点检查清单

建议按这个顺序操作：

1. 复制一个现有站点文件
   - 例如复制 `src/lib/site/sites/xiao-brand-us-store.ts`
2. 修改新站点文件中的：
   - `siteId`
   - `navigation.header`
   - `navigation.footer`
   - `commerce.defaultCollectionSlug`
   - `commerce.supportEmail`
   - `commerce.marketCode`
   - `theme`
   - `features`
3. 在 `src/lib/site/site-registry.ts` 里注册新站点
4. 为该站点新增部署环境变量
5. 配置该站点对应的域名与部署实例
6. 验证：
   - 首页品牌名是否正确
   - 导航是否正确
   - `NEXT_PUBLIC_SITE_URL` 生成的 canonical / sitemap 是否正确
   - 客服邮箱、支付回跳、邮件链接是否正确

## 站点文件模板

```ts
import type { SiteDefinition } from "@/lib/site/types";

export const myNewSite: SiteDefinition = {
  siteId: "brand-my-site",
  navigation: {
    header: [
      { href: "/shop", label: "Shop" },
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
    marketCode: "my-market",
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
};
```

## 当前边界

当前实现同时支持两种落地方式：

1. 多站点独立部署：每个部署实例用环境变量固定绑定一个 `SITE_KEY`（更简单、更常见）。
2. 单域名单部署多站点：通过 `geo_site_choice` 写入 cookie，再由 middleware 注入 `x-site-key`，让同一部署在不同请求里切换站点。

如果你选择方案 2（单域名单部署多站点），需要在 Vercel 环境变量里同时配置：

- `SITE_KEY`（默认站点，例如 `cn-store`）
- `SITE_URLS_BY_SITE_KEY`（JSON，三站点都指向同一个域名也可以）

## 内容按站点隔离

默认内容和发布内容现在可以通过 `siteKeys` 控制适用站点。

例如：

```ts
{
  slug: "how-to-choose",
  siteKeys: ["cn-store", "us-store"]
}
```

规则是：

- 未配置 `siteKeys`：默认所有站点可见
- 配置了 `siteKeys`：仅对应站点可见

当前这一层已经接入：

- `product`
- `guide`
- `faq`

CMS schema 侧的字段规范见：

- `docs/cms-site-keys-schema.md`

在 ops 中通过 `Generate` 新建 draft 时，系统现在会默认继承当前部署站点，并自动写入：

```ts
siteKeys: [currentSiteKey]
```

如果需要让一份内容同时适用于多个站点，再在 ops 编辑页中手动补充更多 `siteKeys`。

目前 ops 编辑已支持：

- product / guide / faq / collection 的 `siteKeys` 编辑与 diff 对比
- `ops/collection` 的 `featuredProductSlugs` 编辑
- `ops/collection` 的 `ctaLinks` 编辑

## 商品目录按站点隔离

商品目录本身现在也支持 `siteKeys`。

对于 mock 商品，可以直接在商品对象里配置：

```ts
{
  slug: "haili",
  siteKeys: ["cn-store", "us-store", "jp-store"]
}
```

对于 Medusa 商品，可以在 `metadata.siteKeys` 中提供：

```json
{
  "siteKeys": ["us-store"]
}
```

如果没有配置 `siteKeys`，默认所有站点都可见。

如果后续需要单次部署多域名，需要再补：

- host -> site context 映射
- middleware 注入 `siteKey`
- base URL 按当前请求动态生成

## 建议

如果你们接下来要继续扩站，建议保持这个顺序：

1. 先按站点独立部署
2. 先把站点配置文件体系稳定下来
3. 再按站点拆内容、支付和邮件资源
4. 最后再评估是否需要“单部署多域名”

## 相关模板

- `docs/deploy-env-template.md`
- `docs/env.cn-store.example`
- `docs/env.us-store.example`
- `docs/env.jp-store.example`
