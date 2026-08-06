import type { SupportedLocaleKey } from "@/lib/site/locale-routing";

export function getSiteLabel(siteKey: string, localeKey: SupportedLocaleKey) {
  const zh: Record<string, string> = {
    "cn-store": "中国站",
    "jp-store": "日本站",
    "us-store": "美国站",
  };
  const en: Record<string, string> = {
    "cn-store": "CN",
    "jp-store": "JP",
    "us-store": "US",
  };

  const map = localeKey === "zh" ? zh : en;
  return map[siteKey] ?? siteKey;
}
