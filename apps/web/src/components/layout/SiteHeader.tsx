import Link from "next/link";
import { getCurrentCart } from "@/features/cart/server";
import { filterFeatureEnabledNavItems, getSiteConfigForLocale } from "@/lib/site/config";
import { getHeaderNavLabel, getLocalizedCopy } from "@/lib/site/copy";
import { buildLocalePath, stripLocalePrefix } from "@/lib/site/locale-routing";
import { getRequestLocaleKey, getRequestVisiblePathname } from "@/lib/site/locale-routing.server";
import { GeoRecommendationBanner } from "@/components/layout/GeoRecommendationBanner";

export async function SiteHeader() {
  const localeKey = await getRequestLocaleKey();
  const visiblePathname = await getRequestVisiblePathname();
  const site = getSiteConfigForLocale(localeKey);
  const copy = getLocalizedCopy(localeKey);
  const headerNavItems = filterFeatureEnabledNavItems(site.site.navigation.header, localeKey);
  const cart = await getCurrentCart();
  const cartQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const canonicalPath = stripLocalePrefix(visiblePathname).pathname;
  const nextLocaleKey = localeKey === "zh" ? "en" : "zh";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 md:py-4">
        <div className="mb-3">
          <GeoRecommendationBanner />
        </div>
        <div className="flex items-center justify-between gap-3">
        <Link href={buildLocalePath("/", localeKey)} className="min-w-0 flex items-center gap-3 font-semibold tracking-tight text-zinc-900">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-sm text-white">
            {site.brand.name.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{site.brand.name}</span>
            <span className="hidden text-xs font-normal text-zinc-500 sm:block">{site.brand.tagline}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {headerNavItems.map((item) => (
            <Link
              key={item.href}
              href={buildLocalePath(item.href, localeKey)}
              className="text-sm text-zinc-700 hover:text-zinc-900"
            >
              {getHeaderNavLabel(item.href, item.label, localeKey)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={buildLocalePath(canonicalPath, nextLocaleKey)}
            className="hidden rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 md:inline-flex"
          >
            {nextLocaleKey === "zh" ? "中文" : "English"}
          </Link>
          <Link
            href={buildLocalePath("/shop", localeKey)}
            className="hidden rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 md:inline-flex"
          >
            {copy.header.shop}
          </Link>
          <Link
            href={buildLocalePath("/cart", localeKey)}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 md:px-4"
          >
            <span className="hidden sm:inline">{copy.header.cart}</span>
            <span className="sm:hidden">{copy.header.cart}</span>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-white">
              {cartQuantity}
            </span>
          </Link>
        </div>
        </div>

        <nav className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden">
          {headerNavItems.map((item) => (
            <Link
              key={item.href}
              href={buildLocalePath(item.href, localeKey)}
              className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            >
              {getHeaderNavLabel(item.href, item.label, localeKey)}
            </Link>
          ))}
          <Link
            href={buildLocalePath(canonicalPath, nextLocaleKey)}
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
          >
            {nextLocaleKey === "zh" ? "中文" : "English"}
          </Link>
          <Link
            href={buildLocalePath("/shop", localeKey)}
            className="whitespace-nowrap rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
          >
            {copy.header.shop}
          </Link>
        </nav>
      </div>
    </header>
  );
}
