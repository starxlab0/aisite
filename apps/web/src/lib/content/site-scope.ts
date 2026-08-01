import { getActiveSiteContext } from "@/lib/site/config";
import { filterBySiteScopeValue, matchesSiteScopeValue } from "@/lib/site/site-scope-utils";

export function getCurrentSiteKey() {
  return getActiveSiteContext().siteKey;
}

export function matchesSiteScope(
  value:
    | {
        siteKeys?: string[] | null;
      }
    | null
    | undefined,
  siteKey = getCurrentSiteKey(),
) {
  return matchesSiteScopeValue(value, siteKey);
}

export function filterBySiteScope<T extends { siteKeys?: string[] | null }>(
  items: T[],
  siteKey = getCurrentSiteKey(),
) {
  return filterBySiteScopeValue(items, siteKey);
}
