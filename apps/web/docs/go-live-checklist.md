# 正式上线清单（多站点）

这份清单用于把当前仓库内能力落到“可上线”的最小闭环。

## A. 必要环境变量与连接

### Web 站点（每个站点一套部署）

- `SITE_TENANT_KEY`
- `SITE_BRAND_KEY`
- `SITE_KEY`
- `SITE_DEFAULT_LOCALE`
- `NEXT_PUBLIC_SANITY_PROJECT_ID`
- `NEXT_PUBLIC_SANITY_DATASET`
- `NEXT_PUBLIC_MEDUSA_URL`（若使用 Medusa）
- `NEXT_PUBLIC_MEDUSA_REGION_ID`
- `NEXT_PUBLIC_MEDUSA_COUNTRY_CODE`
- `NEXT_PUBLIC_COMMERCE_MODE`（可选：`mock`）
- `SITE_URLS_BY_SITE_KEY`（可选：JSON，用于 GEO 推荐跳转，例如 `{"cn-store":"https://cn.example.com","us-store":"https://us.example.com","jp-store":"https://jp.example.com"}`）

### Control-plane（发布侧）

- `CONTROL_PLANE_URL`
- `OPS_ADMIN_TOKEN`
- `SANITY_PROJECT_ID`
- `SANITY_DATASET`
- `SANITY_API_TOKEN`
- `WEB_BASE_URL`（用于 publish verify）

## B. CMS schema 与数据

### 1) Studio/schema 接入

把下列文档内容落到 Sanity Studio/schema：

- `docs/cms-site-keys-schema.md`
- `docs/cms-site-keys-schema-examples.md`

验收：Studio 中可编辑 `siteKeys`，且值受限于 `cn-store/us-store/jp-store`。

### 2) 历史内容补齐 siteKeys

优先补齐：

- `productContent`
- `collectionPage`
- `guideArticle`
- `faqItem`

如果想用脚本补齐（需要 `SANITY_API_TOKEN`）：

```bash
node apps/control-plane/src/tools/backfill-site-keys.js --dry-run --file apps/control-plane/src/tools/backfill-site-keys.sample.json
node apps/control-plane/src/tools/backfill-site-keys.js --apply --file /path/to/your-backfill.json
```

## C. 商品系统数据

### Medusa 商品 metadata.siteKeys

确保所有上架商品都有 `metadata.siteKeys`：

- 未设置：默认全站可见（风险：容易串站）
- 设置：只在对应站点可见

建议：上线前至少把“当前会展示在 /shop 的商品”全部补齐。

## D. 上线验收（每个站点都要过）

### 1) 基础访问

- `/` 首页可访问
- `/shop` 商品列表符合站点预期
- `/collection/first-time` 等核心合集可访问

### 2) feature gating

对当前站点关闭的 feature：

- 导航入口不可见
- 路由访问 `notFound`
- `sitemap.xml` 不包含相关路径

### 3) 内容与商品隔离

抽样验证（每个站点至少 3 个样本）：

- 不属于本站点的 `guide / faq / productContent / collection` 不可见
- 不属于本站点的商品不出现在 `/shop`，且 `/product/[slug]` 也拿不到

### 4) ops 发布链路（至少走一次）

- 在 ops 生成 draft（应自动继承 `siteKeys: [currentSiteKey]`）
- 编辑 `featuredProductSlugs / ctaLinks`
- 发布并通过 verify

### 5) GEO（可选，但建议上线前配置）

- 访问站点时能写入 `geo_country / geo_recommended_site` cookie（由 CDN header 驱动）
- 若配置了 `SITE_URLS_BY_SITE_KEY`，站点 header 会提示“推荐切换站点”

## E. 预计上线前最小闭环

只要满足：

1. Studio/schema 接入完成
2. 核心内容补齐 `siteKeys`
3. 核心商品补齐 `metadata.siteKeys`
4. 每站点通过 D 的抽样验收

即可进入“正式上线”状态。
