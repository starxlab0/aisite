import Stripe from "stripe";
import { envServer } from "@/lib/env/server";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!envServer.stripeSecretKey) {
    throw new Error("stripe_secret_key_not_configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(envServer.stripeSecretKey, {
      apiVersion: "2025-06-30.basil",
    });
  }
  return stripeClient;
}
