/**
 * Phase-0 "house supplier": MySupplier itself lists the 50 highest-demand Riyadh construction products and
 * fulfils the orders (buy locally, deliver, invoice) until third-party suppliers join. Idempotent: safe to
 * re-run to refresh prices. Run on production after the catalogue seed:
 *
 *   HOUSE_SUPPLIER_PASSWORD='strong-password' pnpm --filter @mysupplier/api seed:house
 *
 * Prices are LIST prices in SAR excluding VAT, set from typical Riyadh market levels in Q4 2026; verify each
 * against two local quotes before going live and re-run with the updated numbers (or edit them in
 * Supplier → My products). `validUntil` is 30 days so stale prices drop out of comparisons automatically.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { snapshotHistory } from "../src/services/catalog";

const prisma = new PrismaClient();

export const HOUSE_COMPANY = {
  slug: "mysupplier-direct",
  name: "MySupplier Direct",
  nameAr: "موردي المباشر",
  city: "Riyadh",
  region: "Central",
  description:
    "Fulfilled directly by the MySupplier team in Riyadh: we source from authorised distributors and factories, check quality on pickup and deliver to your site, usually next working day (orders confirmed before 14:00). Delivery 120 SAR per order anywhere in Riyadh, free for orders above 3,000 SAR. Tax invoice from MySupplier, cash on delivery or bank transfer, returns within 48 hours for unopened goods.",
  descriptionAr:
    "يُنفَّذ مباشرةً من فريق موردي في الرياض: نشتري من الموزعين والمصانع المعتمدين، نفحص الجودة عند الاستلام ونوصّل إلى موقعك عادةً في يوم العمل التالي (للطلبات المؤكدة قبل الساعة 2 ظهراً). التوصيل 120 ر.س للطلب داخل الرياض، ومجاني للطلبات فوق 3,000 ر.س. فاتورة ضريبية من موردي، الدفع عند الاستلام أو تحويل بنكي، والإرجاع خلال 48 ساعة للبضاعة غير المفتوحة.",
  phone: process.env.HOUSE_SUPPLIER_PHONE ?? "+966500000000",
  email: process.env.HOUSE_SUPPLIER_EMAIL ?? "direct@mysupplier.sa",
  workingHours: "Sat–Thu 7:00–18:00",
  deliveryDays: 1,
  minOrderValue: 300,
  deliveryFee: 120,
  freeDeliveryAbove: 3000,
};

/** sku, list price (SAR excl. VAT), min qty, lead time days, sourcing note for the ops team. */
export const HOUSE_PRODUCTS: Array<{ sku: string; price: number; minQty: number; leadTimeDays: number; source: string }> = [
  // Cement
  { sku: "CEM-OPC-50", price: 15.5, minQty: 20, leadTimeDays: 1, source: "Yamama / Saudi Cement / City Cement authorised agents; pallet of 40 bags" },
  { sku: "CEM-SRC-50", price: 17.0, minQty: 20, leadTimeDays: 1, source: "Same cement agents (Type V); check availability, often 1-day" },
  { sku: "CEM-WHT-50", price: 29.0, minQty: 10, leadTimeDays: 1, source: "Building-material shops (Saudi White Cement / Riyadh White)" },
  // Steel
  { sku: "RBR-8", price: 2750, minQty: 1, leadTimeDays: 1, source: "Al-Sulay steel market traders (SABIC Hadeed / Al-Ittefaq / Rajhi Steel); priced per ton, confirm daily" },
  { sku: "RBR-10", price: 2700, minQty: 1, leadTimeDays: 1, source: "Al-Sulay steel market; confirm daily price" },
  { sku: "RBR-12", price: 2650, minQty: 1, leadTimeDays: 1, source: "Al-Sulay steel market; confirm daily price" },
  { sku: "RBR-16", price: 2620, minQty: 1, leadTimeDays: 1, source: "Al-Sulay steel market; confirm daily price" },
  { sku: "RBR-20", price: 2620, minQty: 1, leadTimeDays: 1, source: "Al-Sulay steel market; confirm daily price" },
  { sku: "STL-MESH-A142", price: 165, minQty: 5, leadTimeDays: 1, source: "Steel traders / mesh factories (Al-Sulay, 2nd Industrial City)" },
  { sku: "HW-TW-16", price: 125, minQty: 1, leadTimeDays: 1, source: "Hardware wholesalers (Al-Batha / Exit 18)" },
  // Blocks & pavers
  { sku: "BLK-HOL-20", price: 2.9, minQty: 200, leadTimeDays: 1, source: "Block factories Exit 18 / 2nd Industrial City; delivered by factory truck" },
  { sku: "BLK-HOL-15", price: 2.5, minQty: 200, leadTimeDays: 1, source: "Block factories; delivered by factory truck" },
  { sku: "BLK-SOL-10", price: 2.3, minQty: 200, leadTimeDays: 1, source: "Block factories" },
  { sku: "BLK-AAC-20", price: 7.5, minQty: 100, leadTimeDays: 2, source: "AAC/Siporex distributors (Saudi AAC / Al-Rashed)" },
  { sku: "PAV-INT-6", price: 24, minQty: 50, leadTimeDays: 2, source: "Precast / interlock factories" },
  // Aggregates & sand
  { sku: "SND-WASH", price: 55, minQty: 10, leadTimeDays: 1, source: "Sand & crusher yards; sold per tipper load (10–16 m³)" },
  { sku: "SND-RED", price: 35, minQty: 10, leadTimeDays: 1, source: "Fill-sand yards; per tipper load" },
  { sku: "AGG-3/4", price: 62, minQty: 10, leadTimeDays: 1, source: "Crushers (Riyadh east); per tipper load" },
  { sku: "AGG-3/8", price: 60, minQty: 10, leadTimeDays: 1, source: "Crushers; per tipper load" },
  // Timber & formwork
  { sku: "PLY-18", price: 125, minQty: 10, leadTimeDays: 1, source: "Timber yards (Al-Batha / Exit 18); film-faced 18mm" },
  { sku: "TMB-2x4", price: 38, minQty: 20, leadTimeDays: 1, source: "Timber yards; white wood 4m" },
  { sku: "TMB-4x4", price: 78, minQty: 10, leadTimeDays: 1, source: "Timber yards" },
  { sku: "HW-NAIL-3", price: 120, minQty: 1, leadTimeDays: 1, source: "Hardware wholesalers" },
  // Gypsum
  { sku: "GYP-BRD-12", price: 31, minQty: 20, leadTimeDays: 1, source: "Gypsum board distributors (Saudi Gypsum / Knauf dealers)" },
  { sku: "GYP-MR-12", price: 42, minQty: 20, leadTimeDays: 1, source: "Gypsum board distributors" },
  // Waterproofing & chemicals
  { sku: "WP-MEM-4", price: 110, minQty: 5, leadTimeDays: 1, source: "Waterproofing distributors (Bitumat / Derbigum dealers)" },
  { sku: "CH-BIT-PRM", price: 120, minQty: 1, leadTimeDays: 1, source: "Waterproofing distributors" },
  { sku: "WP-CEM-20", price: 95, minQty: 2, leadTimeDays: 1, source: "Construction-chemicals dealers (Sika / Fosroc / BASF)" },
  { sku: "CH-CUR-20", price: 95, minQty: 1, leadTimeDays: 1, source: "Construction-chemicals dealers" },
  { sku: "CH-GRT-25", price: 48, minQty: 5, leadTimeDays: 1, source: "Construction-chemicals dealers" },
  { sku: "CH-SIL-300", price: 8.5, minQty: 24, leadTimeDays: 1, source: "Hardware wholesalers; box of 24" },
  // Tiles & finishes
  { sku: "TIL-ADH-25", price: 26, minQty: 10, leadTimeDays: 1, source: "Tile shops / Saudi Ceramics, Alfanar Building Materials" },
  { sku: "TIL-POR-60", price: 38, minQty: 20, leadTimeDays: 2, source: "Saudi Ceramics / RAK / Porcelanosa dealers; per m²" },
  { sku: "TIL-CER-30", price: 30, minQty: 20, leadTimeDays: 2, source: "Tile showrooms; per m²" },
  { sku: "PNT-EMU-INT", price: 215, minQty: 1, leadTimeDays: 1, source: "Jotun / Jazeera / National Paints dealers" },
  { sku: "PNT-PRM", price: 165, minQty: 1, leadTimeDays: 1, source: "Paint dealers" },
  { sku: "PNT-PUT-25", price: 40, minQty: 5, leadTimeDays: 1, source: "Paint dealers" },
  // Plumbing
  { sku: "PVC-110", price: 85, minQty: 5, leadTimeDays: 1, source: "Pipe distributors (Saudi Plastic Factory / Neproplast / Amiantit dealers)" },
  { sku: "PVC-160", price: 165, minQty: 5, leadTimeDays: 1, source: "Pipe distributors" },
  { sku: "PPR-25", price: 26, minQty: 10, leadTimeDays: 1, source: "Pipe distributors (Aquatherm / SPF / Wefatherm)" },
  { sku: "PPR-32", price: 40, minQty: 10, leadTimeDays: 1, source: "Pipe distributors" },
  { sku: "PVC-CEM-1L", price: 30, minQty: 2, leadTimeDays: 1, source: "Plumbing shops" },
  { sku: "WTT-PE-1000", price: 480, minQty: 1, leadTimeDays: 1, source: "Tank factories (Al-Khaleej / Rotoplast dealers)" },
  // Electrical
  { sku: "CBL-2.5", price: 285, minQty: 1, leadTimeDays: 1, source: "Electrical wholesalers (Saudi Cable / Riyadh Cables / Jeddah Cables); copper-linked, confirm weekly" },
  { sku: "CBL-4", price: 430, minQty: 1, leadTimeDays: 1, source: "Electrical wholesalers; confirm weekly" },
  { sku: "CND-20", price: 4.5, minQty: 50, leadTimeDays: 1, source: "Electrical wholesalers; bundles of 50" },
  // Safety & site
  { sku: "PPE-HLM", price: 22, minQty: 10, leadTimeDays: 1, source: "Safety suppliers (3M / Delta Plus dealers, Al-Batha)" },
  { sku: "PPE-VST", price: 10, minQty: 10, leadTimeDays: 1, source: "Safety suppliers" },
  { sku: "PPE-GLV", price: 48, minQty: 1, leadTimeDays: 1, source: "Safety suppliers; dozen pairs" },
  { sku: "TL-WHB", price: 150, minQty: 1, leadTimeDays: 1, source: "Hardware wholesalers" },
];

async function main() {
  const skus = HOUSE_PRODUCTS.map((p) => p.sku);
  const materials = await prisma.material.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, name: true } });
  const bySku = new Map(materials.map((m) => [m.sku, m]));
  const missing = skus.filter((s) => !bySku.has(s));
  if (missing.length) throw new Error(`Catalogue is missing ${missing.length} SKU(s): ${missing.join(", ")}. Run the catalogue seed first (SEED_MODE=catalogue pnpm prisma:seed).`);

  const company = await prisma.company.upsert({
    where: { slug: HOUSE_COMPANY.slug },
    create: { ...HOUSE_COMPANY, type: "SUPPLIER", verified: true, verificationStatus: "VERIFIED", citiesServed: ["Riyadh"], branches: { create: { name: "Riyadh hub", city: "Riyadh", address: "Riyadh", phone: HOUSE_COMPANY.phone, isDefault: true } } },
    update: { name: HOUSE_COMPANY.name, nameAr: HOUSE_COMPANY.nameAr, description: HOUSE_COMPANY.description, descriptionAr: HOUSE_COMPANY.descriptionAr, deliveryDays: HOUSE_COMPANY.deliveryDays, minOrderValue: HOUSE_COMPANY.minOrderValue, deliveryFee: HOUSE_COMPANY.deliveryFee, freeDeliveryAbove: HOUSE_COMPANY.freeDeliveryAbove, workingHours: HOUSE_COMPANY.workingHours, verified: true, verificationStatus: "VERIFIED" },
  });

  const password = process.env.HOUSE_SUPPLIER_PASSWORD ?? crypto.randomBytes(9).toString("base64url");
  const user = await prisma.user.upsert({
    where: { email: HOUSE_COMPANY.email },
    create: { email: HOUSE_COMPANY.email, passwordHash: bcrypt.hashSync(password, 10), name: "MySupplier Direct Ops", phone: HOUSE_COMPANY.phone, role: "SUPPLIER", companyId: company.id, companyRole: "OWNER", locale: "ar", phoneVerified: true },
    update: { companyId: company.id, role: "SUPPLIER", companyRole: "OWNER", active: true },
  });

  const validUntil = new Date(Date.now() + 30 * 86_400_000);
  let created = 0, updated = 0;
  for (const p of HOUSE_PRODUCTS) {
    const material = bySku.get(p.sku)!;
    const existing = await prisma.priceListing.findFirst({ where: { companyId: company.id, materialId: material.id, city: "Riyadh", source: "SUPPLIER" } });
    const data = { price: p.price, minQty: p.minQty, leadTimeDays: p.leadTimeDays, validUntil, active: true, stock: null, currency: "SAR" };
    if (existing) { await prisma.priceListing.update({ where: { id: existing.id }, data }); updated++; }
    else { await prisma.priceListing.create({ data: { ...data, companyId: company.id, materialId: material.id, city: "Riyadh", source: "SUPPLIER" } }); created++; }
  }
  // Keep the price index (min/avg/max per day) fresh for these products.
  await snapshotHistory(materials.map((m) => m.id)).catch(() => undefined);

  console.log(`House supplier "${company.name}" ready: ${created} listings created, ${updated} refreshed, valid until ${validUntil.toISOString().slice(0, 10)}.`);
  console.log(`Ops login: ${user.email}${process.env.HOUSE_SUPPLIER_PASSWORD ? "" : ` / generated password: ${password} (change it after first login)`}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
