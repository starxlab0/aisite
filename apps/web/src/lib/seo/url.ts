export function getSiteBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_BASE_URL ||
    process.env.WEB_BASE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function buildAbsoluteUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteBaseUrl()}${normalized}`;
}

