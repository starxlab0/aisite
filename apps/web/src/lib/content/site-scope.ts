import "server-only";

import { getActiveSiteContext } from "@/lib/site/config.server";
import { filterBySiteScopeValue, matchesSiteScopeValue } from "@/lib/site/site-scope-utils";

export async function getCurrentSiteKey() {
  return (await getActiveSiteContext()).siteKey;
}

export function matchesSiteScope(
  value:
    | {
        siteKeys?: string[] | null;
      }
    | null
    | undefined,
  siteKey: string,
) {
  return matchesSiteScopeValue(value, siteKey);
}

export function filterBySiteScope<T extends { siteKeys?: string[] | null }>(
  items: T[],
  siteKey: string,
) {
  return filterBySiteScopeValue(items, siteKey);
}
