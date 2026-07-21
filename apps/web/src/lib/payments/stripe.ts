import Stripe from "stripe";
import { envServer } from "@/lib/env/server";

let stripe: Stripe | null = null;

export function getStripeClient() {
  if (!envServer.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripe) {
    stripe = new Stripe(envServer.stripeSecretKey, {
      // 交给 Stripe SDK 默认 API 版本，避免仓库升级时硬编码版本导致不兼容
      typescript: true,
    });
  }
  return stripe;
}

export function resolveBaseUrl() {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  if (!url) {
    throw new Error("NEXT_PUBLIC_SITE_URL is not configured");
  }
  return url.replace(/\/$/, "");
}
