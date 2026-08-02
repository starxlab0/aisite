"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TrackedLink } from "@/components/signals/tracked-link";
import { TrackedSubmitButton } from "@/components/signals/tracked-submit-button";
import { envClient } from "@/lib/env/client";
import { getExperimentBucket } from "@/lib/experiments/ab";
import { writeAttributionContext } from "@/components/signals/attribution";
import { getLocalizedCopy } from "@/lib/site/copy";
import { buildLocalePath, getLocaleKeyFromPathname } from "@/lib/site/locale-routing";
import type { SupportedLocaleKey } from "@/lib/site/locale-routing";

type Product = {
  defaultVariantId?: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  wearable?: boolean;
  appControl?: boolean;
  stimulationType?: string[];
};

type Props = {
  source: string;
  sourceProductSlug: string | null;
  products: Product[];
  localeKey?: SupportedLocaleKey;
  siteFeatures?: {
    bundles: boolean;
    appControl: boolean;
  };
};

type Answer = {
  firstTime: "yes" | "no" | null;
  wearable: "yes" | "no" | null;
  dual: "yes" | "no" | null;
  budget: "low" | "mid" | "high" | null;
  control: "simple" | "app" | null;
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

function budgetRange(budget: Answer["budget"], localeKey: SupportedLocaleKey) {
  const quizCopy = getLocalizedCopy(localeKey).quiz;
  if (budget === "low") return { min: 0, max: 5000, label: "≤ $50" };
  if (budget === "mid") return { min: 5000, max: 10000, label: "$50–$100" };
  if (budget === "high") return { min: 10000, max: Infinity, label: "≥ $100" };
  return { min: 0, max: Infinity, label: quizCopy.budgetAny };
}

function pickRecommendations(products: Product[], answer: Answer, localeKey: SupportedLocaleKey) {
  const range = budgetRange(answer.budget, localeKey);
  const scored = products.map((p) => {
    let score = 0;
    if (answer.wearable === "yes" && p.wearable) score += 3;
    if (answer.wearable === "no" && !p.wearable) score += 1;
    if (answer.dual === "yes" && (p.stimulationType || []).includes("dual")) score += 2;
    if (answer.dual === "no" && !(p.stimulationType || []).includes("dual")) score += 1;
    if (answer.firstTime === "yes") {
      if (!p.appControl) score += 1;
    }
    if (answer.control === "app") {
      score += p.appControl ? 2 : -1;
    } else if (answer.control === "simple") {
      score += p.appControl ? 0 : 1;
    }

    if (Number.isFinite(p.price)) {
      if (p.price >= range.min && p.price < range.max) score += 2;
      else score -= 1;
    }
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || a.p.price - b.p.price);
  return scored.slice(0, 3).map((x) => x.p);
}

function reasonTags(product: Product, answer: Answer, localeKey: SupportedLocaleKey) {
  const quizCopy = getLocalizedCopy(localeKey).quiz;
  const tags: string[] = [];
  if (answer.wearable === "yes" && product.wearable) tags.push(quizCopy.reasonTags.wearable);
  if (answer.dual === "yes" && (product.stimulationType || []).includes("dual")) tags.push(quizCopy.reasonTags.dual);
  if (answer.firstTime === "yes" && !product.appControl) tags.push(quizCopy.reasonTags.firstTime);
  if (answer.control === "app" && product.appControl) tags.push(quizCopy.reasonTags.app);
  if (answer.control === "simple" && !product.appControl) tags.push(quizCopy.reasonTags.simple);
  if (answer.budget) {
    const range = budgetRange(answer.budget, localeKey);
    if (Number.isFinite(product.price) && product.price >= range.min && product.price < range.max) tags.push(quizCopy.reasonTags.budget(range.label));
  }
  if (!tags.length) {
    if (product.appControl) tags.push(quizCopy.reasonTags.advanced);
    else tags.push(quizCopy.reasonTags.overall);
  }
  return tags.slice(0, 3);
}

function getCollectionPlan(answer: Answer, topPick: Product | null, localeKey: SupportedLocaleKey) {
  const quizCopy = getLocalizedCopy(localeKey).quiz;
  if (answer.firstTime === "yes") {
    return {
      slug: "first-time",
      title: quizCopy.collectionTitles.firstTime,
      summary: quizCopy.collectionSummaries.firstTime,
    };
  }
  if (answer.wearable === "yes") {
    return {
      slug: "wearable",
      title: quizCopy.collectionTitles.wearable,
      summary: quizCopy.collectionSummaries.wearable,
    };
  }
  if (answer.control === "app" || topPick?.appControl) {
    return {
      slug: "app-controlled",
      title: quizCopy.collectionTitles.app,
      summary: quizCopy.collectionSummaries.app,
    };
  }
  if (answer.dual === "yes") {
    return {
      slug: "dual-stimulation",
      title: quizCopy.collectionTitles.dual,
      summary: quizCopy.collectionSummaries.dual,
    };
  }
  return {
    slug: "first-time",
    title: quizCopy.collectionTitles.curated,
    summary: quizCopy.collectionSummaries.curated,
  };
}

function getBundlePlan(answer: Answer, topPick: Product | null, localeKey: SupportedLocaleKey) {
  const quizCopy = getLocalizedCopy(localeKey).quiz;
  if (answer.control === "app" || topPick?.appControl) {
    return {
      key: "app-control",
      title: quizCopy.bundleTitles.app,
      summary: quizCopy.bundleSummaries.app,
      href: `/bundles?plan=app-control${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
    };
  }
  if (answer.wearable === "yes") {
    return {
      key: "wearable",
      title: quizCopy.bundleTitles.wearable,
      summary: quizCopy.bundleSummaries.wearable,
      href: `/bundles?plan=wearable${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
    };
  }
  if (answer.dual === "yes") {
    return {
      key: "dual",
      title: quizCopy.bundleTitles.dual,
      summary: quizCopy.bundleSummaries.dual,
      href: `/bundles?plan=dual${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
    };
  }
  return {
    key: "starter",
    title: quizCopy.bundleTitles.starter,
    summary: quizCopy.bundleSummaries.starter,
    href: `/bundles?plan=starter${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
  };
}

export function AiQuiz({ source, sourceProductSlug, products, localeKey: localeKeyProp, siteFeatures }: Props) {
  const pathname = usePathname();
  const enabled = envClient.aiConciergeEnabled;
  const bucket = useMemo(() => (enabled ? getExperimentBucket(envClient.aiConciergeExperiment) : "B"), [enabled]);

  const [answer, setAnswer] = useState<Answer>({ firstTime: null, wearable: null, dual: null, budget: null, control: null });
  const submittedQuizKeyRef = useRef<string | null>(null);
  const done = answer.firstTime && answer.wearable && answer.dual && answer.budget && answer.control;

  const localeKey = localeKeyProp ?? getLocaleKeyFromPathname(pathname || "/");
  const bundlesEnabled = siteFeatures?.bundles ?? true;
  const appControlEnabled = siteFeatures?.appControl ?? true;
  const quizCopy = getLocalizedCopy(localeKey).quiz;
  const recommendations = useMemo(() => (done ? pickRecommendations(products, answer, localeKey) : []), [done, products, answer, localeKey]);
  const [cartHint, setCartHint] = useState<string | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const topPick = recommendations[0] ?? null;
  const collectionPlan = useMemo(() => (done ? getCollectionPlan(answer, topPick, localeKey) : null), [done, answer, topPick, localeKey]);
  const featureAwareCollectionPlan =
    collectionPlan?.slug === "app-control" && !appControlEnabled ? null : collectionPlan;
  const bundlePlan = useMemo(
    () => (done && bundlesEnabled ? getBundlePlan(answer, topPick, localeKey) : null),
    [done, bundlesEnabled, answer, topPick, localeKey],
  );
  const resultSummary = useMemo(() => {
    if (!done) return null;
    const budget = budgetRange(answer.budget, localeKey).label;
    const parts = [
      answer.firstTime === "yes" ? quizCopy.resultSummary.firstTime : quizCopy.resultSummary.notFirstTime,
      answer.wearable === "yes" ? quizCopy.resultSummary.wearable : quizCopy.resultSummary.nonWearable,
      answer.dual === "yes" ? quizCopy.resultSummary.dual : quizCopy.resultSummary.nonDual,
      answer.control === "app" ? quizCopy.resultSummary.app : quizCopy.resultSummary.simple,
      quizCopy.resultSummary.budget(budget),
    ];
    return parts.join(" · ");
  }, [done, answer, localeKey, quizCopy]);

  useEffect(() => {
    track("view", {
      experiment: envClient.aiConciergeExperiment,
      bucket,
      source,
      sourceProductSlug,
      stage: "quiz_view",
      dedupeKey: `quiz:${source}:${sourceProductSlug ?? ""}`,
    });
  }, [bucket, source, sourceProductSlug]);

  useEffect(() => {
    if (!done) return;
    track("view", {
      experiment: envClient.aiConciergeExperiment,
      bucket,
      source,
      answers: answer,
      recommended: recommendations.map((p) => p.slug),
      stage: "results_view",
      dedupeKey: `recs:${source}:${sourceProductSlug ?? ""}:${recommendations.map((p) => p.slug).join(",")}`,
    });
  }, [done]);

  useEffect(() => {
    if (!done) return;

    const dedupeKey = `quiz-submit:${source}:${sourceProductSlug ?? ""}:${recommendations.map((p) => p.slug).join(",")}`;
    if (submittedQuizKeyRef.current === dedupeKey) return;
    submittedQuizKeyRef.current = dedupeKey;

    fetch("/api/quiz/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source,
        sourceProductSlug,
        bucket,
        experiment: envClient.aiConciergeExperiment,
        summary: resultSummary,
        answers: answer,
        recommended: recommendations.map((p) => p.slug),
        dedupeKey,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [answer, bucket, done, recommendations, resultSummary, source, sourceProductSlug]);

  async function addTopPick(product: Product, redirectTo?: "cart" | "checkout") {
    writeAttributionContext({
      src: "ai_concierge",
      experiment: envClient.aiConciergeExperiment,
      bucket,
      placement: source,
      sourceProductSlug,
    });
    setPendingSlug(product.slug);
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productSlug: product.slug,
          variantId: product.defaultVariantId,
          quantity: 1,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setCartHint(quizCopy.addFail);
        return;
      }
      setCartHint(quizCopy.addSuccess);
      if (redirectTo === "cart") {
        track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, product: product.slug, stage: "cart_click" });
        window.location.href = "/cart?src=ai_concierge&from=quiz";
        return;
      }
      if (redirectTo === "checkout") {
        track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, product: product.slug, stage: "checkout_click" });
        window.location.href = "/checkout?src=ai_concierge&from=quiz";
      }
    } catch {
      setCartHint(quizCopy.addFail);
    } finally {
      setPendingSlug(null);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {!enabled ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm text-zinc-700">{quizCopy.disabled}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-xs text-zinc-500">{quizCopy.experiment}</p>
        <p className="mt-1 text-sm text-zinc-700">
          {envClient.aiConciergeExperiment} · bucket {bucket}
        </p>
        <p className="mt-2 text-xs text-zinc-500">{quizCopy.source}: {source}{sourceProductSlug ? ` · product: ${sourceProductSlug}` : ""}</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">{quizCopy.q1}</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.firstTime === "yes" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, firstTime: "yes" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "firstTime", a: "yes" });
            }}
          >
            {quizCopy.yes}
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.firstTime === "no" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, firstTime: "no" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "firstTime", a: "no" });
            }}
          >
            {quizCopy.no}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">{quizCopy.q2}</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.wearable === "yes" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, wearable: "yes" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "wearable", a: "yes" });
            }}
          >
            {quizCopy.yes}
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.wearable === "no" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, wearable: "no" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "wearable", a: "no" });
            }}
          >
            {quizCopy.no}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">{quizCopy.q3}</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.dual === "yes" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, dual: "yes" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "dual", a: "yes" });
            }}
          >
            {quizCopy.yes}
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.dual === "no" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, dual: "no" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "dual", a: "no" });
            }}
          >
            {quizCopy.no}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">{quizCopy.q4}</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.budget === "low" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, budget: "low" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "budget", a: "low" });
            }}
          >
            ≤ $50
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.budget === "mid" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, budget: "mid" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "budget", a: "mid" });
            }}
          >
            $50–$100
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.budget === "high" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, budget: "high" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "budget", a: "high" });
            }}
          >
            ≥ $100
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">{quizCopy.q5}</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.control === "simple" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, control: "simple" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "control", a: "simple" });
            }}
          >
            {quizCopy.simpleControls}
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.control === "app" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, control: "app" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "control", a: "app" });
            }}
          >
            {quizCopy.appControl}
          </button>
        </div>
      </div>

      {done ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">{quizCopy.matchTitle}</p>
          <p className="mt-2 text-sm text-zinc-600">{quizCopy.matchIntro}</p>
          {resultSummary ? (
            <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
              <p className="font-medium text-zinc-900">{quizCopy.summaryTitle}</p>
              <p className="mt-1">{resultSummary}</p>
            </div>
          ) : null}
          {topPick?.defaultVariantId ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-medium text-zinc-900">{quizCopy.topPick}: {topPick.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{quizCopy.topPickHint}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <TrackedSubmitButton
                  type="button"
                  targetType="product"
                  targetId={topPick.slug}
                  contentRef={null}
                  eventType="add_to_cart"
                  metadata={{
                    stage: "quiz_top_pick_checkout",
                    experiment: envClient.aiConciergeExperiment,
                    bucket,
                    source,
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  disabled={pendingSlug === topPick.slug}
                  onClick={async (e) => {
                    e.preventDefault();
                    await addTopPick(topPick, "checkout");
                  }}
                >
                  {pendingSlug === topPick.slug ? quizCopy.processing : quizCopy.topPickCheckout}
                </TrackedSubmitButton>
                <TrackedSubmitButton
                  type="button"
                  targetType="product"
                  targetId={topPick.slug}
                  contentRef={null}
                  eventType="add_to_cart"
                  metadata={{
                    stage: "quiz_top_pick_cart",
                    experiment: envClient.aiConciergeExperiment,
                    bucket,
                    source,
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
                  disabled={pendingSlug === topPick.slug}
                  onClick={async (e) => {
                    e.preventDefault();
                    await addTopPick(topPick, "cart");
                  }}
                >
                  {quizCopy.goToCart}
                </TrackedSubmitButton>
              </div>
            </div>
          ) : null}
          {featureAwareCollectionPlan || bundlePlan ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {featureAwareCollectionPlan ? (
                <TrackedLink
                  href={buildLocalePath(`/collection/${featureAwareCollectionPlan.slug}?src=ai_concierge&from=quiz`, localeKey)}
                  targetType="collection"
                  targetId={featureAwareCollectionPlan.slug}
                  source="ai_concierge"
                  metadata={{
                    stage: "quiz_collection_plan",
                    experiment: envClient.aiConciergeExperiment,
                    bucket,
                    source,
                  }}
                  className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300"
                  onClick={() =>
                    writeAttributionContext({
                      src: "ai_concierge",
                      experiment: envClient.aiConciergeExperiment,
                      bucket,
                      placement: source,
                      sourceProductSlug,
                    })
                  }
                >
                  <p className="text-xs text-zinc-500">{quizCopy.bestNextStep}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">{featureAwareCollectionPlan.title}</p>
                  <p className="mt-2 text-sm text-zinc-600">{featureAwareCollectionPlan.summary}</p>
                </TrackedLink>
              ) : null}
              {bundlePlan ? (
                <TrackedLink
                  href={buildLocalePath(bundlePlan.href, localeKey)}
                  targetType="collection"
                  targetId={`bundle:${bundlePlan.key}`}
                  source="ai_concierge"
                  metadata={{
                    stage: "quiz_bundle_plan",
                    experiment: envClient.aiConciergeExperiment,
                    bucket,
                    source,
                  }}
                  className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300"
                  onClick={() =>
                    writeAttributionContext({
                      src: "ai_concierge",
                      experiment: envClient.aiConciergeExperiment,
                      bucket,
                      placement: source,
                      sourceProductSlug,
                    })
                  }
                >
                  <p className="text-xs text-zinc-500">{quizCopy.bundleRoute}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">{bundlePlan.title}</p>
                  <p className="mt-2 text-sm text-zinc-600">{bundlePlan.summary}</p>
                </TrackedLink>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 grid gap-3">
            {recommendations.map((p) => (
              <TrackedLink
                key={p.slug}
                href={buildLocalePath(`/product/${p.slug}?src=ai_concierge&exp=${encodeURIComponent(envClient.aiConciergeExperiment)}&bucket=${encodeURIComponent(bucket)}&from=quiz`, localeKey)}
                targetType="product"
                targetId={p.slug}
                className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300"
                onClick={() =>
                  (writeAttributionContext({
                    src: "ai_concierge",
                    experiment: envClient.aiConciergeExperiment,
                    bucket,
                    placement: source,
                    sourceProductSlug,
                  }),
                  track("cta", {
                    experiment: envClient.aiConciergeExperiment,
                    bucket,
                    source,
                    answers: answer,
                    product: p.slug,
                    stage: "result_click",
                  }))
                }
                metadata={{
                  stage: "product_click",
                  experiment: envClient.aiConciergeExperiment,
                  bucket,
                  source,
                }}
              >
                <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{p.slug}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {reasonTags(p, answer, localeKey).map((tag) => (
                    <span key={tag} className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                      {tag}
                    </span>
                  ))}
                </div>
                {p.defaultVariantId ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <TrackedSubmitButton
                      type="button"
                      targetType="product"
                      targetId={p.slug}
                      contentRef={null}
                      eventType="add_to_cart"
                      metadata={{
                        stage: "quiz_quick_add",
                        experiment: envClient.aiConciergeExperiment,
                        bucket,
                        source,
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
                      onClick={async (e) => {
                        e.preventDefault();
                        writeAttributionContext({
                          src: "ai_concierge",
                          experiment: envClient.aiConciergeExperiment,
                          bucket,
                          placement: source,
                          sourceProductSlug,
                        });
                        try {
                          const res = await fetch("/api/cart/add", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              productSlug: p.slug,
                              variantId: p.defaultVariantId,
                              quantity: 1,
                            }),
                          });
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok || !json?.ok) {
                            setCartHint(quizCopy.addFail);
                            return;
                          }
                          setCartHint(quizCopy.addSuccess);
                        } catch {
                          setCartHint(quizCopy.addFail);
                        }
                      }}
                    >
                      {quizCopy.quickAdd}
                    </TrackedSubmitButton>
                    <span className="text-xs text-zinc-500">{quizCopy.quickAddHint}</span>
                  </div>
                ) : null}
              </TrackedLink>
            ))}
          </div>
          {cartHint ? (
            <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
              <p>
                {cartHint}{" "}
                <a className="underline underline-offset-4" href={buildLocalePath("/cart", localeKey)}>
                  {quizCopy.goToCart}
                </a>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
