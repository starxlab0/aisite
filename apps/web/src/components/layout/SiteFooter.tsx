import Link from "next/link";
import { FooterNewsletter } from "@/components/layout/FooterNewsletter";
import { getActiveSiteConfig } from "@/lib/site/config";

export function SiteFooter() {
  const site = getActiveSiteConfig();

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="text-sm text-zinc-600">
            <p>© {new Date().getFullYear()} {site.brand.name}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              {site.site.navigation.footer.map((item) => (
                <Link key={item.href} className="hover:text-zinc-900" href={item.href}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <FooterNewsletter brandName={site.brand.name} />
        </div>
      </div>
    </footer>
  );
}
