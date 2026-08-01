export type SiteFeatureMap = {
  guides: boolean;
  bundles: boolean;
  appControl: boolean;
  quiz: boolean;
};

export function resolveFeatureForPath(pathname: string): keyof SiteFeatureMap | null {
  const normalizedPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (normalizedPath === "/guides" || normalizedPath.startsWith("/guides/")) return "guides";
  if (normalizedPath === "/bundles" || normalizedPath.startsWith("/bundles/")) return "bundles";
  if (normalizedPath === "/app-control" || normalizedPath.startsWith("/app-control/")) return "appControl";
  if (normalizedPath === "/collection/app-control" || normalizedPath.startsWith("/collection/app-control")) return "appControl";
  if (normalizedPath === "/quiz" || normalizedPath.startsWith("/quiz/")) return "quiz";
  return null;
}

export function isFeaturePathEnabledForFeatures(pathname: string, features: SiteFeatureMap) {
  const feature = resolveFeatureForPath(pathname);
  if (!feature) return true;
  return Boolean(features[feature]);
}

export function filterFeatureEnabledItemsForFeatures<T extends { href: string }>(
  items: T[],
  features: SiteFeatureMap,
) {
  return items.filter((item) => isFeaturePathEnabledForFeatures(item.href, features));
}
