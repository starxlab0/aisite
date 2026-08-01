import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE_KEY,
  isSupportedLocaleKey,
  LOCALE_COOKIE_NAME,
  normalizePathname,
  type SupportedLocaleKey,
} from "@/lib/site/locale-routing";

export async function getRequestLocaleKey(): Promise<SupportedLocaleKey> {
  const headerStore = await headers();
  const headerLocale = headerStore.get("x-site-locale");
  if (isSupportedLocaleKey(headerLocale)) return headerLocale;

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isSupportedLocaleKey(cookieLocale)) return cookieLocale;

  return DEFAULT_LOCALE_KEY;
}

export async function getRequestVisiblePathname(): Promise<string> {
  const headerStore = await headers();
  return normalizePathname(headerStore.get("x-site-visible-pathname") || "/");
}
