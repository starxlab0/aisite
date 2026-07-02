export function getMedusaBaseUrl() {
  const url = process.env.NEXT_PUBLIC_MEDUSA_URL;
  if (!url) {
    // 开发期允许为空；调用处需要自行处理为空的场景（返回 mock 或 null）
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
