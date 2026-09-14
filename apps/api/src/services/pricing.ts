/**
 * Pure pricing helpers (unit-tested). They operate on plain numbers so they are
 * usable from any layer and easy to test without a database.
 */
export interface PriceLike {
  id?: string;
  price: number;
  updatedAt?: Date | string;
}

export interface Summary {
  min: number | null;
  avg: number | null;
  median: number | null;
  max: number | null;
  count: number;
  cheapestListingId: string | null;
  lastUpdated: string | null;
}

export function summarize(listings: PriceLike[]): Summary {
  if (!listings.length) {
    return { min: null, avg: null, median: null, max: null, count: 0, cheapestListingId: null, lastUpdated: null };
  }
  const sorted = [...listings].sort((a, b) => a.price - b.price);
  const prices = sorted.map((l) => l.price);
  const sum = prices.reduce((a, b) => a + b, 0);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  let lastUpdated: string | null = null;
  for (const l of listings) {
    if (!l.updatedAt) continue;
    const iso = new Date(l.updatedAt).toISOString();
    if (!lastUpdated || iso > lastUpdated) lastUpdated = iso;
  }
  return {
    min: round2(prices[0]),
    avg: round2(sum / prices.length),
    median: round2(median),
    max: round2(prices[prices.length - 1]),
    count: prices.length,
    cheapestListingId: sorted[0].id ?? null,
    lastUpdated,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function percentChange(from: number | null | undefined, to: number | null | undefined): number {
  if (!from || to === null || to === undefined) return 0;
  return round2(((to - from) / from) * 100);
}

export interface BidItemInput {
  unitPrice: number;
  quantity: number;
}

export function bidTotal(items: BidItemInput[]): number {
  return round2(items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0));
}

/** Ranks bids by total ascending, ties broken by faster delivery. */
export function rankBids<T extends { totalPrice: number; deliveryDays: number }>(bids: T[]): T[] {
  return [...bids].sort((a, b) => a.totalPrice - b.totalPrice || a.deliveryDays - b.deliveryDays);
}
