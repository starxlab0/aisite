export const envClient = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  medusaUrl: process.env.NEXT_PUBLIC_MEDUSA_URL,
  medusaPublishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  medusaDefaultRegion: process.env.NEXT_PUBLIC_MEDUSA_DEFAULT_REGION,
  medusaCountryCode: process.env.NEXT_PUBLIC_MEDUSA_COUNTRY_CODE,
  medusaRegionId: process.env.NEXT_PUBLIC_MEDUSA_REGION_ID,
  sanityProjectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  sanityDataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  gaId: process.env.NEXT_PUBLIC_GA_ID,
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  aiConciergeEnabled: process.env.NEXT_PUBLIC_AI_CONCIERGE_ENABLED === "true",
  aiConciergeExperiment: process.env.NEXT_PUBLIC_AI_CONCIERGE_EXPERIMENT || "ai_concierge_v1",
};
