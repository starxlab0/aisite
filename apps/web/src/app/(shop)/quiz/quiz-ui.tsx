"use client";

import { useEffect, useMemo, useState } from "react";
import { TrackedLink } from "@/components/signals/tracked-link";
import { TrackedSubmitButton } from "@/components/signals/tracked-submit-button";
import { envClient } from "@/lib/env/client";
import { getExperimentBucket } from "@/lib/experiments/ab";
import { writeAttributionContext } from "@/components/signals/attribution";

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

function budgetRange(budget: Answer["budget"]) {
  if (budget === "low") return { min: 0, max: 5000, label: "≤ $50" };
  if (budget === "mid") return { min: 5000, max: 10000, label: "$50–$100" };
  if (budget === "high") return { min: 10000, max: Infinity, label: "≥ $100" };
  return { min: 0, max: Infinity, label: "any" };
}

function pickRecommendations(products: Product[], answer: Answer) {
  const range = budgetRange(answer.budget);
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

    // budget match (price is cents)
    if (Number.isFinite(p.price)) {
      if (p.price >= range.min && p.price < range.max) score += 2;
      else score -= 1;
    }
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || a.p.price - b.p.price);
  return scored.slice(0, 3).map((x) => x.p);
}

function reasonTags(product: Product, answer: Answer) {
  const tags: string[] = [];
  if (answer.wearable === "yes" && product.wearable) tags.push("适合 wearable 偏好");
  if (answer.dual === "yes" && (product.stimulationType || []).includes("dual")) tags.push("包含 dual stimulation");
  if (answer.firstTime === "yes" && !product.appControl) tags.push("更适合 first-time 入门");
  if (answer.control === "app" && product.appControl) tags.push("支持 App Control");
  if (answer.control === "simple" && !product.appControl) tags.push("操作更简单");
  if (answer.budget) {
    const range = budgetRange(answer.budget);
    if (Number.isFinite(product.price) && product.price >= range.min && product.price < range.max) tags.push(`预算匹配 ${range.label}`);
  }
  if (!tags.length) {
    if (product.appControl) tags.push("偏进阶控制体验");
    else tags.push("整体匹配度较高");
  }
  return tags.slice(0, 3);
}

function getCollectionPlan(answer: Answer, topPick: Product | null) {
  if (answer.firstTime === "yes") {
    return {
      slug: "first-time",
      title: "First-time picks",
      summary: "更适合快速缩小范围，先看入门组合与低门槛款式。",
    };
  }
  if (answer.wearable === "yes") {
    return {
      slug: "wearable",
      title: "Wearable picks",
      summary: "优先看 wearable 路线，兼顾 discreet 和 hands-free 使用场景。",
    };
  }
  if (answer.control === "app" || topPick?.appControl) {
    return {
      slug: "app-controlled",
      title: "App-controlled picks",
      summary: "适合想要 App Control、远程互动和更细粒度控制的人。",
    };
  }
  if (answer.dual === "yes") {
    return {
      slug: "dual-stimulation",
      title: "Dual stimulation picks",
      summary: "优先看 dual stimulation 路线，快速对比更强刺激组合。",
    };
  }
  return {
    slug: "first-time",
    title: "Curated picks",
    summary: "如果还没有明确方向，先从这组精选路线开始。",
  };
}

function getBundlePlan(answer: Answer, topPick: Product | null) {
  if (answer.control === "app" || topPick?.appControl) {
    return {
      key: "app-control",
      title: "App control bundle",
      summary: "把 App Control 主推荐和同路线商品放在一起，适合继续比较或一起购买。",
      href: `/bundles?plan=app-control${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
    };
  }
  if (answer.wearable === "yes") {
    return {
      key: "wearable",
      title: "Wearable bundle",
      summary: "更适合 wearable / discreet 路线的组合浏览。",
      href: `/bundles?plan=wearable${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
    };
  }
  if (answer.dual === "yes") {
    return {
      key: "dual",
      title: "Dual stimulation bundle",
      summary: "更适合想直接比较 dual 路线体验差异的人。",
      href: `/bundles?plan=dual${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
    };
  }
  return {
    key: "starter",
    title: "Starter bundle",
    summary: "先从入门路线组合开始，再决定是否进入更进阶的控制或刺激类型。",
    href: `/bundles?plan=starter${topPick ? `&top=${encodeURIComponent(topPick.slug)}` : ""}`,
  };
}

export function AiQuiz({ source, sourceProductSlug, products }: Props) {
  const enabled = envClient.aiConciergeEnabled;
  const bucket = useMemo(() => (enabled ? getExperimentBucket(envClient.aiConciergeExperiment) : "B"), [enabled]);

  const [answer, setAnswer] = useState<Answer>({ firstTime: null, wearable: null, dual: null, budget: null, control: null });
  const done = answer.firstTime && answer.wearable && answer.dual && answer.budget && answer.control;

  const recommendations = useMemo(() => (done ? pickRecommendations(products, answer) : []), [done, products, answer]);
  const [cartHint, setCartHint] = useState<string | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const topPick = recommendations[0] ?? null;
  const collectionPlan = useMemo(() => (done ? getCollectionPlan(answer, topPick) : null), [done, answer, topPick]);
  const bundlePlan = useMemo(() => (done ? getBundlePlan(answer, topPick) : null), [done, answer, topPick]);
  const resultSummary = useMemo(() => {
    if (!done) return null;
    const budget = budgetRange(answer.budget).label;
    const parts = [
      answer.firstTime === "yes" ? "入门友好" : "不限制入门难度",
      answer.wearable === "yes" ? "偏 wearable" : "偏非 wearable",
      answer.dual === "yes" ? "偏 dual stimulation" : "不强求 dual",
      answer.control === "app" ? "偏 App Control" : "偏简单操作",
      `预算 ${budget}`,
    ];
    return parts.join(" · ");
  }, [done, answer]);

  useEffect(() => {
    // quiz page view（用于衡量入口转化）
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
    // 推荐曝光（不污染商品 view；用独立 targetId）
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
        setCartHint("加购失败，请打开商品页再试。");
        return;
      }
      setCartHint("已加入购物车。");
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
      setCartHint("加购失败，请稍后再试。");
    } finally {
      setPendingSlug(null);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {!enabled ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm text-zinc-700">AI 导购当前未开启（`NEXT_PUBLIC_AI_CONCIERGE_ENABLED=true` 后生效）。</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-xs text-zinc-500">Experiment</p>
        <p className="mt-1 text-sm text-zinc-700">
          {envClient.aiConciergeExperiment} · bucket {bucket}
        </p>
        <p className="mt-2 text-xs text-zinc-500">source: {source}{sourceProductSlug ? ` · product: ${sourceProductSlug}` : ""}</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">Q1. Is this your first toy?</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.firstTime === "yes" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, firstTime: "yes" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "firstTime", a: "yes" });
            }}
          >
            Yes
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.firstTime === "no" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, firstTime: "no" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "firstTime", a: "no" });
            }}
          >
            No
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">Q2. Prefer wearable?</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.wearable === "yes" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, wearable: "yes" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "wearable", a: "yes" });
            }}
          >
            Yes
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.wearable === "no" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, wearable: "no" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "wearable", a: "no" });
            }}
          >
            No
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">Q3. Want dual stimulation?</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.dual === "yes" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, dual: "yes" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "dual", a: "yes" });
            }}
          >
            Yes
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.dual === "no" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, dual: "no" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "dual", a: "no" });
            }}
          >
            No
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-medium text-zinc-900">Q4. Budget range?</p>
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
        <p className="text-sm font-medium text-zinc-900">Q5. Control preference?</p>
        <div className="mt-4 flex flex-col gap-3">
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.control === "simple" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, control: "simple" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "control", a: "simple" });
            }}
          >
            Simple controls
          </button>
          <button
            className={`h-11 rounded-md border px-4 text-left text-sm hover:bg-zinc-50 ${answer.control === "app" ? "border-zinc-900" : "border-zinc-300 bg-white"}`}
            onClick={() => {
              setAnswer((s) => ({ ...s, control: "app" }));
              track("cta", { experiment: envClient.aiConciergeExperiment, bucket, source, stage: "answer_select", q: "control", a: "app" });
            }}
          >
            Prefer App Control
          </button>
        </div>
      </div>

      {done ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm font-medium text-zinc-900">Your Match</p>
          <p className="mt-2 text-sm text-zinc-600">基于你的回答，我们优先推荐下面 3 个候选。</p>
          {resultSummary ? (
            <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
              <p className="font-medium text-zinc-900">推荐摘要</p>
              <p className="mt-1">{resultSummary}</p>
            </div>
          ) : null}
          {topPick?.defaultVariantId ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-medium text-zinc-900">Top pick: {topPick.name}</p>
              <p className="mt-1 text-xs text-zinc-500">更强的转化路径：先加入购物车，再直接去结账。</p>
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
                  {pendingSlug === topPick.slug ? "处理中..." : "Add top pick & checkout"}
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
                  去购物车
                </TrackedSubmitButton>
              </div>
            </div>
          ) : null}
          {collectionPlan || bundlePlan ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {collectionPlan ? (
                <TrackedLink
                  href={`/collection/${collectionPlan.slug}?src=ai_concierge&from=quiz`}
                  targetType="collection"
                  targetId={collectionPlan.slug}
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
                  <p className="text-xs text-zinc-500">Best next step</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">{collectionPlan.title}</p>
                  <p className="mt-2 text-sm text-zinc-600">{collectionPlan.summary}</p>
                </TrackedLink>
              ) : null}
              {bundlePlan ? (
                <TrackedLink
                  href={bundlePlan.href}
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
                  <p className="text-xs text-zinc-500">Bundle route</p>
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
                href={`/product/${p.slug}?src=ai_concierge&exp=${encodeURIComponent(envClient.aiConciergeExperiment)}&bucket=${encodeURIComponent(bucket)}&from=quiz`}
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
                  {reasonTags(p, answer).map((tag) => (
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
                            setCartHint("加购失败，请打开商品页再试。");
                            return;
                          }
                          setCartHint("已加入购物车。");
                        } catch {
                          setCartHint("加购失败，请稍后再试。");
                        }
                      }}
                    >
                      Quick add
                    </TrackedSubmitButton>
                    <span className="text-xs text-zinc-500">不会离开当前页面</span>
                  </div>
                ) : null}
              </TrackedLink>
            ))}
          </div>
          {cartHint ? (
            <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
              <p>
                {cartHint}{" "}
                <a className="underline underline-offset-4" href="/cart">
                  去购物车
                </a>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
