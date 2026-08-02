export type GeoCountryCode = string;

export type GeoSignals = {
  country: GeoCountryCode | null;
  recommendedSiteKey: string | null;
  preferredLocale: "en" | "zh";
};

export function normalizeCountryCode(value: string | null | undefined): GeoCountryCode | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const normalized = trimmed.toUpperCase();
  if (normalized.length < 2 || normalized.length > 3) return null;
  return normalized;
}

export function getCountryCodeFromHeaders(headers: Headers): GeoCountryCode | null {
  // Common CDN / hosting headers:
  // - Vercel: x-vercel-ip-country
  // - Cloudflare: cf-ipcountry
  // - Generic: x-country
  const candidates = [
    headers.get("x-vercel-ip-country"),
    headers.get("cf-ipcountry"),
    headers.get("x-country"),
    headers.get("x-geo-country"),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCountryCode(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function recommendSiteKeyFromCountry(country: GeoCountryCode | null): string | null {
  if (!country) return null;
  // Minimal routing table for current sites.
  if (["CN", "HK", "MO", "TW"].includes(country)) return "cn-store";
  if (country === "JP") return "jp-store";
  if (["US", "CA"].includes(country)) return "us-store";
  return "us-store";
}

export function preferredLocaleFromGeo(input: { country: GeoCountryCode | null; acceptLanguage?: string | null }) {
  const al = (input.acceptLanguage ?? "").toLowerCase();
  if (al.includes("zh")) return "zh" as const;
  if (input.country && ["CN", "HK", "MO", "TW"].includes(input.country)) return "zh" as const;
  return "en" as const;
}

export function buildGeoSignals(input: { headers: Headers }) : GeoSignals {
  const country = getCountryCodeFromHeaders(input.headers);
  return {
    country,
    recommendedSiteKey: recommendSiteKeyFromCountry(country),
    preferredLocale: preferredLocaleFromGeo({
      country,
      acceptLanguage: input.headers.get("accept-language"),
    }),
  };
}

