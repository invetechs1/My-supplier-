import { Prisma, type CarrierCode, type ShippingZone } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { round2 } from "./pricing";

export const CARRIERS: Array<{ code: CarrierCode; name: string; nameAr: string; kind: "OWN_FLEET" | "HEAVY_TRUCKING" | "PARCEL"; supportsTracking: boolean; maxWeightKg: number | null; envKey?: string }> = [
  { code: "SUPPLIER", name: "Supplier delivery", nameAr: "توصيل المورد", kind: "OWN_FLEET", supportsTracking: false, maxWeightKg: null },
  { code: "TRUKKER", name: "TruKKer", nameAr: "تراكر", kind: "HEAVY_TRUCKING", supportsTracking: true, maxWeightKg: 40000, envKey: "TRUKKER_API_KEY" },
  { code: "TRELLA", name: "Trella", nameAr: "تريلا", kind: "HEAVY_TRUCKING", supportsTracking: true, maxWeightKg: 40000, envKey: "TRELLA_API_KEY" },
  { code: "SMSA", name: "SMSA Express", nameAr: "سمسا", kind: "PARCEL", supportsTracking: true, maxWeightKg: 70, envKey: "SMSA_API_KEY" },
  { code: "ARAMEX", name: "Aramex", nameAr: "أرامكس", kind: "PARCEL", supportsTracking: true, maxWeightKg: 70, envKey: "ARAMEX_API_KEY" },
  { code: "SPL", name: "Saudi Post SPL", nameAr: "سبل", kind: "PARCEL", supportsTracking: true, maxWeightKg: 30, envKey: "SPL_API_KEY" },
  { code: "OTHER", name: "Other carrier", nameAr: "ناقل آخر", kind: "OWN_FLEET", supportsTracking: false, maxWeightKg: null },
];

export const carrierName = (code: CarrierCode) => CARRIERS.find((c) => c.code === code)?.name ?? code;
export const carrierEnabled = (code: CarrierCode) => {
  const c = CARRIERS.find((x) => x.code === code);
  if (!c) return false;
  if (!c.envKey) return true;
  // Rate-card quoting works without credentials; API booking needs them. Both are listed; UI shows tracking support.
  return process.env[`CARRIER_${c.code}_ENABLED`] !== "false";
};
export const trackingUrlFor = (code: CarrierCode, tracking: string | null | undefined) => {
  if (!tracking) return null;
  const t = encodeURIComponent(tracking);
  return ({ SMSA: `https://www.smsaexpress.com/sa/trackingdetails?tracknumbers=${t}`, ARAMEX: `https://www.aramex.com/sa/en/track/results?ShipmentNumber=${t}`, SPL: `https://splonline.com.sa/en/track/?trackingNumber=${t}` } as Partial<Record<CarrierCode, string>>)[code] ?? null;
};

// ---------------------------------------------------------------- zones
const REGION: Record<string, string> = {
  Riyadh: "Central", Buraidah: "Central", Hail: "Central", Jeddah: "Western", Makkah: "Western", Madinah: "Western", Taif: "Western", Yanbu: "Western",
  Dammam: "Eastern", Khobar: "Eastern", Dhahran: "Eastern", Jubail: "Eastern", "Al Ahsa": "Eastern", Qatif: "Eastern",
  Tabuk: "Northern", NEOM: "Northern", Abha: "Southern", "Khamis Mushait": "Southern", Najran: "Southern", Jazan: "Southern",
};
export function zoneFor(pickupCity: string, deliveryCity: string): ShippingZone {
  if (pickupCity === deliveryCity) return "SAME_CITY";
  if (REGION[pickupCity] && REGION[pickupCity] === REGION[deliveryCity]) return "SAME_REGION";
  return "NATIONAL";
}

// ---------------------------------------------------------------- weight & volume
/** Default weight per unit (kg) by unit when the material has no logistics data. Conservative construction averages. */
const DEFAULT_KG: Record<string, number> = { ton: 1000, kg: 1, bag: 50, m3: 1600, m2: 20, m: 2, piece: 5, pallet: 1000, roll: 40, litre: 1.2, drum: 20, sheet: 25, bundle: 60 };
const DEFAULT_M3: Record<string, number> = { ton: 0.6, kg: 0.001, bag: 0.035, m3: 1, m2: 0.015, m: 0.002, piece: 0.01, pallet: 1.2, roll: 0.05, litre: 0.001, drum: 0.03, sheet: 0.03, bundle: 0.08 };

export interface QuoteItem { materialId: string; quantity: number }

export async function loadForQuote(items: QuoteItem[]) {
  const mats = await prisma.material.findMany({ where: { id: { in: items.map((i) => i.materialId) } }, select: { id: true, unit: true, weightKg: true, volumeM3: true, hazardous: true } });
  let weightKg = 0, volumeM3 = 0, hazardous = false;
  for (const it of items) {
    const m = mats.find((x) => x.id === it.materialId);
    if (!m) continue;
    weightKg += (m.weightKg ?? DEFAULT_KG[m.unit] ?? 5) * it.quantity;
    volumeM3 += (m.volumeM3 ?? DEFAULT_M3[m.unit] ?? 0.01) * it.quantity;
    hazardous ||= m.hazardous;
  }
  return { weightKg: round2(weightKg), volumeM3: Math.round(volumeM3 * 1000) / 1000, hazardous };
}

// ---------------------------------------------------------------- quoting (pure)
export interface RateCard { carrier: CarrierCode; zone: ShippingZone; service: string; baseFee: number; perKg: number; includedKg: number; perM3: number; minFee: number; maxWeightKg: number | null; etaDays: number; enabled: boolean }

export function priceRate(rate: RateCard, weightKg: number, volumeM3: number): number | null {
  if (!rate.enabled) return null;
  if (rate.maxWeightKg !== null && weightKg > rate.maxWeightKg) return null;
  const extraKg = Math.max(0, weightKg - rate.includedKg);
  const price = rate.baseFee + extraKg * rate.perKg + volumeM3 * rate.perM3;
  return round2(Math.max(rate.minFee, price));
}

export function quoteAll(rates: RateCard[], zone: ShippingZone, weightKg: number, volumeM3: number, supplierFlatFee?: number | null) {
  const quotes = rates
    .filter((r) => r.zone === zone && carrierEnabled(r.carrier))
    .map((r) => ({ carrier: r.carrier, carrierName: carrierName(r.carrier), service: r.service, zone, weightKg, volumeM3, price: priceRate(r, weightKg, volumeM3), etaDays: r.etaDays, notes: r.carrier === "SUPPLIER" ? "Delivered by the supplier's own trucks" : null }))
    .filter((q): q is typeof q & { price: number } => q.price !== null);
  // A supplier's own configured delivery fee overrides the generic own-fleet card.
  if (supplierFlatFee !== null && supplierFlatFee !== undefined) {
    const idx = quotes.findIndex((q) => q.carrier === "SUPPLIER");
    const own = { carrier: "SUPPLIER" as CarrierCode, carrierName: carrierName("SUPPLIER"), service: "Supplier delivery", zone, weightKg, volumeM3, price: round2(supplierFlatFee), etaDays: quotes[idx]?.etaDays ?? 2, notes: "Supplier's published delivery fee" };
    if (idx >= 0) quotes[idx] = own; else quotes.unshift(own);
  }
  return quotes.sort((a, b) => a.price - b.price);
}

export async function loadRates(): Promise<RateCard[]> {
  const rows = await prisma.shippingRate.findMany({ where: { enabled: true } });
  return rows.map((r) => ({ carrier: r.carrier, zone: r.zone, service: r.service, baseFee: Number(r.baseFee), perKg: Number(r.perKg), includedKg: r.includedKg, perM3: Number(r.perM3), minFee: Number(r.minFee), maxWeightKg: r.maxWeightKg, etaDays: r.etaDays, enabled: r.enabled }));
}

/** Quotes for one supplier's basket delivered to a city. */
export async function quoteForSupplier(companyId: string, items: QuoteItem[], deliveryCity: string, pickupCity?: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { branches: { where: { isDefault: true }, take: 1 } } });
  const from = pickupCity ?? company?.branches[0]?.city ?? company?.city ?? deliveryCity;
  const { weightKg, volumeM3 } = await loadForQuote(items);
  const rates = await loadRates();
  const quotes = quoteAll(rates, zoneFor(from, deliveryCity), weightKg, volumeM3, company?.deliveryFee === null || company?.deliveryFee === undefined ? undefined : Number(company.deliveryFee));
  return { from, quotes };
}

export const DEFAULT_RATES: Omit<Prisma.ShippingRateCreateManyInput, "id">[] = [
  { carrier: "SUPPLIER", zone: "SAME_CITY", service: "Supplier delivery", baseFee: 150, perKg: 0, includedKg: 0, perM3: 0, minFee: 150, maxWeightKg: null, etaDays: 2 },
  { carrier: "SUPPLIER", zone: "SAME_REGION", service: "Supplier delivery", baseFee: 350, perKg: 0, includedKg: 0, perM3: 0, minFee: 350, maxWeightKg: null, etaDays: 3 },
  { carrier: "SUPPLIER", zone: "NATIONAL", service: "Supplier delivery", baseFee: 900, perKg: 0, includedKg: 0, perM3: 0, minFee: 900, maxWeightKg: null, etaDays: 5 },
  { carrier: "TRUKKER", zone: "SAME_CITY", service: "Flatbed trailer (up to 25 t)", baseFee: 450, perKg: 0.01, includedKg: 5000, perM3: 0, minFee: 450, maxWeightKg: 25000, etaDays: 1 },
  { carrier: "TRUKKER", zone: "SAME_REGION", service: "Flatbed trailer (up to 25 t)", baseFee: 1200, perKg: 0.03, includedKg: 5000, perM3: 0, minFee: 1200, maxWeightKg: 25000, etaDays: 2 },
  { carrier: "TRUKKER", zone: "NATIONAL", service: "Flatbed trailer (up to 25 t)", baseFee: 2800, perKg: 0.05, includedKg: 5000, perM3: 0, minFee: 2800, maxWeightKg: 25000, etaDays: 3 },
  { carrier: "TRELLA", zone: "SAME_CITY", service: "Dyna / 7 t truck", baseFee: 280, perKg: 0.02, includedKg: 2000, perM3: 0, minFee: 280, maxWeightKg: 7000, etaDays: 1 },
  { carrier: "TRELLA", zone: "SAME_REGION", service: "Dyna / 7 t truck", baseFee: 750, perKg: 0.04, includedKg: 2000, perM3: 0, minFee: 750, maxWeightKg: 7000, etaDays: 2 },
  { carrier: "TRELLA", zone: "NATIONAL", service: "Dyna / 7 t truck", baseFee: 1900, perKg: 0.08, includedKg: 2000, perM3: 0, minFee: 1900, maxWeightKg: 7000, etaDays: 4 },
  { carrier: "SMSA", zone: "SAME_CITY", service: "Next-day parcel", baseFee: 25, perKg: 3, includedKg: 5, perM3: 0, minFee: 25, maxWeightKg: 70, etaDays: 1 },
  { carrier: "SMSA", zone: "SAME_REGION", service: "Next-day parcel", baseFee: 30, perKg: 3.5, includedKg: 5, perM3: 0, minFee: 30, maxWeightKg: 70, etaDays: 2 },
  { carrier: "SMSA", zone: "NATIONAL", service: "2-day parcel", baseFee: 35, perKg: 4, includedKg: 5, perM3: 0, minFee: 35, maxWeightKg: 70, etaDays: 3 },
  { carrier: "ARAMEX", zone: "SAME_CITY", service: "Domestic express", baseFee: 28, perKg: 3, includedKg: 5, perM3: 0, minFee: 28, maxWeightKg: 70, etaDays: 1 },
  { carrier: "ARAMEX", zone: "NATIONAL", service: "Domestic express", baseFee: 38, perKg: 4.5, includedKg: 5, perM3: 0, minFee: 38, maxWeightKg: 70, etaDays: 3 },
];
