import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { activeListingWhere } from "./catalog";
import { round2 } from "./pricing";

export const DEAL_THRESHOLD = 0.05; // best price >= 5% below average
export const VAT_RATE = 0.15;
export const DELIVERY_FEE_SAME_CITY = 150;
export const DELIVERY_FEE_OTHER_CITY = 350;

export type ListingWithCompany = Prisma.PriceListingGetPayload<{ include: { company: true } }> & {
  /** Volume tiers; optional so callers that only include `company` (cart, checkout) keep working. */
  tiers?: { minQty: number; price: Prisma.Decimal | number }[];
};

export interface SalePricingInput {
  price: number;
  salePrice?: number | null;
  saleEndsAt?: Date | string | null;
}

/** True when a sale price exists and has not expired (saleEndsAt null = open ended). */
export function isSaleLive(l: SalePricingInput, now: Date = new Date()): boolean {
  if (l.salePrice === null || l.salePrice === undefined || !(l.salePrice > 0)) return false;
  if (l.salePrice >= l.price) return false;
  if (!l.saleEndsAt) return true;
  return new Date(l.saleEndsAt).getTime() > now.getTime();
}

/** Pure: sale-aware pricing fields for an offer. */
export function effectivePricing(l: SalePricingInput, now: Date = new Date()) {
  const live = isSaleLive(l, now);
  return {
    salePrice: live ? Number(l.salePrice) : null,
    compareAtPrice: live ? l.price : null,
    effectivePrice: live ? Number(l.salePrice) : l.price,
  };
}

export interface TierLike { minQty: number; price: number }

/** Pure: unit price for a quantity = cheapest of (effective price, best matching volume tier). */
export function priceForQuantity(offer: { effectivePrice: number; tiers?: TierLike[] }, qty: number): number {
  let best = offer.effectivePrice;
  for (const t of offer.tiers ?? []) if (qty >= t.minQty && t.price < best) best = t.price;
  return best;
}

export function toOffer(l: ListingWithCompany, now: Date = new Date()) {
  const price = Number(l.price);
  const pricing = effectivePricing({ price, salePrice: l.salePrice === null || l.salePrice === undefined ? null : Number(l.salePrice), saleEndsAt: l.saleEndsAt }, now);
  const tiers = (l.tiers ?? []).map((t) => ({ minQty: t.minQty, price: Number(t.price) })).sort((a, b) => a.minQty - b.minQty);
  return {
    listingId: l.id,
    companyId: l.companyId,
    companyName: l.company?.name ?? `${l.sourceName ?? "Market"} (reference)`,
    verified: l.company?.verified ?? false,
    rating: l.company?.rating ?? 0,
    city: l.city,
    price,
    minQty: l.minQty,
    leadTimeDays: l.leadTimeDays,
    stock: l.stock,
    source: l.source,
    sourceName: l.sourceName,
    imageUrl: l.imageUrl ?? null,
    salePrice: pricing.salePrice,
    saleEndsAt: pricing.salePrice !== null && l.saleEndsAt ? new Date(l.saleEndsAt).toISOString() : null,
    compareAtPrice: pricing.compareAtPrice,
    effectivePrice: pricing.effectivePrice,
    tiers,
  };
}

export type Offer = ReturnType<typeof toOffer>;

/** Purchasable = a real supplier offer (market references are informational). */
export const isPurchasable = (o: Offer) => o.source === "SUPPLIER" && o.companyId !== null && (o.stock === null || o.stock > 0);

export interface Enrichment {
  bestOffer: Offer | null;
  offerCount: number;
  minPrice: number | null;
  avgPrice: number | null;
  maxPrice: number | null;
  supplierCount: number;
  inStock: boolean;
  isDeal: boolean;
  lastUpdated: string | null;
  /** First supplier-uploaded photo among the listings (used when the material has no image of its own). */
  listingImageUrl: string | null;
}

export const offerInclude = { company: true, tiers: { orderBy: { minQty: "asc" } } } satisfies Prisma.PriceListingInclude;

/** Pure: storefront aggregate for one material's offers (effective = sale-aware prices). */
export function enrichmentFromOffers(offers: Offer[], lastUpdated: string | null = null, listingImageUrl: string | null = null): Enrichment {
  const sorted = [...offers].sort((a, b) => a.effectivePrice - b.effectivePrice);
  const purchasable = sorted.filter(isPurchasable);
  const best = purchasable[0] ?? sorted[0] ?? null;
  const prices = sorted.map((o) => o.effectivePrice);
  const avg = prices.length ? round2(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
  return {
    bestOffer: best,
    offerCount: sorted.length,
    minPrice: prices.length ? prices[0] : null,
    avgPrice: avg,
    maxPrice: prices.length ? prices[prices.length - 1] : null,
    supplierCount: new Set(sorted.filter((o) => o.companyId).map((o) => o.companyId)).size,
    inStock: purchasable.length > 0,
    isDeal: Boolean(best && ((avg && best.effectivePrice <= avg * (1 - DEAL_THRESHOLD)) || best.compareAtPrice !== null)),
    lastUpdated,
    listingImageUrl,
  };
}

/** Loads all active listings for a set of materials and computes storefront fields per material. */
export async function enrichMaterials(materialIds: string[], city?: string): Promise<Map<string, Enrichment>> {
  const map = new Map<string, Enrichment>();
  if (!materialIds.length) return map;
  const listings = await prisma.priceListing.findMany({
    where: { materialId: { in: materialIds }, ...activeListingWhere(city) },
    include: offerInclude,
    orderBy: { price: "asc" },
  });
  const grouped = new Map<string, typeof listings>();
  for (const l of listings) {
    const arr = grouped.get(l.materialId) ?? [];
    arr.push(l);
    grouped.set(l.materialId, arr);
  }
  const now = new Date();
  for (const id of materialIds) {
    const ls = grouped.get(id) ?? [];
    const lastUpdated = ls.length ? ls.reduce((m, l) => (l.updatedAt > m ? l.updatedAt : m), ls[0].updatedAt).toISOString() : null;
    map.set(id, enrichmentFromOffers(ls.map((l) => toOffer(l, now)), lastUpdated, ls.find((l) => l.imageUrl)?.imageUrl ?? null));
  }
  return map;
}

export const productInclude = { category: true } satisfies Prisma.MaterialInclude;
export type ProductRow = Prisma.MaterialGetPayload<{ include: typeof productInclude }>;

/** Active materials + storefront enrichment (shared by home, brand pages, recommendations, wishlists). */
export async function products(where: Prisma.MaterialWhereInput, orderBy: Prisma.MaterialOrderByWithRelationInput | Prisma.MaterialOrderByWithRelationInput[], take: number, city?: string) {
  const rows = await prisma.material.findMany({ where: { active: true, ...where }, include: productInclude, orderBy, take });
  return withEnrichment(rows, city);
}

/** Attaches enrichment to already-loaded material rows (keeps their order). */
export async function withEnrichment<T extends { id: string; imageUrl: string | null }>(rows: T[], city?: string) {
  const enrich = await enrichMaterials(rows.map((r) => r.id), city);
  return rows.map((r) => {
    const e = enrich.get(r.id) ?? emptyEnrichment;
    return { ...r, ...e, imageUrl: r.imageUrl ?? e.listingImageUrl };
  });
}

export const emptyEnrichment: Enrichment = {
  bestOffer: null, offerCount: 0, minPrice: null, avgPrice: null, maxPrice: null, supplierCount: 0, inStock: false, isDeal: false, lastUpdated: null, listingImageUrl: null,
};

export function deliveryFee(supplierCity: string, deliveryCity: string): number {
  return supplierCity === deliveryCity ? DELIVERY_FEE_SAME_CITY : DELIVERY_FEE_OTHER_CITY;
}

/** Deterministic product image (SVG) so every product has a visual even before suppliers upload photos. */
export function productImageSvg(sku: string, name: string, icon: string, color = "#0B6E4F"): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 22) {
      lines.push(cur.trim());
      cur = w;
    } else cur = `${cur} ${w}`;
    if (lines.length === 3) break;
  }
  if (cur && lines.length < 3) lines.push(cur.trim());
  const hue = [...sku].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},35%,92%)"/><stop offset="1" stop-color="hsl(${hue},30%,82%)"/></linearGradient></defs>
  <rect width="600" height="600" rx="32" fill="url(#g)"/>
  <circle cx="300" cy="230" r="120" fill="#ffffff" opacity="0.85"/>
  <text x="300" y="275" font-size="130" text-anchor="middle">${esc(icon)}</text>
  ${lines.map((l, i) => `<text x="300" y="${420 + i * 40}" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="600" fill="${color}" text-anchor="middle">${esc(l)}</text>`).join("\n  ")}
  <text x="300" y="560" font-family="Inter, Arial, sans-serif" font-size="22" fill="#4b5563" text-anchor="middle">${esc(sku)}</text>
</svg>`;
}
