"use client";

import { useEffect } from "react";

type Props = {
  targetType: "product" | "collection";
  targetId: string;
  contentRef?: string | null;
};

export function SignalTracker({ targetType, targetId, contentRef }: Props) {
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        targetType,
        targetId,
        contentRef: contentRef ?? null,
        eventType: "view",
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
  }, [targetType, targetId, contentRef]);

  return null;
}

