import type { OpsChangeRequest } from "@/lib/control-plane/ops";

export type ChangeRequestExecutionTarget =
  | {
      mode: "draft";
      targetType: "product" | "guide" | "collection" | "faq";
      targetId: string;
      patch: Record<string, unknown>;
      detailHrefBase: string;
    }
  | {
      mode: "repo_change";
      title: string;
      summary: string;
      kind: "site_feature_toggle";
      targetType: "site-config";
      targetId: string;
      branchName: string;
      siteConfigChange: {
        siteKeys: string[];
        feature: string;
        op: "enable" | "disable";
      };
      detailHrefBase: string;
    };

export function getChangeRequestExecutionTarget(
  item: OpsChangeRequest,
): ChangeRequestExecutionTarget | null {
  const plan = item.plan;
  if (!plan) return null;

  if (
    plan.kind === "set_site_keys_product" &&
    plan.targetType === "product" &&
    typeof plan.targetId === "string" &&
    plan.targetId.trim()
  ) {
    return {
      mode: "draft",
      targetType: "product",
      targetId: plan.targetId,
      patch: {
        siteKeys: Array.isArray(plan.sites) ? plan.sites : [],
      },
      detailHrefBase: `/ops/product/${encodeURIComponent(plan.targetId)}`,
    };
  }

  if (
    plan.kind === "set_site_keys_content" &&
    (plan.targetType === "guide" || plan.targetType === "collection") &&
    typeof plan.targetId === "string" &&
    plan.targetId.trim()
  ) {
    return {
      mode: "draft",
      targetType: plan.targetType,
      targetId: plan.targetId,
      patch: {
        siteKeys: Array.isArray(plan.sites) ? plan.sites : [],
      },
      detailHrefBase: `/ops/${plan.targetType}/${encodeURIComponent(plan.targetId)}`,
    };
  }

  if (
    (plan.kind === "update_collection_featured_products" || plan.kind === "update_collection_cta") &&
    plan.targetType === "collection" &&
    typeof plan.targetId === "string" &&
    plan.targetId.trim()
  ) {
    return {
      mode: "draft",
      targetType: "collection",
      targetId: plan.targetId,
      patch: typeof plan.fields === "object" && plan.fields ? plan.fields : {},
      detailHrefBase: `/ops/collection/${encodeURIComponent(plan.targetId)}`,
    };
  }

  if (
    plan.kind === "set_site_keys_content" &&
    plan.targetType === "faq" &&
    typeof plan.targetId === "string" &&
    plan.targetId.includes(":")
  ) {
    const [targetType, targetId] = plan.targetId.split(":");
    if (targetType && targetId) {
      return {
        mode: "draft",
        targetType: "faq",
        targetId: `${targetType}:${targetId}`,
        patch: {
          siteKeys: Array.isArray(plan.sites) ? plan.sites : [],
        },
        detailHrefBase: `/ops/faq/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`,
      };
    }
  }

  if (
    plan.kind === "toggle_feature" &&
    typeof plan.targetId === "string" &&
    plan.targetId.trim() &&
    Array.isArray(plan.sites) &&
    plan.sites.length
  ) {
    const op = String((plan.fields as Record<string, unknown> | undefined)?.op || "disable") === "enable" ? "enable" : "disable";
    const feature = plan.targetId;
    const siteKey = plan.sites[0];
    return {
      mode: "repo_change",
      title: `${op === "enable" ? "Enable" : "Disable"} ${feature} for ${siteKey}`,
      summary: `${op === "enable" ? "Enable" : "Disable"} feature ${feature} for site ${siteKey} through site config repo change.`,
      kind: "site_feature_toggle",
      targetType: "site-config",
      targetId: `${siteKey}:${feature}`,
      branchName: `ai/site-config/${siteKey}-${feature}-${op}`,
      siteConfigChange: {
        siteKeys: plan.sites,
        feature,
        op,
      },
      detailHrefBase: "/ops/queue",
    };
  }

  return null;
}
