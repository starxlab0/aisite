# Sanity schema 示例

这份文档提供可直接复制到 Sanity Studio/schema 包中的 `defineType(...)` 示例。

适用前提：

- 当前仓库没有内置 Sanity Studio/schema 目录
- 这些示例用于后续接入单独的 Studio 工程，或接入 monorepo 中的 schema 包

## 共用字段

建议先抽一个可复用的 `siteKeys` 字段：

```ts
import { defineField } from "sanity";

export const siteKeysField = defineField({
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
  options: {
    layout: "tags",
  },
  description: "留空表示所有站点可见；填写后仅在这些站点可见。",
  validation: (Rule) => Rule.unique(),
});
```

## `productContent`

```ts
import { defineField, defineType } from "sanity";
import { siteKeysField } from "./fields/siteKeysField";

export const productContentType = defineType({
  name: "productContent",
  title: "Product Content",
  type: "document",
  fields: [
    defineField({
      name: "productSlug",
      title: "Product slug",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    siteKeysField,
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle",
      type: "string",
    }),
    defineField({
      name: "shortDescription",
      title: "Short description",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "hero",
      title: "Hero",
      type: "object",
      fields: [
        defineField({ name: "eyebrow", type: "string" }),
        defineField({ name: "headline", type: "string" }),
        defineField({ name: "description", type: "text", rows: 4 }),
        defineField({
          name: "media",
          type: "array",
          of: [{ type: "string" }],
          description: "可填图片 URL 或你们自己的媒体引用字段。",
        }),
      ],
    }),
    defineField({ name: "keyBenefits", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "whoItsFor", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "whyItFeelsDifferent", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "appControlHighlights", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "careInstructions", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "whatsInBox", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "relatedProducts", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "relatedGuides", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "seo",
      type: "object",
      fields: [
        defineField({ name: "title", type: "string" }),
        defineField({ name: "description", type: "text", rows: 3 }),
        defineField({ name: "keywords", type: "array", of: [{ type: "string" }] }),
      ],
    }),
    defineField({
      name: "locales",
      title: "Locales",
      type: "object",
      fields: [
        defineField({
          name: "zh",
          type: "object",
          fields: [
            defineField({ name: "title", type: "string" }),
            defineField({ name: "subtitle", type: "string" }),
            defineField({ name: "shortDescription", type: "text", rows: 3 }),
          ],
        }),
        defineField({
          name: "en",
          type: "object",
          fields: [
            defineField({ name: "title", type: "string" }),
            defineField({ name: "subtitle", type: "string" }),
            defineField({ name: "shortDescription", type: "text", rows: 3 }),
          ],
        }),
      ],
    }),
  ],
});
```

## `collectionPage`

```ts
import { defineField, defineType } from "sanity";
import { siteKeysField } from "./fields/siteKeysField";

export const collectionPageType = defineType({
  name: "collectionPage",
  title: "Collection Page",
  type: "document",
  fields: [
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "title",
      },
      validation: (Rule) => Rule.required(),
    }),
    siteKeysField,
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "subtitle", type: "string" }),
    defineField({ name: "description", type: "text", rows: 4 }),
    defineField({
      name: "heroImage",
      type: "string",
      description: "先按当前前端契约使用 string；后续可替换成 image 类型。",
    }),
    defineField({
      name: "introBlocks",
      type: "array",
      of: [{ type: "text" }],
    }),
    defineField({
      name: "featuredProducts",
      type: "array",
      of: [{ type: "string" }],
      description: "填商品 slug。",
    }),
    defineField({ name: "faqIds", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "guideIds", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "seo",
      type: "object",
      fields: [
        defineField({ name: "title", type: "string" }),
        defineField({ name: "description", type: "text", rows: 3 }),
      ],
    }),
  ],
});
```

## `guideArticle`

```ts
import { defineField, defineType } from "sanity";
import { siteKeysField } from "./fields/siteKeysField";

export const guideArticleType = defineType({
  name: "guideArticle",
  title: "Guide Article",
  type: "document",
  fields: [
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "title",
      },
      validation: (Rule) => Rule.required(),
    }),
    siteKeysField,
    defineField({
      name: "title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "excerpt",
      type: "text",
      rows: 3,
      validation: (Rule) => Rule.required(),
    }),
    defineField({ name: "coverImage", type: "string" }),
    defineField({
      name: "category",
      type: "string",
      options: {
        list: [
          { title: "Buying guide", value: "buying-guide" },
          { title: "Care", value: "care" },
          { title: "Long distance", value: "long-distance" },
          { title: "Discreet play", value: "discreet-play" },
          { title: "Education", value: "education" },
        ],
      },
    }),
    defineField({
      name: "body",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({ name: "relatedProductSlugs", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "relatedCollectionSlugs", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "seo",
      type: "object",
      fields: [
        defineField({ name: "title", type: "string" }),
        defineField({ name: "description", type: "text", rows: 3 }),
      ],
    }),
    defineField({
      name: "locales",
      type: "object",
      fields: [
        defineField({
          name: "zh",
          type: "object",
          fields: [
            defineField({ name: "title", type: "string" }),
            defineField({ name: "excerpt", type: "text", rows: 3 }),
          ],
        }),
        defineField({
          name: "en",
          type: "object",
          fields: [
            defineField({ name: "title", type: "string" }),
            defineField({ name: "excerpt", type: "text", rows: 3 }),
          ],
        }),
      ],
    }),
  ],
});
```

## `faqItem`

```ts
import { defineField, defineType } from "sanity";
import { siteKeysField } from "./fields/siteKeysField";

export const faqItemType = defineType({
  name: "faqItem",
  title: "FAQ Item",
  type: "document",
  fields: [
    siteKeysField,
    defineField({
      name: "question",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "answer",
      type: "text",
      rows: 5,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "category",
      type: "string",
      options: {
        list: [
          { title: "Product", value: "product" },
          { title: "Shipping", value: "shipping" },
          { title: "Returns", value: "returns" },
          { title: "Privacy", value: "privacy" },
          { title: "App control", value: "app-control" },
          { title: "Care", value: "care" },
        ],
      },
    }),
    defineField({ name: "targetType", type: "string" }),
    defineField({ name: "targetId", type: "string" }),
    defineField({
      name: "locales",
      type: "object",
      fields: [
        defineField({
          name: "zh",
          type: "object",
          fields: [
            defineField({ name: "question", type: "string" }),
            defineField({ name: "answer", type: "text", rows: 5 }),
          ],
        }),
        defineField({
          name: "en",
          type: "object",
          fields: [
            defineField({ name: "question", type: "string" }),
            defineField({ name: "answer", type: "text", rows: 5 }),
          ],
        }),
      ],
    }),
  ],
});
```

## schema 汇总示例

```ts
import { productContentType } from "./productContentType";
import { collectionPageType } from "./collectionPageType";
import { guideArticleType } from "./guideArticleType";
import { faqItemType } from "./faqItemType";

export const schemaTypes = [
  productContentType,
  collectionPageType,
  guideArticleType,
  faqItemType,
];
```

## 使用建议

- 先把 `siteKeys` 接进 Studio
- 保持“留空 = 全站点可见”
- 优先让 `productContent / collectionPage / guideArticle / faqItem` 对齐
- 如果后续要把图片、富文本、本地化做得更完整，再逐步替换文档里当前的最小字段版本
