import type { MetadataRoute } from "next";
import { listProducts } from "@/lib/commerce/products";
import { resolveGuideList } from "@/lib/content/resolvers";
import { buildAbsoluteUrl } from "@/lib/seo/url";
import { buildFeatureEnabledSitemapRoutes } from "@/lib/seo/sitemap-utils";
import { getActiveSiteConfig, isFeaturePathEnabled } from "@/lib/site/config";
import { buildLocalePath } from "@/lib/site/locale-routing";

async function getProductRoutes() {
  try {
    const products = await listProducts();
    return products.map((product) => `/product/${product.slug}`);
  } catch {
    return [];
  }
}

async function getGuideRoutes() {
  try {
    const guides = await resolveGuideList();
    return guides.items.map((guide) => `/guides/${guide.slug}`);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const site = getActiveSiteConfig();
  const [productRoutes, guideRoutes] = await Promise.all([
    getProductRoutes(),
    site.site.features.guides ? getGuideRoutes() : Promise.resolve([]),
  ]);
  const canonicalRoutes = buildFeatureEnabledSitemapRoutes(
    site.site.features,
    productRoutes,
    guideRoutes.filter((path) => isFeaturePathEnabled(path, site.context.localeKey)),
  );
  const routes = canonicalRoutes.flatMap((path) => [buildLocalePath(path, "en"), buildLocalePath(path, "zh")]);

  return Array.from(new Set(routes)).map((path) => ({
    url: buildAbsoluteUrl(path),
    lastModified: now,
  }));
}
