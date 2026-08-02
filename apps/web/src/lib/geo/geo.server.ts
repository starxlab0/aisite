import "server-only";

import { cookies, headers } from "next/headers";

export const GEO_COUNTRY_COOKIE = "geo_country";
export const GEO_RECOMMENDED_SITE_COOKIE = "geo_recommended_site";
export const GEO_MANUAL_SITE_COOKIE = "geo_manual_site";
export const GEO_BANNER_DISMISSED_COOKIE = "geo_banner_dismissed";

export async function getRequestGeoCountry(): Promise<string | null> {
  const headerStore = await headers();
  const headerCountry = headerStore.get("x-geo-country");
  if (headerCountry) return headerCountry;

  const cookieStore = await cookies();
  return cookieStore.get(GEO_COUNTRY_COOKIE)?.value ?? null;
}

export async function getRequestGeoRecommendedSiteKey(): Promise<string | null> {
  const headerStore = await headers();
  const headerSite = headerStore.get("x-geo-recommended-site");
  if (headerSite) return headerSite;

  const cookieStore = await cookies();
  return cookieStore.get(GEO_RECOMMENDED_SITE_COOKIE)?.value ?? null;
}

export async function getRequestGeoManualSiteKey(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(GEO_MANUAL_SITE_COOKIE)?.value ?? null;
}

export async function isGeoBannerDismissed(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(GEO_BANNER_DISMISSED_COOKIE)?.value === "1";
}
