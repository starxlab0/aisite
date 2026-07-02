import { NextResponse } from "next/server";

export async function POST() {
  // TODO: 记录 quiz 完成事件（PostHog/GA4），或落库用于推荐优化。
  return NextResponse.json({ ok: true });
}

