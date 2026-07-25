# 架构总览

当前仓库分为三个核心面向：

- `apps/web`：正式对外的 storefront，负责内容展示、选购、购物车、结账、订单页与增长埋点。
- `apps/control-plane`：运营与内容控制面，承接 draft、preview、repo change、signals，以及订单快照与监控能力。
- `apps/medusa`：商品、库存、价格与履约后端。

## 当前主链路

1. 用户从首页、collection、guide 或 quiz 进入商品页。
2. 商品页完成 `add to cart`，在 `/cart` 和 `/checkout` 中继续确认。
3. 结账优先进入 Stripe，若未完成支付，则订单页通过本地快照 + control-plane order snapshot 恢复状态。
4. Medusa webhook 会把支付状态继续回写到 storefront 可读取的 snapshot 链路中。

## 状态同步原则

订单状态目前采用“多层兜底”：

- checkout 提交时先写 storefront snapshot
- storefront 再 best-effort 推送到 control-plane `/ops/order-snapshots`
- order 页优先读取 control-plane snapshot
- Medusa webhook 到达后继续覆盖最新状态

这样即使支付回跳、webhook 延迟、或前端 session 丢失，也仍然能恢复订单页状态。
