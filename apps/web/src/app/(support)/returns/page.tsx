export default function ReturnsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">帮助中心</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">退换政策</h1>
      <p className="mt-4 max-w-2xl text-zinc-600">
        退换政策写得越清楚，用户下单前顾虑越少。下面按最常见的售后问题做统一说明。
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">支持退换的情况</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>收到商品即存在破损、明显质量问题或错发漏发。</li>
            <li>外包装完好但商品本身无法正常使用。</li>
            <li>订单与实际收货商品型号不一致。</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">不支持退换的情况</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>因个人主观体验差异提出的无质量问题退货。</li>
            <li>商品已明显使用、损坏、污染或配件不全。</li>
            <li>超过售后申请时限，且无明确质量异常证明。</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">申请流程</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>准备订单号、问题描述和必要图片/视频。</li>
            <li>通过联系页提交售后申请。</li>
            <li>客服确认后提供后续处理方案。</li>
          </ol>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">退款说明</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
            <li>退款会按原支付路径退回。</li>
            <li>到账时间取决于支付渠道与银行处理速度。</li>
            <li>支付失败、取消或超时订单也会在订单页展示恢复建议。</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
