const autoScopedEntityTypes = new Set([
  "product-content",
  "guide-article",
  "faq",
  "collection-page",
]);

export function shouldAutoScopeGeneratedDraft(
  draft:
    | {
        entityType?: string | null;
        payload?: {
          siteKeys?: string[] | null;
        } | null;
      }
    | null
    | undefined,
) {
  if (!draft) return false;
  if (!autoScopedEntityTypes.has(String(draft.entityType ?? ""))) return false;
  const siteKeys = draft.payload?.siteKeys ?? [];
  return !Array.isArray(siteKeys) || siteKeys.length === 0;
}
