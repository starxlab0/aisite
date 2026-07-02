import { NextResponse } from "next/server";

export async function POST() {
  // TODO: 校验 webhook 签名，并转发到 /api/revalidate（或直接 revalidatePath）。
  return NextResponse.json({ ok: true });
}

