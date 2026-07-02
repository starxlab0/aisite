# site-kernel

站点内核的第一版共享包。

当前职责：

- 提供 `tenant / brand / site / locale` 的基础类型
- 提供默认 tenant 与默认站点上下文
- 提供品牌、导航、页脚、默认 collection 等站点级配置
- 提供 `resolveSiteConfig()` 作为统一解析入口
- 作为后续多站点 / 多品牌 / 多语言配置的基础入口

后续会继续扩展：

- 站点主题 token 与多品牌视觉变量
- 模块 DSL
- 站点能力开关
- 站点市场配置与能力矩阵
