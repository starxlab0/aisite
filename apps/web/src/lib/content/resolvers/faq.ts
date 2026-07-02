import { getFaqItems } from "@/lib/cms/queries";
import { getPublishedFaqDrafts } from "@/lib/control-plane/drafts";
import type { ControlPlaneDraftRecord, FaqDraftPayload } from "@/types/draft";
import type { SanityFaqItem } from "@/lib/cms/queries";

export type ResolvedFaqGroup = {
  source: "sanity-faqItem" | "control-plane-draft";
  title: string;
  contentRef: string;
  targetPath: string;
  items: Array<{
    id: string;
    question: string;
    answer: string;
    category?: string;
  }>;
};

export type ResolvedFaqContent = {
  source: "sanity-faqItem" | "control-plane-draft" | "fallback";
  groups: ResolvedFaqGroup[];
};

function resolveTargetPath(targetType: string | undefined, targetId: string | undefined): string {
  if (!targetType || !targetId) return "/faq";
  if (targetType === "product") return `/product/${targetId}`;
  if (targetType === "collection") return `/collection/${targetId}`;
  return "/faq";
}

function buildGroupsFromSanity(items: SanityFaqItem[]): ResolvedFaqGroup[] {
  const map = new Map<string, ResolvedFaqGroup>();

  items.forEach((item) => {
    const targetType = item.targetType ?? "global";
    const targetId = item.targetId ?? "faq";
    const key = `${targetType}:${targetId}`;

    const group =
      map.get(key) ??
      ({
        source: "sanity-faqItem",
        title: targetType === "global" ? "FAQ" : `FAQ: ${targetId}`,
        contentRef: "sanity:faqItem",
        targetPath: resolveTargetPath(item.targetType, item.targetId),
        items: [],
      } satisfies ResolvedFaqGroup);

    group.items.push({
      id: item._id,
      question: item.question,
      answer: item.answer,
      category: item.category,
    });

    map.set(key, group);
  });

  return Array.from(map.values());
}

export async function resolveFaqContent(): Promise<ResolvedFaqContent> {
  const sanityItems = await getFaqItems();
  if (sanityItems.length > 0) {
    return {
      source: "sanity-faqItem",
      groups: buildGroupsFromSanity(sanityItems),
    };
  }

  const drafts = await getPublishedFaqDrafts();
  if (drafts.length === 0) {
    return {
      source: "fallback",
      groups: [],
    };
  }

  const groups: ResolvedFaqGroup[] = drafts.map(
    (draft: ControlPlaneDraftRecord<FaqDraftPayload>) => ({
      source: "control-plane-draft",
      title: draft.payload.title,
      contentRef: draft.contentRef,
      targetPath: draft.targetPath,
      items: draft.payload.items.map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
        category: item.intent,
      })),
    }),
  );

  return {
    source: "control-plane-draft",
    groups,
  };
}
