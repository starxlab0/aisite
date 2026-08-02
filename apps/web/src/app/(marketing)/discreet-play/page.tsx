import Link from "next/link";
import { getSiteConfigForLocale } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

function getDiscreetPlayCopy(localeKey: "en" | "zh") {
  if (localeKey === "en") {
    return {
      paragraphs: [
        "This route works best if you care most about quiet use, discretion, easy storage, or reducing the emotional weight of the buying process. The comparison usually starts with noise, wearing style, control complexity, and packaging privacy.",
        "For a first purchase, you do not need to chase the most complex feature set first. A steadier, easier-to-understand, and more everyday-friendly experience usually makes the first order easier to feel good about.",
        "You can keep filtering from the shop page, or go straight into the quiz and let the system narrow the route around quiet use, wearable fit, and simpler controls.",
      ],
      shop: "Keep browsing the shop",
      quiz: "Take the quiz first",
    };
  }
  return {
    paragraphs: [
      "如果你更看重安静、低调、容易收纳或不想让选择过程太有负担，这一页更适合作为起点。这类商品通常会优先比较噪音、穿戴方式、操作复杂度和包装隐私感。",
      "第一次购买时，不一定要先追求最复杂的功能；更稳定、好理解、适合日常使用的体验，往往更容易做出不后悔的第一单。",
      "你可以继续从商店页筛选，也可以直接进入问答页，让系统按“安静 / 可穿戴 / 简单操作”的偏好给出更接近的推荐。",
    ],
    shop: "去商店继续看",
    quiz: "先做问答",
  };
}

export default async function DiscreetPlayPage() {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getDiscreetPlayCopy(localeKey);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Discreet Play
      </h1>
      <div className="mt-4 space-y-4 text-zinc-600">
        {copy.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link className="underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
          {copy.shop}
        </Link>
        {site.site.features.quiz ? (
          <Link className="underline underline-offset-4" href={buildLocalePath("/quiz?src=discreet-play", localeKey)}>
            {copy.quiz}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
