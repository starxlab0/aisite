export type CreateCartInput = {
  regionId?: string;
  countryCode?: string;
};

export function buildCreateCartPayload(input: CreateCartInput = {}) {
  const payload: Record<string, string> = {};

  if (input.regionId) {
    payload.region_id = input.regionId;
  }

  return payload;
}

export function getDisplayLineTotal(unitPrice: number, quantity: number, total: number, cartSubtotal: number) {
  if (total > 0 || cartSubtotal <= 0 || unitPrice <= 0 || quantity <= 0) {
    return total;
  }

  return unitPrice * quantity;
}
