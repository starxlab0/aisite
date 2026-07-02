# Sanity 与 Medusa 数据模型

## 目标

本项目的数据模型需要同时满足两类需求：

- 交易与履约：由 `Medusa` 承载
- 内容与页面表达：由 `Sanity` 承载

核心原则：

- `Medusa` 是交易真相
- `Sanity` 是展示真相
- 前台页面使用聚合后的 View Model，而不是直接吃第三方原始结构

## 一、Sanity 模型

## `siteSettings`

用于站点全局配置。

```ts
type SiteSettings = {
  siteName: string
  siteUrl: string
  defaultTitle: string
  defaultDescription: string
  defaultOgImage: string
  supportEmail: string
  socialLinks: {
    instagram?: string
    x?: string
    reddit?: string
  }
}
```

## `navigation`

用于维护头部与页脚导航。

```ts
type Navigation = {
  header: Array<{
    label: string
    href: string
    children?: Array<{ label: string; href: string }>
  }>
  footer: Array<{
    title: string
    links: Array<{ label: string; href: string }>
  }>
}
```

## `productContent`

用于商品页展示内容。  
注意：这里不存真实库存与最终价格，只存商品页内容表达。

```ts
type ProductContent = {
  productSlug: string
  title: string
  subtitle?: string
  shortDescription?: string

  hero: {
    eyebrow?: string
    headline?: string
    description?: string
    media: string[]
  }

  keyBenefits: string[]
  whoItsFor: string[]
  whyItFeelsDifferent: string[]
  appControlHighlights?: string[]
  careInstructions?: string[]
  whatsInBox?: string[]

  sections: Array<
    | { _type: 'imageText'; title: string; body: string; image: string }
    | { _type: 'featureGrid'; title: string; items: string[] }
    | { _type: 'comparison'; title: string; rows: { label: string; value: string }[] }
    | { _type: 'faqGroup'; faqIds: string[] }
  >

  relatedProducts: string[]
  relatedGuides: string[]

  seo: {
    title?: string
    description?: string
    keywords?: string[]
  }
}
```

### `productContent` 字段说明

- `productSlug`：与 `Medusa` 商品 slug 对齐
- `hero`：商品页首屏内容
- `keyBenefits`：核心卖点
- `whoItsFor`：适合人群
- `whyItFeelsDifferent`：区别于普通产品的体验说明
- `sections`：富区块扩展，支持后续页面演化

## `collectionPage`

用于分类页的内容包装。

```ts
type CollectionPage = {
  slug: string
  title: string
  subtitle?: string
  description?: string
  heroImage?: string

  introBlocks?: string[]
  featuredProducts: string[]
  faqIds: string[]
  guideIds: string[]

  seo: {
    title?: string
    description?: string
  }
}
```

## `bundlePage`

用于套装页内容。

```ts
type BundlePage = {
  slug: string
  title: string
  subtitle?: string
  description: string
  productSlugs: string[]
  reasonToBuy: string[]
  audienceTag: 'first-time' | 'couples' | 'intense' | 'discreet'
  faqIds?: string[]
}
```

## `guideArticle`

用于内容中心文章。

```ts
type GuideArticle = {
  slug: string
  title: string
  excerpt: string
  coverImage?: string
  category:
    | 'buying-guide'
    | 'care'
    | 'long-distance'
    | 'discreet-play'
    | 'education'

  body: any
  relatedProductSlugs: string[]
  relatedCollectionSlugs: string[]

  seo: {
    title?: string
    description?: string
  }
}
```

## `faqItem`

```ts
type FAQItem = {
  question: string
  answer: string
  category:
    | 'product'
    | 'shipping'
    | 'returns'
    | 'privacy'
    | 'app-control'
    | 'care'
}
```

## `technologyPage`

用于像 `App Control` 这样的专题页。

```ts
type TechnologyPage = {
  slug: string
  title: string
  subtitle?: string
  intro?: string
  sections: Array<{
    title: string
    body: string
    image?: string
  }>
  relatedProductSlugs: string[]
  faqIds?: string[]
}
```

## `landingPage`

用于活动页、营销专题页。

```ts
type LandingPage = {
  slug: string
  title: string
  subtitle?: string
  sections: Array<any>
  seo?: {
    title?: string
    description?: string
  }
}
```

## 二、Medusa 模型

`Medusa` 负责交易与库存逻辑，但需要补充当前品类特有的体验属性。

## `CommerceProduct`

```ts
type CommerceProduct = {
  id: string
  slug: string
  name: string
  status: 'draft' | 'published'

  brand: string
  series?: string

  thumbnail: string
  images: string[]

  price: number
  compareAtPrice?: number
  currency: string

  inventoryQuantity: number
  allowBackorder: boolean

  material?: string
  waterproof?: 'none' | 'IPX6' | 'IPX7'
  runtimeMinutes?: number
  chargeMinutes?: number
  weightGrams?: number
  sizeText?: string

  stimulationType: Array<
    'clitoral' | 'licking' | 'suction' | 'insertable' | 'dual' | 'thrusting'
  >

  appControl: boolean
  remoteControl: boolean
  wearable: boolean
  heating: boolean
  coupleFriendly: boolean

  beginnerLevel: 1 | 2 | 3 | 4 | 5
  intensityLevel: 1 | 2 | 3 | 4 | 5
  noiseLevel: 1 | 2 | 3 | 4 | 5
  discreetLevel: 1 | 2 | 3 | 4 | 5

  tags: string[]
  collections: string[]
}
```

## `Cart`

```ts
type Cart = {
  id: string
  items: Array<{
    productId: string
    variantId: string
    quantity: number
    unitPrice: number
    total: number
  }>
  subtotal: number
  discountTotal: number
  shippingTotal: number
  taxTotal: number
  total: number
  currency: string
}
```

## `Order`

```ts
type Order = {
  id: string
  email: string
  items: Array<{
    productId: string
    title: string
    quantity: number
    unitPrice: number
  }>
  paymentStatus: 'pending' | 'authorized' | 'paid' | 'failed'
  fulfillmentStatus: 'unfulfilled' | 'processing' | 'shipped' | 'delivered'
  total: number
  currency: string
  createdAt: string
}
```

## 三、必备体验标签体系

这套标签决定以下功能能否顺利实现：

- 分类页筛选
- `By Need` 导购
- quiz 推荐
- 商品推荐
- bundle 组合逻辑

## 标签字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `stimulationType` | `string[]` | 刺激方式 |
| `appControl` | `boolean` | 是否支持 App |
| `remoteControl` | `boolean` | 是否支持远程控制 |
| `wearable` | `boolean` | 是否可穿戴 |
| `heating` | `boolean` | 是否带加温 |
| `coupleFriendly` | `boolean` | 是否适合情侣互动 |
| `beginnerLevel` | `1-5` | 新手友好度 |
| `intensityLevel` | `1-5` | 刺激强度 |
| `noiseLevel` | `1-5` | 噪音级别 |
| `discreetLevel` | `1-5` | 隐蔽程度 |

## 首批 SKU 初步映射

| 产品 | stimulationType | appControl | wearable | coupleFriendly |
|---|---|---|---|---|
| `口口舱X` | `licking` `suction` | `true` | `false` | `true` |
| `口口舱Pro` | `dual` `suction` `insertable` | `true` | `false` | `true` |
| `口口舱Pro Max` | `dual` `suction` `insertable` | `true` | `false` | `true` |
| `海狸` | `dual` | `true` | `true` | `true` |
| `逃狸` | `suction` | `true` | `true` | `true` |
| `粉噗` | `suction` | `true` | `true` | `true` |
| `含豆` | `dual` `suction` `insertable` | `true` | `false` | `false` |
| `速泡` | `thrusting` `insertable` | `true` | `false` | `true` |

## 四、前台聚合 View Model

前台不要直接消费 `Sanity` 和 `Medusa` 原始结构，必须先聚合成页面可用对象。

## `ProductPageViewModel`

```ts
type ProductPageViewModel = {
  slug: string
  title: string
  subtitle?: string

  price: {
    amount: number
    compareAt?: number
    currency: string
  }

  media: string[]
  inStock: boolean

  badges: string[]
  keyBenefits: string[]
  whoItsFor: string[]
  whyItFeelsDifferent: string[]
  specs: Array<{ label: string; value: string }>
  whatsInBox: string[]
  faqs: Array<{ question: string; answer: string }>

  relatedProducts: Array<{
    slug: string
    title: string
    thumbnail: string
    price: number
  }>
}
```

## `CollectionPageViewModel`

```ts
type CollectionPageViewModel = {
  slug: string
  title: string
  subtitle?: string
  description?: string
  heroImage?: string
  introBlocks?: string[]

  products: Array<{
    slug: string
    title: string
    thumbnail: string
    price: number
    badges: string[]
  }>

  featuredProducts: string[]
  faqs: Array<{ question: string; answer: string }>
  guides: Array<{ slug: string; title: string }>
}
```

## 五、数据来源映射

### 商品页

- `Medusa`：价格、库存、基础参数、图片
- `Sanity`：标题包装、卖点、图文区块、FAQ、推荐内容

### 分类页

- `Sanity`：分类文案、hero、FAQ、相关文章
- `Medusa`：商品列表与筛选

### 指南页

- `Sanity`：文章正文、SEO、关联内容

### 购物车与结账

- `Medusa`：购物车、折扣、价格、订单、支付状态

## 六、开发约束

- 不把真实价格和库存写进 `Sanity`
- 不把长篇商品页文案写进 `Medusa`
- 所有页面都通过 adapter 层取数
- 标签字段必须保持枚举统一，避免前后台命名分叉

## 七、待确认问题

- 首批产品的 `beginnerLevel / intensityLevel / discreetLevel` 具体分值
- `wearable` 产品是否需要额外增加 `publicPlayFriendly` 标签
- bundle 的最终价格逻辑由 `Medusa` 折扣实现还是单独 SKU 实现
