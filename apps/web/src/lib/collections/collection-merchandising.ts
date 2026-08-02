export type CollectionProductLike = {
  slug: string;
  beginnerLevel: number;
  appControl: boolean;
  wearable: boolean;
  stimulationType: string[];
  collections: string[];
};

export type CollectionCtaLike = {
  href: string;
  label: string;
};

export function getBaseCollectionProducts<T extends CollectionProductLike>(products: T[], slug: string) {
  return products.filter((product) => {
    if (slug === "first-time") return product.beginnerLevel >= 4;
    if (slug === "app-control") return product.appControl;
    if (slug === "wearable") return product.wearable;
    if (slug === "dual-stimulation") return product.stimulationType.includes("dual");
    return product.collections.includes(slug);
  });
}

export function pickCollectionProducts<T extends CollectionProductLike>(
  products: T[],
  slug: string,
  contentFeaturedProductSlugs?: string[],
  overrideFeaturedProductSlugs?: string[],
) {
  const preferredSlugs = contentFeaturedProductSlugs?.length
    ? contentFeaturedProductSlugs
    : overrideFeaturedProductSlugs?.length
      ? overrideFeaturedProductSlugs
      : [];

  if (preferredSlugs.length) {
    return preferredSlugs
      .map((productSlug) => products.find((product) => product.slug === productSlug))
      .filter((product): product is T => Boolean(product));
  }

  return getBaseCollectionProducts(products, slug);
}

export function pickCollectionCtaLinks<T extends { href: string }>(
  contentCtaLinks: T[] | undefined,
  overrideCtaLinks: T[] | undefined,
  isFeaturePathEnabled: (pathname: string) => boolean,
) {
  const preferredLinks = contentCtaLinks?.length ? contentCtaLinks : overrideCtaLinks ?? [];
  return preferredLinks.filter((item) => isFeaturePathEnabled(item.href));
}
