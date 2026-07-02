# 独立站架构总览

## 目标

本项目用于承载女用智能愉悦与情侣远程互动方向的独立站，首期目标不是做一个大而全的商城，而是上线一个具备以下能力的可运营站点：

- 支持品牌展示、商品售卖、内容种草和选购引导
- 支持 `App Control`、`Wearable`、`Dual Stimulation` 等核心体验标签表达
- 支持 SEO、专题页、内容中心和后续增长迭代
- 具备稳定的商品、购物车、订单和内容管理能力

## 技术原则

### 1. 前台体验与业务状态分离

- `Vercel + Next.js` 负责前台体验、SEO、全球访问、预览和部署
- 交易、库存、订单等有状态业务放在外部服务，不把核心状态写死在 Vercel Functions

### 2. 内容与交易分离

- `Sanity` 负责内容真相：文案、页面模块、FAQ、专题页、文章
- `Medusa` 负责交易真相：商品、价格、库存、购物车、订单、折扣

### 3. 按体验维度建模

站点不以传统商品目录思维为主，而以体验和场景为主：

- 外吸 / 舔吸
- 双刺激
- 穿戴
- 远程互动
- 新手友好
- 安静隐蔽

### 4. 优先做可上线 MVP

第一阶段先打通以下闭环：

- 首页
- 分类页
- 商品页
- 购物车
- 结账
- FAQ / 政策页
- Guides 内容页
- App Control 专题页

## 推荐技术栈

### 前台

- `Next.js 15`
- `App Router`
- `TypeScript`
- `Tailwind CSS`
- 部署到 `Vercel`

### 内容

- `Sanity`

### 电商

- `Medusa`
- `Postgres`

### 配套服务

- 对象存储：`S3` 或 `Cloudflare R2`
- 邮件：`Resend + Klaviyo`
- 分析：`GA4 + PostHog`
- 客服：后续按需求接入

## 系统边界

### Vercel / Next.js 负责

- 首页、分类页、商品页、指南页、专题页
- SEO metadata、结构化数据、sitemap
- 轻量 API，如 revalidate、newsletter、webhook 接收
- 预览环境和版本发布

### Sanity 负责

- 商品内容包装
- 分类页文案
- 套装页文案
- 指南文章
- FAQ
- 顶部公告、导航、页脚
- 技术专题与活动页

### Medusa 负责

- 商品基础信息
- SKU / 价格 / 库存
- 购物车
- 订单
- 折扣与结账

## 页面与业务分层

建议采用以下分层：

### 表现层

- `app/*` 路由页面
- `components/*` 通用和业务组件

### 业务层

- `features/*`
- 负责页面模块拼装、筛选逻辑、推荐逻辑、quiz 逻辑

### 集成层

- `lib/cms/*`
- `lib/commerce/*`
- `lib/analytics/*`
- `lib/seo/*`

### 数据来源

- 内容数据来自 `Sanity`
- 交易数据来自 `Medusa`

## 首期信息架构

### 主导航

- `Shop`
- `By Need`
- `App Control`
- `Bundles`
- `Guides`
- `Support`

### 推荐分类

- `first-time`
- `clitoral-licking`
- `dual-stimulation`
- `wearable`
- `app-controlled`
- `intense-play`
- `discreet-play`
- `couples`

## 渲染策略

### 适合静态或 ISR 的页面

- 首页
- 分类页
- 商品页
- 指南页
- FAQ / 政策页
- 技术专题页

### 适合动态渲染的页面

- 购物车
- 结账
- 订单查询

## 版本规划

### 阶段 1：基础可上线版本

- 路由骨架
- 首页
- 分类页
- 商品页
- 购物车
- 结账
- FAQ / 政策页
- 基础埋点

### 阶段 2：转化增强

- `App Control` 专题页
- `Find Your Match` quiz
- `Bundles`
- 内容中心
- 邮件订阅与弃单承接

### 阶段 3：增长与扩展

- 多语言
- 搜索
- 更复杂的推荐
- 评价体系
- 联盟或会员体系

## 当前需优先确认的业务问题

- 首批上架 SKU 清单
- `collection` 最终列表
- 商品体验标签打标规则
- 首发语言范围
- 支付方案与风控边界
- 内容维护角色分工

## 相关文档

- `routing.md`
- `data-model.md`
- `page-modules.md`
