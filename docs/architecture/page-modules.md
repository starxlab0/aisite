# 页面模块清单与数据来源

## 目标

本文档用于定义首期核心页面的模块组成、模块职责和数据来源，方便设计、前端、内容运营和后端协同。

首期重点页面：

- 首页
- 分类页
- 商品页
- `App Control` 专题页
- Guides 列表页 / 详情页

## 一、首页 `/`

## 模块列表

### 1. `HomeHeroSection`

#### 作用

- 展示品牌定位
- 承接首屏流量
- 引导进入主推路径

#### 建议内容

- 品牌主标题
- 一句副标题
- 主按钮：`Find Your Match`
- 次按钮：`Shop Best Sellers`
- 主视觉产品或组合图

#### 数据来源

- `Sanity.siteSettings`
- `Sanity.landingPage` 或首页配置模块

### 2. `NeedFinderSection`

#### 作用

- 按需求而不是按型号导购

#### 推荐入口

- 第一次买
- 想要外吸 / 舔吸
- 想要双刺激
- 想要安静隐蔽
- 想要远程互动

#### 数据来源

- `Sanity.landingPage`
- 对应跳转到 `collection` 或 `quiz`

### 3. `FeaturedProductsSection`

#### 作用

- 首页主推产品展示

#### 首期建议商品

- `口口舱X`
- `口口舱Pro`
- `海狸`

#### 数据来源

- 商品内容：`Sanity.productContent`
- 价格库存：`Medusa.CommerceProduct`

### 4. `AppControlIntroSection`

#### 作用

- 强调站点差异能力
- 说明远程互动和自定义模式

#### 数据来源

- `Sanity.technologyPage(app-control)`

### 5. `ScenarioCardsSection`

#### 作用

- 按使用场景导流

#### 推荐场景

- Solo Play
- Long Distance
- Discreet Play
- Dual Stimulation

#### 数据来源

- `Sanity.landingPage`
- 链接到专题页或 collection

### 6. `TrustBarSection`

#### 作用

- 建立下单信任

#### 建议内容

- Discreet Packaging
- Body-safe Materials
- Waterproof Designs
- Secure Checkout
- Support Available

#### 数据来源

- `Sanity.siteSettings`
- `Sanity.landingPage`

### 7. `GuideCardsSection`

#### 作用

- 承接 SEO 和教育内容

#### 建议文章方向

- 第一次买怎么选
- 外吸和双刺激有什么区别
- 如何清洁和收纳

#### 数据来源

- `Sanity.guideArticle`

### 8. `NewsletterSection`

#### 作用

- 邮件订阅
- 领取选购指南或优惠

#### 数据来源

- 文案：`Sanity.landingPage`
- 接口：`/api/newsletter/subscribe`

## 二、分类页 `/collection/[slug]`

## 模块列表

### 1. `CollectionHeroSection`

#### 作用

- 解释这个分类是什么
- 告诉用户适合谁

#### 数据来源

- `Sanity.collectionPage`

### 2. `CollectionIntroBlocksSection`

#### 作用

- 说明该分类下产品的共同特点

#### 数据来源

- `Sanity.collectionPage.introBlocks`

### 3. `CollectionFilterBar`

#### 作用

- 商品筛选

#### 首期筛选项

- App Control
- Wearable
- Beginner Friendly
- Discreet
- Intense

#### 数据来源

- `Medusa.CommerceProduct`

### 4. `CollectionProductGrid`

#### 作用

- 展示该分类下的商品卡片

#### 商品卡建议字段

- 主图
- 名称
- 一句说明
- 价格
- 2 到 3 个 badge

#### 数据来源

- `Medusa.CommerceProduct`
- `Sanity.productContent`

### 5. `CollectionFeaturedSection`

#### 作用

- 突出当前分类的主推款

#### 数据来源

- `Sanity.collectionPage.featuredProducts`
- `Sanity.productContent`
- `Medusa.CommerceProduct`

### 6. `CollectionFAQSection`

#### 作用

- 降低决策门槛

#### 数据来源

- `Sanity.collectionPage.faqIds`
- `Sanity.faqItem`

### 7. `RelatedGuidesSection`

#### 作用

- 给用户更完整的教育内容

#### 数据来源

- `Sanity.collectionPage.guideIds`
- `Sanity.guideArticle`

## 三、商品页 `/product/[slug]`

## 模块列表

### 1. `ProductHeroSection`

#### 作用

- 展示商品图、价格、核心摘要、购买入口

#### 必要信息

- 标题
- 副标题
- 价格
- 主图 / 图库
- 主 CTA
- 快速卖点

#### 数据来源

- 标题文案：`Sanity.productContent`
- 价格与库存：`Medusa.CommerceProduct`

### 2. `ProductBadgesRow`

#### 作用

- 用 badge 快速说明产品属性

#### 建议 badge

- App Control
- Wearable
- Beginner Friendly
- Dual Stimulation
- Quiet / Discreet

#### 数据来源

- `Medusa.CommerceProduct`

### 3. `KeyBenefitsSection`

#### 作用

- 用 3 到 5 个重点卖点快速打动用户

#### 数据来源

- `Sanity.productContent.keyBenefits`

### 4. `WhoItsForSection`

#### 作用

- 告诉用户这款适合谁

#### 数据来源

- `Sanity.productContent.whoItsFor`

### 5. `WhyItFeelsDifferentSection`

#### 作用

- 解释和普通同类款的差别

#### 数据来源

- `Sanity.productContent.whyItFeelsDifferent`

### 6. `AppControlSection`

#### 作用

- 对支持 App 的产品解释远程和自定义能力

#### 显示条件

- `appControl === true`

#### 数据来源

- `Medusa.CommerceProduct.appControl`
- `Sanity.productContent.appControlHighlights`

### 7. `ProductStoryBlocks`

#### 作用

- 图文说明
- 补充体验解释

#### 数据来源

- `Sanity.productContent.sections`

### 8. `SpecsSection`

#### 作用

- 展示关键参数

#### 建议字段

- 材质
- 防水等级
- 续航
- 充电时间
- 尺寸
- 重量

#### 数据来源

- `Medusa.CommerceProduct`

### 9. `InTheBoxSection`

#### 作用

- 展示包装清单

#### 数据来源

- `Sanity.productContent.whatsInBox`

### 10. `CareGuideSection`

#### 作用

- 提前回答清洁与使用问题

#### 数据来源

- `Sanity.productContent.careInstructions`

### 11. `ProductFAQSection`

#### 作用

- 进一步促成转化

#### 数据来源

- `Sanity.productContent.sections` 中 `faqGroup`
- `Sanity.faqItem`

### 12. `RelatedProductsSection`

#### 作用

- 做交叉销售和相关推荐

#### 数据来源

- `Sanity.productContent.relatedProducts`
- `Medusa.CommerceProduct`

## 四、`App Control` 专题页 `/app-control`

## 模块列表

### 1. `TechnologyHeroSection`

- 介绍什么是 App Control
- 说明适合谁

### 2. `CapabilityGridSection`

- 远程控制
- 自定义模式
- 情侣互动
- 安静隐蔽使用

### 3. `HowItWorksSection`

- 3 到 4 步说明使用方式

### 4. `AppControlProductsSection`

- 所有支持 App 的产品列表

### 5. `UseCasesSection`

- Long-distance couples
- Private solo play
- Discreet teasing

### 6. `FAQSection`

- 回答兼容性、稳定性、隐私等问题

#### 数据来源

- 全部来自 `Sanity.technologyPage`
- 产品列表可从 `Medusa` 过滤 `appControl === true`

## 五、Guides 列表页 `/guides`

## 模块列表

### 1. `GuidesHeroSection`

- 内容中心定位说明

### 2. `GuideCategoryTabs`

- Buying Guide
- Care
- App Control
- Long Distance
- Discreet Play

### 3. `GuideListSection`

- 文章列表

### 4. `FeaturedGuideSection`

- 推荐重点文章

#### 数据来源

- `Sanity.guideArticle`

## 六、Guide 详情页 `/guides/[slug]`

## 模块列表

### 1. `GuideArticleHero`

- 标题
- 摘要
- 封面图

### 2. `GuideArticleBody`

- 正文

### 3. `RelatedProductsSection`

- 文章关联商品

### 4. `RelatedCollectionsSection`

- 文章关联分类

### 5. `GuideCTASection`

- 跳转到 `quiz` 或 `shop`

#### 数据来源

- `Sanity.guideArticle`
- 商品数据补充来自 `Medusa`

## 七、购物车 `/cart`

## 模块列表

### 1. `CartItemsSection`

- 商品列表
- 数量调整
- 删除

### 2. `CartSummarySection`

- 小计
- 折扣
- 运费说明

### 3. `CartTrustSection`

- 隐私包装
- 安全支付
- 售后支持

### 4. `CartUpsellSection`

- 推荐加购
- 推荐 bundle

#### 数据来源

- 购物车：`Medusa`
- trust 文案：`Sanity`
- upsell：`Sanity + Medusa`

## 八、结账 `/checkout`

## 模块列表

### 1. `CheckoutFormSection`

- 联系方式
- 地址
- 配送
- 支付

### 2. `CheckoutSummarySection`

- 商品清单
- 总金额

### 3. `CheckoutTrustHints`

- 隐私包装
- 安全支付
- 联系支持方式

#### 数据来源

- 交易数据：`Medusa`
- trust 文案：`Sanity`

## 九、模块与数据来源总表

| 模块 | 主数据来源 |
|---|---|
| 首页首屏 | `Sanity` |
| 首页主推商品 | `Sanity + Medusa` |
| 分类页 Hero | `Sanity` |
| 分类页商品列表 | `Medusa + Sanity` |
| 商品页首屏 | `Sanity + Medusa` |
| 商品参数 | `Medusa` |
| 商品 FAQ | `Sanity` |
| App Control 专题 | `Sanity + Medusa` |
| Guides | `Sanity` |
| 购物车 / 结账 | `Medusa` |

## 十、开发注意事项

- 页面区块要模块化，不要写死在单一页面文件中
- 所有商品页、分类页尽量通过统一 View Model 取数
- 文案可配置部分全部交给 `Sanity`
- 价格、库存、订单绝不从 `Sanity` 读取
