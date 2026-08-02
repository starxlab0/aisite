import Link from "next/link";
import { getSiteConfigForLocale } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

function getLongDistanceCopy(localeKey: "en" | "zh") {
  if (localeKey === "en") {
    return {
      paragraphs: [
        "This route works best for long-distance couples or shoppers who care most about preserving a sense of interaction. The decision usually starts with app control, connection stability, ease of use, and privacy rather than raw one-time intensity.",
        "If you already know remote control or interaction matters most, compare app-enabled products first. If you are still unsure, take the quiz to narrow the field before returning to product pages for pricing, shape, and learning-curve comparisons.",
        "More products and content will continue to grow around this route, but it already works as a practical entry point for remote-interaction shopping.",
      ],
      appControl: "Explore the App Control route",
      quiz: "Take the quiz first",
    };
  }
  return {
    paragraphs: [
      "这条路线更适合异地情侣、想保留互动感的人，重点关注 App Control、连接稳定性、操作门槛和隐私体验，而不只是单次刺激强度。",
      "如果你已经明确希望远程控制或更重视互动感，优先看支持 App 的款式；如果还不确定，可以先去问答页快速缩小范围，再回到商品页比较价格、形态和使用门槛。",
      "相关商品和内容会继续围绕这条场景补充，但现在已经可以把它当作“远程互动导购入口”来使用。",
    ],
    appControl: "看 App Control 路线",
    quiz: "先做问答",
  };
}

export default async function LongDistancePage() {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getLongDistanceCopy(localeKey);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        Long-distance Play
      </h1>
      <div className="mt-4 space-y-4 text-zinc-600">
        {copy.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        {site.site.features.appControl ? (
          <Link className="underline underline-offset-4" href={buildLocalePath("/app-control", localeKey)}>
            {copy.appControl}
          </Link>
        ) : null}
        {site.site.features.quiz ? (
          <Link className="underline underline-offset-4" href={buildLocalePath("/quiz?src=long-distance", localeKey)}>
            {copy.quiz}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
