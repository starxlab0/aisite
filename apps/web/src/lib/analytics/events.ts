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

export function track(_name: AnalyticsEventName, _payload?: AnalyticsEventPayload) {
  // TODO: 接入 PostHog / GA4。MVP 阶段可先做 console 记录或 no-op。
}

