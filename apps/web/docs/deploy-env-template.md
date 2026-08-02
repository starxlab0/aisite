# 站点独立部署 env 模板

这份文档把 `apps/web` 当前实际用到的环境变量按部署场景分成 4 类：

- 站点识别
- 站点 URL
- 商业后端 / 内容后端
- 增长 / 邮件 / 支付 / 运维

适用于：

- 同一套代码
- 不同站点分别部署
- 每个部署实例固定绑定一个 `SITE_KEY`

## 必填：站点识别

每个站点部署都必须配置：

```env
SITE_TENANT_KEY=xiao
SITE_BRAND_KEY=brand
SITE_KEY=cn-store
SITE_DEFAULT_LOCALE=en
```

说明：

- `SITE_TENANT_KEY`
  - 当前部署使用哪个 tenant
- `SITE_BRAND_KEY`
  - 当前部署使用哪个 brand
- `SITE_KEY`
  - 当前部署绑定哪个 site
- `SITE_DEFAULT_LOCALE`
  - 当前站点默认 locale；不配置时会回退到 `en`

## 必填：站点 URL

这 3 个建议始终保持一致：

```env
NEXT_PUBLIC_SITE_URL=https://cn.example.com
SITE_BASE_URL=https://cn.example.com
SITE_URL=https://cn.example.com
```

说明：

- `NEXT_PUBLIC_SITE_URL`
  - 前台公开使用；SEO、客户端和部分支付回跳逻辑会读
- `SITE_BASE_URL`
  - 服务端 absolute URL 备用
- `SITE_URL`
  - 服务端 absolute URL 备用

## 商业后端：Medusa

如果站点需要真实商品、购物车、下单，建议配置：

```env
NEXT_PUBLIC_COMMERCE_MODE=medusa
NEXT_PUBLIC_MEDUSA_URL=https://medusa.example.com
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_xxx
NEXT_PUBLIC_MEDUSA_DEFAULT_REGION=reg_xxx
NEXT_PUBLIC_MEDUSA_REGION_ID=reg_xxx
NEXT_PUBLIC_MEDUSA_COUNTRY_CODE=cn
MEDUSA_API_KEY=msk_xxx
```

说明：

- 前缀 `NEXT_PUBLIC_` 的变量会进入前台
- `MEDUSA_API_KEY` 只在服务端使用

建议：

- 如果不同站点对应不同市场和价格体系，`REGION_ID / COUNTRY_CODE` 建议按站点独立
- 如果多个站点共用一个 Medusa 后端，也至少要按站点区分 region

## 内容后端：Sanity

如果站点使用 CMS 内容，建议配置：

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=sanity_token
```

建议：

- 如果多个站点共用同一个内容库，可以先共用 project/dataset
- 如果未来不同站点内容差异很大，建议按 dataset 或内容模型中的 site 维度隔离

## 支付：Stripe

如果站点启用 Stripe 结账，需要配置：

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

建议：

- 如果不同站点对应不同 Stripe account，务必按站点独立配置
- 即使共用 Stripe，也要确认 `SITE_URL` 正确，否则回跳地址会串站

## 邮件 / 增长

### 欢迎邮件：Resend

```env
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=hello@cn.example.com
RESEND_REPLY_TO_EMAIL=support@cn.example.com
```

建议按站点独立：

- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO_EMAIL`

### PostHog

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_SECRET=phs_xxx
```

建议：

- 可以共用一个 PostHog project
- 但最好在事件里继续带上 `siteId / marketCode`

### Google Analytics

```env
NEXT_PUBLIC_GA_ID=G-XXXXXXX
```

如果不同站点要分开统计，建议按站点独立 GA property。

### Klaviyo

```env
KLAVIYO_API_KEY=pk_xxx
```

如果邮件营销受站点或市场隔离，建议按站点单独配置。

## 运维 / 管理

```env
REVALIDATE_SECRET=xxx
CONTROL_PLANE_URL=https://ops.example.com
OPS_ADMIN_TOKEN=xxx
SIGNALS_INGEST_TOKEN=xxx
```

说明：

- `REVALIDATE_SECRET`
  - 内容刷新接口使用
- `CONTROL_PLANE_URL`
  - ops / control-plane 交互使用
- `OPS_ADMIN_TOKEN`
  - 后台管理令牌
- `SIGNALS_INGEST_TOKEN`
  - 信号采集令牌

如果 `OPS_ADMIN_TOKEN` 已配置，当前代码会优先用它作为 `signalsIngestToken`。

## AI / 实验

```env
NEXT_PUBLIC_AI_CONCIERGE_ENABLED=true
NEXT_PUBLIC_AI_CONCIERGE_EXPERIMENT=ai_concierge_v1
```

建议：

- 如果某些站点不想开放 AI 问答入口，可以直接关闭
- 如果不同站点想跑不同实验，可以按站点配置不同 experiment 名称

## 按站点建议独立的 env

这些变量最建议每个站点部署单独配置：

- `SITE_KEY`
- `SITE_DEFAULT_LOCALE`
- `NEXT_PUBLIC_SITE_URL`
- `SITE_BASE_URL`
- `SITE_URL`
- `RESEND_FROM_EMAIL`
- `RESEND_REPLY_TO_EMAIL`
- `NEXT_PUBLIC_MEDUSA_REGION_ID`
- `NEXT_PUBLIC_MEDUSA_COUNTRY_CODE`
- `NEXT_PUBLIC_GA_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## 可以先共用的 env

在早期阶段，这些可以先共用：

- `SITE_TENANT_KEY`
- `SITE_BRAND_KEY`
- `NEXT_PUBLIC_SANITY_PROJECT_ID`
- `NEXT_PUBLIC_SANITY_DATASET`
- `SANITY_API_TOKEN`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `POSTHOG_SECRET`
- `CONTROL_PLANE_URL`

## 推荐做法

建议为每个站点单独维护一份部署模板，例如：

- `docs/env.cn-store.example`
- `docs/env.us-store.example`
- `docs/env.jp-store.example`

部署时直接复制对应模板，再替换密钥和值。
