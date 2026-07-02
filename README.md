# Workspace Overview

当前工作区包含两个主要应用：

- [前台站点 `apps/web`](computer:///workspace/apps/web)
- [Medusa backend `apps/medusa`](computer:///workspace/apps/medusa)

以及项目架构文档：

- [架构文档索引 `docs/architecture/README.md`](computer:///workspace/docs/architecture/README.md)
- [部署说明 `docs/architecture/deployment.md`](computer:///workspace/docs/architecture/deployment.md)

## 建议阅读顺序

1. 先看架构文档
2. 再看前台 `apps/web`
3. 再看 `apps/medusa/README.local.md`

## 本地开发

### 一键准备

在根目录执行：

```bash
cd /workspace
npm run bootstrap
```

它会完成：

- 创建 `apps/medusa/apps/backend/.env`
- 创建 `apps/web/.env.local`
- 安装 `web` 和 `medusa` 的依赖
- 启动本地 `Postgres / Redis`

### 前台

```bash
cd /workspace/apps/web
npm install
npm run dev
```

### Medusa backend

```bash
cd /workspace/apps/medusa
npm run infra:up
cp apps/backend/.env.template apps/backend/.env
npm install
npm run backend:migrate
npm run backend:user -- -e admin@example.com -p supersecret
npm run backend:seed:local
npm run backend:dev
```

### 一键同时启动前台和 backend

```bash
cd /workspace
npm run dev:all
```

## 当前状态

- 前台已经有可运行的路由骨架
- 商品读取层支持 mock fallback
- Medusa backend 已生成并做了本地联调适配
- 下一阶段是录入测试商品并把 `/shop`、`/product/[slug]` 切成真实数据
