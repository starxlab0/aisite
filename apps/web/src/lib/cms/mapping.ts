import type { CommerceProduct, ProductContent, ProductPageViewModel } from "@/types/product";

function truthyBadges(p: CommerceProduct): string[] {
  const badges: string[] = [];
  if (p.appControl) badges.push("App Control");
  if (p.wearable) badges.push("Wearable");
  if (p.coupleFriendly) badges.push("Couples");
  if (p.heating) badges.push("Heating");
  if (p.stimulationType.includes("dual")) badges.push("Dual");
  if (p.discreetLevel >= 4) badges.push("Discreet");
  return badges;
}

export function toProductPageViewModel(input: {
  commerce: CommerceProduct;
  content?: ProductContent | null;
}): ProductPageViewModel {
  const { commerce, content } = input;

  const media = [
    ...(content?.hero?.media ?? []),
    ...(commerce.images ?? []),
  ].filter(Boolean);

  return {
    slug: commerce.slug,
    title: content?.title ?? commerce.name,
    subtitle: content?.subtitle,
    price: {
      amount: commerce.price,
      compareAt: commerce.compareAtPrice,
      currency: commerce.currency,
    },
    media,
    inStock:
      typeof commerce.inventoryQuantity === "number"
        ? commerce.inventoryQuantity > 0 || Boolean(commerce.allowBackorder)
        : true,
    badges: truthyBadges(commerce),
    keyBenefits: content?.keyBenefits ?? [],
    whoItsFor: content?.whoItsFor ?? [],
    whyItFeelsDifferent: content?.whyItFeelsDifferent ?? [],
    specs: [
      commerce.material ? { label: "Material", value: commerce.material } : null,
      commerce.waterproof
        ? { label: "Waterproof", value: commerce.waterproof }
        : null,
      typeof commerce.runtimeMinutes === "number"
        ? { label: "Runtime", value: `${commerce.runtimeMinutes} min` }
        : null,
      typeof commerce.chargeMinutes === "number"
        ? { label: "Charge", value: `${commerce.chargeMinutes} min` }
        : null,
      commerce.sizeText ? { label: "Size", value: commerce.sizeText } : null,
      typeof commerce.weightGrams === "number"
        ? { label: "Weight", value: `${commerce.weightGrams} g` }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>,
    whatsInBox: content?.whatsInBox ?? [],
    faqs: [],
    relatedProducts: [],
  };
}

