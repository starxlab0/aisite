export function appendGeoPreferenceParams(
  href: string,
  input: {
    siteKey?: string;
    localeKey?: string;
    dismissBanner?: boolean;
  },
) {
  const url = new URL(href, "http://local.test");
  if (input.siteKey) url.searchParams.set("geo_site_choice", input.siteKey);
  if (input.localeKey) url.searchParams.set("geo_locale_choice", input.localeKey);
  if (input.dismissBanner) url.searchParams.set("geo_dismiss_banner", "1");
  const result = `${url.pathname}${url.search}`;
  return href.startsWith("http://") || href.startsWith("https://")
    ? `${href.split("?")[0]}${url.search}`
    : result;
}

