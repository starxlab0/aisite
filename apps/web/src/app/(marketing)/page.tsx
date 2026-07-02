import Link from "next/link";
import { getActiveSiteConfig } from "@/lib/site/config";

export default function HomePage() {
  const site = getActiveSiteConfig();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          <p className="text-sm font-medium text-zinc-500">{site.brand.name}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-5xl">
            Smart intimacy, made more personal.
          </h1>
          <p className="text-zinc-600">
            这是独立站的开发骨架版本：包含路由、数据模型和页面模块的最小实现，后续会逐步接入
            Sanity 与 Medusa。
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
              href="/quiz"
            >
              Find Your Match
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-300 px-5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              href="/shop"
            >
              Shop
            </Link>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-zinc-600">
            <Link className="underline underline-offset-4" href="/app-control">
              App Control
            </Link>
            <Link className="underline underline-offset-4" href="/bundles">
              Bundles
            </Link>
            <Link className="underline underline-offset-4" href="/guides">
              Guides
            </Link>
            <Link className="underline underline-offset-4" href="/docs">
              Docs
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-semibold text-zinc-900">下一步接入</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-700">
            <li>Sanity：站点内容、商品文案、分类页与专题页</li>
            <li>Medusa：商品/价格/库存/购物车/订单</li>
            <li>Revalidate Webhook：内容或商品变更后刷新 ISR 页面</li>
            <li>埋点：GA4 + PostHog 事件</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
