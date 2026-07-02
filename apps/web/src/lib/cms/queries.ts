import { sanityClient } from "@/lib/cms/client";
import type { ProductContent } from "@/types/product";
import type { CollectionPage } from "@/types/collection";
import type { GuideArticle } from "@/types/guide";
import type { BundlePage } from "@/types/bundle";
import type { FAQItem } from "@/types/faq";

/**
 * 注意：这里的 GROQ 只是骨架占位，后续会与实际 Sanity schema 对齐。
 */

export async function getProductContentBySlug(
  slug: string,
): Promise<ProductContent | null> {
  if (!sanityClient) return null;
  const query = `*[_type == "productContent" && productSlug == $slug][0]`;
  return sanityClient.fetch(query, { slug });
}

export async function getCollectionPageBySlug(
  slug: string,
): Promise<CollectionPage | null> {
  if (!sanityClient) return null;
  const query = `*[_type == "collectionPage" && slug.current == $slug][0]{
    "slug": slug.current,
    title,
    subtitle,
    description,
    heroImage,
    introBlocks,
    featuredProducts,
    faqIds,
    guideIds,
    seo
  }`;
  return sanityClient.fetch(query, { slug });
}

export async function getGuideBySlug(slug: string): Promise<GuideArticle | null> {
  if (!sanityClient) return null;
  const query = `*[_type == "guideArticle" && slug.current == $slug][0]{
    "slug": slug.current,
    title,
    excerpt,
    coverImage,
    category,
    body,
    relatedProductSlugs,
    relatedCollectionSlugs,
    seo
  }`;
  return sanityClient.fetch(query, { slug });
}

export async function getGuides(): Promise<GuideArticle[]> {
  if (!sanityClient) return [];
  const query = `*[_type == "guideArticle"] | order(updatedAt desc){
    "slug": slug.current,
    title,
    excerpt,
    coverImage,
    category,
    body,
    relatedProductSlugs,
    relatedCollectionSlugs,
    seo
  }`;
  return sanityClient.fetch(query);
}

export async function getBundleBySlug(slug: string): Promise<BundlePage | null> {
  if (!sanityClient) return null;
  const query = `*[_type == "bundlePage" && slug.current == $slug][0]{
    "slug": slug.current,
    title,
    subtitle,
    description,
    productSlugs,
    reasonToBuy,
    audienceTag,
    faqIds
  }`;
  return sanityClient.fetch(query, { slug });
}

export type SanityFaqItem = FAQItem & {
  _id: string;
  targetType?: string;
  targetId?: string;
};

export async function getFaqItems(): Promise<SanityFaqItem[]> {
  if (!sanityClient) return [];
  const query = `*[_type == "faqItem"]{
    _id,
    question,
    answer,
    category,
    targetType,
    targetId
  } | order(targetType asc, targetId asc)`;
  return sanityClient.fetch(query);
}
