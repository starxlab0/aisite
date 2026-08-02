import { getPublishedGuideDraftBySlug, getPublishedGuideDrafts } from "@/lib/control-plane/drafts";
import { getGuideBySlug, getGuides } from "@/lib/cms/queries";
import { fallbackGuideBySlug } from "@/lib/content/fallback-localized-content";
import { filterBySiteScope, getCurrentSiteKey, matchesSiteScope } from "@/lib/content/site-scope";
import type { ControlPlaneDraftRecord, GuideArticleDraftPayload } from "@/types/draft";
import type { GuideArticle } from "@/types/guide";

export type ResolvedGuideArticle = {
  source: "control-plane-draft" | "sanity" | "fallback";
  article: GuideArticle | null;
  debug?: {
    contentRef?: string;
    draftRef?: string;
  };
};

function fromDraft(draft: ControlPlaneDraftRecord<GuideArticleDraftPayload>): ResolvedGuideArticle {
  const payload = draft.payload;
  return {
    source: "control-plane-draft",
    article: {
      slug: payload.slug,
      siteKeys: payload.siteKeys,
      title: payload.title,
      excerpt: payload.excerpt,
      category: "buying-guide",
      body: payload.body,
      relatedProductSlugs: payload.relatedProductSlugs,
      relatedCollectionSlugs: payload.relatedCollectionSlugs,
      seo: payload.seo,
      locales: payload.locales,
    },
    debug: {
      contentRef: draft.contentRef,
      draftRef: draft.contentRef,
    },
  };
}

function fallbackGuide(slug: string): ResolvedGuideArticle {
  return {
    source: "fallback",
    article: fallbackGuideBySlug[slug] ?? {
      slug,
      title: `Guide: ${slug}`,
      excerpt: "Guide 内容骨架：后续由 Sanity 或 control-plane 已发布 guide draft 驱动。",
      category: "buying-guide",
      body: [],
      relatedProductSlugs: [],
      relatedCollectionSlugs: [],
    },
  };
}

export async function resolveGuideBySlug(slug: string): Promise<ResolvedGuideArticle> {
  const siteKey = getCurrentSiteKey();
  const draft = await getPublishedGuideDraftBySlug(slug);
  if (draft && matchesSiteScope(draft.payload, siteKey)) {
    return fromDraft(draft);
  }

  const sanity = await getGuideBySlug(slug);
  if (sanity && matchesSiteScope(sanity, siteKey)) {
    return {
      source: "sanity",
      article: sanity,
    };
  }

  return fallbackGuide(slug);
}

export async function resolveGuideList(): Promise<{
  source: "control-plane-draft" | "sanity" | "fallback";
  items: GuideArticle[];
}> {
  const siteKey = getCurrentSiteKey();
  const drafts = await getPublishedGuideDrafts();
  if (drafts.length > 0) {
    return {
      source: "control-plane-draft",
      items: drafts
        .filter((draft) => matchesSiteScope(draft.payload, siteKey))
        .map((draft) => fromDraft(draft).article!)
        .filter(Boolean),
    };
  }

  const sanity = await getGuides();
  if (sanity.length > 0) {
    return {
      source: "sanity",
      items: filterBySiteScope(sanity, siteKey),
    };
  }

  return {
    source: "fallback",
    items: filterBySiteScope(Object.values(fallbackGuideBySlug), siteKey),
  };
}
