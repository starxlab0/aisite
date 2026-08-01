import Link from "next/link";
import { FooterNewsletter } from "@/components/layout/FooterNewsletter";
import { GeoPreferenceSelector } from "@/components/layout/GeoPreferenceSelector";
import { filterFeatureEnabledNavItems, getSiteConfigForLocale } from "@/lib/site/config";
import { getFooterNavLabel } from "@/lib/site/copy";
import { buildLocalePath } from "@/lib/site/locale-routing";
import { getRequestLocaleKey } from "@/lib/site/locale-routing.server";

export async function SiteFooter() {
  const localeKey = await getRequestLocaleKey();
  const site = getSiteConfigForLocale(localeKey);
  const footerNavItems = filterFeatureEnabledNavItems(site.site.navigation.footer, localeKey);

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="mb-6">
          <GeoPreferenceSelector />
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="text-sm text-zinc-600">
            <p>© {new Date().getFullYear()} {site.brand.name}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              {footerNavItems.map((item) => (
                <Link key={item.href} className="hover:text-zinc-900" href={buildLocalePath(item.href, localeKey)}>
                  {getFooterNavLabel(item.href, item.label, localeKey)}
                </Link>
              ))}
            </div>
          </div>
          <div className="w-full md:w-auto">
            <FooterNewsletter brandName={site.brand.name} localeKey={localeKey} />
          </div>
        </div>
      </div>
    </footer>
  );
}
