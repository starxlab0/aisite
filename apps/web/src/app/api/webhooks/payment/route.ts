import { NextResponse } from "next/server";

export async function POST() {
  // TODO: 支付回调入口（具体取决于支付服务商）。建议只做验签 + 转发到 Medusa。
  return NextResponse.json({ ok: true });
}

