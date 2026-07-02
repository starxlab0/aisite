# 架构文档索引

当前独立站的核心架构文档如下：

- `overview.md`：架构总览、技术栈、系统边界、版本规划
- `routing.md`：项目目录、路由树、页面职责、API 路由规划
- `data-model.md`：Sanity 与 Medusa 数据模型、体验标签体系、前台聚合模型
- `page-modules.md`：首页、分类页、商品页、专题页、内容页、购物车与结账的模块清单及数据来源
- `medusa-local-setup.md`：本地运行 Medusa backend、配置数据库、创建 API key 与联调前台的说明
- `medusa-test-products.md`：Medusa 测试商品字段规范与首批测试商品模板
- `deployment.md`：Vercel 前台部署、环境变量、CORS 与 webhook 配置说明
- `platformization.md`：第一批平台化代码骨架、目录边界与后续扩展建议

## 阅读顺序建议

1. 先读 `overview.md`
2. 再读 `routing.md`
3. 再读 `data-model.md`
4. 最后读 `page-modules.md`

## 当前用途

这组文档用于：

- 开发启动前的架构对齐
- 前端、内容、后端的字段和页面分工
- 后续由本项目继续推进开发时的基础参考

## 后续建议补充文档

- `integration.md`：支付、邮件、分析、对象存储、搜索接入说明
- `tracking.md`：埋点方案
- `launch-checklist.md`：上线检查项
