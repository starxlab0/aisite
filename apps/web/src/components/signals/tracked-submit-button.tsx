"use client";

import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  targetType: "product" | "collection";
  targetId: string;
  contentRef?: string | null;
  eventType: "cta" | "add_to_cart";
};

export function TrackedSubmitButton({ targetType, targetId, contentRef, eventType, onClick, ...rest }: Props) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        try {
          const payload = JSON.stringify({
            targetType,
            targetId,
            contentRef: contentRef ?? null,
            eventType,
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

