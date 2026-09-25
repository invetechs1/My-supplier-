import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { snapshotHistory } from "../services/catalog";
import { importCatalog, type ImportRow } from "../services/catalogImport";

const router = Router();

const priceSchema = z.object({
  materialId: z.string(),
  price: z.coerce.number().positive(),
  minQty: z.coerce.number().positive().default(1),
  leadTimeDays: z.coerce.number().int().min(0).default(1),
  city: z.string().min(2),
  validUntil: z.coerce.date().optional().nullable(),
});

async function upsertPrice(companyId: string, p: z.infer<typeof priceSchema>) {
  const existing = await prisma.priceListing.findFirst({ where: { companyId, materialId: p.materialId, city: p.city, source: "SUPPLIER" } });
  const data = { price: p.price, minQty: p.minQty, leadTimeDays: p.leadTimeDays, validUntil: p.validUntil ?? null };
  if (existing) {
    return prisma.priceListing.update({ where: { id: existing.id }, data, include: { material: true, company: true } });
  }
  return prisma.priceListing.create({
    data: { ...data, companyId, materialId: p.materialId, city: p.city, source: "SUPPLIER" },
    include: { material: true, company: true },
  });
}

router.get(
  "/supplier/prices",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where = { companyId };
    const [total, listings] = await Promise.all([
      prisma.priceListing.count({ where }),
      prisma.priceListing.findMany({ where, include: { material: { include: { category: true } } }, orderBy: { updatedAt: "desc" }, skip, take }),
    ]);
    res.json(paged(serialize(listings), page, pageSize, total));
  }),
);

router.post(
  "/supplier/prices",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const body = priceSchema.parse(req.body);
    const material = await prisma.material.findUnique({ where: { id: body.materialId } });
    if (!material) throw notFound("Material not found");
    const listing = await upsertPrice(companyId, body);
    await snapshotHistory([body.materialId]);
    res.status(201).json(serialize(listing));
  }),
);

router.post(
  "/supplier/prices/bulk",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { items } = z.object({ items: z.array(priceSchema).min(1).max(500) }).parse(req.body);
    const ids = [...new Set(items.map((i) => i.materialId))];
    const found = await prisma.material.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const valid = new Set(found.map((m) => m.id));
    let upserted = 0;
    const skipped: string[] = [];
    for (const item of items) {
      if (!valid.has(item.materialId)) {
        skipped.push(item.materialId);
        continue;
      }
      await upsertPrice(companyId, item);
      upserted++;
    }
    await snapshotHistory([...valid]);
    res.json({ upserted, skipped });
  }),
);

router.delete(
  "/supplier/prices/:id",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const listing = await prisma.priceListing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.companyId !== companyId) throw notFound("Listing not found");
    await prisma.priceListing.delete({ where: { id: listing.id } });
    res.json({ ok: true });
  }),
);

router.patch(
  "/supplier/prices/:id",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const data = z
      .object({ price: z.coerce.number().positive().optional(), stock: z.coerce.number().int().nonnegative().nullable().optional(), minQty: z.coerce.number().positive().optional(), leadTimeDays: z.coerce.number().int().min(0).optional(), validUntil: z.coerce.date().nullable().optional(), active: z.boolean().optional() })
      .parse(req.body);
    const listing = await prisma.priceListing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.companyId !== companyId) throw notFound("Listing not found");
    const updated = await prisma.priceListing.update({ where: { id: listing.id }, data, include: { material: { include: { category: true } } } });
    if (data.price !== undefined) await snapshotHistory([listing.materialId]);
    res.json(serialize(updated));
  }),
);

const catalogItem = z.object({
  sku: z.string().optional(), name: z.string().min(2), nameAr: z.string().optional(), categorySlug: z.string().min(2), unit: z.string().min(1),
  brand: z.string().optional(), description: z.string().optional(), imageUrl: z.string().url().optional(), price: z.coerce.number().positive(),
  city: z.string().min(2), stock: z.coerce.number().int().nonnegative().optional(), minQty: z.coerce.number().positive().optional(), leadTimeDays: z.coerce.number().int().min(0).optional(),
});

/** "Sell on MySupplier": suppliers add products (new or existing) with their own offer and stock. */
router.post(
  "/supplier/catalog/import",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { items } = z.object({ items: z.array(catalogItem).min(1).max(1000) }).parse(req.body);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const rows: ImportRow[] = items.map(({ categorySlug, ...rest }) => ({ ...rest, category: categorySlug }));
    res.json(await importCatalog(rows, { companyId, sourceName: company.name, materialSource: "SUPPLIER" }));
  }),
);

export default router;
