import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string }
    | null;
  const email = body?.email?.trim();

  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  // TODO: 接入 Resend / Klaviyo（双写：订阅 + welcome 邮件）
  return NextResponse.json({ ok: true });
}

