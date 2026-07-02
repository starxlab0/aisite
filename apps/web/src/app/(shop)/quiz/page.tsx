import Link from "next/link";

export default function QuizPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Find Your Match
      </h1>
      <p className="mt-4 text-zinc-600">
        选购问答骨架：首期可先前端实现，后续可迁移到 Sanity 配置问题与推荐规则。
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">Q1. Is this your first toy?</p>
        <div className="mt-4 flex flex-col gap-3">
          <button className="h-11 rounded-md border border-zinc-300 bg-white text-left px-4 text-sm hover:bg-zinc-50">
            Yes
          </button>
          <button className="h-11 rounded-md border border-zinc-300 bg-white text-left px-4 text-sm hover:bg-zinc-50">
            No
          </button>
        </div>
      </div>

      <div className="mt-8 flex gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/collection/first-time">
          Browse first-time picks
        </Link>
        <Link className="underline underline-offset-4" href="/shop">
          Shop all
        </Link>
      </div>
    </div>
  );
}

