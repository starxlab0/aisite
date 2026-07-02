import Link from "next/link";

export default function AppControlPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        App Control
      </h1>
      <p className="mt-4 text-zinc-600">
        专题页骨架：后续由 Sanity 驱动内容模块，并从 Medusa 过滤
        <code className="rounded bg-zinc-100 px-1">appControl=true</code> 的商品列表。
      </p>
      <div className="mt-8 flex gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/shop">
          Go to Shop
        </Link>
        <Link className="underline underline-offset-4" href="/quiz">
          Find Your Match
        </Link>
      </div>
    </div>
  );
}

