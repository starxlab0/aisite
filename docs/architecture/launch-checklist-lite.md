# 上线前最后检查单

这是一版适合上线当天照着走的短检查单，只保留最关键、最容易阻断上线的项目。

## 1. 环境变量

- `Vercel` 已填写前台必需变量
- `NEXT_PUBLIC_SITE_URL` 指向正式域名
- `NEXT_PUBLIC_MEDUSA_URL`、`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` 已配置
- `SANITY_API_TOKEN`、`REVALIDATE_SECRET` 已配置
- 如果要启用增长与邮件：`NEXT_PUBLIC_POSTHOG_KEY`、`NEXT_PUBLIC_POSTHOG_HOST`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`RESEND_REPLY_TO_EMAIL` 已配置

## 2. 商品与内容

- `/shop` 能看到真实商品
- 至少 1 个商品页能打开并展示真实价格、FAQ、购买说明
- 首页、FAQ、collection、guide 页面没有明显“占位 / 骨架 / TODO”字样
- `Sanity` 中已经有要展示的 FAQ 或导购内容

## 3. 购买链路

- 商品页 `Add to cart` 可用
- `/cart` 能看到当前购物车内容
- `/checkout` 能正常读取购物车摘要
- 如果已启用 Stripe：至少完成一次真实或测试支付闭环

## 4. Webhook 与刷新

- `Sanity webhook` 已指向前台刷新接口
- 商品或库存变更后，前台页面能刷新到新内容
- 订单快照链路可用，且远端存储优先逻辑已部署

## 5. 增长与邮件

- 在 footer 提交测试邮箱后，`/api/newsletter/subscribe` 返回成功
- `PostHog` 中能看到 `subscribe_newsletter`
- 测试邮箱能收到 welcome email
- 完成一次 `/quiz` 后，`PostHog` 中能看到 `complete_quiz`

## 6. 最后 5 分钟

- 首页、商店页、商品页、购物车页、结账页各手动点一遍
- 手机和桌面至少各看一次首页与商品页
- 确认 Vercel 最新 deployment 为成功状态
- 保留一条回滚路径：最近一个稳定 deployment 或最近一个稳定 PR

## 7. 不满足时的处理顺序

1. 先修购买链路
2. 再修环境变量与 webhook
3. 最后再补内容与增长项

如果上线当天时间紧，只要前 4 节通过，站点就已经具备可上线的最低条件。
