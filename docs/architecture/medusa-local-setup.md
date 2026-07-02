# Medusa 本地接入说明

## 当前目录

官方脚手架已生成在：

- `apps/medusa`

其中真正的 backend 位于：

- `apps/medusa/apps/backend`

这是官方 DTC starter 的标准结构，当前我们只使用其中的 backend 部分。

## 已完成的本地适配

目前已经做过这些调整：

- `STORE_CORS` 已改为允许前台 `http://localhost:3000`
- `AUTH_CORS` 已改为允许前台 `http://localhost:3000`
- 前台 `apps/web/.env.example` 已新增：
  - `NEXT_PUBLIC_MEDUSA_URL`
  - `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_MEDUSA_DEFAULT_REGION`
- 前台请求 `src/lib/commerce/http.ts` 已支持自动附带：
  - `x-publishable-api-key`
  - `x-region`

## 本地运行前提

至少需要：

- Node.js 20+
- PostgreSQL
- 建议有 Redis（starter 默认保留 `REDIS_URL` 配置）

## 第一步：配置数据库

编辑：

- `apps/medusa/apps/backend/.env`

补上：

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/medusa_backend
```

数据库名可以自定义，但需要提前创建。

## 第二步：安装并启动 backend

在 `apps/medusa` 目录执行：

```bash
npm install
npm run backend:dev
```

如果只想在 backend 目录直接执行，也可以：

```bash
cd apps/backend
npm install
npm run dev
```

默认启动后，Medusa backend 地址通常是：

```txt
http://localhost:9000
```

管理后台通常在：

```txt
http://localhost:9000/app
```

## 第三步：跑迁移

如果数据库是新建的，需要先执行迁移：

```bash
cd apps/medusa/apps/backend
npm exec medusa db:migrate
```

## 第四步：创建管理员

```bash
cd apps/medusa/apps/backend
npm exec medusa user -e admin@example.com -p supersecret
```

完成后即可登录：

- `http://localhost:9000/app`

## 第五步：创建 Publishable API Key

在 Medusa Admin 中：

- 进入设置
- 创建 `Publishable API Key`
- 将该 key 与需要暴露给 storefront 的销售渠道关联

创建后，把 key 填到前台：

- `apps/web/.env.local`

```env
NEXT_PUBLIC_MEDUSA_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_xxx
NEXT_PUBLIC_MEDUSA_DEFAULT_REGION=cn
NEXT_PUBLIC_MEDUSA_COUNTRY_CODE=cn
NEXT_PUBLIC_MEDUSA_REGION_ID=
```

如果你已经知道 Medusa 中具体的 `region_id`，建议一并填写，这样前台拿到的价格上下文会更稳定。

## 第六步：启动前台

在 `apps/web` 目录执行：

```bash
npm run dev
```

前台默认在：

```txt
http://localhost:3000
```

## 当前前台对接状态

### 已完成

- `/shop` 可从 `lib/commerce/products.ts` 取商品列表
- `/product/[slug]` 可从 `lib/commerce/products.ts` 取商品详情
- 前台请求会自动附带 `x-publishable-api-key`
- 前台会自动带 `country_code` / `region_id` 价格上下文参数（如果已配置）
- 若 `NEXT_PUBLIC_MEDUSA_URL` 未配置，则自动回退到 mock 数据

### 下一步需要做

- 用真实 Medusa 返回结构替换当前 `metadata` 映射假设
- 处理 region / price set 的真实价格结构
- 接通 cart / checkout / order
- 接通 publishable key 对应销售渠道和库存范围

## 建议的联调顺序

1. 跑起 Medusa backend
2. 能登录 admin
3. 建一个销售渠道
4. 建一个 publishable key
5. 录入 3 个测试商品
6. 配置前台 `.env.local`
7. 打开 `/shop` 和 `/product/[slug]` 看真实返回

## 推荐首批测试商品

- `口口舱X`
- `海狸`
- `含豆`

## 备注

当前实现是“先可跑，再逐步对齐真实接口”。  
也就是说：

- 前台结构已经按长期方案搭好
- Medusa 也已经起了官方 backend 骨架
- 下一阶段重点是把 mock 切成真实数据，而不是重写结构
