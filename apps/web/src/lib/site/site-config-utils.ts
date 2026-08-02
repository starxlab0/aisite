import type { SiteContext, TenantConfig } from "@/lib/site/types";

export function listAvailableSiteKeysForContext(
  registry: Record<string, TenantConfig>,
  context: Pick<SiteContext, "tenantKey" | "brandKey">,
) {
  const tenant = registry[context.tenantKey];
  const brand = tenant?.brands?.[context.brandKey];
  return brand ? Object.keys(brand.sites) : [];
}
