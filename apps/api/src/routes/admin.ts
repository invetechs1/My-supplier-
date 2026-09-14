import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { platformStats, priceIndex, snapshotHistory } from "../services/catalog";

const router = Router();
router.use("/admin", requireAuth("ADMIN"));

router.get(
  "/admin/stats",
  asyncHandler(async (_req, res) => {
    const [stats, byStatus, recentOrders, topCategories] = await Promise.all([
      platformStats(),
      prisma.rfq.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.order.findMany({ include: { company: true, rfq: { select: { id: true, reference: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
      priceIndex(),
    ]);
    const rfqsByStatus: Record<string, number> = { OPEN: 0, CLOSED: 0, AWARDED: 0, CANCELLED: 0 };
    for (const row of byStatus) rfqsByStatus[row.status] = row._count._all;
    res.json(serialize({ ...stats, rfqsByStatus, recentOrders, topCategories }));
  }),
);

router.get(
  "/admin/users",
  asyncHandler(async (req, res) => {
    const { q, role } = z.object({ q: z.string().optional(), role: z.enum(["BUYER", "SUPPLIER", "ADMIN"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, include: { company: true }, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    res.json(paged(serialize(users), page, pageSize, total));
  }),
);

router.patch(
  "/admin/users/:id",
  asyncHandler(async (req, res) => {
    const data = z.object({ role: z.enum(["BUYER", "SUPPLIER", "ADMIN"]).optional(), active: z.boolean().optional() }).parse(req.body);
    const user = await prisma.user.update({ where: { id: req.params.id }, data, include: { company: true } });
    res.json(serialize(user));
  }),
);

router.get(
  "/admin/companies",
  asyncHandler(async (req, res) => {
    const { verified, q } = z.object({ verified: z.enum(["true", "false"]).optional(), q: z.string().optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.CompanyWhereInput = {
      ...(verified ? { verified: verified === "true" } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    };
    const [total, companies] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany({ where, include: { _count: { select: { users: true, listings: true, bids: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    res.json(paged(serialize(companies.map(({ _count, ...c }) => ({ ...c, counts: _count }))), page, pageSize, total));
  }),
);

router.patch(
  "/admin/companies/:id/verify",
  asyncHandler(async (req, res) => {
    const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
    const company = await prisma.company.update({ where: { id: req.params.id }, data: { verified } });
    res.json(serialize(company));
  }),
);

router.post(
  "/admin/categories",
  asyncHandler(async (req, res) => {
    const data = z
      .object({ slug: z.string().min(2), name: z.string().min(2), nameAr: z.string().min(1), parentId: z.string().optional(), icon: z.string().optional() })
      .parse(req.body);
    const category = await prisma.category.create({ data });
    res.status(201).json(serialize(category));
  }),
);

const materialSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  nameAr: z.string().min(1),
  unit: z.string().min(1),
  categoryId: z.string(),
  brand: z.string().optional().nullable(),
  specs: z.record(z.union([z.string(), z.number()])).optional().nullable(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  active: z.boolean().optional(),
});

router.post(
  "/admin/materials",
  asyncHandler(async (req, res) => {
    const data = materialSchema.parse(req.body);
    const material = await prisma.material.create({ data: { ...data, specs: data.specs ?? undefined }, include: { category: true } });
    res.status(201).json(serialize(material));
  }),
);

router.patch(
  "/admin/materials/:id",
  asyncHandler(async (req, res) => {
    const data = materialSchema.partial().parse(req.body);
    const material = await prisma.material.update({
      where: { id: req.params.id },
      data: { ...data, specs: data.specs === null ? Prisma.DbNull : data.specs },
      include: { category: true },
    });
    res.json(serialize(material));
  }),
);

router.delete(
  "/admin/materials/:id",
  asyncHandler(async (req, res) => {
    // Soft delete keeps RFQ history intact.
    await prisma.material.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ ok: true });
  }),
);

/**
 * Imports market prices from an external source (e.g. a supplier catalogue,
 * GASTAT index, or a scraped price list) as MARKET listings keyed by sourceName.
 */
router.post(
  "/admin/prices/import",
  asyncHandler(async (req, res) => {
    const { sourceName, items } = z
      .object({
        sourceName: z.string().min(2),
        items: z
          .array(z.object({ sku: z.string(), price: z.coerce.number().positive(), city: z.string().min(2), minQty: z.coerce.number().positive().optional(), leadTimeDays: z.coerce.number().int().min(0).optional() }))
          .min(1)
          .max(2000),
      })
      .parse(req.body);
    const skus = [...new Set(items.map((i) => i.sku))];
    const materials = await prisma.material.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
    const bySku = new Map(materials.map((m) => [m.sku, m.id]));
    let imported = 0;
    const unknownSkus: string[] = [];
    for (const item of items) {
      const materialId = bySku.get(item.sku);
      if (!materialId) {
        unknownSkus.push(item.sku);
        continue;
      }
      const existing = await prisma.priceListing.findFirst({ where: { materialId, companyId: null, city: item.city, sourceName } });
      const data = { price: item.price, minQty: item.minQty ?? 1, leadTimeDays: item.leadTimeDays ?? 3 };
      if (existing) await prisma.priceListing.update({ where: { id: existing.id }, data });
      else await prisma.priceListing.create({ data: { ...data, materialId, city: item.city, source: "MARKET", sourceName } });
      imported++;
    }
    await snapshotHistory([...new Set(materials.map((m) => m.id))]);
    res.json({ imported, unknownSkus: [...new Set(unknownSkus)] });
  }),
);

export default router;
