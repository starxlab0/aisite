type SiteFeatureMap = {
  guides: boolean;
  bundles: boolean;
  appControl: boolean;
  quiz: boolean;
};

function resolveFeatureForPath(pathname: string): keyof SiteFeatureMap | null {
  const normalizedPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (normalizedPath === "/guides" || normalizedPath.startsWith("/guides/")) return "guides";
  if (normalizedPath === "/bundles" || normalizedPath.startsWith("/bundles/")) return "bundles";
  if (normalizedPath === "/app-control" || normalizedPath.startsWith("/app-control/")) return "appControl";
  if (normalizedPath === "/collection/app-control" || normalizedPath.startsWith("/collection/app-control")) return "appControl";
  if (normalizedPath === "/quiz" || normalizedPath.startsWith("/quiz/")) return "quiz";
  return null;
}

function isFeaturePathEnabledForFeatures(pathname: string, features: SiteFeatureMap) {
  const feature = resolveFeatureForPath(pathname);
  if (!feature) return true;
  return Boolean(features[feature]);
}

export const staticSitemapRoutes = [
  "/",
  "/shop",
  "/bundles",
  "/guides",
  "/quiz",
  "/app-control",
  "/long-distance",
  "/discreet-play",
  "/how-to-choose",
  "/faq",
  "/shipping",
  "/returns",
  "/privacy",
  "/contact",
];

export const collectionSitemapSlugs = ["first-time", "app-control", "wearable", "dual-stimulation"];

export function buildFeatureEnabledSitemapRoutes(
  features: SiteFeatureMap,
  productRoutes: string[],
  guideRoutes: string[],
) {
  const featureEnabledStaticRoutes = staticSitemapRoutes.filter((path) =>
    isFeaturePathEnabledForFeatures(path, features),
  );
  const featureEnabledCollectionRoutes = collectionSitemapSlugs
    .map((slug) => `/collection/${slug}`)
    .filter((path) => isFeaturePathEnabledForFeatures(path, features));

  return [
    ...featureEnabledStaticRoutes,
    ...featureEnabledCollectionRoutes,
    ...(features.guides ? guideRoutes : []),
    ...productRoutes,
  ];
}
