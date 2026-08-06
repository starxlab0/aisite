import "server-only";

import Link from "next/link";

import { listAvailableSiteKeys } from "@/lib/site/config.server";
import { getActiveSiteContext } from "@/lib/site/config.server";
import { SUPPORTED_LOCALE_KEYS, buildLocalePath, stripLocalePrefix } from "@/lib/site/locale-routing";
import { getRequestLocaleKey, getRequestVisiblePathname } from "@/lib/site/locale-routing.server";
import { getSiteLabel } from "@/lib/site/site-labels";
import { getSiteUrlBySiteKey } from "@/lib/site/site-url-map";
import { appendGeoPreferenceParams } from "@/lib/geo/geo-switch-url";
import { resolveSafeSiteSwitchPath } from "@/lib/geo/site-switch";

const localeLabels: Record<(typeof SUPPORTED_LOCALE_KEYS)[number], string> = {
  en: "English",
  zh: "简体中文",
};

function normalizeHttpOrigin(rawUrl: string | null) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function safeJoinUrl(origin: string, href: string) {
  try {
    return new URL(href, origin).toString();
  } catch {
    return href;
  }
}

export async function GeoPreferencePopover() {
  const localeKey = await getRequestLocaleKey();
  const visiblePathname = await getRequestVisiblePathname();
  const strippedPath = stripLocalePrefix(visiblePathname).pathname;

  const context = await getActiveSiteContext();
  const availableSiteKeys = await listAvailableSiteKeys(context);
  const currentSiteKey = context.siteKey;

  const siteLinks = await Promise.all(
    availableSiteKeys.map(async (siteKey) => {
      const safePath = await resolveSafeSiteSwitchPath(visiblePathname, siteKey);
      const localizedPath = buildLocalePath(safePath, localeKey);
      const relativeHref = appendGeoPreferenceParams(localizedPath, {
        siteKey,
        localeKey,
      });
      const origin = normalizeHttpOrigin(getSiteUrlBySiteKey(siteKey));
      const href = origin ? safeJoinUrl(origin, relativeHref) : relativeHref;
      return {
        siteKey,
        href,
        active: siteKey === currentSiteKey,
      };
    }),
  );

  return (
    <details className="relative">
      <summary
        className={[
          "inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:text-zinc-900",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2",
          "[&::-webkit-details-marker]:hidden",
        ].join(" ")}
      >
        <span className="hidden max-w-[9rem] truncate sm:inline">
          {getSiteLabel(currentSiteKey, localeKey)} · {localeLabels[localeKey]}
        </span>
        <span className="sm:hidden">{localeKey === "zh" ? "站点/语言" : "Region"}</span>
        <span aria-hidden="true" className="text-zinc-400">
          ▾
        </span>
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          {localeKey === "zh" ? "站点与语言" : "Region & language"}
        </p>
        <div className="mt-3 grid gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">{localeKey === "zh" ? "站点" : "Site"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {siteLinks.map((entry) => {
                if (!entry) return null;
                return (
                  <Link
                    key={entry.siteKey}
                    href={entry.href}
                    className={[
                      "inline-flex rounded-full border px-3 py-1.5 text-sm",
                      entry.active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
                    ].join(" ")}
                  >
                    {getSiteLabel(entry.siteKey, localeKey)}
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-900">{localeKey === "zh" ? "语言" : "Language"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUPPORTED_LOCALE_KEYS.map((nextLocaleKey) => {
                const href = appendGeoPreferenceParams(buildLocalePath(strippedPath, nextLocaleKey), {
                  siteKey: currentSiteKey,
                  localeKey: nextLocaleKey,
                });
                const active = nextLocaleKey === localeKey;
                return (
                  <Link
                    key={nextLocaleKey}
                    href={href}
                    className={[
                      "inline-flex rounded-full border px-3 py-1.5 text-sm",
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
                    ].join(" ")}
                  >
                    {localeLabels[nextLocaleKey]}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
