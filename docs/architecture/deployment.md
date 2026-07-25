# 部署说明

## Web

`apps/web` 需要配置至少以下环境变量：

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_MEDUSA_URL`
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`（若启用正式支付）
- `MEDUSA_WEBHOOK_SECRET`
- `CONTROL_PLANE_URL`
- `OPS_BEARER_TOKEN`
- `REVALIDATE_SECRET`
- `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`（若启用增长）
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_REPLY_TO_EMAIL`（若启用邮件）

## Control Plane

`apps/control-plane` 需要能持久化本地状态文件，并对以下能力开放：

- `/ops/*`
- `/signals/*`
- order snapshot 存储
- preview token resolve / revoke
- repo change / monitoring / alerts

如果 storefront 需要恢复订单状态，`CONTROL_PLANE_URL` 必须可从 web 侧访问。

## Medusa

Medusa 需要：

- 可访问数据库
- `REDIS_URL`
- 正常运行 migrations
- 配置 webhook，把订单支付状态推送到 web

如果部署在 Railway，当前 backend 需要保留：

- `medusa-config.ts`
- `medusa-config.js`
- `instrumentation.js`
- `railway.json`

并在构建时把 admin 输出复制到 `public/admin`。
