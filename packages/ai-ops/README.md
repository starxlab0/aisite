# ai-ops

AI 控制平面的第一版共享包。

当前职责：

- 定义 `ActionRun`、`ActionRunInput`、`ReviewDecision`、`PublishPayload`、`RollbackPayload`
- 提供状态迁移规则和辅助函数
- 作为控制平面和 worker 之间共享的数据契约

后续会继续扩展：

- 策略输入输出 schema
- Prompt policy
- 评估器接口
- 发布与回滚任务模型

当前已包含：

- `actionTransitionRules`
- `canTransition()`
- `createActionRun()`
- `transitionActionRun()`
- `applyReviewDecision()`
- `attachPublishPayload()`
- `attachRollbackPayload()`
