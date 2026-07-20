# 项目检查点

日期：2026-07-12

## 当前阶段判断

项目已经明显超过“平台骨架”阶段，进入到“可运行的 AI 运营闭环样板 + 开始系统化平台收口”的阶段。

如果按文档口径看，当前顶层 `README.md` 和 `apps/control-plane/README.md` 已经基本跟上进度，但部分架构文档与较早的 checkpoint 仍偏早期，更多还在描述：

- 前台与后端骨架
- control-plane 初版能力
- 第一批平台化目录边界

但从当前代码落地情况看，实际进展已经更靠前：

- 运营工作台最小闭环已完成
- recommendation / monitoring / governance 主链已跑通
- 发布、回滚、repo change、follow-up、auto-action 已形成多条样板闭环
- SEO 主线已经具备完整的发现、建议、修复、验证、收口流程
- SEO 领域已经完成一轮 `domain + facade + compat layer + contract test` 的结构收口
- SEO 主线已经从“内部闭环”推进到“真实 Search Console 接入 + 最小自动化 + 运行可见性”
- commerce / purchase / funnel 主线也已经进入同样的结构收口阶段

一句话判断：

> 当前项目不是“只有平台雏形”，而是已经进入“有真实 AI ops 样板能力，并开始整理成长期可维护平台结构”的阶段。

## 相比 2026-07-01 的新增进展

`project-checkpoint-2026-07-01.md` 的判断整体仍然成立，但已经落后于最近这轮主线推进。最近新增的关键进展主要集中在 SEO 主线的真实自动接入、commerce 主线和结构整理。

### SEO 运营闭环

目前已经完成：

- `SEO metrics freshness`
- Search Console 风格导入
- `seoImportDiagnostics`
- unmapped page 检测
- canonical path 的 target suggestion
- 单条 `Open PR`
- 批量 `Open PRs (N)`
- repo change / draft PR 去重
- PR 状态回流到 monitoring
- merged 项从 active gap 中退出
- `Replay latest import`
- replay 后按 latest import 口径收口
- 真实 Search Console API 拉数
- 手动 sync 入口
- CLI sync 入口
- 最小定时自动化入口
- 最近运行状态持久化
- sync 失败 / 未配置的 monitoring 告警

这意味着 SEO 这条线已经形成：

1. 发现问题
2. 识别缺口
3. 给出注册建议
4. 发起 repo change / PR
5. 跟踪 PR / merge 状态
6. merged 后重放导入做验证
7. 从当前问题视图中消失

这条链已经是一个真实的 AI-assisted ops 闭环样板。

更重要的是，SEO 这条线现在已经不只是“支持 Search Console 风格导入”，而是开始具备一个真实外部数据源的最小运行闭环：

1. Search Console API 拉数
2. 导入既有 `seoOps` contract
3. 写入 replay / diagnostics / monitoring
4. 通过 CLI 或手动路由触发
5. 通过最小定时入口持续运行
6. 将最近运行状态、连续失败、未配置状态暴露到 monitoring

### SEO 平台化收口

除了功能闭环，最近还完成了一轮明显的结构整理：

- 从 `apps/control-plane/src/ops/store.js` 中抽出 `seo-domain.js`
- 将 SEO monitoring snapshot / alerts 下沉到 domain
- 将 SEO recommendation candidates 下沉到 domain
- 将 SEO/GEO recommendation summary 下沉到 domain
- 建立 `seoOps` facade
- 让 `router.js` 与 `monitoring.js` 优先走 `seoOps`
- 保留旧细粒度导出作为 compat layer
- 新增 `seoOpsContract`
- 为 facade / contract 补回归测试

这标志着项目开始从“功能闭环”走向“领域边界清晰、可长期演进”的平台状态。

### Commerce / purchase / funnel 平台化收口

最近这一轮已经把第二条高价值主线也往和 SEO 相同的方法上推进了。

目前已经完成：

- 抽出 `apps/control-plane/src/ops/commerce-domain.js`
- 将 `purchase diagnostics summary` 下沉到 domain
- 将 `checkout funnel summary` 下沉到 domain
- 将 weak checkout source recommendation candidate 下沉到 domain
- 将 `purchase / checkout alerts` 下沉到 domain
- 将 `checkout_completion_dropoff` 对应的 incident proposal candidate 下沉到 domain
- 将 `applied + risk` 后的 observation follow-up candidate 下沉到 domain
- 建立 `commerceOps` facade
- 新增 `commerceOpsContract`
- 保留细粒度导出作为 compat layer
- 为 facade / contract 补回归测试

这意味着 `commerce / purchase / funnel` 已经不再只是 `monitoring.js` 里的一组规则，而是开始形成：

- domain
- facade
- compat layer
- contract test

更重要的是，这证明之前在 SEO 线上跑通的结构收口方法已经可以复制到第二条高价值主线上。

## 当前已落地的关键能力

### 内容工作流

- `product / collection / faq` 的生成、审核、发布、回滚主链
- preview token 工作流
- diff、发布结果、校验与回滚增强
- repo change / PR draft 生成与同步

### signals / recommendations / governance

- 前台事件采集
- signals 聚合与 snapshots
- recommendation 自动生成
- recommendation 生命周期
- follow-up / observation / review summary
- auto-action policy / rollback policy
- audit、runtime、health、ops 首页运行态摘要

### 业务结果型监控

已经不再只看页面行为，还包括：

- payment result
- fulfillment result
- refund result
- customer notification intents
- support cases
- commerce checkout funnel
- AI concierge funnel

最近又往前推进了一步：`payment / fulfillment / refund result governance` 已经抽出第一版 `result-governance-domain`，完成了 summary、alerts，以及 payment / fulfillment proposal / observation candidate 的初步下沉。

### AI 运营主线样板

当前已经有多条可运行样板：

- SEO target registration 闭环
- AI concierge funnel recommendation → proposal → repo lane 样板
- purchase / checkout / follow-up 治理样板
- publishing anomaly → follow-up / revert candidate 样板

其中 SEO 与 commerce 两条线都已经开始形成“发现问题 → recommendation / proposal → follow-up / observation → 结构化收口”的双样板格局，而 SEO 还进一步进入了真实外部接入与最小自动化阶段。

## 目前最准确的整体进度判断

如果分成几条主线来看，可以这样判断。

### 1. 站点与交易底座

完成度较高，已经不是“只有路由骨架”：

- `apps/web` 路由比较完整
- `apps/medusa` 已进入本地联调可用状态
- 商品、购物车、结账、订单、FAQ、guides、ops 等页面链路都已存在

这一块可以认为已超过“首期可上线骨架”。

### 2. AI 运营闭环

这是目前进展最好的部分。

不仅有：

- recommendation
- monitoring
- proposals
- repo change
- publish / rollback

而且已经出现了真正的“自动发现问题 → 自动起草动作 → 人审核 → 系统继续观察”的闭环样板。

### 3. 平台化与长期维护结构

这部分正在从中段往上走。

最近 SEO 与 commerce 两条线已经共同证明，这套模式可行：

- 先跑出主线能力
- 再抽 domain
- 再建 facade
- 再保留 compat layer
- 最后补 contract test

这说明项目已经不只是把“单条成功样板”整理顺，而是开始具备把成功路径复制到多条主线、沉淀为“平台方法”的能力。

## 仍然存在的主要缺口

### 1. 文档口径落后于代码

当前最明显的问题之一仍然是文档没有全部跟上代码。

不过这里的情况已经比上一版好一些。根目录 `README.md` 和 `apps/control-plane/README.md` 会在这一轮同步后基本跟上当前口径，当前更偏旧的主要是：

- 一部分架构说明
- 较早的 checkpoint /阶段说明
- 尚未同步到第三条高价值主线与 SEO 自动化进展的说明文本

这些文档还没有完整反映：

- recommendation / governance 主链成熟度
- SEO 闭环样板
- `seoOps` / `commerceOps` 这类 domain/facade 收口

### 2. 自动化第二阶段还没真正完成

虽然已经有自动 recommendation、auto-draft PR、repo lane、follow-up 样板，而且 SEO 已经具备 Search Console 的最小自动化入口，但更完整的第二阶段自动化仍未完全收口，例如：

- recommendation 到 draft 的稳定批量自动化
- recommendation 与处理效果之间更普适的自动复盘
- 外部真实数据源的失败恢复、历史运行视图和更强告警

### 3. 第三条高价值主线还没完成 facade / contract 收口

SEO 与 commerce 两条线已经都走到了比较完整的 `domain + facade + compat + contract test`。

但像下面这些主线还没完成同等级整理：

- customer notifications
- support cases
- payment / fulfillment / refund result governance
- AI concierge deeper governance / proposal lane

### 4. 顶层“平台状态”还未全量同步

目前代码中已经有明显的平台边界：

- `packages/site-kernel`
- `packages/knowledge`
- `packages/ai-ops`
- `apps/control-plane`

但很多能力仍然主要在 control-plane 内演化，尚未全面沉淀成更统一的跨域 contract。

## 当前最适合的下一步

从现在开始，最合理的方向不再是继续只在 SEO 线上补最小接入，也不是重新回去做大段纯重构，而是把已经推进到真实自动接入的 SEO 主线继续往运行系统成熟度拉高，同时把第三条高价值主线补到 facade / contract 层。

优先建议：

1. SEO sync 运行系统第二阶段
   - 最近运行状态已经有了，但还缺最近 N 次历史、失败恢复与更强运行视图
   - 最适合继续把“真实接入”推进到“稳定运行”

2. `payment / fulfillment / refund result governance`
   - 第三条高价值主线已经完成 domain 级 summary / alert / proposal-candidate 下沉
   - 下一步最自然的是 facade、compat layer、contract test

3. 更新架构文档
   - 把 SEO 真实 Search Console 接入、`result-governance-domain`、以及最新主线判断同步到架构说明

## 当前状态结论

如果按“是不是已经有真实产品样板”来判断，答案是肯定的。

如果按“是不是已经进入长期平台化阶段”来判断，答案也是肯定的，但仍处在前半段。

更准确的总结是：

> 这个项目已经不是一个只有骨架的 AI 内容运营平台原型，而是一个已经跑出多条真实闭环样板，并开始把这些样板复制到多个高价值主线、系统化沉淀为平台能力的项目。

现在最重要的不是再证明“这条线能不能跑”，而是继续把已经跑通的方法复制到第三条高价值主线，并同步把文档口径持续更新到和代码现实一致。
