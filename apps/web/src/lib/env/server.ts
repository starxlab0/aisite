export const envServer = {
  revalidateSecret: process.env.REVALIDATE_SECRET,
  sanityToken: process.env.SANITY_API_TOKEN,
  medusaApiKey: process.env.MEDUSA_API_KEY,
  controlPlaneUrl: process.env.CONTROL_PLANE_URL,
  opsAdminToken: process.env.OPS_ADMIN_TOKEN,
  signalsIngestToken: process.env.SIGNALS_INGEST_TOKEN || process.env.OPS_ADMIN_TOKEN,
  resendApiKey: process.env.RESEND_API_KEY,
  klaviyoApiKey: process.env.KLAVIYO_API_KEY,
  posthogSecret: process.env.POSTHOG_SECRET,
};
