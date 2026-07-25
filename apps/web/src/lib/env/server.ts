export const envServer = {
  nodeEnv: process.env.NODE_ENV || "development",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  medusaWebhookSecret: process.env.MEDUSA_WEBHOOK_SECRET || "",
  controlPlaneUrl: process.env.CONTROL_PLANE_URL || "",
  opsBearerToken: process.env.OPS_BEARER_TOKEN || "",
  signalsIngestToken: process.env.SIGNALS_INGEST_TOKEN || "",
  posthogKey: process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
  posthogHost: process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || "",
  revalidateSecret: process.env.REVALIDATE_SECRET || "",
};
