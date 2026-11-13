/**
 * Shared by `seed-house.ts` (CLI) and `scripts/catalog-launch.ts` (agent): upserts the house
 * supplier "MySupplier Direct", creates any catalogue products missing from HOUSE_TOP200 and
 * refreshes its Riyadh price listings.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { HOUSE_TOP200, type HouseProduct } from "./seed-data/house-top200";
import { snapshotHistory } from "../src/services/catalog";

export const HOUSE_COMPANY = {
  slug: "mysupplier-direct",
  name: "MySupplier Direct",
  nameAr: "موردي المباشر",
  type: "SUPPLIER" as const,
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

export interface SeedHouseResult { companyId: string; email: string; password: string | null; materialsCreated: number; listingsCreated: number; listingsUpdated: number; validUntil: Date }

/** Creates catalogue products for HOUSE_TOP200 entries that do not exist yet (matched by SKU). */
export async function ensureHouseMaterials(prisma: PrismaClient, products: HouseProduct[] = HOUSE_TOP200): Promise<{ created: number; idBySku: Map<string, string> }> {
  const existing = await prisma.material.findMany({ where: { sku: { in: products.map((p) => p.sku) } }, select: { id: true, sku: true } });
  const idBySku = new Map(existing.map((m) => [m.sku, m.id]));
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  let created = 0;
  for (const p of products) {
    if (idBySku.has(p.sku)) continue;
    const categoryId = catBySlug.get(p.category);
    if (!categoryId) throw new Error(`Unknown category slug "${p.category}" for ${p.sku}`);
    const m = await prisma.material.create({
      data: {
        sku: p.sku, name: p.name, nameAr: p.nameAr, unit: p.unit, categoryId,
        specs: p.specs && Object.keys(p.specs).length ? p.specs : Prisma.JsonNull,
        description: `${p.name}.`, tags: ["launch-200"], popularity: 0, weightKg: p.weightKg ?? null, source: "CURATED",
      },
    });
    idBySku.set(p.sku, m.id);
    created++;
  }
  return { created, idBySku };
}

export async function seedHouse(prisma: PrismaClient, products: HouseProduct[] = HOUSE_TOP200): Promise<SeedHouseResult> {
  const { created: materialsCreated, idBySku } = await ensureHouseMaterials(prisma, products);

  const company = await prisma.company.upsert({
    where: { slug: HOUSE_COMPANY.slug },
    create: { ...HOUSE_COMPANY, verified: true, verificationStatus: "VERIFIED", citiesServed: ["Riyadh"], branches: { create: { name: "Riyadh hub", city: "Riyadh", address: "Riyadh", phone: HOUSE_COMPANY.phone, isDefault: true } } },
    update: { name: HOUSE_COMPANY.name, nameAr: HOUSE_COMPANY.nameAr, description: HOUSE_COMPANY.description, descriptionAr: HOUSE_COMPANY.descriptionAr, deliveryDays: HOUSE_COMPANY.deliveryDays, minOrderValue: HOUSE_COMPANY.minOrderValue, deliveryFee: HOUSE_COMPANY.deliveryFee, freeDeliveryAbove: HOUSE_COMPANY.freeDeliveryAbove, workingHours: HOUSE_COMPANY.workingHours, verified: true, verificationStatus: "VERIFIED" },
  });

  const generated = process.env.HOUSE_SUPPLIER_PASSWORD ? null : crypto.randomBytes(9).toString("base64url");
  const password = process.env.HOUSE_SUPPLIER_PASSWORD ?? generated!;
  const existingUser = await prisma.user.findUnique({ where: { email: HOUSE_COMPANY.email }, select: { id: true } });
  await prisma.user.upsert({
    where: { email: HOUSE_COMPANY.email },
    create: { email: HOUSE_COMPANY.email, passwordHash: bcrypt.hashSync(password, 10), name: "MySupplier Direct Ops", phone: HOUSE_COMPANY.phone, role: "SUPPLIER", companyId: company.id, companyRole: "OWNER", locale: "ar", phoneVerified: true },
    update: { companyId: company.id, role: "SUPPLIER", companyRole: "OWNER", active: true },
  });

  const validUntil = new Date(Date.now() + 30 * 86_400_000);
  let listingsCreated = 0, listingsUpdated = 0;
  for (const p of products) {
    const materialId = idBySku.get(p.sku)!;
    const existing = await prisma.priceListing.findFirst({ where: { companyId: company.id, materialId, city: "Riyadh", source: "SUPPLIER" } });
    const data = { price: p.price, minQty: p.minQty, leadTimeDays: p.leadTimeDays, validUntil, active: true, stock: null, currency: "SAR" };
    if (existing) { await prisma.priceListing.update({ where: { id: existing.id }, data }); listingsUpdated++; }
    else { await prisma.priceListing.create({ data: { ...data, companyId: company.id, materialId, city: "Riyadh", source: "SUPPLIER" } }); listingsCreated++; }
  }
  await snapshotHistory([...idBySku.values()]).catch(() => undefined);
  return { companyId: company.id, email: HOUSE_COMPANY.email, password: existingUser ? null : generated, materialsCreated, listingsCreated, listingsUpdated, validUntil };
}
