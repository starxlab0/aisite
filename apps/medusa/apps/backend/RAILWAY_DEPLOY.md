# Medusa Backend 部署到 Railway

本目录用于把 `apps/medusa/apps/backend` 单独作为一个 Railway 服务部署。

## Root Directory

在 Railway 新建服务时，Root Directory 设为：

```txt
apps/medusa/apps/backend
```

这样 Railway 会直接读取本目录下的 `package.json` 和 `railway.json`。

## 运行方式

当前 `railway.json` 已配置：

- Build Command: `npm install --no-audit --no-fund && npm run build`
- Start Command: `npx medusa db:migrate && npm run start`

## Railway 需要的环境变量

至少配置：

```txt
NODE_ENV=production
PORT=3000
DATABASE_URL=<Railway Postgres 连接串>
REDIS_URL=<Railway Redis 连接串>
JWT_SECRET=<随机长字符串>
COOKIE_SECRET=<随机长字符串>
STORE_CORS=https://aisite-lyart.vercel.app
ADMIN_CORS=https://<railway-backend-domain>,http://localhost:9000
AUTH_CORS=https://aisite-lyart.vercel.app,https://<railway-backend-domain>
MEDUSA_WORKER_MODE=shared
```

如果后续接 Stripe provider，还需要继续加：

```txt
STRIPE_API_KEY=<Stripe secret key>
STRIPE_WEBHOOK_SECRET=<Stripe webhook secret>
```

## 部署后要做的事

1. 确认 `/health` 返回正常
2. 创建 publishable key
3. 创建 region
4. 创建 sales channel
5. 创建 shipping option
6. 导入或 seed 商品
7. 把以下变量回填到 `apps/web`

```txt
NEXT_PUBLIC_MEDUSA_URL=<Railway backend 域名>
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<publishable key>
NEXT_PUBLIC_MEDUSA_REGION_ID=<region id>
NEXT_PUBLIC_MEDUSA_COUNTRY_CODE=cn
NEXT_PUBLIC_MEDUSA_DEFAULT_REGION=cn
MEDUSA_API_KEY=<如需管理接口>
```

## 验收顺序

1. `/store/products` 可读
2. 前台 `/shop` 能看到真实商品
3. 商品页可加入购物车
4. 购物车能进 `/checkout`
5. Stripe checkout 能跳转
6. Stripe webhook 能回写订单为 `paid`
