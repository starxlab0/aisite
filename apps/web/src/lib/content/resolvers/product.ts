import { getPublishedProductContentDraftBySlug } from "@/lib/control-plane/drafts";
import { getProductContentBySlug } from "@/lib/cms/queries";
import { fallbackProductContentBySlug } from "@/lib/content/fallback-localized-content";
import { getCurrentSiteKey, matchesSiteScope } from "@/lib/content/site-scope";
import type { ProductContent } from "@/types/product";
import type { ControlPlaneDraftRecord, ProductContentDraftPayload } from "@/types/draft";

export type ResolvedProductContent = {
  source: "control-plane-draft" | "sanity" | "fallback";
  content: ProductContent | null;
  debug?: {
    contentRef?: string;
    draftRef?: string;
  };
};

function fromDraft(input: {
  slug: string;
  draft: ControlPlaneDraftRecord<ProductContentDraftPayload>;
}): ResolvedProductContent {
  const { slug, draft } = input;
  const payload = draft.payload;

  const content: ProductContent = {
    productSlug: payload.productSlug ?? slug,
    siteKeys: payload.siteKeys,
    title: payload.title,
    subtitle: payload.subtitle,
    shortDescription: payload.shortDescription,
    hero: payload.hero,
    keyBenefits: payload.keyBenefits,
    whoItsFor: payload.whoItsFor,
    whyItFeelsDifferent: payload.whyItFeelsDifferent,
    careInstructions: payload.careInstructions,
    whatsInBox: payload.whatsInBox,
    locales: payload.locales,
  };

  return {
    source: "control-plane-draft",
    content,
    debug: {
      contentRef: draft.contentRef,
      draftRef: draft.contentRef,
    },
  };
}

export async function resolveProductContent(slug: string): Promise<ResolvedProductContent> {
  const siteKey = await getCurrentSiteKey();
  const draft = await getPublishedProductContentDraftBySlug(slug);
  if (draft && matchesSiteScope(draft.payload, siteKey)) {
    return fromDraft({ slug, draft });
  }

  const sanity = await getProductContentBySlug(slug);
  if (sanity && matchesSiteScope(sanity, siteKey)) {
    return {
      source: "sanity",
      content: sanity,
    };
  }

  return {
    source: "fallback",
    content: matchesSiteScope(fallbackProductContentBySlug[slug], siteKey)
      ? fallbackProductContentBySlug[slug] ?? null
      : null,
  };
}
