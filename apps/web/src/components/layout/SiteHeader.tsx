import Link from "next/link";
import { getCurrentCart } from "@/features/cart/server";
import { filterFeatureEnabledNavItems, getSiteConfigForLocale } from "@/lib/site/config.server";
import { getHeaderNavLabel, getLocalizedCopy } from "@/lib/site/copy";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";
import { GeoRecommendationBanner } from "@/components/layout/GeoRecommendationBanner";
import { GeoPreferencePopover } from "@/components/layout/GeoPreferencePopover";

export async function SiteHeader() {
  const localeKey = await getRequestLocaleKey();
  const site = await getSiteConfigForLocale(localeKey);
  const copy = getLocalizedCopy(localeKey);
  const headerNavItems = await filterFeatureEnabledNavItems(site.site.navigation.header, localeKey);
  const cart = await getCurrentCart();
  const cartQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 md:py-4">
        <div className="mb-3">
          <GeoRecommendationBanner />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Link
            href={buildLocalePath("/", localeKey)}
            className="min-w-0 flex items-center gap-3 font-semibold tracking-tight text-zinc-900"
          >
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

          <div className="flex items-center gap-2 sm:gap-3">
            <GeoPreferencePopover />

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

            <details className="relative md:hidden">
              <summary
                className={[
                  "inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:text-zinc-900",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2",
                  "[&::-webkit-details-marker]:hidden",
                ].join(" ")}
              >
                <span>{localeKey === "zh" ? "菜单" : "Menu"}</span>
                <span aria-hidden="true" className="text-zinc-400">
                  ☰
                </span>
              </summary>

              <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
                <nav className="grid gap-1">
                  {headerNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={buildLocalePath(item.href, localeKey)}
                      className="rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      {getHeaderNavLabel(item.href, item.label, localeKey)}
                    </Link>
                  ))}
                </nav>
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
