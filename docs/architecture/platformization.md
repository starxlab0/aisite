# 平台化第一批骨架

## 本次落地内容

当前仓库已经补入第一批平台化骨架，目标不是一次性完成平台，而是先把边界做出来。

### 新增共享包

- `packages/site-kernel`
- `packages/knowledge`
- `packages/ai-ops`

### 新增应用骨架

- `apps/control-plane`

## 设计意图

### `site-kernel`

用于承载站点级配置和后续多站点能力。

当前已包含：

- `tenant / brand / site / locale` 基础层级
- 品牌名、描述、导航、页脚
- 默认 collection 与 market code
- 站点能力开关

当前 `apps/web` 已开始从 `site-kernel` 读取：

- `layout.tsx`
- `SiteHeader`
- `SiteFooter`
- `seo/metadata`
- 首页品牌名

当前前台本地配置入口也已经同步升级为：

- `context`
- `tenant`
- `brand`
- `site`
- `locale`

这样后续接真正的 workspace 包或远程配置中心时，不需要再推翻前台消费结构。

### `knowledge`

用于承载 GEO / SEO 专有智能的基础结构。

当前已包含：

- `KnowledgeRule`
- `KnowledgeTemplate`
- `KnowledgeCase`
- `KnowledgeExperimentResult`
- `KnowledgePlaybook`
- `SiteProfile`
- 初始站点画像
- 初始知识资产示例
- 知识资产查询入口

### `ai-ops`

用于承载 AI 控制平面的任务对象。

当前已包含：

- `ActionRun`
- `ActionRunInput`
- `ActionTarget`
- `ReviewDecision`
- `PublishPayload`
- `RollbackPayload`
- `EvaluationSnapshot`
- 状态迁移规则与辅助函数
- 初始任务样例

### `control-plane`

作为未来 AI 控制平面的独立服务入口。

当前已包含：

- 最小 `server.js`
- `contracts/`
- `workflows/`
- 基础 README
- `/health` 与 `/knowledge` 最小读取接口
- `/actions` 与 `/actions/:id` 最小 action 接口
- CMS adapter 边界、默认 local draft 实现、第一版 `sanity-adapter` 与 `/drafts` 查询接口
- `FAQ 扩写` 最小 `planning / generation / review / publish / rollback` 工作流接口
- `collection 页面改写` 最小 `planning / generation / review / publish / rollback` 工作流接口
- `productContentDraft -> productContent`、`collectionPageDraft -> collectionPage`、`faqDraft -> faqItem` 的第一版 schema-aligned 镜像写入能力

## 当前意义

这一步的重点不是“功能变多了”，而是仓库开始出现了真正的平台边界：

- 前台站点不再完全写死品牌和导航
- 知识层和 AI 控制层开始拥有独立目录
- 控制平面不再只能存在于文档里

## 下一步建议

建议按下面顺序继续：

1. 为 `site-kernel` 增加站点配置加载器和环境切换能力
2. 为 `knowledge` 增加持久化存储与版本策略
3. 在 `control-plane` 中继续扩展真实工作流：
   - guide 生成
   - FAQ / collection / product 对接真实 Sanity schema
   - 把 `contentDraft` 从通用文档进一步拆分为更贴近前台 schema 的模型
4. 把 `apps/web` 的更多硬编码文案迁移到 `site-kernel + CMS`
5. 为 `site-kernel` 与 `knowledge` 补数据库或远程配置加载器
