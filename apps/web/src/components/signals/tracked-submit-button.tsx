"use client";

import type { ButtonHTMLAttributes } from "react";
import { readAttributionContext } from "./attribution";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  targetType: "product" | "collection";
  targetId: string;
  contentRef?: string | null;
  eventType: "cta" | "add_to_cart";
  source?: string;
  metadata?: Record<string, unknown> | null;
};

export function TrackedSubmitButton({ targetType, targetId, contentRef, eventType, source, metadata, onClick, ...rest }: Props) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        try {
          const attribution = readAttributionContext();
          const payload = JSON.stringify({
            targetType,
            targetId,
            contentRef: contentRef ?? null,
            eventType,
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

        onClick?.(e);
      }}
    />
  );
}
