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

function formatWaterproof(waterproof: CommerceProduct["waterproof"]) {
  if (!waterproof) return null;
  if (waterproof === "none") return "不支持防水";
  return waterproof;
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
      commerce.material ? { label: "材质", value: commerce.material } : null,
      formatWaterproof(commerce.waterproof)
        ? { label: "防水", value: formatWaterproof(commerce.waterproof)! }
        : null,
      typeof commerce.runtimeMinutes === "number"
        ? { label: "续航", value: `${commerce.runtimeMinutes} 分钟` }
        : null,
      typeof commerce.chargeMinutes === "number"
        ? { label: "充电", value: `${commerce.chargeMinutes} 分钟` }
        : null,
      commerce.sizeText ? { label: "尺寸", value: commerce.sizeText } : null,
      typeof commerce.weightGrams === "number"
        ? { label: "重量", value: `${commerce.weightGrams} g` }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>,
    whatsInBox: content?.whatsInBox ?? [],
    faqs: [],
    relatedProducts: [],
  };
}
