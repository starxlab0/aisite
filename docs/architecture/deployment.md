# 部署说明

## 目标

将当前前台项目部署到 `Vercel`，并让它与以下外部服务协同：

- `Medusa`：商品、购物车、结账、订单
- `Sanity`：内容与页面文案
- 邮件与分析服务

## 一、Vercel 项目设置

### 推荐方式

在 `Vercel` 中创建项目时，将 **Root Directory** 指向：

```txt
apps/web
```

这样可以避免根目录同时存在 `apps/medusa` 时影响前台构建识别。

### 构建设置

如果 `Vercel` 自动识别 `Next.js`，通常无需额外改动。

默认：

- Install Command: `npm install`
- Build Command: `npm run build`
- Output: Next.js 默认输出

## 二、Vercel 环境变量

至少配置以下变量：

### Public

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | 前台正式域名 |
| `NEXT_PUBLIC_MEDUSA_URL` | Medusa Store API 域名 |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Medusa publishable key |
| `NEXT_PUBLIC_MEDUSA_DEFAULT_REGION` | 默认地区标识，如 `cn` |
| `NEXT_PUBLIC_MEDUSA_COUNTRY_CODE` | 默认国家码，如 `cn` |
| `NEXT_PUBLIC_MEDUSA_REGION_ID` | 可选，若已知 region id 可直接填写 |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Sanity project id |
| `NEXT_PUBLIC_SANITY_DATASET` | Sanity dataset |
| `NEXT_PUBLIC_GA_ID` | 可选 |
| `NEXT_PUBLIC_POSTHOG_KEY` | 可选 |

### Server

| 变量 | 说明 |
|---|---|
| `REVALIDATE_SECRET` | 触发 ISR 更新的密钥 |
| `SANITY_API_TOKEN` | Sanity server token |
| `MEDUSA_API_KEY` | 可选，管理端请求使用 |
| `RESEND_API_KEY` | 可选 |
| `KLAVIYO_API_KEY` | 可选 |
| `POSTHOG_SECRET` | 可选 |

可参考：

- `apps/web/.env.production.example`

## 三、Medusa 部署建议

前台部署在 `Vercel`，但 `Medusa` 不建议部署在 `Vercel Functions`。  
更适合部署在支持长期运行 Node 服务与数据库连接的环境，例如：

- Railway
- Render
- Fly.io
- ECS / 自有服务器
- 容器平台

### Railway（当前推荐）

本仓库已经补充了 Medusa backend 的 Railway 配置，建议直接把 Railway 服务的 **Root Directory** 指向：

```txt
apps/medusa/apps/backend
```

然后使用该目录下的：

- `railway.json`
- `RAILWAY_DEPLOY.md`

这样可以避免根目录现有的 `railway.json`（当前主要服务于 `control-plane`）误用于 Medusa backend。

### Medusa 至少需要

- PostgreSQL
- Redis
- Node 20+

## 四、域名与 CORS

部署后需要在 `Medusa` 环境中配置：

### Store CORS

允许前台正式域名，例如：

```txt
https://your-domain.com
```

### Auth CORS

同样允许前台正式域名。

如果未来有预览环境，也建议加入：

```txt
https://*.vercel.app
```

前提是你们确认只在内部或测试环境使用。

## 五、Sanity 与前台

`Sanity` 内容更新后，建议通过 webhook 调用前台：

```txt
/api/webhooks/sanity
```

再由前台触发 `revalidatePath` 或内部 `/api/revalidate` 刷新页面。

## 六、Medusa 与前台

当商品、价格、库存变更时，建议让 `Medusa` 调用：

```txt
/api/webhooks/medusa
```

后续在该路由中按变更内容刷新：

- `/shop`
- `/collection/[slug]`
- `/product/[slug]`

## 七、发布前检查

### 前台

- 首页可打开
- `/shop` 能看到商品
- `/product/[slug]` 能看到真实商品详情
- `Add to cart` 可用
- `/cart` 能看到当前 cart
- `/checkout` 能读取当前 cart

### Medusa

- Admin 可登录
- Publishable key 已创建
- 销售渠道已配置
- 商品已发布到 storefront 销售渠道
- region / currency / shipping option 已配置

### 内容

- Sanity 环境变量已配置
- FAQ / Guides / 分类页内容已配置

## 八、当前阶段的上线建议

当前最适合的上线顺序：

1. 先部署 `Medusa`
2. 在 `Medusa` 后台录入或 seed 测试商品
3. 配置前台 Vercel 环境变量
4. 部署 `apps/web`
5. 联调 `/shop`、`/product/[slug]`、`/cart`
6. 最后再接 checkout 的完整支付流程

## 九、当前代码已支持的部署前提

目前前台已支持：

- 无 `Medusa` 时 mock fallback
- 有 `Medusa` 时优先请求真实商品
- 商品页加入购物车 server action
- 购物车页读取当前 cart
- checkout 页面读取当前 cart 摘要

这意味着你们可以先部署前台并观察页面，再逐步切真数据和支付能力。
