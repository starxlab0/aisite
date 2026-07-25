import Stripe from "stripe";
import { envServer } from "@/lib/env/server";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!envServer.stripeSecretKey) {
    throw new Error("stripe_secret_key_not_configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(envServer.stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });
  }
  return stripeClient;
}

export function resolveBaseUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${String(vercelUrl).replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}
