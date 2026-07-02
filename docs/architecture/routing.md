# 项目目录与路由规划

## 仓库结构

建议使用 `monorepo`，但第一阶段保持克制，只保留当前必要的应用和共享包。

```txt
repo/
  apps/
    web/
  packages/
    ui/
    config/
    types/
    lib/
  docs/
    architecture/
```

## `apps/web` 目录结构

```txt
apps/web/
  app/
    (marketing)/
      page.tsx
      app-control/
        page.tsx
      bundles/
        page.tsx
      guides/
        page.tsx
        [slug]/
          page.tsx
      long-distance/
        page.tsx
      discreet-play/
        page.tsx
      how-to-choose/
        page.tsx

    (shop)/
      shop/
        page.tsx
      collection/
        [slug]/
          page.tsx
      product/
        [slug]/
          page.tsx
      quiz/
        page.tsx
      cart/
        page.tsx
      checkout/
        page.tsx
      order/
        [id]/
          page.tsx

    (support)/
      faq/
        page.tsx
      shipping/
        page.tsx
      returns/
        page.tsx
      privacy/
        page.tsx
      contact/
        page.tsx

    api/
      revalidate/
        route.ts
      webhooks/
        sanity/
          route.ts
        medusa/
          route.ts
        payment/
          route.ts
      newsletter/
        subscribe/
          route.ts
      quiz/
        submit/
          route.ts

    sitemap.ts
    robots.ts
    layout.tsx
    not-found.tsx
    globals.css

  components/
    ui/
    layout/
    shared/
    product/
    collection/
    bundle/
    quiz/
    guide/
    marketing/

  features/
    home/
    product/
    collection/
    cart/
    checkout/
    quiz/
    bundles/
    guides/
    app-control/
    analytics/

  lib/
    cms/
      client.ts
      queries.ts
      mapping.ts
    commerce/
      products.ts
      cart.ts
      checkout.ts
      customer.ts
      mapping.ts
    analytics/
      events.ts
      providers.tsx
    seo/
      metadata.ts
      schema.ts
    env/
      server.ts
      client.ts
    utils/
      money.ts
      image.ts
      text.ts
      filters.ts

  types/
    product.ts
    collection.ts
    bundle.ts
    guide.ts
    faq.ts
    quiz.ts

  hooks/
  providers/
  styles/
```

## 目录职责

### `app/`

- 只负责路由入口和页面装配
- 不直接写复杂业务逻辑
- 不直接四处调用第三方 SDK

### `features/`

- 放页面级业务逻辑
- 放模块组合和数据装配
- 放 quiz、bundle、筛选、推荐等功能逻辑

### `components/`

- 放纯组件
- 可区分为基础 UI、业务组件、页面区块

### `lib/cms`

- 统一对接 `Sanity`
- 输出站点需要的内容对象

### `lib/commerce`

- 统一对接 `Medusa`
- 输出商品、购物车、结账相关对象

## 路由树

### 主站页面

```txt
/
/shop
/collection/[slug]
/product/[slug]
/bundles
/guides
/guides/[slug]
/quiz
/app-control
/long-distance
/discreet-play
/how-to-choose
/faq
/shipping
/returns
/privacy
/contact
/cart
/checkout
/order/[id]
```

## 推荐的 `collection` slug

```txt
/collection/first-time
/collection/clitoral-licking
/collection/dual-stimulation
/collection/wearable
/collection/app-controlled
/collection/intense-play
/collection/discreet-play
/collection/couples
```

## 推荐的专题页

```txt
/app-control
/long-distance
/discreet-play
/how-to-choose
```

## 页面职责

### 首页 `/`

- 品牌定位
- 选购入口
- 主推产品
- App Control 能力介绍
- 场景入口
- 信任模块

### 商城页 `/shop`

- 所有可售商品
- 基础筛选
- 按 collection 快速切换

### 分类页 `/collection/[slug]`

- 场景化分类说明
- 适合谁
- 商品列表
- FAQ
- 相关文章

### 商品页 `/product/[slug]`

- Hero
- 卖点
- 适合谁
- 使用体验说明
- 参数
- 包装清单
- FAQ
- 相关推荐

### 指南页 `/guides`

- 文章列表
- 按主题分类
- 承接 SEO 与教育内容

### quiz `/quiz`

- 选购问答
- 输出推荐商品或 collection

### `App Control` 专题页

- 远程互动介绍
- 支持 App 的产品列表
- 玩法说明

## 渲染建议

| 路由 | 建议渲染方式 | 说明 |
|---|---|---|
| `/` | `ISR` | 更新频率适中，强调速度和 SEO |
| `/shop` | `ISR` | 商品列表允许缓存 |
| `/collection/[slug]` | `ISR` | 分类页适合缓存 |
| `/product/[slug]` | `ISR` | 商品页对 SEO 重要 |
| `/guides` | `Static` | 内容页适合静态 |
| `/guides/[slug]` | `Static` | 内容页适合静态 |
| `/faq` 等支持页 | `Static` | 更新少 |
| `/cart` | `Client + Server Action` | 实时交互 |
| `/checkout` | `Dynamic` | 价格和支付动态 |
| `/order/[id]` | `Dynamic` | 订单状态动态 |

## API 路由规划

```txt
/api/revalidate
/api/webhooks/sanity
/api/webhooks/medusa
/api/webhooks/payment
/api/newsletter/subscribe
/api/quiz/submit
```

### API 职责

- `revalidate`：手动或系统触发页面更新
- `webhooks/sanity`：内容更新后通知前台刷新
- `webhooks/medusa`：商品、库存、价格更新后刷新相关页面
- `webhooks/payment`：接支付状态回调
- `newsletter/subscribe`：邮箱订阅
- `quiz/submit`：问答结果记录或回传

## 组件分层建议

### 基础层

- `Button`
- `Card`
- `Badge`
- `Accordion`
- `Tabs`

### 业务层

- `ProductCard`
- `BundleCard`
- `CollectionHero`
- `QuizQuestion`
- `GuideCard`

### 页面区块层

- `HomeHeroSection`
- `FeaturedProductsSection`
- `ProductFAQSection`
- `AppControlFeatureSection`

## 路由与导航映射

### 主导航建议

- `Shop`
- `By Need`
- `App Control`
- `Bundles`
- `Guides`
- `Support`

### `By Need` 下推荐映射

- `first-time`
- `clitoral-licking`
- `dual-stimulation`
- `wearable`
- `discreet-play`
- `couples`

## 开发注意事项

- 不要在页面组件里直接使用 CMS 或电商 SDK 原始结构
- 路由页面只拼装数据，不承载复杂逻辑
- 内容页尽量从 `Sanity` 驱动
- 商品页数据应由 `Sanity + Medusa` 聚合后输出
