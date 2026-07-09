import overrides from "./repo-change-overrides.json";

type RepoChangeSeoOverride = {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: {
    index?: boolean;
    follow?: boolean;
  };
  sourceRepoChangeId?: string;
};

type RepoChangeOverrideMap = {
  product?: Record<string, RepoChangeSeoOverride>;
  collection?: Record<string, RepoChangeSeoOverride>;
};

const overrideMap = overrides as RepoChangeOverrideMap;

export function getRepoChangeSeoOverride(type: "product" | "collection", slug: string): RepoChangeSeoOverride | null {
  const bucket = overrideMap[type] ?? {};
  return bucket[slug] ?? null;
}
