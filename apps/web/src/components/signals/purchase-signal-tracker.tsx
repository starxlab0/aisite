"use client";

import { useEffect } from "react";
import { readAttributionContext } from "./attribution";

type PurchaseTarget = {
  targetType: "product" | "collection";
  targetId: string;
  contentRef?: string | null;
};

type Props = {
  targets: PurchaseTarget[];
  dedupeKey: string;
};

export function PurchaseSignalTracker({ targets, dedupeKey }: Props) {
  useEffect(() => {
    if (!dedupeKey || !targets.length) return;
    const storageKey = `purchase-signal:${dedupeKey}`;
    try {
      if (window.sessionStorage.getItem(storageKey) === "1") return;
    } catch {}

    const uniqueTargets = targets.filter(
      (item, index, list) =>
        item?.targetType &&
        item?.targetId &&
        list.findIndex((entry) => entry.targetType === item.targetType && entry.targetId === item.targetId) === index,
    );

    uniqueTargets.forEach((item) => {
      try {
        const attribution = readAttributionContext();
        const payload = JSON.stringify({
          targetType: item.targetType,
          targetId: item.targetId,
          contentRef: item.contentRef ?? null,
          eventType: "purchase",
          source: "web",
          dedupeKey: `${dedupeKey}:${item.targetType}:${item.targetId}`,
          metadata: attribution ? { attribution, stage: "purchase" } : { stage: "purchase" },
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
    });

    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {}
  }, [dedupeKey, targets]);

  return null;
}
