import type { Metadata } from "next";
import { getActiveSiteConfig } from "@/lib/site/config";

export function buildMetadata(input: {
  title?: string;
  description?: string;
}): Metadata {
  const site = getActiveSiteConfig();
  return {
    title: input.title ?? site.brand.name,
    description: input.description ?? site.brand.description,
  };
}
