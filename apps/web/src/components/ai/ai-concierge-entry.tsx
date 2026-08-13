"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { envClient } from "@/lib/env/client";
import { buildLocalePath, getLocaleKeyFromPathname } from "@/lib/site/locale-routing";
import { getSiteConfigForLocale } from "@/lib/site/config";
import { getExperimentBucket } from "@/lib/experiments/ab";
import { writeAttributionContext } from "@/components/signals/attribution";

type Props = {
  placement: "shop" | "product";
  productSlug?: string;
  introEyebrow?: string;
  introDescription?: string;
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

export function AiConciergeEntry({ placement, productSlug, introEyebrow, introDescription }: Props) {
  const pathname = usePathname();
  const enabled = envClient.aiConciergeEnabled;
  const bucket = useMemo(() => (enabled ? getExperimentBucket(envClient.aiConciergeExperiment) : "B"), [enabled]);
  const shouldShow = enabled && bucket === "A";
  const localeKey = getLocaleKeyFromPathname(pathname || "/");
  const site = getSiteConfigForLocale(localeKey);
  const quizHref = buildLocalePath(`/quiz?src=${placement}${productSlug ? `&product=${encodeURIComponent(productSlug)}` : ""}`, localeKey);
  const shopHref = buildLocalePath("/shop", localeKey);
  const secondaryHref = placement === "shop" ? `${pathname || shopHref}#all-products` : shopHref;
  const uiCopy =
    localeKey === "en"
      ? {
          title: "AI Concierge",
          description: "Answer a few quick questions and narrow down the right products in about 30 seconds.",
          primaryCta: "Start quiz",
          secondaryCta: placement === "shop" ? "See all products" : "Browse shop first",
          experimentNote: "A/B test: shown only to a subset of users.",
        }
      : {
          title: "AI 导购",
          description: "30 秒选购问答，帮你快速缩小范围。",
          primaryCta: "开始问答",
          secondaryCta: placement === "shop" ? "看全部商品" : "先逛逛",
          experimentNote: "A/B 实验中：只对部分用户展示。",
        };

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

  if (!shouldShow || !site.site.features.quiz) return null;

  return (
    <div className="mt-8 space-y-4">
      {introEyebrow || introDescription ? (
        <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 p-5">
          {introEyebrow ? <p className="text-sm font-medium text-zinc-900">{introEyebrow}</p> : null}
          {introDescription ? <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{introDescription}</p> : null}
        </section>
      ) : null}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">{uiCopy.title}</p>
        <p className="mt-2 text-sm text-zinc-600">{uiCopy.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-white hover:bg-zinc-800"
            href={quizHref}
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
            {uiCopy.primaryCta}
          </Link>
          <Link className="underline underline-offset-4 text-zinc-700" href={secondaryHref}>
            {uiCopy.secondaryCta}
          </Link>
        </div>
        <p className="mt-3 text-xs text-zinc-500">{uiCopy.experimentNote}</p>
      </div>
    </div>
  );
}
