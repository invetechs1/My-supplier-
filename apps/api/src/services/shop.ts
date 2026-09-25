import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { activeListingWhere } from "./catalog";
import { round2 } from "./pricing";

export const DEAL_THRESHOLD = 0.05; // best price >= 5% below average
export const VAT_RATE = 0.15;
export const DELIVERY_FEE_SAME_CITY = 150;
export const DELIVERY_FEE_OTHER_CITY = 350;

export type ListingWithCompany = Prisma.PriceListingGetPayload<{ include: { company: true } }>;

export function toOffer(l: ListingWithCompany) {
  return {
    listingId: l.id,
    companyId: l.companyId,
    companyName: l.company?.name ?? `${l.sourceName ?? "Market"} (reference)`,
    verified: l.company?.verified ?? false,
    rating: l.company?.rating ?? 0,
    city: l.city,
    price: Number(l.price),
    minQty: l.minQty,
    leadTimeDays: l.leadTimeDays,
    stock: l.stock,
    source: l.source,
    sourceName: l.sourceName,
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

/** Loads all active listings for a set of materials and computes storefront fields per material. */
export async function enrichMaterials(materialIds: string[], city?: string): Promise<Map<string, Enrichment>> {
  const map = new Map<string, Enrichment>();
  if (!materialIds.length) return map;
  const listings = await prisma.priceListing.findMany({
    where: { materialId: { in: materialIds }, ...activeListingWhere(city) },
    include: { company: true },
    orderBy: { price: "asc" },
  });
  const grouped = new Map<string, ListingWithCompany[]>();
  for (const l of listings) {
    const arr = grouped.get(l.materialId) ?? [];
    arr.push(l);
    grouped.set(l.materialId, arr);
  }
  for (const id of materialIds) {
    const ls = grouped.get(id) ?? [];
    const offers = ls.map(toOffer);
    const purchasable = offers.filter(isPurchasable);
    const best = purchasable[0] ?? offers[0] ?? null;
    const prices = offers.map((o) => o.price);
    const avg = prices.length ? round2(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
    map.set(id, {
      bestOffer: best,
      offerCount: offers.length,
      minPrice: prices.length ? prices[0] : null,
      avgPrice: avg,
      maxPrice: prices.length ? prices[prices.length - 1] : null,
      supplierCount: new Set(offers.filter((o) => o.companyId).map((o) => o.companyId)).size,
      inStock: purchasable.length > 0,
      isDeal: Boolean(best && avg && best.price <= avg * (1 - DEAL_THRESHOLD)),
      lastUpdated: ls.length ? ls.reduce((m, l) => (l.updatedAt > m ? l.updatedAt : m), ls[0].updatedAt).toISOString() : null,
      listingImageUrl: ls.find((l) => l.imageUrl)?.imageUrl ?? null,
    });
  }
  return map;
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
