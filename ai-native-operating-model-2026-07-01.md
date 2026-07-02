# AI 原生内容运营系统职责边界

日期：2026-07-01

## 核心定义

这个项目的最终目标不是“AI 帮运营提效工具”，而应该是：

> AI 持续观察内容系统，自动发现问题、创建改写方案、准备审核材料；人类只在审核、发布、回滚和策略节点进行授权。

也就是说：

- AI 先做大部分可验证、可回滚、可审计的工作
- 人不再负责每一步执行
- 人主要负责：
  - 审核
  - 兜底
  - 最终授权
  - 策略调整

## 总原则

### AI 自动做

满足以下条件的工作，优先由 AI 自动处理：

- 高重复
- 低风险
- 可验证
- 可回滚
- 可审计

### 人必须参与

满足以下条件的工作，必须有人参与：

- 品牌判断
- 合规风险判断
- 发布授权
- 回滚授权
- 阈值调整
- 策略变更

一句话总结：

> AI 主动推进流程，人只卡关键门。

---

## 四层最终形态

### 1. AI 观察层

负责持续发现哪里需要动作。

在本项目里对应：

- 前台事件采集
- signals
- snapshots
- recommendations
- runtime 监控
- audit

最终职责：

- 观察 product 页面表现变化
- 观察 collection 页面点击与转化关系
- 观察 FAQ 覆盖缺口
- 观察版本表现是否比上一版本更差
- 观察 recommendation 是否长期未处理

### 2. AI 执行层

负责“能自动推进的，先自动推进”。

在本项目里最终应该负责：

- 自动生成 recommendation
- 自动创建 rewrite draft
- 自动给出修改建议
- 自动生成 diff 摘要
- 自动准备审核上下文

### 3. 人类审核层

负责风险判断和最终授权。

在本项目里最终应该负责：

- reviewer 判断方向和风险
- publisher 决定是否上线
- publisher 决定是否回滚
- strategist/admin 决定规则和阈值

### 4. 系统治理层

负责让整套系统长期可运行。

包括：

- 权限
- 审计
- 健康状态
- 失败历史
- recommendation 生命周期
- 持久化
- 规则配置
- 人工介入边界

---

## product 职责边界

### AI 负责

- 监控 product 页面 signals
- 判断当前版本是否异常
- 对比当前 `contentRef` 和上一版本
- 生成 recommendation
- 自动创建 rewrite draft
- 自动给出建议修改点，例如：
  - headline
  - selling points
  - CTA 表达
  - FAQ 补充方向
- 自动生成 diff 摘要
- 自动准备审核上下文

### 人负责

- 判断改写方向是否符合品牌
- 判断是否存在敏感或过度承诺表述
- 审核 AI draft 是否可接受
- 决定是否发布
- 决定是否回滚

### product 理想工作流

1. AI 监控 product signals
2. AI 发现版本表现下降
3. AI 创建 recommendation
4. AI 自动创建新的 product draft
5. AI 附带：
   - 触发原因
   - 指标变化
   - 建议修改点
   - diff 摘要
6. reviewer 审核内容方向
7. publisher 决定是否上线
8. AI 上线后继续监控表现

---

## collection 职责边界

### AI 负责

- 监控 collection 页的 view / CTA / downstream 行为
- 判断 hero、sections、内部链接是否需要改写
- 自动创建 rewrite draft
- 自动建议：
  - hero title / summary
  - sections 结构
  - internal links
  - buying guide 强化点
- 自动生成 recommendation 和版本对比

### 人负责

- 判断叙事方向是否符合运营策略
- 判断 AI 是否误解了 collection 主题
- 审核结构调整是否合理
- 决定是否发布或回滚

### collection 理想工作流

1. AI 发现 collection 点击高但后续行为弱
2. AI 判断可能是文案和结构问题
3. AI 自动起草新版 collection 页面
4. AI 给出结构性原因说明
5. reviewer 判断方向
6. publisher 决定是否发布
7. AI 继续跟踪新版本效果

---

## faq 职责边界

### AI 负责

- 从 product / collection / recommendation / 历史提问中识别 FAQ 缺口
- 自动建议新增问题
- 自动做问题去重
- 自动排序
- 自动生成 FAQ draft
- 自动说明为什么需要补这条 FAQ

### 人负责

- 判断问题是否真的值得出现
- 判断答案是否过度承诺
- 判断 FAQ 语气是否符合品牌
- 决定是否发布

### faq 理想工作流

1. AI 发现某个 product/collection 内容覆盖不足
2. AI 自动生成 FAQ recommendation
3. AI 自动创建 FAQ draft
4. reviewer 审核问题和答案
5. publisher 决定是否发布

### FAQ 的特殊性

FAQ 比 product / collection 更适合更早进入高自动化阶段，因为：

- 结构更稳定
- 格式更明确
- 风险主要集中在措辞审核

---

## recommendation 职责边界

### AI 负责

- 自动生成 recommendation
- 自动计算优先级
- 自动分级：
  - `info`
  - `warning`
  - `critical`
- 自动去重 / 合并相似 recommendation
- 自动关联 target + `contentRef`
- 自动创建后续任务
- 理想状态下自动创建 draft

### 人负责

- 判断 recommendation 是否值得执行
- 对异常 recommendation 做 dismiss
- 对高优先级 recommendation 排序
- 调整 recommendation 规则

### 最终标准

最终不应该只是：

- “这里有一条 recommendation”

而应该是：

- “这里有一条 recommendation，AI 已经准备好了下一步，只等人审核或放行”

---

## publish / rollback 职责边界

### AI 负责

- 自动准备发布所需信息
- 自动校验：
  - draft 状态
  - review 状态
  - 变更内容
  - diff 摘要
  - recommendation 来源
- 自动提示风险
- 自动监控发布后效果
- 自动识别疑似需要 rollback 的版本

### 人负责

- 最终发布授权
- 最终回滚授权

### 为什么仍需人类门禁

因为发布和回滚涉及：

- 外部用户可见变化
- 品牌责任
- 合规责任
- 业务后果

所以最终形态更适合是：

- AI 把发布准备工作做完
- 人做最后一次确认

而不是一开始就全自动发布。

---

## signals 职责边界

### AI / 系统负责

- 自动采集事件
- 自动聚合 snapshot
- 自动记录版本表现
- 自动判断趋势变化
- 自动发现异常窗口

### 人负责

- 调整阈值
- 决定看哪些指标
- 决定不同内容类型的权重

这意味着 signals 层理想上应该基本完全系统化，人不应该每天手工介入。

---

## 审计与权限

### 审计

系统负责：

- 自动记录关键动作
- 自动记录 actor / role / target / action / note
- 自动记录 batch 运行状态
- 自动记录 recommendation 生命周期

人负责：

- 查问题
- 查责任
- 复盘异常
- 做治理决策

### 权限

系统负责：

- 按角色控制动作是否可用
- 明确显示当前角色和能力
- 拒绝越权操作
- 记录权限拒绝事件

人负责：

- 决定角色分工
- 决定谁可以 publish / rollback / run batch
- 决定哪些动作未来可以进一步自动化

---

## 最终工作流

### 日常状态

1. AI 持续监控内容表现
2. AI 自动发现问题
3. AI 自动生成 recommendation
4. AI 自动创建 draft 与修改建议
5. 人审核内容与风险
6. 人授权发布
7. AI 继续监控发布后效果
8. AI 触发下一轮优化

### 异常状态

1. AI 发现指标异常或版本下滑
2. AI 生成高优先级 recommendation
3. AI 提示可能需要 rollback
4. 人决定是否回滚
5. AI 继续记录与复盘

---

## 最适合自动化的顺序

### 第一批最适合自动化

- recommendation 生成
- snapshot 聚合
- FAQ draft 创建
- product / collection rewrite draft 创建
- diff 摘要
- 审核上下文准备

### 第二批可逐步自动化

- recommendation 自动转 draft
- recommendation 优先级排序
- 低风险 FAQ 的半自动处理
- 发布前检查

### 最后才考虑

- 自动发布
- 自动回滚
- 自动策略调整

这些都属于高风险动作，不适合过早自动化。

---

## 当前项目的一句话定义

> 这是一个由 AI 持续监控、诊断、起草和推进内容优化流程，由人类在审核、发布、回滚和策略节点进行授权的 AI 原生内容运营系统。

