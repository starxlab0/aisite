import Link from "next/link";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

function getDocsCopy(localeKey: "en" | "zh") {
  if (localeKey === "en") {
    return {
      intro: "Architecture docs live in the repository under `docs/architecture`. Start with the index before jumping into individual documents.",
      items: [
        { key: "README", value: "document index and recommended reading order" },
        { key: "overview", value: "architecture overview and version planning" },
        { key: "routing", value: "directory and routing design" },
        { key: "data-model", value: "Sanity / Medusa data model" },
        { key: "page-modules", value: "page module list and data sources" },
      ],
      back: "Back to Home",
    };
  }
  return {
    intro: "架构文档存放在仓库的 `docs/architecture` 目录中，建议从索引开始阅读。",
    items: [
      { key: "README", value: "文档索引（阅读入口）" },
      { key: "overview", value: "架构总览与版本规划" },
      { key: "routing", value: "目录与路由规划" },
      { key: "data-model", value: "Sanity/Medusa 数据模型" },
      { key: "page-modules", value: "页面模块清单与数据来源" },
    ],
    back: "Back to Home",
  };
}

export default async function DocsPage() {
  const localeKey = await getRequestLocaleKey();
  const copy = getDocsCopy(localeKey);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Architecture Docs
      </h1>
      <p className="mt-3 text-zinc-600">
        {copy.intro.split("`docs/architecture`")[0]}
        <code className="rounded bg-zinc-100 px-1">docs/architecture</code>
        {copy.intro.split("`docs/architecture`")[1]}
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
          {copy.items.map((item) => (
            <li key={item.key}>
              <span className="font-medium">{item.key}</span>: {item.value}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-8">
        <Link className="text-sm underline underline-offset-4" href={buildLocalePath("/", localeKey)}>
          {copy.back}
        </Link>
      </div>
    </div>
  );
}
