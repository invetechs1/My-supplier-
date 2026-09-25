/**
 * "My products": everything a supplier has on sale in the public marketplace, as the buyer sees it,
 * with inline control of price, stock, minimum quantity, lead time, pause/resume and a product photo.
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { badRequest, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { assertMagicBytes, publicUrl, uploader } from "../lib/uploads";
import { env } from "../lib/env";

const router = Router();
const supplier = requireAuth("SUPPLIER");

export type ListingStatus = "ACTIVE" | "PAUSED" | "OUT_OF_STOCK" | "EXPIRED";

/** Pure status rule shared by the API and the tests. */
export function listingStatus(l: { active: boolean; stock: number | null; validUntil: Date | null }, now = new Date()): ListingStatus {
  if (!l.active) return "PAUSED";
  if (l.validUntil && l.validUntil < now) return "EXPIRED";
  if (l.stock !== null && l.stock <= 0) return "OUT_OF_STOCK";
  return "ACTIVE";
}

const generatedImage = (sku: string) => `${env.apiUrl}/images/materials/${encodeURIComponent(sku)}`;

const include = { material: { include: { category: true } } } satisfies Prisma.PriceListingInclude;
type Row = Prisma.PriceListingGetPayload<{ include: typeof include }>;

async function shape(rows: Row[], companyId: string) {
  if (!rows.length) return [];
  const now = new Date();
  const since = new Date(Date.now() - 30 * 86400000);
  const materialIds = [...new Set(rows.map((r) => r.materialId))];
  const [competitors, sold] = await Promise.all([
    prisma.priceListing.findMany({
      where: { materialId: { in: materialIds }, source: "SUPPLIER", companyId: { not: companyId }, active: true, OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      select: { materialId: true, city: true, price: true, companyId: true },
    }),
    prisma.orderItem.groupBy({ by: ["listingId"], where: { listingId: { in: rows.map((r) => r.id) }, order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } }, _sum: { quantity: true } }),
  ]);
  const soldBy = new Map(sold.map((s) => [s.listingId, Number(s._sum.quantity ?? 0)]));
  return rows.map((l) => {
    const rivals = competitors.filter((c) => c.materialId === l.materialId && c.city === l.city);
    const best = rivals.length ? Math.min(...rivals.map((c) => Number(c.price))) : null;
    const price = Number(l.price);
    return {
      id: l.id, materialId: l.materialId,
      material: { id: l.material.id, sku: l.material.sku, name: l.material.name, nameAr: l.material.nameAr, unit: l.material.unit, brand: l.material.brand, imageUrl: l.material.imageUrl, category: l.material.category ? { id: l.material.category.id, slug: l.material.category.slug, name: l.material.category.name, nameAr: l.material.category.nameAr, icon: l.material.category.icon } : null },
      city: l.city, price, currency: l.currency, minQty: l.minQty, leadTimeDays: l.leadTimeDays, stock: l.stock, validUntil: l.validUntil, active: l.active, imageUrl: l.imageUrl,
      displayImageUrl: l.imageUrl ?? l.material.imageUrl ?? generatedImage(l.material.sku),
      status: listingStatus(l, now),
      competitors: new Set(rivals.map((c) => c.companyId)).size,
      bestCompetitorPrice: best,
      isCheapest: best === null ? true : price <= best,
      sold30d: soldBy.get(l.id) ?? 0,
      updatedAt: l.updatedAt,
    };
  });
}

router.get("/supplier/products", supplier, asyncHandler(async (req, res) => {
  const companyId = requireCompany(req);
  const q = z.object({ q: z.string().optional(), status: z.enum(["ACTIVE", "PAUSED", "OUT_OF_STOCK", "EXPIRED"]).optional(), city: z.string().optional(), categoryId: z.string().optional(), sort: z.enum(["updated", "name", "price", "stock"]).default("updated") }).parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const now = new Date();
  const statusWhere: Prisma.PriceListingWhereInput =
    q.status === "PAUSED" ? { active: false }
    : q.status === "EXPIRED" ? { active: true, validUntil: { lt: now } }
    : q.status === "OUT_OF_STOCK" ? { active: true, stock: { lte: 0 }, OR: [{ validUntil: null }, { validUntil: { gte: now } }] }
    : q.status === "ACTIVE" ? { active: true, AND: [{ OR: [{ stock: null }, { stock: { gt: 0 } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: now } }] }] }
    : {};
  const where: Prisma.PriceListingWhereInput = {
    companyId, source: "SUPPLIER",
    ...(q.city ? { city: q.city } : {}),
    ...(q.categoryId ? { material: { categoryId: q.categoryId } } : {}),
    ...(q.q ? { material: { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { nameAr: { contains: q.q } }, { sku: { contains: q.q, mode: "insensitive" } }, { brand: { contains: q.q, mode: "insensitive" } }] } } : {}),
    ...statusWhere,
  };
  const orderBy: Prisma.PriceListingOrderByWithRelationInput = q.sort === "name" ? { material: { name: "asc" } } : q.sort === "price" ? { price: "asc" } : q.sort === "stock" ? { stock: "asc" } : { updatedAt: "desc" };
  const [total, rows, all] = await Promise.all([
    prisma.priceListing.count({ where }),
    prisma.priceListing.findMany({ where, include, orderBy, skip, take }),
    prisma.priceListing.findMany({ where: { companyId, source: "SUPPLIER" }, select: { id: true, active: true, stock: true, validUntil: true, city: true, materialId: true, price: true } }),
  ]);
  const items = await shape(rows, companyId);
  // Summary across the whole catalogue (not just this page), including how many offers are the cheapest in their city.
  const summary = { total: all.length, active: 0, paused: 0, outOfStock: 0, expired: 0, cheapest: 0 };
  for (const l of all) {
    const st = listingStatus(l, now);
    if (st === "ACTIVE") summary.active++; else if (st === "PAUSED") summary.paused++; else if (st === "OUT_OF_STOCK") summary.outOfStock++; else summary.expired++;
  }
  if (all.length) {
    const rivals = await prisma.priceListing.groupBy({ by: ["materialId", "city"], where: { materialId: { in: [...new Set(all.map((l) => l.materialId))] }, source: "SUPPLIER", companyId: { not: companyId }, active: true, OR: [{ validUntil: null }, { validUntil: { gte: now } }] }, _min: { price: true } });
    const bestBy = new Map(rivals.map((r) => [`${r.materialId}|${r.city}`, Number(r._min.price ?? 0)]));
    for (const l of all) { const b = bestBy.get(`${l.materialId}|${l.city}`); if (b === undefined || Number(l.price) <= b) summary.cheapest++; }
  }
  res.json({ ...paged(serialize(items), page, pageSize, total), summary, cities: [...new Set(all.map((l) => l.city))].sort() });
}));

router.post(
  "/supplier/prices/:id/image",
  supplier,
  (req, res, next) => uploader("image", 3).single("file")(req, res, (err) => (err ? next(badRequest((err as Error).message)) : next())),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const listing = await prisma.priceListing.findUnique({ where: { id: req.params.id } });
    if (!listing || listing.companyId !== companyId) throw notFound("Listing not found");
    if (!req.file) throw badRequest("Upload an image");
    try { assertMagicBytes(req.file.path, req.file.mimetype); } catch (e) { throw badRequest((e as Error).message); }
    const updated = await prisma.priceListing.update({ where: { id: listing.id }, data: { imageUrl: publicUrl(req.file.filename) }, include });
    res.json(serialize((await shape([updated], companyId))[0]));
  }),
);

router.delete("/supplier/prices/:id/image", supplier, asyncHandler(async (req, res) => {
  const companyId = requireCompany(req);
  const listing = await prisma.priceListing.findUnique({ where: { id: req.params.id } });
  if (!listing || listing.companyId !== companyId) throw notFound("Listing not found");
  const updated = await prisma.priceListing.update({ where: { id: listing.id }, data: { imageUrl: null }, include });
  res.json(serialize((await shape([updated], companyId))[0]));
}));

export default router;
