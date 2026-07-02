# 项目检查点

日期：2026-07-01

## 当前阶段判断

项目已经从 MVP/Alpha 阶段进入到“具备平台雏形”的阶段。

已完成：
- 里程碑 A：运营工作台最小闭环
- 里程碑 B1：编辑体验、Diff、发布/回滚增强
- 里程碑 B2：signals、recommendations、事件采集、自动 snapshot
- 里程碑 B2.5：Needs attention dashboard、版本表现对比、recommendation 生命周期
- 里程碑 C1（已完成大半）：
  - signals 持久化
  - batch 运行历史 / 健康状态 / 连续失败计数
  - `/ops` 首页运行告警
  - 最小角色权限模型
  - 首页与详情页权限可视化
  - recent audit 与独立审计页 `/ops/audit`

## 已落地的关键能力

### 内容工作流
- product / collection / faq 三类目标管理
- generate / edit / submit / review / preview / publish / rollback
- product / collection 真回滚
- preview token 工作流

### 反馈闭环
- 前台事件采集：`view / cta / add_to_cart`
- signals 聚合与 snapshots
- recommendation 自动生成
- recommendation 支持 `open / in_progress / resolved / dismissed`
- `/ops` 首页 `Needs attention`
- 详情页版本表现对比

### 自动化
- batch snapshot runner
- 每日自动 batch 任务
- runtime status / recent batch runs / health

### 治理能力
- signals 持久化
- 角色与能力：
  - `viewer`
  - `editor`
  - `reviewer`
  - `publisher`
  - `admin`
- 首页与详情页权限可视化
- `/ops/audit` 审计页

## 仍然存在的主要缺口

### 1. 审计可靠性还未完全收口
- `ops events` 仍需持久化
- preview token / 审计相关状态还未全部进入稳定持久化链路

### 2. recommendation 仍偏 MVP
- 规则数量有限
- 优先级和策略层仍较轻
- recommendation 到自动 draft 的链路还未完全自动化

### 3. 自动化第二阶段未完成
- recommendation 出来后，AI 还没有稳定做到：
  - 自动创建 draft
  - 自动附带修改建议摘要
  - 自动进入更完整的处理流程

### 4. 数据闭环仍偏浅
- 现有信号主要集中在页面行为
- 离更完整的业务结果型信号还有距离

## 当前最适合的下一步

建议优先级：

1. 补完 C1
- `ops events` 持久化
- 审计可靠性收口

2. 进入 C2
- recommendation 规则升级
- recommendation 自动创建 draft
- recommendation 与处理结果闭环

3. 最后再做高级增强
- 实验 / 灰度
- 内容质量评分
- 多信号融合
- 更激进的自动执行

## AI 原生目标的当前理解

最终目标不是“AI 只是帮运营提效”，而是：

- AI 持续观察系统状态
- AI 自动发现问题
- AI 自动起草改写方案
- AI 自动准备审核材料
- 人只在审核、发布、回滚、策略节点介入

一句话定义：

> 这是一个由 AI 持续监控、诊断、起草和推进内容优化流程，由人类在审核、发布、回滚和策略节点进行授权的 AI 原生内容运营系统。

## 当前状态结论

如果按“内部可持续使用”的标准看，系统已经很接近可稳定使用。

如果按“完整 AI 原生内容平台”的标准看，后续重点已经不在基础工作流，而在：
- 全量持久化
- 审计可靠性
- recommendation 策略深度
- 自动化第二阶段

