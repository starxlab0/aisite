import Link from "next/link";
import { getCurrentCart } from "@/features/cart/server";
import { getActiveSiteConfig } from "@/lib/site/config";

export async function SiteHeader() {
  const site = getActiveSiteConfig();
  const cart = await getCurrentCart();
  const cartQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 md:py-4">
        <div className="flex items-center justify-between gap-3">
        <Link href="/" className="min-w-0 flex items-center gap-3 font-semibold tracking-tight text-zinc-900">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-sm text-white">
            {site.brand.name.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{site.brand.name}</span>
            <span className="hidden text-xs font-normal text-zinc-500 sm:block">{site.brand.tagline}</span>
          </span>
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

        <div className="flex items-center gap-3">
          <Link
            href="/shop"
            className="hidden rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 md:inline-flex"
          >
            去选购
          </Link>
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 md:px-4"
          >
            <span className="hidden sm:inline">购物车</span>
            <span className="sm:hidden">购物车</span>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-white">
              {cartQuantity}
            </span>
          </Link>
        </div>
        </div>

        <nav className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden">
          {site.site.navigation.header.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/shop"
            className="whitespace-nowrap rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
          >
            去选购
          </Link>
        </nav>
      </div>
    </header>
  );
}
