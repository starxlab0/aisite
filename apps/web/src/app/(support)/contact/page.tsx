export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">帮助中心</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">Contact</h1>
      <p className="mt-4 max-w-2xl text-zinc-600">
        下单前后都可以从这里发起联系。如果你还没决定买哪款，建议先描述使用场景、预算和偏好；
        如果已经下单，带上订单号与问题截图，处理会更快。
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">售前咨询</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            不确定该买哪一款、想比较静音度、刺激类型或是否适合新手时，建议先提供你的使用场景、预算和偏好。
          </p>
          <p className="mt-4 text-sm font-medium text-zinc-900">优先通过 FAQ、问答页和帮助入口整理问题后再联系</p>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-zinc-900">订单与售后</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            如果你已经下单，请在联系时附上订单号、问题描述和必要截图，这样能更快进入处理流程。
          </p>
          <p className="mt-4 text-sm font-medium text-zinc-900">订单号 + 问题描述 + 截图，会比一句“有问题”更容易被快速处理</p>
        </section>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
        <h2 className="text-lg font-semibold text-zinc-900">联系时建议带上的信息</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-600">
          <li>商品名称或商品链接</li>
          <li>订单号</li>
          <li>问题出现时间与具体表现</li>
          <li>必要时附图、视频或截图</li>
        </ul>
      </div>
    </div>
  );
}
