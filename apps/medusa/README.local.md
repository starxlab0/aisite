# Medusa 本地运行

## 目录

- `apps/backend`：Medusa backend
- `docker-compose.dev.yml`：本地 Postgres / Redis

## 快速开始

在仓库根目录可先执行：

```bash
cd /workspace
npm run bootstrap
```

如果你只想单独操作 Medusa，也可以在 `apps/medusa` 目录下执行：

```bash
npm run infra:up
cp apps/backend/.env.template apps/backend/.env
npm install
npm run backend:migrate
npm run backend:user -- -e admin@example.com -p supersecret
npm run backend:seed:local
npm run backend:dev
```

启动后：

- Backend: `http://localhost:9000`
- Admin: `http://localhost:9000/app`

## 本地测试数据

如需一键灌入测试商品，可执行：

```bash
npm run backend:seed:local
```

这个脚本会创建：

- Sales Channel
- Publishable API Key
- China region
- 默认运费
- 3 个测试商品：
  - `口口舱X`
  - `海狸`
  - `含豆`

字段规范见：

- `docs/architecture/medusa-test-products.md`

## 与前台联调

在 `apps/web/.env.local` 中配置：

```env
NEXT_PUBLIC_MEDUSA_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=
NEXT_PUBLIC_MEDUSA_DEFAULT_REGION=cn
NEXT_PUBLIC_MEDUSA_COUNTRY_CODE=cn
NEXT_PUBLIC_MEDUSA_REGION_ID=
```

其中：

- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` 需要在 Admin 中创建
- `NEXT_PUBLIC_MEDUSA_REGION_ID` 可选，若已知 region id 可填写
- `NEXT_PUBLIC_MEDUSA_COUNTRY_CODE` 用于商品价格与税区上下文

## 停止基础设施

```bash
npm run infra:down
```
