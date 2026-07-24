import { createHash } from "crypto";
import { envServer } from "@/lib/env/server";
import { getActiveSiteConfig } from "@/lib/site/config";

export type GrowthDeliveryStatus = "sent" | "skipped" | "failed";

export type GrowthDeliveryResult = {
  status: GrowthDeliveryStatus;
  reason?: string;
};

type GrowthSignalInput = {
  eventType: string;
  targetType: string;
  targetId: string;
  contentRef?: string | null;
  source?: string;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

type WelcomeEmailInput = {
  email: string;
  subject?: string;
  intro?: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function hashEmail(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export function getEmailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const [, domain = ""] = normalized.split("@");
  return domain || null;
}

export async function sendGrowthSignal(input: GrowthSignalInput): Promise<GrowthDeliveryResult> {
  if (!envServer.controlPlaneUrl) {
    return { status: "skipped", reason: "control_plane_not_configured" };
  }
  if (!envServer.signalsIngestToken) {
    return { status: "skipped", reason: "signals_token_not_configured" };
  }

  try {
    const response = await fetch(`${envServer.controlPlaneUrl.replace(/\/$/, "")}/signals/track`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signals-token": envServer.signalsIngestToken,
      },
      body: JSON.stringify({
        targetType: input.targetType,
        targetId: input.targetId,
        contentRef: input.contentRef ?? null,
        eventType: input.eventType,
        source: input.source ?? "web",
        dedupeKey: input.dedupeKey ?? null,
        metadata: input.metadata ?? null,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: "failed", reason: `signals_http_${response.status}` };
    }

    return { status: "sent" };
  } catch {
    return { status: "failed", reason: "signals_fetch_failed" };
  }
}

function buildWelcomeEmailHtml(input: WelcomeEmailInput) {
  const site = getActiveSiteConfig();
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b;">
      <p>Hi,</p>
      <p>${input.intro ?? `Thanks for subscribing to ${site.brand.name}.`}</p>
      <p>
        We’ll only send a small number of practical updates: product launches, buying guides,
        and shipping or support notes that are actually useful.
      </p>
      <p>
        If you need help before your first order, reply to this email or contact
        ${site.site.commerce.supportEmail ?? "our support team"}.
      </p>
      <p>Thanks,<br />${site.brand.name}</p>
    </div>
  `;
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<GrowthDeliveryResult> {
  if (!envServer.resendApiKey) {
    return { status: "skipped", reason: "resend_not_configured" };
  }

  const site = getActiveSiteConfig();
  const from = site.site.commerce.supportEmail;
  if (!from || from.includes("example.com")) {
    return { status: "skipped", reason: "sender_not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${envServer.resendApiKey}`,
        "content-type": "application/json",
        "user-agent": "aisite-growth/1.0",
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: input.subject ?? `Welcome to ${site.brand.name}`,
        html: buildWelcomeEmailHtml(input),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: "failed", reason: `resend_http_${response.status}` };
    }

    return { status: "sent" };
  } catch {
    return { status: "failed", reason: "resend_fetch_failed" };
  }
}
