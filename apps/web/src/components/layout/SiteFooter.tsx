import Link from "next/link";
import { getActiveSiteConfig } from "@/lib/site/config";

export function SiteFooter() {
  const site = getActiveSiteConfig();

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-zinc-600 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} {site.brand.name}</p>
        <div className="flex gap-4">
          {site.site.navigation.footer.map((item) => (
            <Link key={item.href} className="hover:text-zinc-900" href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
