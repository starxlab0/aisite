import { getCollectionPageBySlug } from "@/lib/cms/queries";
import { getPublishedCollectionDraftBySlug } from "@/lib/control-plane/drafts";
import type { CollectionPage } from "@/types/collection";
import type { ControlPlaneDraftRecord, CollectionPageDraftPayload } from "@/types/draft";

export type ResolvedCollectionContent = {
  source: "control-plane-draft" | "sanity" | "fallback";
  slug: string;
  heroTitle: string;
  heroSummary: string;
  sections: Array<{ key: string; title: string; content: string }>;
  internalLinks: string[];
  debug?: {
    contentRef?: string;
    draftRef?: string;
  };
};

function fromDraft(input: {
  slug: string;
  draft: ControlPlaneDraftRecord<CollectionPageDraftPayload>;
}): ResolvedCollectionContent {
  const { slug, draft } = input;
  return {
    source: "control-plane-draft",
    slug,
    heroTitle: draft.payload.hero.title,
    heroSummary: draft.payload.hero.summary,
    sections: draft.payload.sections,
    internalLinks: draft.payload.internalLinks,
    debug: {
      contentRef: draft.contentRef,
      draftRef: draft.contentRef,
    },
  };
}

function toSectionsFromSanity(collection: CollectionPage): Array<{
  key: string;
  title: string;
  content: string;
}> {
  const blocks = collection.introBlocks ?? [];
  if (blocks.length === 0) return [];

  return blocks.map((content, index) => ({
    key: `intro-${index + 1}`,
    title: `Intro ${index + 1}`,
    content,
  }));
}

function fromSanity(input: { slug: string; collection: CollectionPage }): ResolvedCollectionContent {
  const { slug, collection } = input;
  return {
    source: "sanity",
    slug,
    heroTitle: collection.title,
    heroSummary: collection.description ?? collection.subtitle ?? "",
    sections: toSectionsFromSanity(collection),
    internalLinks: ["/guides", "/faq", `/collection/${slug}`],
  };
}

function fallback(slug: string): ResolvedCollectionContent {
  return {
    source: "fallback",
    slug,
    heroTitle: `Collection: ${slug}`,
    heroSummary: "分类页骨架：后续由 Sanity 提供分类文案与 FAQ，由 Medusa 提供商品列表与筛选。",
    sections: [],
    internalLinks: [],
  };
}

export async function resolveCollectionContent(slug: string): Promise<ResolvedCollectionContent> {
  const draft = await getPublishedCollectionDraftBySlug(slug);
  if (draft) {
    return fromDraft({ slug, draft });
  }

  const sanity = await getCollectionPageBySlug(slug);
  if (sanity) {
    return fromSanity({ slug, collection: sanity });
  }

  return fallback(slug);
}
