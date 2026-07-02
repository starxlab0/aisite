import { getPublishedGuideDraftBySlug, getPublishedGuideDrafts } from "@/lib/control-plane/drafts";
import { getGuideBySlug, getGuides } from "@/lib/cms/queries";
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
      title: payload.title,
      excerpt: payload.excerpt,
      category: "buying-guide",
      body: payload.body,
      relatedProductSlugs: payload.relatedProductSlugs,
      relatedCollectionSlugs: payload.relatedCollectionSlugs,
      seo: payload.seo,
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
    article: {
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
  const draft = await getPublishedGuideDraftBySlug(slug);
  if (draft) {
    return fromDraft(draft);
  }

  const sanity = await getGuideBySlug(slug);
  if (sanity) {
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
  const drafts = await getPublishedGuideDrafts();
  if (drafts.length > 0) {
    return {
      source: "control-plane-draft",
      items: drafts.map((draft) => fromDraft(draft).article!).filter(Boolean),
    };
  }

  const sanity = await getGuides();
  if (sanity.length > 0) {
    return {
      source: "sanity",
      items: sanity,
    };
  }

  return {
    source: "fallback",
    items: [
      {
        slug: "how-to-choose",
        title: "第一次买怎么选",
        excerpt: "从场景、隐私、连接与清洁四个维度，帮助第一次购买者缩小范围。",
        category: "buying-guide",
        body: [],
        relatedProductSlugs: ["kokocang-x"],
        relatedCollectionSlugs: ["first-time"],
      },
    ],
  };
}

