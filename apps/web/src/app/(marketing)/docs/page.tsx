import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Architecture Docs
      </h1>
      <p className="mt-3 text-zinc-600">
        架构文档存放在仓库的 <code className="rounded bg-zinc-100 px-1">docs/architecture</code>{" "}
        目录中，建议从索引开始阅读。
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
          <li>
            <span className="font-medium">README</span>：文档索引（阅读入口）
          </li>
          <li>
            <span className="font-medium">overview</span>：架构总览与版本规划
          </li>
          <li>
            <span className="font-medium">routing</span>：目录与路由规划
          </li>
          <li>
            <span className="font-medium">data-model</span>：Sanity/Medusa 数据模型
          </li>
          <li>
            <span className="font-medium">page-modules</span>：页面模块清单与数据来源
          </li>
        </ul>
      </div>
      <div className="mt-8">
        <Link className="text-sm underline underline-offset-4" href="/">
          Back to Home
        </Link>
      </div>
    </div>
  );
}

