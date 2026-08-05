import Link from "next/link";
import { appendGeoPreferenceParams } from "@/lib/geo/geo-switch-url";
import { getSiteConfigForLocale } from "@/lib/site/config.server";
import { buildLocalePath, stripLocalePrefix } from "@/lib/site/locale-routing";
import { getRequestLocaleKey, getRequestVisiblePathname } from "@/lib/site/locale-routing.server";
import {
  getRequestGeoCountry,
  getRequestGeoManualSiteKey,
  getRequestGeoRecommendedSiteKey,
  isGeoBannerDismissed,
} from "@/lib/geo/geo.server";
import { getSiteUrlBySiteKey } from "@/lib/site/site-url-map";
import { resolveSafeSiteSwitchPath } from "@/lib/geo/site-switch";

export async function GeoRecommendationBanner() {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  const country = await getRequestGeoCountry();
  const recommendedSiteKey = await getRequestGeoRecommendedSiteKey();
  const manualSiteKey = await getRequestGeoManualSiteKey();
  const dismissed = await isGeoBannerDismissed();
  const visiblePathname = await getRequestVisiblePathname();
  const strippedPath = stripLocalePrefix(visiblePathname).pathname;

  if (!recommendedSiteKey) return null;
  if (recommendedSiteKey === site.context.siteKey) return null;
  if (manualSiteKey) return null;
  if (dismissed) return null;

  const targetBaseUrl = getSiteUrlBySiteKey(recommendedSiteKey);
  if (!targetBaseUrl) return null;
  const safePath = await resolveSafeSiteSwitchPath(visiblePathname, recommendedSiteKey);
  const targetHref = appendGeoPreferenceParams(`${targetBaseUrl}${buildLocalePath(safePath, localeKey)}`, {
    siteKey: recommendedSiteKey,
    localeKey,
  });
  const dismissHref = appendGeoPreferenceParams(buildLocalePath(strippedPath, localeKey), {
    dismissBanner: true,
  });

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-6">
          {country ? `检测到你所在地区为 ${country}。` : "我们检测到你可能在其他站点体验更好。"}
          {" "}
          建议切换到 <span className="font-medium">{recommendedSiteKey}</span>。
        </p>
        <div className="flex items-center gap-3">
          <Link
            href={dismissHref}
            className="text-sm text-blue-900 underline underline-offset-4"
          >
            关闭提示
          </Link>
          <Link
            href={targetHref}
            className="inline-flex items-center justify-center rounded-full bg-blue-950 px-4 py-2 text-sm font-medium text-white"
          >
            去推荐站点
          </Link>
        </div>
      </div>
    </div>
  );
}
