"use client";

import Link, { type LinkProps } from "next/link";
import type { PropsWithChildren } from "react";

type Props = PropsWithChildren<
  LinkProps & {
    className?: string;
    targetType: "product" | "collection";
    targetId: string;
    contentRef?: string | null;
  }
>;

export function TrackedLink({ targetType, targetId, contentRef, children, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        try {
          const payload = JSON.stringify({
            targetType,
            targetId,
            contentRef: contentRef ?? null,
            eventType: "cta",
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

        props.onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}

