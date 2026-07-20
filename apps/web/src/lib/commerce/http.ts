export function getCommerceMode(): "medusa" | "mock" {
  const raw = String(process.env.NEXT_PUBLIC_COMMERCE_MODE || "").trim().toLowerCase();
  if (raw === "mock") return "mock";
  return "medusa";
}

export function getMedusaBaseUrl() {
  if (getCommerceMode() === "mock") return null;
  const url = process.env.NEXT_PUBLIC_MEDUSA_URL;
  if (!url) {
    // 默认认为本地 dev 会跑 Medusa；若确实需要 mock，请设置 NEXT_PUBLIC_COMMERCE_MODE=mock
    if (process.env.NODE_ENV !== "production") return "http://localhost:9000";
    return null;
  }
  return url.replace(/\/$/, "");
}

export async function medusaFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = getMedusaBaseUrl();
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_MEDUSA_URL is not set");
  }
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
  const region = process.env.NEXT_PUBLIC_MEDUSA_DEFAULT_REGION;

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(publishableKey
        ? {
            "x-publishable-api-key": publishableKey,
          }
        : {}),
      ...(region
        ? {
            "x-region": region,
          }
        : {}),
      ...(init?.headers ?? {}),
    },
    // Medusa 返回通常适合短缓存；真实策略会在 ISR 层做
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Medusa request failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}
