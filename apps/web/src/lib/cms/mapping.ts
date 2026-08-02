import type { CommerceProduct, ProductContent, ProductPageViewModel } from "@/types/product";
import { getLocalizedCopy } from "@/lib/site/copy";
import type { SupportedLocaleKey } from "@/lib/site/locale-routing";

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

function formatWaterproof(waterproof: CommerceProduct["waterproof"], localeKey: SupportedLocaleKey) {
  const copy = getLocalizedCopy(localeKey).product;
  if (!waterproof) return null;
  if (waterproof === "none") return copy.specLabels.notWaterproof;
  return waterproof;
}

export function toProductPageViewModel(input: {
  commerce: CommerceProduct;
  content?: ProductContent | null;
  localeKey: SupportedLocaleKey;
}): ProductPageViewModel {
  const { commerce, content, localeKey } = input;
  const copy = getLocalizedCopy(localeKey).product;

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
      commerce.material ? { label: copy.specLabels.material, value: commerce.material } : null,
      formatWaterproof(commerce.waterproof, localeKey)
        ? { label: copy.specLabels.waterproof, value: formatWaterproof(commerce.waterproof, localeKey)! }
        : null,
      typeof commerce.runtimeMinutes === "number"
        ? { label: copy.specLabels.runtime, value: `${commerce.runtimeMinutes} ${copy.specLabels.minutes}` }
        : null,
      typeof commerce.chargeMinutes === "number"
        ? { label: copy.specLabels.charge, value: `${commerce.chargeMinutes} ${copy.specLabels.minutes}` }
        : null,
      commerce.sizeText ? { label: copy.specLabels.size, value: commerce.sizeText } : null,
      typeof commerce.weightGrams === "number"
        ? { label: copy.specLabels.weight, value: `${commerce.weightGrams} g` }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>,
    whatsInBox: content?.whatsInBox ?? [],
    faqs: [],
    relatedProducts: [],
  };
}
