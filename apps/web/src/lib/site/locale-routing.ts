export const SUPPORTED_LOCALE_KEYS = ["en", "zh"] as const;
export type SupportedLocaleKey = (typeof SUPPORTED_LOCALE_KEYS)[number];
export const DEFAULT_LOCALE_KEY: SupportedLocaleKey = "en";
export const LOCALE_COOKIE_NAME = "site_locale";

export function isSupportedLocaleKey(value: string | null | undefined): value is SupportedLocaleKey {
  return SUPPORTED_LOCALE_KEYS.includes(value as SupportedLocaleKey);
}

export function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function stripLocalePrefix(pathname: string): { localeKey: SupportedLocaleKey; pathname: string } {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split("/");
  const maybeLocale = segments[1];

  if (isSupportedLocaleKey(maybeLocale)) {
    const rest = `/${segments.slice(2).join("/")}`;
    return {
      localeKey: maybeLocale,
      pathname: normalizePathname(rest),
    };
  }

  return {
    localeKey: DEFAULT_LOCALE_KEY,
    pathname: normalized,
  };
}

export function buildLocalePath(pathname: string, localeKey: SupportedLocaleKey) {
  const normalized = normalizePathname(pathname);
  if (localeKey === DEFAULT_LOCALE_KEY) return normalized;
  return normalized === "/" ? `/${localeKey}` : `/${localeKey}${normalized}`;
}

export function getLocaleKeyFromPathname(pathname: string): SupportedLocaleKey {
  return stripLocalePrefix(pathname).localeKey;
}

export function getAlternateLocalePaths(pathname: string) {
  const stripped = stripLocalePrefix(pathname).pathname;
  return {
    en: buildLocalePath(stripped, "en"),
    zh: buildLocalePath(stripped, "zh"),
    "x-default": buildLocalePath(stripped, DEFAULT_LOCALE_KEY),
  };
}
