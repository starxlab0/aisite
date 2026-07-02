import type { CommerceProduct } from "@/types/product";
import { getMedusaBaseUrl, medusaFetch } from "@/lib/commerce/http";
import { mockProducts } from "@/lib/commerce/mock";

type MedusaProductResponse = {
  products: Array<{
    id: string;
    handle: string;
    title: string;
    status?: string;
    thumbnail?: string;
    images?: Array<{ url: string }>;
    variants?: Array<{
      id: string;
      calculated_price?: {
        calculated_amount?: number | string;
        original_amount?: number | string;
        currency_code?: string;
      };
      prices?: Array<{
        amount?: number | string;
        currency_code?: string;
      }>;
    }>;
    metadata?: Record<string, unknown>;
  }>;
};

function resolvePrice(
  p: MedusaProductResponse["products"][number],
  md: Record<string, any>,
) {
  const firstVariant = p.variants?.[0];
  const calculatedAmount = firstVariant?.calculated_price?.calculated_amount;
  const originalAmount = firstVariant?.calculated_price?.original_amount;
  const variantPrice = firstVariant?.prices?.[0]?.amount;
  const currency =
    firstVariant?.calculated_price?.currency_code ??
    firstVariant?.prices?.[0]?.currency_code ??
    md.currency ??
    "USD";

  return {
    price: Number(calculatedAmount ?? variantPrice ?? md.price ?? 0),
    compareAtPrice:
      originalAmount != null
        ? Number(originalAmount)
        : md.compareAtPrice
          ? Number(md.compareAtPrice)
          : undefined,
    currency: String(currency).toUpperCase(),
  };
}

function mapMedusaProduct(p: MedusaProductResponse["products"][number]): CommerceProduct {
  const md = (p.metadata ?? {}) as Record<string, any>;
  const priceInfo = resolvePrice(p, md);
  return {
    id: p.id,
    defaultVariantId: p.variants?.[0]?.id,
    slug: p.handle,
    name: p.title,
    status: (p.status === "draft" ? "draft" : "published"),
    brand: String(md.brand ?? "Brand"),
    series: md.series ? String(md.series) : undefined,
    thumbnail: p.thumbnail,
    images: (p.images ?? []).map((x) => x.url),
    price: priceInfo.price,
    compareAtPrice: priceInfo.compareAtPrice,
    currency: priceInfo.currency,
    inventoryQuantity: md.inventoryQuantity ? Number(md.inventoryQuantity) : undefined,
    allowBackorder: Boolean(md.allowBackorder ?? false),
    material: md.material ? String(md.material) : undefined,
    waterproof: (md.waterproof as any) ?? "none",
    runtimeMinutes: md.runtimeMinutes ? Number(md.runtimeMinutes) : undefined,
    chargeMinutes: md.chargeMinutes ? Number(md.chargeMinutes) : undefined,
    weightGrams: md.weightGrams ? Number(md.weightGrams) : undefined,
    sizeText: md.sizeText ? String(md.sizeText) : undefined,
    stimulationType: (md.stimulationType as any) ?? [],
    appControl: Boolean(md.appControl ?? false),
    remoteControl: Boolean(md.remoteControl ?? false),
    wearable: Boolean(md.wearable ?? false),
    heating: Boolean(md.heating ?? false),
    coupleFriendly: Boolean(md.coupleFriendly ?? false),
    beginnerLevel: (md.beginnerLevel as any) ?? 3,
    intensityLevel: (md.intensityLevel as any) ?? 3,
    noiseLevel: (md.noiseLevel as any) ?? 3,
    discreetLevel: (md.discreetLevel as any) ?? 3,
    tags: (md.tags as any) ?? [],
    collections: (md.collections as any) ?? [],
  };
}

function withStorePriceContext(path: string) {
  const regionId = process.env.NEXT_PUBLIC_MEDUSA_REGION_ID;
  const countryCode = process.env.NEXT_PUBLIC_MEDUSA_COUNTRY_CODE;

  const url = new URL(path, "http://medusa.local");
  if (regionId && !url.searchParams.has("region_id")) {
    url.searchParams.set("region_id", regionId);
  }
  if (countryCode && !url.searchParams.has("country_code")) {
    url.searchParams.set("country_code", countryCode);
  }
  return `${url.pathname}${url.search}`;
}

export async function listProducts(): Promise<CommerceProduct[]> {
  if (!getMedusaBaseUrl()) return mockProducts;
  const data = await medusaFetch<MedusaProductResponse>(
    withStorePriceContext("/store/products"),
  );
  return data.products.map(mapMedusaProduct);
}

export async function getProductBySlug(slug: string): Promise<CommerceProduct | null> {
  if (!getMedusaBaseUrl()) return mockProducts.find((p) => p.slug === slug) ?? null;
  const data = await medusaFetch<MedusaProductResponse>(
    withStorePriceContext(`/store/products?handle=${encodeURIComponent(slug)}`),
  );
  const p = data.products?.[0];
  return p ? mapMedusaProduct(p) : null;
}
