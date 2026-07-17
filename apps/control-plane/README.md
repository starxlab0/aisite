# control-plane

`apps/control-plane` 已经不只是“第一版应用骨架”，而是当前仓库里 AI 运营闭环、监控、治理和自动推进样板最集中的地方。它既承载内容工作流，也承载 signals、recommendations、monitoring、repo lane、publish / rollback 和部分自动化治理能力。

## 当前定位

control-plane 的职责已经可以概括为：

- 接收来自站点、交易、内容与运营侧的信号
- 汇总为 monitoring summary 与 recommendation
- 为内容生成、审核、发布、回滚提供统一编排入口
- 推动 proposal、repo change、follow-up、observation 这类 AI ops 样板链路
- 为长期平台化提供 domain、facade、contract 的收口位置

它现在更接近“AI 原生内容运营系统的执行与治理中枢”，而不是单纯的 workflow demo 服务。

## 当前已落地的关键能力

### 内容工作流

已经具备较完整的内容工作流链路：

- `FAQ expansion`
- `collection rewrite`
- `product rewrite`
- guide / publish 相关配套能力
- preview、review、publish、rollback

同时已具备 CMS adapter 边界：

- `CMS_ADAPTER=local`
- `CMS_ADAPTER=sanity`

当使用 `sanity` adapter 时，至少需要：

- `SANITY_PROJECT_ID` 或 `NEXT_PUBLIC_SANITY_PROJECT_ID`
- `SANITY_DATASET` 或 `NEXT_PUBLIC_SANITY_DATASET`
- `SANITY_API_TOKEN`

## monitoring / governance / ops

当前 control-plane 已经包含一条较完整的运营与治理主链：

- monitoring summary
- runtime health / dependency probe
- audit
- permissions
- recommendation lifecycle
- follow-up / observation summary
- auto-action policy
- rollback policy
- repo change / PR sync

这些能力主要集中在：

- `src/ops/monitoring.js`
- `src/ops/store.js`
- `src/ops/router.js`
- `src/ops/github.js`
- `src/ops/rollback-policy.js`
- `src/ops/auto-action-policy.js`

## 已运行的 AI ops 样板

当前已经不只是“能生成 recommendation”，而是存在几条真实闭环样板：

- publishing anomaly → follow-up / revert candidate
- AI concierge funnel recommendation → proposal → repo lane
- purchase / checkout / commerce journey 治理样板
- SEO target registration 闭环

### SEO 闭环样板

目前 SEO 主线已经形成较完整链路：

- metrics freshness
- Search Console 风格导入
- 真实 Search Console API 拉数
- 手动 sync 入口
- CLI sync 入口
- 最小定时自动化入口
- 最近运行状态持久化
- sync 失败 / 未配置的 monitoring 告警
- unmapped page diagnostics
- target suggestion
- 单条 / 批量开 PR
- repo change / draft PR 去重
- PR 状态回流到 monitoring
- merged 后 replay latest import 验证
- latest import 视图收口

这是当前 control-plane 中最完整的一条 AI-assisted ops 样板，而且已经从“内部闭环”推进到了“真实外部数据接入 + 最小自动化”阶段。

## 当前结构进展

最近一轮工作已经开始把高价值主线从“大文件逻辑”整理成更稳定的领域结构。

以 SEO 线为例，已经完成：

- 从 `src/ops/store.js` 中抽出 `src/ops/seo-domain.js`
- 将 monitoring snapshot、alerts、recommendation candidates、SEO/GEO summary 下沉到 domain
- 建立 `seoOps` facade
- 保留旧细粒度导出作为 compat layer
- 新增 `seoOpsContract`
- 为 facade / contract 补测试

而在主线推进上，又新增了：

- `src/ops/search-console.js`
- `src/ops/seo-search-console-sync.js`
- `POST /ops/seo-metrics/sync-search-console`
- `npm run seo:sync:search-console`
- `runtime.seoSync` 与对应 monitoring alerts

这意味着 control-plane 已经进入“功能闭环之后的结构收口”阶段。

## 目录关注点

建议重点关注：

- `src/ops/`
  - monitoring、repo lane、SEO domain、router、治理策略
- `src/signals/`
  - 事件、规则、batch、store、策略注册
- `src/workflows/`
  - FAQ、collection、product 等内容工作流
- `src/publish/`
  - publish、verify、rollback、revalidate

## Search Console 配置

当前 control-plane 已支持通过 service account 拉 Search Console Search Analytics 数据。最小配置项在 `.env.example` 中已经给出，核心包括：

- `SEARCH_CONSOLE_SITE_URL`
- `SEARCH_CONSOLE_SERVICE_ACCOUNT_EMAIL`
- `SEARCH_CONSOLE_PRIVATE_KEY`
- `SEARCH_CONSOLE_SYNC_ENABLED`
- `SEARCH_CONSOLE_SYNC_INTERVAL_MINUTES`
- `SEARCH_CONSOLE_SYNC_RUN_ON_START`

可用方式包括：

- 手动调用 `POST /ops/seo-metrics/sync-search-console`
- 本地执行 `npm run seo:sync:search-console`
- 启用最小定时自动化，让 control-plane 在启动后按固定间隔拉数

## 当前最值得继续推进的方向

当前最自然的延续有两条：

1. 把 SEO 真实自动接入继续推进到更稳定的运行系统
   - 最近 N 次 sync 历史
   - 失败恢复
   - 更完整的运行视图

2. 把第三条高价值主线继续补到 facade / contract 层，例如：

- `payment / fulfillment / refund result governance`

## 相关文档

- [项目检查点 2026-07-10](computer:///workspace/project-checkpoint-2026-07-10.md)
- [架构文档索引](computer:///workspace/docs/architecture/README.md)
