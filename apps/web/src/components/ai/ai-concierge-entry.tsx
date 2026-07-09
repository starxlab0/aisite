"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { envClient } from "@/lib/env/client";
import { getExperimentBucket } from "@/lib/experiments/ab";
import { writeAttributionContext } from "@/components/signals/attribution";

type Props = {
  placement: "shop" | "product";
  productSlug?: string;
};

function track(eventType: "view" | "cta", payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify({
      targetType: "collection",
      targetId: "ai-concierge",
      eventType,
      source: "ai_concierge",
      contentRef: null,
      dedupeKey: payload.dedupeKey ?? null,
      metadata: payload,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/signals/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/signals/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(
        () => {},
      );
    }
  } catch {}
}

export function AiConciergeEntry({ placement, productSlug }: Props) {
  const enabled = envClient.aiConciergeEnabled;
  const bucket = useMemo(() => (enabled ? getExperimentBucket(envClient.aiConciergeExperiment) : "B"), [enabled]);
  const shouldShow = enabled && bucket === "A";

  useEffect(() => {
    if (!shouldShow) return;
    track("view", {
      experiment: envClient.aiConciergeExperiment,
      bucket,
      placement,
      productSlug,
      stage: "entry_view",
      dedupeKey: `${placement}:${productSlug ?? ""}`,
    });
  }, [shouldShow, bucket, placement, productSlug]);

  if (!shouldShow) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-sm font-medium text-zinc-900">AI 导购</p>
      <p className="mt-2 text-sm text-zinc-600">30 秒选购问答，帮你快速缩小范围。</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-white hover:bg-zinc-800"
          href={`/quiz?src=${placement}${productSlug ? `&product=${encodeURIComponent(productSlug)}` : ""}`}
          onClick={() => {
            writeAttributionContext({
              src: "ai_concierge",
              experiment: envClient.aiConciergeExperiment,
              bucket,
              placement,
              sourceProductSlug: productSlug ?? null,
            });
            track("cta", { experiment: envClient.aiConciergeExperiment, bucket, placement, productSlug, stage: "entry_click" });
          }}
        >
          开始问答
        </Link>
        <Link className="underline underline-offset-4 text-zinc-700" href="/shop">
          先逛逛
        </Link>
      </div>
      <p className="mt-3 text-xs text-zinc-500">A/B 实验中：只对部分用户展示。</p>
    </div>
  );
}
