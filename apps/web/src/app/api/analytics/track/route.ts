import { NextResponse } from "next/server";
import { sendGrowthSignal } from "@/lib/growth/server";

type AnalyticsRequestBody = {
  name?: string;
  payload?: Record<string, unknown> | null;
};

function deriveTarget(payload: Record<string, unknown>) {
  const targetType =
    typeof payload.targetType === "string"
      ? payload.targetType
      : typeof payload.product === "string"
        ? "product"
        : typeof payload.collection === "string"
          ? "collection"
          : "site";

  const targetId =
    typeof payload.targetId === "string"
      ? payload.targetId
      : typeof payload.product === "string"
        ? payload.product
        : typeof payload.collection === "string"
          ? payload.collection
          : "growth";

  return { targetType, targetId };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AnalyticsRequestBody | null;
  const name = String(body?.name ?? "").trim();
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

  if (!name) {
    return NextResponse.json({ ok: false, error: "missing_event_name" }, { status: 400 });
  }

  const { targetType, targetId } = deriveTarget(payload);
  const signal = await sendGrowthSignal({
    eventType: name,
    targetType,
    targetId,
    source: "web_analytics",
    dedupeKey: typeof payload.dedupeKey === "string" ? payload.dedupeKey : null,
    metadata: payload,
  });

  return NextResponse.json({ ok: true, signal });
}
