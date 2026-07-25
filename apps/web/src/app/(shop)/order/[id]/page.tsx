import { CheckoutSignalTracker } from "@/components/signals/checkout-signal-tracker";
import { PurchaseSignalTracker } from "@/components/signals/purchase-signal-tracker";
import { resumeStripeCheckoutAction } from "@/features/checkout/actions";
import { getOrderSnapshotById } from "@/features/checkout/session";
import { getStoredOrderSnapshotById, upsertOrderSnapshot } from "@/lib/commerce/order-snapshot-store";
import { applyOrderStatusOverlay } from "@/lib/commerce/orders";
import { getOrderById } from "@/lib/commerce/orders";
import { getStripeClient } from "@/lib/payments/stripe";
import { buildPurchaseTargetsFromOrder, isSuccessfulOrderPayment } from "@/lib/signals/purchase";
import { formatMoney } from "@/lib/utils/money";
import type { Order } from "@/types/order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getOrderAmountValue(order: Order, amount: number) {
  if (order.amountUnit === "minor") return amount / 100;
  return amount;
}

function formatOrderMoney(order: Order, amount: number) {
  return formatMoney(getOrderAmountValue(order, amount), order.currency);
}

function firstValue(value: string | string[] | undefined) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved ?? null;
}

async function resolveStripeReturnOrder(input: {
  orderId: string;
  order: Order | null;
  stripeState: string | null;
  sessionId: string | null;
}) {
  const { orderId, order, stripeState, sessionId } = input;
  if (!order) return null;
  if (!envServer.stripeSecretKey) return order;

  if (stripeState === "cancel") {
    const canceledOrder = applyOrderStatusOverlay(order, {
      paymentStatus: "failed",
      paymentDetail: "canceled",
      paymentIssueReason: "customer_abandon",
      statusSource: "checkout",
      statusNote: "用户已从 Stripe 返回，但支付已取消或未完成。",
      updatedAt: new Date().toISOString(),
    });
    await upsertOrderSnapshot(canceledOrder);
    return canceledOrder;
  }

  if (stripeState !== "success" || !sessionId || order.paymentStatus === "paid" || order.paymentStatus === "authorized") {
    return order;
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const belongsToOrder =
      String(session.client_reference_id || "").trim() === orderId ||
      String(session.metadata?.order_id || "").trim() === orderId;
    if (!belongsToOrder) return order;

    const isPaid = session.payment_status === "paid" || session.status === "complete";
    if (!isPaid) return order;

    const nextOrder = applyOrderStatusOverlay(order, {
      paymentStatus: "paid",
      paymentDetail: "paid",
      paymentIssueReason: "completed",
      statusSource: "payment_webhook",
      statusNote: `stripe_return:${session.id}`,
      updatedAt: new Date().toISOString(),
    });

    await upsertOrderSnapshot({
      ...nextOrder,
      paymentProvider: "stripe",
      paymentSessionId: session.id,
      paymentUrl: storedOrder.paymentUrl ?? liveOrder.paymentUrl,
    },
  );
}

function recoveryHeadline(order: Order) {
  if (order.recoveryLane === "customer_retry") return "建议重新发起支付";
  if (order.recoveryLane === "customer_action") return "需要用户完成额外支付动作";
  if (order.recoveryLane === "provider_review") return "建议转支付/provider 排查";
  if (order.recoveryLane === "fulfillment_ready") return "订单可进入履约";
  return "等待支付结果继续同步";
}

function paymentReasonLabel(order: Order) {
  if (order.paymentIssueReason === "declined") return "支付被拒绝";
  if (order.paymentIssueReason === "timeout") return "支付超时";
  if (order.paymentIssueReason === "customer_abandon") return "用户中途取消";
  if (order.paymentIssueReason === "action_required") return "仍需额外支付确认";
  if (order.paymentIssueReason === "capture_pending") return "支付已授权，等待最终确认";
  if (order.paymentIssueReason === "completed") return "支付已完成";
  if (order.paymentIssueReason === "pending_sync") return "等待支付结果同步";
  if (order.paymentIssueReason === "provider_error") return "支付服务暂时异常";
  return null;
}

function paymentStatusLabel(order: Order) {
  if (order.paymentStatus === "paid") return "已支付";
  if (order.paymentStatus === "authorized") return "已授权";
  if (order.paymentStatus === "failed") return "支付失败";
  return "待支付";
}

function fulfillmentStatusLabel(order: Order) {
  if (order.fulfillmentStatus === "delivered") return "已送达";
  if (order.fulfillmentStatus === "shipped") return "已发货";
  if (order.fulfillmentStatus === "processing") return "处理中";
  return "待履约";
}

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const stripeState = firstValue(sp.stripe);
  const sessionId = firstValue(sp.session_id);

  const liveOrder = await getOrderById(id);
  const storedOrder = await getStoredOrderSnapshotById(id);
  const mergedLiveOrder = mergeLiveOrderWithSnapshot(liveOrder, storedOrder);
  const browserSnapshotOrder = mergedLiveOrder || storedOrder ? null : await getOrderSnapshotById(id);
  const resolvedFallbackOrder = await resolveStripeReturnOrder({
    orderId: id,
    order: mergedLiveOrder ?? storedOrder ?? browserSnapshotOrder,
    stripeState,
    sessionId,
  });
  const order = resolvedFallbackOrder ?? mergedLiveOrder;

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-14">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">订单号：{id}</h1>
        <p className="mt-3 text-zinc-600">暂时没有找到这笔订单。请确认下单是否完成，或稍后刷新页面再试。</p>
      </div>
    );
  }

  const purchaseTargets = buildPurchaseTargetsFromOrder(order);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      {purchaseTargets.length && isSuccessfulOrderPayment(order) ? (
        <PurchaseSignalTracker targets={purchaseTargets} dedupeKey={`order:${order.id}`} />
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">订单号：{order.id}</h1>
      {!mergedLiveOrder ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          当前展示的是最近一次保存的订单状态。如果支付结果刚刚更新，刷新后会看到最新进展。
        </div>
      ) : null}
      <CheckoutSignalTracker targets={purchaseTargets} dedupeKey={`order:${order.id}`} eventType="checkout_complete" />
      <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${paymentTone(order)}`}>
        <p className="font-medium">{paymentHeadline(order)}</p>
        <p className="mt-1">{paymentDescription(order)}</p>
        <p className="mt-2 text-xs opacity-80">
          当前状态 {paymentStatusLabel(order)}
          {order.updatedAt ? ` · 最后同步 ${new Date(order.updatedAt).toLocaleString()}` : ""}
        </p>
      </div>

      {order.paymentProvider === "stripe" && order.paymentStatus !== "paid" ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-medium">订单尚未完成支付</p>
          <p className="mt-1 text-xs text-amber-800">
            如果你刚从 Stripe 返回，可能还在等待 webhook 同步；也可以点击下面按钮重新发起支付。
          </p>
          <form action={resumeStripeCheckoutAction} className="mt-3">
            <input type="hidden" name="orderId" value={order.id} />
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              继续/重新支付
            </button>
          </form>
        </div>
      ) : null}
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">{recoveryHeadline(order)}</p>
        {paymentReasonLabel(order) ? <p className="mt-1 text-xs text-zinc-500">{paymentReasonLabel(order)}</p> : null}
        {Array.isArray(order.recoveryActions) && order.recoveryActions.length ? (
          <div className="mt-2 space-y-1">
            {order.recoveryActions.slice(0, 2).map((item) => (
              <p key={item} className="text-xs text-zinc-600">
                {item}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-zinc-600">
        邮箱 {order.email || "未填写"} · 支付 {paymentStatusLabel(order)} · 履约 {fulfillmentStatusLabel(order)}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        创建于 {new Date(order.createdAt).toLocaleString()} · 总计 {formatOrderMoney(order, order.total)}
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-3">
          <p className="text-sm font-medium text-zinc-900">订单商品</p>
        </div>
        <div className="divide-y divide-zinc-200">
          {order.items.length ? (
            order.items.map((item) => (
              <div key={`${item.productId}-${item.title}`} className="flex items-center justify-between gap-4 px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    商品编号 {item.productId}
                    {item.productHandle ? ` · ${item.productHandle}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-zinc-900">× {item.quantity}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatOrderMoney(order, item.unitPrice)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-zinc-600">当前订单里还没有商品明细。</div>
          )}
        </div>
      </div>
    </div>
  );
}
