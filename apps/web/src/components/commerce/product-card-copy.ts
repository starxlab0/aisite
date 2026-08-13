import type { SupportedLocaleKey } from "../../lib/site/locale-routing";
import type { CommerceProduct } from "../../types/product";

type ProductCardCopy = {
  badges: {
    appControl: string;
    wearable: string;
    coupleFriendly: string;
    dualStimulation: string;
    discreet: string;
  };
  stock: {
    backorder: string;
    outOfStock: string;
    onlyLeft: (count: number) => string;
    inStock: string;
  };
  runtimeFallback: string;
  viewDetails: string;
  discreetLevel: string;
  beginnerFriendly: string;
  specLabels: {
    waterproof: string;
    runtime: string;
    notWaterproof: string;
    minutes: string;
  };
};

export function getProductCardCopy(localeKey: SupportedLocaleKey): ProductCardCopy {
  if (localeKey === "en") {
    return {
      badges: {
        appControl: "App Control",
        wearable: "Wearable",
        coupleFriendly: "Couples",
        dualStimulation: "Dual stimulation",
        discreet: "Quiet & discreet",
      },
      stock: {
        backorder: "Backorder available",
        outOfStock: "Out of stock",
        onlyLeft: (count) => `Only ${count} left`,
        inStock: "In stock",
      },
      runtimeFallback: "See product page",
      viewDetails: "View details",
      discreetLevel: "Discreetness",
      beginnerFriendly: "Beginner friendly",
      specLabels: {
        waterproof: "Waterproofing",
        runtime: "Battery",
        notWaterproof: "Not waterproof",
        minutes: "min",
      },
    };
  }

  return {
    badges: {
      appControl: "App 控制",
      wearable: "可穿戴",
      coupleFriendly: "适合情侣",
      dualStimulation: "双重刺激",
      discreet: "低调安静",
    },
    stock: {
      backorder: "支持预售",
      outOfStock: "暂时缺货",
      onlyLeft: (count) => `仅剩 ${count} 件`,
      inStock: "现货可下单",
    },
    runtimeFallback: "详情页查看",
    viewDetails: "查看详情",
    discreetLevel: "静音度",
    beginnerFriendly: "新手友好",
    specLabels: {
      waterproof: "防水",
      runtime: "续航",
      notWaterproof: "不支持防水",
      minutes: "分钟",
    },
  };
}

export function buildProductBadges(product: CommerceProduct, localeKey: SupportedLocaleKey) {
  const copy = getProductCardCopy(localeKey);
  const badges: string[] = [];

  if (product.appControl) badges.push(copy.badges.appControl);
  if (product.wearable) badges.push(copy.badges.wearable);
  if (product.coupleFriendly) badges.push(copy.badges.coupleFriendly);
  if (product.stimulationType.includes("dual")) badges.push(copy.badges.dualStimulation);
  if (product.discreetLevel >= 4) badges.push(copy.badges.discreet);

  return badges.slice(0, 4);
}

export function getStockLabel(product: CommerceProduct, localeKey: SupportedLocaleKey) {
  const copy = getProductCardCopy(localeKey);

  if (product.allowBackorder) return copy.stock.backorder;
  if (typeof product.inventoryQuantity === "number" && product.inventoryQuantity <= 0) {
    return copy.stock.outOfStock;
  }
  if (typeof product.inventoryQuantity === "number" && product.inventoryQuantity < 10) {
    return copy.stock.onlyLeft(product.inventoryQuantity);
  }

  return copy.stock.inStock;
}

export function getRuntimeLabel(product: CommerceProduct, localeKey: SupportedLocaleKey) {
  const copy = getProductCardCopy(localeKey);

  if (product.runtimeMinutes) {
    return `${product.runtimeMinutes} ${copy.specLabels.minutes}`;
  }

  return copy.runtimeFallback;
}

export function getWaterproofLabel(product: CommerceProduct, localeKey: SupportedLocaleKey) {
  const copy = getProductCardCopy(localeKey);

  if (product.waterproof && product.waterproof !== "none") {
    return product.waterproof;
  }

  return copy.specLabels.notWaterproof;
}
