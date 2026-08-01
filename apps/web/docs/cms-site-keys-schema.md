# CMS `siteKeys` schema 规范

这份文档用于把当前前端的多站点约定，收敛成 CMS 侧可直接落地的 schema 规范。

目标：

- 内容录入时就明确归属哪些站点
- Sanity query 与前端类型保持一致
- 避免“前端支持了站点隔离，但 CMS 没有原生字段”的长期分裂

可直接复制的 `defineType(...)` 示例见：

- `docs/cms-site-keys-schema-examples.md`

## 适用文档类型

当前建议以下 schema 原生支持 `siteKeys`：

- `productContent`
- `collectionPage`
- `guideArticle`
- `faqItem`

其中：

- `productContent / guideArticle / faqItem` 已经被前端 resolver 按 `siteKeys` 过滤
- `collectionPage` 现在也已经按 `siteKeys` 过滤

## 字段约定

建议所有上述 schema 统一增加：

```ts
{
  name: "siteKeys",
  title: "Applicable sites",
  type: "array",
  of: [{ type: "string" }],
  options: {
    layout: "tags",
  },
}
```

语义约定：

- 未设置 `siteKeys`：默认所有站点可见
- 设置了 `siteKeys`：仅这些站点可见

## 建议的可选值

当前站点注册表中的值是：

- `cn-store`
- `us-store`
- `jp-store`

如果 Studio 侧要做更友好的录入体验，建议把这个字段改成固定 option 列表，而不是自由输入。

示意：

```ts
{
  name: "siteKeys",
  title: "Applicable sites",
  type: "array",
  of: [
    {
      type: "string",
      options: {
        list: [
          { title: "CN Store", value: "cn-store" },
          { title: "US Store", value: "us-store" },
          { title: "JP Store", value: "jp-store" },
        ],
      },
    },
  ],
}
```

## 前端当前期待的字段

### `productContent`

前端 query 当前期待：

- `productSlug`
- `siteKeys`
- `title`
- `subtitle`
- `shortDescription`
- `hero`
- `keyBenefits`
- `whoItsFor`
- `whyItFeelsDifferent`
- `appControlHighlights`
- `careInstructions`
- `whatsInBox`
- `relatedProducts`
- `relatedGuides`
- `seo`
- `locales`

### `collectionPage`

前端 query 当前期待：

- `slug.current`
- `siteKeys`
- `title`
- `subtitle`
- `description`
- `heroImage`
- `introBlocks`
- `featuredProducts`
- `faqIds`
- `guideIds`
- `seo`

### `guideArticle`

前端 query 当前期待：

- `slug.current`
- `siteKeys`
- `title`
- `excerpt`
- `coverImage`
- `category`
- `body`
- `relatedProductSlugs`
- `relatedCollectionSlugs`
- `seo`
- `locales`

### `faqItem`

前端 query 当前期待：

- `_id`
- `siteKeys`
- `question`
- `answer`
- `category`
- `targetType`
- `targetId`
- `locales`

## 推荐 Studio 校验

建议增加至少两类校验：

### 1. 站点 key 合法性

只允许：

- `cn-store`
- `us-store`
- `jp-store`

### 2. 避免空字符串

如果使用自由输入模式，应过滤空字符串和重复值。

## 建议的迁移策略

如果当前 Sanity 数据还没有 `siteKeys`，建议按这个顺序迁移：

1. 先给 schema 增加 `siteKeys`
2. 不立刻强制必填，保持“未设置 = 全站可见”
3. 先给需要明显分站的内容补值
4. 再逐步把新内容录入流程切到带 `siteKeys`

这样不会打断现有内容，也能逐步把多站点数据治理做起来。
