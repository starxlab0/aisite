import { NextResponse } from "next/server";
import {
  getEmailDomain,
  hashEmail,
  isValidEmail,
  normalizeEmail,
  sendGrowthSignal,
  sendWelcomeEmail,
} from "@/lib/growth/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; source?: string; placement?: string }
    | null;
  const email = normalizeEmail(body?.email ?? "");

  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const emailHash = hashEmail(email);
  const signal = await sendGrowthSignal({
    eventType: "subscribe_newsletter",
    targetType: "site",
    targetId: "newsletter",
    source: "newsletter",
    dedupeKey: `newsletter:${emailHash}`,
    metadata: {
      emailHash,
      emailDomain: getEmailDomain(email),
      source: body?.source ?? "unknown",
      placement: body?.placement ?? "unknown",
    },
  });

  const welcomeEmail = await sendWelcomeEmail({
    email,
    intro: "You’re on the list. We’ll send practical updates, not daily noise.",
  });

  return NextResponse.json({
    ok: true,
    integrations: {
      signal,
      welcomeEmail,
    },
  });
}
