# AI 原生内容运营系统

当前仓库已经不再只是站点与后端骨架，而是进入了“可运行的 AI 运营闭环样板 + 开始系统化平台收口”的阶段。最新阶段判断见 [项目检查点 2026-07-10](computer:///workspace/project-checkpoint-2026-07-10.md)。

## 当前包含的主要应用

- [前台站点 `apps/web`](computer:///workspace/apps/web)
- [AI 控制平面 `apps/control-plane`](computer:///workspace/apps/control-plane)
- [Medusa backend `apps/medusa`](computer:///workspace/apps/medusa)

以及平台化与架构文档：

- [架构文档索引 `docs/architecture/README.md`](computer:///workspace/docs/architecture/README.md)
- [平台化说明 `docs/architecture/platformization.md`](computer:///workspace/docs/architecture/platformization.md)
- [项目检查点 2026-07-10](computer:///workspace/project-checkpoint-2026-07-10.md)

## 当前阶段

从代码落地情况看，项目已经具备：

- 可运行的前台站点、商品、购物车、结账、订单与 ops 页面
- control-plane 内的 workflows、monitoring、recommendations、governance 主链
- recommendation → proposal → repo change / publish / rollback 的多条样板闭环
- 一条较完整的 SEO 运营闭环
- SEO 主线已经进入真实 Search Console 接入与最小自动化阶段
- 开始把高价值主线整理成 `domain + facade + compat layer + contract test`

更准确地说，当前不是“平台雏形”，而是已经进入“**有真实 AI ops 样板，并开始往长期可维护平台结构收口**”的阶段。

## 已落地的关键能力

### 站点与交易底座

- `apps/web` 已有较完整的营销站、商品页、分类页、guides、FAQ、支持页、ops 页
- `apps/medusa` 已具备本地联调所需的 backend、迁移、seed 与运行脚本
- 前台内容与交易分层已经明确：内容走 CMS，交易走 Medusa

### AI 运营主线

- signals 采集与 snapshots
- recommendation 自动生成与生命周期
- monitoring、runtime、health、audit、permissions
- proposal / follow-up / review summary / repo lane 样板
- 发布、校验、回滚、repo change、draft PR 同步

### SEO 闭环样板

当前 SEO 主线已经完成：

- metrics freshness
- Search Console 风格导入
- 真实 Search Console API 拉数
- 手动 sync 与 CLI sync
- 最小定时自动化入口
- 最近运行状态与 monitoring 告警
- unmapped page diagnostics
- target suggestion
- 单条 / 批量开 PR
- repo change / PR 去重
- PR 状态回流到 monitoring
- merged 后 replay latest import 验证
- latest import 视图收口

这条线已经形成一个真实的 AI-assisted ops 样板，而且不再只是“导入样板”，而是开始具备真实外部数据源和最小持续运行能力。

## 当前最值得关注的结构进展

最近一轮不是只在加功能，而是在做平台收口。以 SEO 主线为例，已经完成：

- 从 `store.js` 中抽出独立 `seo-domain.js`
- 将 monitoring snapshot、alerts、recommendation candidates、SEO/GEO summary 下沉到 domain
- 建立 `seoOps` facade
- 保留旧细粒度导出作为 compat layer
- 增加 `seoOpsContract` 与 contract 方向测试

同时，主线又新增了真实接入层：

- `src/ops/search-console.js`
- `src/ops/seo-search-console-sync.js`
- `POST /ops/seo-metrics/sync-search-console`
- `npm run seo:sync:search-console`
- `runtime.seoSync` 运行态

这说明项目已经开始从“功能闭环”走向“领域边界清晰、可长期演进”的平台状态。

## 建议阅读顺序

1. 先读 [项目检查点 2026-07-10](computer:///workspace/project-checkpoint-2026-07-10.md)
2. 再读 [架构文档索引 `docs/architecture/README.md`](computer:///workspace/docs/architecture/README.md)
3. 然后看 [AI 控制平面 `apps/control-plane`](computer:///workspace/apps/control-plane)
4. 最后看 [前台站点 `apps/web`](computer:///workspace/apps/web) 和 [Medusa backend `apps/medusa`](computer:///workspace/apps/medusa)

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

## 下一步重点

当前最合理的下一步不再是重新证明 SEO 能不能跑，而是：

1. 继续把 SEO 的真实自动接入推进到更稳定的运行系统
2. 把第三条高价值主线补到 facade / contract 层，例如：

- `payment / fulfillment / refund result governance`
