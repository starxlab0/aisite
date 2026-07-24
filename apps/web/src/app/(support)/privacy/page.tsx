export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Privacy
      </h1>
      <div className="mt-4 space-y-4 text-zinc-600">
        <p>
          我们会在下单、履约、售后与站点优化过程中收集必要信息，例如邮箱、收货信息、
          浏览行为和订单状态，用于完成交易、提供客服支持，并改进站内体验。
        </p>
        <p>
          支付过程由受信任的支付服务商处理，我们不会在站内保存完整银行卡信息。订单、
          支付与履约相关数据只会在提供服务、处理争议、满足合规义务或改进运营所需的范围内使用。
        </p>
        <p>
          若你希望查询、更新或删除与订单相关的信息，可以通过联系页与我们沟通。后续如果接入更多内容、
          分析或订阅工具，这里会同步补充更完整的隐私说明。
        </p>
      </div>
    </div>
  );
}
