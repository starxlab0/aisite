import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildGeoSignals } from "@/lib/geo/geo-utils";
import {
  buildLocalePath,
  DEFAULT_LOCALE_KEY,
  isSupportedLocaleKey,
  LOCALE_COOKIE_NAME,
  stripLocalePrefix,
} from "@/lib/site/locale-routing";
import {
  GEO_BANNER_DISMISSED_COOKIE,
  GEO_COUNTRY_COOKIE,
  GEO_MANUAL_SITE_COOKIE,
  GEO_RECOMMENDED_SITE_COOKIE,
} from "@/lib/geo/geo.server";

const KNOWN_SITE_KEYS = new Set(["cn-store", "us-store", "jp-store"]);

function normalizeSiteKey(input?: string | null) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return null;
  return KNOWN_SITE_KEYS.has(value) ? value : null;
}

function shouldSkip(pathname: string) {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.startsWith("/sitemap.xml") ||
    pathname.includes(".")
  );
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  const siteChoice = request.nextUrl.searchParams.get("geo_site_choice");
  const localeChoice = request.nextUrl.searchParams.get("geo_locale_choice");
  const dismissBanner = request.nextUrl.searchParams.get("geo_dismiss_banner");

  if (siteChoice || localeChoice || dismissBanner) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.searchParams.delete("geo_site_choice");
    redirectUrl.searchParams.delete("geo_locale_choice");
    redirectUrl.searchParams.delete("geo_dismiss_banner");
    const response = NextResponse.redirect(redirectUrl);
    if (siteChoice) {
      response.cookies.set(GEO_MANUAL_SITE_COOKIE, siteChoice, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    if (localeChoice && isSupportedLocaleKey(localeChoice)) {
      response.cookies.set(LOCALE_COOKIE_NAME, localeChoice, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    if (dismissBanner === "1") {
      response.cookies.set(GEO_BANNER_DISMISSED_COOKIE, "1", {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 14,
      });
    }
    return response;
  }

  const geo = buildGeoSignals({ headers: request.headers });
  const manualSiteKey = normalizeSiteKey(request.cookies.get(GEO_MANUAL_SITE_COOKIE)?.value);
  const preferredSiteKey = normalizeSiteKey(geo.recommendedSiteKey);
  const defaultSiteKey = normalizeSiteKey(process.env.SITE_KEY) || "cn-store";
  const effectiveSiteKey = manualSiteKey || preferredSiteKey || defaultSiteKey;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const { localeKey, pathname: strippedPathname } = stripLocalePrefix(pathname);
  const effectiveLocale = isSupportedLocaleKey(localeKey)
    ? localeKey
    : isSupportedLocaleKey(cookieLocale)
      ? cookieLocale
      : geo.preferredLocale ?? DEFAULT_LOCALE_KEY;

  if (localeKey === DEFAULT_LOCALE_KEY && isSupportedLocaleKey(cookieLocale) && cookieLocale !== DEFAULT_LOCALE_KEY) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = buildLocalePath(pathname, cookieLocale);
    return NextResponse.redirect(redirectUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-site-locale", effectiveLocale);
  requestHeaders.set("x-site-key", effectiveSiteKey);
  requestHeaders.set("x-site-visible-pathname", pathname);
  if (geo.country) requestHeaders.set("x-geo-country", geo.country);
  if (geo.recommendedSiteKey) requestHeaders.set("x-geo-recommended-site", geo.recommendedSiteKey);

  if (pathname !== strippedPathname) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = strippedPathname;
    const response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: requestHeaders,
      },
    });
    response.cookies.set(LOCALE_COOKIE_NAME, effectiveLocale, {
      path: "/",
      sameSite: "lax",
    });
    if (geo.country) {
      response.cookies.set(GEO_COUNTRY_COOKIE, geo.country, { path: "/", sameSite: "lax" });
    }
    if (geo.recommendedSiteKey) {
      response.cookies.set(GEO_RECOMMENDED_SITE_COOKIE, geo.recommendedSiteKey, { path: "/", sameSite: "lax" });
    }
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.cookies.set(LOCALE_COOKIE_NAME, effectiveLocale, {
    path: "/",
    sameSite: "lax",
  });
  if (geo.country) {
    response.cookies.set(GEO_COUNTRY_COOKIE, geo.country, { path: "/", sameSite: "lax" });
  }
  if (geo.recommendedSiteKey) {
    response.cookies.set(GEO_RECOMMENDED_SITE_COOKIE, geo.recommendedSiteKey, { path: "/", sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
