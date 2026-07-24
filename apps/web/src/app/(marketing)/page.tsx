import Link from "next/link";
import { ProductCard } from "@/components/commerce/ProductCard";
import { listProducts } from "@/lib/commerce/products";
import { getActiveSiteConfig } from "@/lib/site/config";

const collectionHighlights = [
  {
    title: "第一次选购",
    summary: "从入门友好、静音度和使用场景开始，快速缩小范围。",
    href: "/collection/first-time",
  },
  {
    title: "可穿戴与远程控制",
    summary: "适合异地互动、App 控制和更灵活的解放双手体验。",
    href: "/collection/wearable",
  },
  {
    title: "双重刺激",
    summary: "适合想要更强反馈、更完整包裹感的用户。",
    href: "/collection/dual-stimulation",
  },
];

const trustBlocks = [
  {
    title: "隐私包装",
    copy: "默认低调包装与私密账单描述，减少收货顾虑。",
  },
  {
    title: "48 小时内发货",
    copy: "常规现货订单 48 小时内发出，支持物流跟踪。",
  },
  {
    title: "售后支持",
    copy: "购买前后都可以从 FAQ、客服邮箱和帮助页获得支持。",
  },
];

const guidanceSteps = [
  {
    title: "先看自己属于哪类场景",
    copy: "第一次购买、想要更安静低调、想要 wearable，还是更在意 App Control。先明确场景，比先看参数更容易缩小范围。",
  },
  {
    title: "再看预算和使用门槛",
    copy: "如果你希望第一次就买得轻松，优先看操作复杂度、静音度和是否适合新手，而不只是刺激强度。",
  },
  {
    title: "最后再进入商品页比较",
    copy: "当方向已经清楚，再去比较价格、库存、配送、FAQ 和售后说明，支付前的犹豫会少很多。",
  },
];

const audienceBlocks = [
  "第一次购买但不想在信息里迷路的人",
  "重视安静、隐私包装和更低负担体验的人",
  "想看 App Control、异地互动或 wearable 路线的人",
];

export default async function HomePage() {
  const site = getActiveSiteConfig();
  const featuredProducts = (await listProducts()).slice(0, 3);

  return (
    <div className="bg-zinc-50">
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">
            {site.brand.name}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 md:text-6xl">
            更会推荐、也更容易下单的私密好物商店。
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-600">
            从入门推荐、场景筛选到正式下单与售后支持，把“想试试”变成真正能放心购买。
            适合第一次选购、想要更低调体验，或需要 App / 异地互动的用户。
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
              href="/shop"
            >
              进入商店
            </Link>
            <Link
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium text-zinc-900 hover:bg-white"
              href="/quiz"
            >
              先做选购问答
            </Link>
          </div>
          <div className="grid gap-4 pt-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-2xl font-semibold text-zinc-900">3+</p>
              <p className="mt-1 text-sm text-zinc-600">已上线可售商品</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-2xl font-semibold text-zinc-900">48h</p>
              <p className="mt-1 text-sm text-zinc-600">常规现货发货时效</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-2xl font-semibold text-zinc-900">1 对 1</p>
              <p className="mt-1 text-sm text-zinc-600">选购与售后支持</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-900">为什么先从这里开始选</p>
          <div className="mt-6 space-y-4">
            {[
              "按场景选：第一次入门、异地互动、可穿戴、双重刺激",
              "按体验选：静音度、强度、新手友好度、是否支持 App",
              "购买前先看 FAQ、配送、退换说明，减少支付前犹豫",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-600">
            <Link className="underline underline-offset-4" href="/shipping">
              配送说明
            </Link>
            <Link className="underline underline-offset-4" href="/returns">
              退换政策
            </Link>
            <Link className="underline underline-offset-4" href="/faq">
              常见问题
            </Link>
            <Link className="underline underline-offset-4" href="/contact">
              联系支持
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">精选推荐</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              先从最容易成交的商品开始
            </h2>
          </div>
          <Link className="text-sm text-zinc-700 underline underline-offset-4" href="/shop">
            查看全部商品
          </Link>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {featuredProducts.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              eyebrow={index === 0 ? "热销推荐" : index === 1 ? "入门友好" : "高讨论度"}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">按需求进入</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              别让用户在首页停太久
            </h2>
          </div>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {collectionHighlights.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-3xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 hover:shadow-sm"
            >
              <p className="text-lg font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{item.summary}</p>
              <p className="mt-6 text-sm text-zinc-900">去看这类商品 →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">怎么开始选</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              别一开始就被参数拖住
            </h2>
            <div className="mt-8 space-y-4">
              {guidanceSteps.map((item, index) => (
                <div key={item.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                  <p className="text-sm font-medium text-zinc-900">
                    {index + 1}. {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">更适合谁</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              这不是一个只会堆商品的首页
            </h2>
            <p className="mt-4 text-sm leading-7 text-zinc-600">
              我们更希望把首页做成一个“先理解自己，再开始看货”的入口，所以会优先把用户带到适合的合集、
              问答和商品页，而不是让人先在大量陌生名词里反复跳转。
            </p>
            <div className="mt-6 space-y-3">
              {audienceBlocks.map((item) => (
                <div key={item} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link className="underline underline-offset-4" href="/quiz">
                直接开始问答
              </Link>
              <Link className="underline underline-offset-4" href="/guides">
                先看导购内容
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-500">放心购买</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
                让“想买”顺利走到“下单”
              </h2>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
              href="/checkout"
            >
              直接去结账
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {trustBlocks.map((item) => (
              <div key={item.title} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="text-base font-semibold text-zinc-900">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
