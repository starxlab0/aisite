"use client";

import { useEffect } from "react";
import { readAttributionContext } from "./attribution";

type Props = {
  targetType: "product" | "collection";
  targetId: string;
  contentRef?: string | null;
  source?: string;
  metadata?: Record<string, unknown> | null;
};

export function SignalTracker({ targetType, targetId, contentRef, source, metadata }: Props) {
  useEffect(() => {
    try {
      const attribution = readAttributionContext();
      const payload = JSON.stringify({
        targetType,
        targetId,
        contentRef: contentRef ?? null,
        eventType: "view",
        source: source ?? "web",
        metadata: {
          ...(metadata ?? {}),
          ...(attribution ? { attribution } : {}),
        },
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/signals/track", new Blob([payload], { type: "application/json" }));
      } else {
        fetch("/api/signals/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  }, [targetType, targetId, contentRef, source, metadata]);

  return null;
}
