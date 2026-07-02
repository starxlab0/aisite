import Link from "next/link";
import { getActiveSiteConfig } from "@/lib/site/config";

export function SiteHeader() {
  const site = getActiveSiteConfig();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight text-zinc-900">
          {site.brand.name}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {site.site.navigation.header.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-zinc-700 hover:text-zinc-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
