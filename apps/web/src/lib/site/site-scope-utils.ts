export function matchesSiteScopeValue(
  value:
    | {
        siteKeys?: string[] | null;
      }
    | null
    | undefined,
  siteKey: string,
) {
  const siteKeys = value?.siteKeys ?? [];
  if (!siteKeys.length) return true;
  return siteKeys.includes(siteKey);
}

export function filterBySiteScopeValue<T extends { siteKeys?: string[] | null }>(
  items: T[],
  siteKey: string,
) {
  return items.filter((item) => matchesSiteScopeValue(item, siteKey));
}
