export type AnalyticsEventName =
  | "view_home"
  | "view_collection"
  | "view_product"
  | "click_product_card"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "view_bundle"
  | "complete_quiz"
  | "subscribe_newsletter"
  | "click_app_control"
  | "expand_faq";

export type AnalyticsEventPayload = Record<string, unknown>;

export function track(name: AnalyticsEventName, payload?: AnalyticsEventPayload) {
  if (typeof window === "undefined") return;

  try {
    const body = JSON.stringify({
      name,
      payload: payload ?? null,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/track", new Blob([body], { type: "application/json" }));
      return;
    }

    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
