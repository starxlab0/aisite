import { NextResponse } from "next/server";
import { envServer } from "@/lib/env/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.targetType || !body?.targetId || !body?.eventType) {
    return NextResponse.json({ status: "error", message: "targetType, targetId, eventType required" }, { status: 400 });
  }

  if (!envServer.controlPlaneUrl) {
    return NextResponse.json({ status: "error", message: "CONTROL_PLANE_URL not configured" }, { status: 500 });
  }
  if (!envServer.signalsIngestToken) {
    return NextResponse.json({ status: "error", message: "SIGNALS_INGEST_TOKEN not configured" }, { status: 500 });
  }

  const res = await fetch(`${envServer.controlPlaneUrl.replace(/\/$/, "")}/signals/track`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signals-token": envServer.signalsIngestToken,
    },
    body: JSON.stringify({
      targetType: body.targetType,
      targetId: body.targetId,
      contentRef: body.contentRef ?? null,
      eventType: body.eventType,
      source: "web",
    }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
