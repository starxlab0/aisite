import "server-only";

import { getProductContentBySlug, getGuideBySlug, getCollectionPageBySlug } from "@/lib/cms/queries";
import {
  getPublishedCollectionDraftBySlug,
  getPublishedGuideDraftBySlug,
  getPublishedProductContentDraftBySlug,
} from "@/lib/control-plane/drafts";
import { getProductBySlugForSite } from "@/lib/commerce/products";
import { fallbackGuideBySlug, fallbackProductContentBySlug } from "@/lib/content/fallback-localized-content";
import { matchesSiteScopeValue } from "@/lib/site/site-scope-utils";
import { isFeaturePathEnabledForFeatures } from "@/lib/site/feature-utils";
import { stripLocalePrefix } from "@/lib/site/locale-routing";
import { tenantRegistry } from "@/lib/site/site-registry";
import { getActiveSiteContext } from "@/lib/site/config";

async function isGuideAvailableForSite(slug: string, siteKey: string) {
  const draft = await getPublishedGuideDraftBySlug(slug);
  if (draft?.payload && matchesSiteScopeValue(draft.payload, siteKey)) return true;

  const sanity = await getGuideBySlug(slug);
  if (sanity && matchesSiteScopeValue(sanity, siteKey)) return true;

  return matchesSiteScopeValue(fallbackGuideBySlug[slug], siteKey);
}

async function isCollectionAvailableForSite(slug: string, siteKey: string) {
  const draft = await getPublishedCollectionDraftBySlug(slug);
  if (draft?.payload && matchesSiteScopeValue(draft.payload, siteKey)) return true;

  const sanity = await getCollectionPageBySlug(slug);
  if (sanity && matchesSiteScopeValue(sanity, siteKey)) return true;

  return true;
}

async function isProductAvailableForSite(slug: string, siteKey: string) {
  const commerce = await getProductBySlugForSite(slug, siteKey);
  if (commerce) return true;

  const draft = await getPublishedProductContentDraftBySlug(slug);
  if (draft?.payload && matchesSiteScopeValue(draft.payload, siteKey)) return true;

  const sanity = await getProductContentBySlug(slug);
  if (sanity && matchesSiteScopeValue(sanity, siteKey)) return true;

  return matchesSiteScopeValue(fallbackProductContentBySlug[slug], siteKey);
}

export async function resolveSafeSiteSwitchPath(visiblePathname: string, targetSiteKey: string) {
  const context = getActiveSiteContext();
  const tenant = tenantRegistry[context.tenantKey];
  const brand = tenant?.brands?.[context.brandKey];
  const siteDefinition = brand?.sites?.[targetSiteKey];
  const strippedPath = stripLocalePrefix(visiblePathname).pathname;

  if (!siteDefinition) return "/";

  if (!isFeaturePathEnabledForFeatures(strippedPath, siteDefinition.features)) {
    if (strippedPath.startsWith("/guides")) return "/";
    return "/shop";
  }

  const productMatch = strippedPath.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    return (await isProductAvailableForSite(productMatch[1], targetSiteKey)) ? strippedPath : "/shop";
  }

  const guideMatch = strippedPath.match(/^\/guides\/([^/]+)$/);
  if (guideMatch) {
    return (await isGuideAvailableForSite(guideMatch[1], targetSiteKey)) ? strippedPath : "/guides";
  }

  const collectionMatch = strippedPath.match(/^\/collection\/([^/]+)$/);
  if (collectionMatch) {
    return (await isCollectionAvailableForSite(collectionMatch[1], targetSiteKey)) ? strippedPath : "/shop";
  }

  return strippedPath;
}

