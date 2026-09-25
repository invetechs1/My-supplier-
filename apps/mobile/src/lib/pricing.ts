import type { ListingTier, ShopOffer } from "@mysupplier/shared";

/** Offers everywhere may carry sale / tier pricing (marketplace `OfferPricing`); older payloads may not. */
export type PricedOffer = ShopOffer & {
  salePrice?: number | null;
  saleEndsAt?: string | null;
  compareAtPrice?: number | null;
  effectivePrice?: number;
  tiers?: ListingTier[];
};

export function tiersOf(offer: PricedOffer | null | undefined): ListingTier[] {
  return (offer?.tiers ?? []).slice().sort((a, b) => a.minQty - b.minQty);
}

/** True while the sale price is live (the API clears `salePrice` once it expires, this is a guard). */
export function saleLive(offer: PricedOffer | null | undefined): boolean {
  if (!offer || offer.salePrice === null || offer.salePrice === undefined) return false;
  if (offer.saleEndsAt && new Date(offer.saleEndsAt).getTime() < Date.now()) return false;
  return offer.salePrice < offer.price;
}

/** Highest volume tier reached by `quantity` (null when none). */
export function tierFor(offer: PricedOffer | null | undefined, quantity: number): ListingTier | null {
  let hit: ListingTier | null = null;
  tiersOf(offer).forEach((t) => {
    if (t.minQty <= quantity) hit = t;
  });
  return hit;
}

/** Next volume break above `quantity` (null when none, or when a sale is live). */
export function nextTierFor(offer: PricedOffer | null | undefined, quantity: number): (ListingTier & { savePerUnit: number }) | null {
  if (saleLive(offer)) return null;
  const current = unitPriceFor(offer, quantity);
  const next = tiersOf(offer).find((t) => t.minQty > quantity && t.price < current);
  return next ? { ...next, savePerUnit: Math.round((current - next.price) * 100) / 100 } : null;
}

/** Same rule as the API: live sale price wins, else the best tier reached, else the base price. */
export function unitPriceFor(offer: PricedOffer | null | undefined, quantity: number): number {
  if (!offer) return 0;
  if (saleLive(offer)) return offer.salePrice as number;
  return tierFor(offer, quantity)?.price ?? offer.price;
}

/** Price the buyer pays at the minimum quantity (what cards and lists display). */
export function effectivePriceOf(offer: PricedOffer | null | undefined): number | null {
  if (!offer) return null;
  if (typeof offer.effectivePrice === "number") return offer.effectivePrice;
  return unitPriceFor(offer, Math.max(1, offer.minQty || 1));
}

/** List price to strike through while a sale is live (null otherwise). */
export function compareAtOf(offer: PricedOffer | null | undefined): number | null {
  if (!offer) return null;
  if (typeof offer.compareAtPrice === "number" && offer.compareAtPrice > (effectivePriceOf(offer) ?? 0)) return offer.compareAtPrice;
  return saleLive(offer) ? offer.price : null;
}

/** Whole-percent discount of `price` versus `compareAt` (0 when not lower). */
export function percentOff(compareAt: number | null | undefined, price: number | null | undefined): number {
  if (!compareAt || !price || price >= compareAt) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
