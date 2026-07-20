"use client";

import { useEffect } from "react";
import { readAttributionContext } from "./attribution";

type CheckoutTarget = {
  targetType: "product" | "collection";
  targetId: string;
  contentRef?: string | null;
};

type Props = {
  targets: CheckoutTarget[];
  dedupeKey: string;
  eventType: "checkout_start" | "checkout_complete";
};

export function CheckoutSignalTracker({ targets, dedupeKey, eventType }: Props) {
  useEffect(() => {
    if (!dedupeKey || !targets.length) return;
    const storageKey = `checkout-signal:${eventType}:${dedupeKey}`;
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
          eventType,
          source: "web",
          dedupeKey: `${dedupeKey}:${eventType}:${item.targetType}:${item.targetId}`,
          metadata: attribution ? { attribution, stage: eventType } : { stage: eventType },
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
  }, [dedupeKey, eventType, targets]);

  return null;
}

