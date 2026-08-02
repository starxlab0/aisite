import Link from "next/link";
import { notFound } from "next/navigation";
import { listProducts } from "@/lib/commerce/products";
import { getLocalizedCopy } from "@/lib/site/copy";
import { getSiteConfigForLocale, isSiteFeatureEnabled } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { AiQuiz } from "./quiz-ui";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuizPage({ searchParams }: Props) {
  const localeKey = await getRequestLocaleKey();
  if (!isSiteFeatureEnabled("quiz", localeKey)) notFound();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getLocalizedCopy(localeKey).quiz;
  const sp = (await searchParams) ?? {};
  const src = typeof sp.src === "string" ? sp.src : "direct";
  const product = typeof sp.product === "string" ? sp.product : null;
  const products = await listProducts();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{copy.pageTitle}</h1>
      <p className="mt-4 text-zinc-600">
        {copy.pageDescription}
      </p>

      <AiQuiz
        source={src}
        sourceProductSlug={product}
        products={products}
        localeKey={localeKey}
        siteFeatures={{
          bundles: site.site.features.bundles,
          appControl: site.site.features.appControl,
        }}
      />

      <div className="mt-10 flex flex-wrap gap-4 text-sm">
        <Link className="underline underline-offset-4" href={buildLocalePath("/collection/first-time", localeKey)}>
          {copy.firstTimeCta}
        </Link>
        <Link className="underline underline-offset-4" href={buildLocalePath("/shop", localeKey)}>
          {copy.shopAllCta}
        </Link>
      </div>
    </div>
  );
}
