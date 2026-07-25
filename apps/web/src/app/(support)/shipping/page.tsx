export default function ShippingPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">帮助中心</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">配送说明</h1>
      <p className="mt-4 max-w-2xl text-zinc-600">
        为了减少下单前的不确定感，这里把发货、包装、物流查询和异常情况统一说明清楚。
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">发货时效</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>常规现货订单通常在 48 小时内发出。</li>
            <li>法定节假日或促销期间，处理时效可能延长 1 到 3 个工作日。</li>
            <li>如遇缺货、地址异常或支付状态待确认，发货会顺延。</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">包装与隐私</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>默认使用低调包装，不展示敏感商品信息。</li>
            <li>物流面单与账单描述尽量使用中性信息。</li>
            <li>如有额外隐私要求，下单后可联系客服备注。</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">物流追踪</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>订单发出后，可通过订单页查看状态更新。</li>
            <li>物流单号和发货状态会逐步同步到订单页。</li>
            <li>若长时间未更新，请通过联系页提交订单号咨询。</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">异常情况</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>支付失败或支付待确认时，订单会进入人工或系统复核。</li>
            <li>地址不完整、电话无法联系时，发货可能被暂停。</li>
            <li>如需改地址，请尽快联系客服，发货后可能无法修改。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
