import "server-only";

import { envServer } from "@/lib/env/server";

export function getSiteUrlBySiteKey(siteKey: string): string | null {
  const raw = envServer.siteUrlsBySiteKeyJson;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const url = parsed?.[siteKey];
    return typeof url === "string" && url.trim() ? url.trim().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

