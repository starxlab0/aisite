"use client";

import Link, { type LinkProps } from "next/link";
import type { PropsWithChildren } from "react";
import { readAttributionContext } from "./attribution";

type Props = PropsWithChildren<
  LinkProps & {
    className?: string;
    targetType: "product" | "collection";
    targetId: string;
    contentRef?: string | null;
    source?: string;
    metadata?: Record<string, unknown> | null;
  }
>;

export function TrackedLink({ targetType, targetId, contentRef, source, metadata, children, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        try {
          const attribution = readAttributionContext();
          const payload = JSON.stringify({
            targetType,
            targetId,
            contentRef: contentRef ?? null,
            eventType: "cta",
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

        props.onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
