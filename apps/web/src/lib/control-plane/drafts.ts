import { envServer } from "@/lib/env/server";
import type {
  CollectionPageDraftPayload,
  ControlPlaneDraftRecord,
  FaqDraftPayload,
  GuideArticleDraftPayload,
  ProductContentDraftPayload,
} from "@/types/draft";

type DraftListResponse<TPayload> = {
  items: Array<ControlPlaneDraftRecord<TPayload>>;
  total: number;
};

async function fetchDrafts<TPayload>(params: {
  entityType: string;
  targetId?: string;
  status?: string;
}): Promise<Array<ControlPlaneDraftRecord<TPayload>>> {
  if (!envServer.controlPlaneUrl) {
    return [];
  }

  const url = new URL("/drafts", envServer.controlPlaneUrl);
  url.searchParams.set("entityType", params.entityType);
  if (params.targetId) {
    url.searchParams.set("targetId", params.targetId);
  }
  if (params.status) {
    url.searchParams.set("status", params.status);
  }

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const json = (await response.json()) as DraftListResponse<TPayload>;
    return json.items ?? [];
  } catch {
    return [];
  }
}

export async function getPublishedCollectionDraftBySlug(
  slug: string,
): Promise<ControlPlaneDraftRecord<CollectionPageDraftPayload> | null> {
  const drafts = await fetchDrafts<CollectionPageDraftPayload>({
    entityType: "collection-page",
    targetId: slug,
    status: "published",
  });

  return drafts[0] ?? null;
}

export async function getPublishedFaqDrafts(): Promise<
  Array<ControlPlaneDraftRecord<FaqDraftPayload>>
> {
  return fetchDrafts<FaqDraftPayload>({
    entityType: "faq",
    status: "published",
  });
}

export async function getPublishedProductContentDraftBySlug(
  slug: string,
): Promise<ControlPlaneDraftRecord<ProductContentDraftPayload> | null> {
  const drafts = await fetchDrafts<ProductContentDraftPayload>({
    entityType: "product-content",
    targetId: slug,
    status: "published",
  });

  return drafts[0] ?? null;
}

export async function getPublishedProductFaqDraftBySlug(
  slug: string,
): Promise<ControlPlaneDraftRecord<FaqDraftPayload> | null> {
  const drafts = await fetchDrafts<FaqDraftPayload>({
    entityType: "faq",
    targetId: slug,
    status: "published",
  });

  return drafts[0] ?? null;
}

export async function getPublishedGuideDraftBySlug(
  slug: string,
): Promise<ControlPlaneDraftRecord<GuideArticleDraftPayload> | null> {
  const drafts = await fetchDrafts<GuideArticleDraftPayload>({
    entityType: "guide-article",
    targetId: slug,
    status: "published",
  });

  return drafts[0] ?? null;
}

export async function getPublishedGuideDrafts(): Promise<
  Array<ControlPlaneDraftRecord<GuideArticleDraftPayload>>
> {
  return fetchDrafts<GuideArticleDraftPayload>({
    entityType: "guide-article",
    status: "published",
  });
}
