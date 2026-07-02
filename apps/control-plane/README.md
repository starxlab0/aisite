# control-plane

AI 控制平面的第一版应用骨架。

当前阶段先明确职责，不追求完整运行能力。

## 目标

- 接收来自站点、搜索、广告、内容和运营的数据与任务
- 统一生成 `ActionRun`
- 调用知识层与执行层
- 为内容生成、审核、发布、回滚提供统一编排入口

## 后续模块

- `src/server.js`：最小 API 入口
- `src/routes/`：任务与站点管理接口
- `src/services/`：策略、知识、执行 adapter
- `src/workflows/`：控制平面内部工作流

## 当前已落的最小工作流

### Draft 内容层

当前已具备最小 CMS adapter 边界：

- `CMS_ADAPTER=local`：默认，使用本地 draft 仓储
- `CMS_ADAPTER=sanity`：第一版真实实现，支持通过 Sanity 创建与查询 `contentDraft`

当使用 `sanity` adapter 时，至少需要：

- `SANITY_PROJECT_ID` 或 `NEXT_PUBLIC_SANITY_PROJECT_ID`
- `SANITY_DATASET` 或 `NEXT_PUBLIC_SANITY_DATASET`
- `SANITY_API_TOKEN`

当前对外查询接口：

- `/drafts`
- `/drafts/:id`

用于承载工作流发布后的内容草稿记录，当前可在本地仓储与 Sanity 之间切换。

当前在 `sanity` 模式下：

- `productContentDraft` 发布时会同时镜像生成 `productContent`
- `collectionPageDraft` 发布时会同时镜像生成 `collectionPage`
- `faqDraft` 发布时会同时镜像生成一组 `faqItem`

在 `local` 模式下会返回同样的镜像文档信息，但仅作为虚拟结果，不会真实落库。

### FAQ 扩写

当前已经具备三段最小链路：

- `plan`
- `generate`
- `review`
- `publish`
- `rollback`

接口：

- `/workflows/faq-expansion`
- `/workflows/faq-expansion/generate`
- `/workflows/faq-expansion/review`
- `/workflows/faq-expansion/publish`
- `/workflows/faq-expansion/rollback`

### Collection 页面改写

当前也已经具备完整最小链路：

- `plan`
- `generate`
- `review`
- `publish`
- `rollback`

接口：

- `/workflows/collection-rewrite`
- `/workflows/collection-rewrite/generate`
- `/workflows/collection-rewrite/review`
- `/workflows/collection-rewrite/publish`
- `/workflows/collection-rewrite/rollback`
