import { NextResponse } from "next/server";

export async function POST() {
  // TODO: 接收商品/库存/价格变更事件，触发相关页面 revalidate。
  return NextResponse.json({ ok: true });
}

