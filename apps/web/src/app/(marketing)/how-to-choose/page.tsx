import Link from "next/link";
import { getSiteConfigForLocale } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

function getHowToChooseCopy(localeKey: "en" | "zh") {
  if (localeKey === "en") {
    return {
      paragraphs: [
        "Start with four questions: is it for a first purchase, do you prefer something wearable, do you want app control, and roughly what budget range fits? Once those are clearer, most unsuitable options fall away quickly.",
        "If you want the faster route, go straight to the quiz. If you already have a rough direction, return to the shop and keep comparing price, form factor, fit, and FAQ details from product pages.",
        "More complete buying guides will continue to grow inside Guides, but this page already works as a practical entry point for deciding your criteria before browsing products.",
      ],
      quiz: "Go straight to the quiz",
      guides: "Browse Guides",
    };
  }
  return {
    paragraphs: [
      "选购时可以先看四件事：适不适合第一次购买、是否偏好可穿戴、要不要 App Control、以及预算大概落在哪个区间。先把这四项想清楚，通常就能排掉大部分不合适的款。",
      "如果你想要更省事的路径，直接去问答页会更快；如果你已经有大致方向，也可以回到商店页按商品页里的价格、形态、适合人群和 FAQ 继续比较。",
      "后续更完整的导购文章会继续沉淀到 Guides，但现在这页已经可以作为“先想清选择标准，再开始看商品”的入口。",
    ],
    quiz: "直接去问答",
    guides: "去看 Guides",
  };
}

export default async function HowToChoosePage() {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getHowToChooseCopy(localeKey);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        How to choose
      </h1>
      <div className="mt-4 space-y-4 text-zinc-600">
        {copy.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        {site.site.features.quiz ? (
          <Link className="underline underline-offset-4" href={buildLocalePath("/quiz?src=how-to-choose", localeKey)}>
            {copy.quiz}
          </Link>
        ) : null}
        {site.site.features.guides ? (
          <Link className="underline underline-offset-4" href={buildLocalePath("/guides", localeKey)}>
            {copy.guides}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
