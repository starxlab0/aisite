import { NextResponse } from "next/server";
import { sendGrowthSignal } from "@/lib/growth/server";

type QuizSubmitBody = {
  source?: string;
  sourceProductSlug?: string | null;
  bucket?: string | null;
  experiment?: string | null;
  summary?: string | null;
  answers?: Record<string, unknown> | null;
  recommended?: string[] | null;
  dedupeKey?: string | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as QuizSubmitBody | null;
  const recommended = Array.isArray(body?.recommended)
    ? body?.recommended.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (!body?.answers || !recommended.length) {
    return NextResponse.json({ ok: false, error: "missing_quiz_payload" }, { status: 400 });
  }

  const signal = await sendGrowthSignal({
    eventType: "complete_quiz",
    targetType: "collection",
    targetId: "ai-concierge",
    source: "ai_concierge",
    dedupeKey:
      typeof body.dedupeKey === "string" && body.dedupeKey.trim()
        ? body.dedupeKey
        : `quiz:${body.source ?? "unknown"}:${recommended.join(",")}`,
    metadata: {
      source: body.source ?? "unknown",
      sourceProductSlug: body.sourceProductSlug ?? null,
      bucket: body.bucket ?? null,
      experiment: body.experiment ?? null,
      summary: body.summary ?? null,
      answers: body.answers,
      recommended,
    },
  });

  return NextResponse.json({ ok: true, signal });
}
