export const envClient = {
  aiConciergeEnabled: process.env.NEXT_PUBLIC_AI_CONCIERGE_ENABLED === "true",
  aiConciergeExperiment: process.env.NEXT_PUBLIC_AI_CONCIERGE_EXPERIMENT || "ai_concierge_v1",
};
