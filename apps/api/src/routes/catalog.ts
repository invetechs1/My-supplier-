import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import {
  activeListingWhere, aggregateForMaterials, emptyAggregate, materialWithPrices, platformStats, priceIndex,
} from "../services/catalog";
import { summarize } from "../services/pricing";

const router = Router();

const startedAt = Date.now();
router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    let db: "up" | "down" = "up";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "down";
    }
    res.status(db === "up" ? 200 : 503).json({ ok: db === "up", time: new Date().toISOString(), db, version: env.version, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
  }),
);

router.get(
  "/sitemap.xml",
  asyncHandler(async (_req, res) => {
    const [materials, categories] = await Promise.all([
      prisma.material.findMany({ where: { active: true }, select: { id: true, updatedAt: true }, take: 5000 }),
      prisma.category.findMany({ select: { id: true } }),
    ]);
    const urls = [
      "", "/shop", "/shop/products", "/materials", "/suppliers", "/boq", "/about", "/help", "/terms", "/privacy",
      ...categories.map((c) => `/shop/products?categoryId=${c.id}`),
      ...materials.map((m) => `/shop/products/${m.id}`),
    ];
    res.setHeader("Content-Type", "application/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${env.webUrl}${u.replace(/&/g, "&amp;")}</loc></url>`).join("")}</urlset>`);
  }),
);

router.get("/stats", asyncHandler(async (_req, res) => res.json(await platformStats())));

router.get("/price-index", asyncHandler(async (_req, res) => res.json(await priceIndex())));

router.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { materials: { where: { active: true } } } } },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });
    res.json(
      categories.map((c) => ({
        id: c.id, slug: c.slug, name: c.name, nameAr: c.nameAr, parentId: c.parentId, icon: c.icon,
        materialCount: c._count.materials,
      })),
    );
  }),
);

const materialsQuery = z.object({
  q: z.string().trim().optional(),
  categoryId: z.string().optional(),
  city: z.string().optional(),
  sort: z.enum(["price_asc", "price_desc", "name", "updated"]).default("name"),
});

router.get(
  "/materials",
  asyncHandler(async (req, res) => {
    const { q, categoryId, city, sort } = materialsQuery.parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);

    let categoryIds: string[] | undefined;
    if (categoryId) {
      const children = await prisma.category.findMany({ where: { parentId: categoryId }, select: { id: true } });
      categoryIds = [categoryId, ...children.map((c) => c.id)];
    }
    const where: Prisma.MaterialWhereInput = {
      active: true,
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { nameAr: { contains: q } },
              { sku: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(city ? { listings: { some: { city } } } : {}),
    };

    // Price sorts need aggregates, so for those we fetch matching ids then sort in memory.
    if (sort === "price_asc" || sort === "price_desc" || sort === "updated") {
      const all = await prisma.material.findMany({ where, include: { category: true }, orderBy: { name: "asc" } });
      const agg = await aggregateForMaterials(all.map((m) => m.id), city);
      const enriched = all.map((m) => ({ ...m, ...(agg.get(m.id) ?? emptyAggregate) }));
      enriched.sort((a, b) => {
        if (sort === "updated") return (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? "");
        const av = a.minPrice ?? Number.POSITIVE_INFINITY;
        const bv = b.minPrice ?? Number.POSITIVE_INFINITY;
        return sort === "price_asc" ? av - bv : (b.minPrice ?? -1) - (a.minPrice ?? -1);
      });
      return res.json(paged(serialize(enriched.slice(skip, skip + take)), page, pageSize, enriched.length));
    }

    const [total, materials] = await Promise.all([
      prisma.material.count({ where }),
      prisma.material.findMany({ where, include: { category: true }, orderBy: { name: "asc" }, skip, take }),
    ]);
    const agg = await aggregateForMaterials(materials.map((m) => m.id), city);
    const data = materials.map((m) => ({ ...m, ...(agg.get(m.id) ?? emptyAggregate) }));
    res.json(paged(serialize(data), page, pageSize, total));
  }),
);

router.get(
  "/materials/:id",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const result = await materialWithPrices(req.params.id, city);
    if (!result) throw notFound("Material not found");
    const { material, listings, summary, history } = result;
    res.json(
      serialize({
        ...material,
        minPrice: summary.min, avgPrice: summary.avg, maxPrice: summary.max,
        supplierCount: summary.count, lastUpdated: summary.lastUpdated,
        summary, listings, history,
      }),
    );
  }),
);

router.get(
  "/materials/:id/prices",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const listings = await prisma.priceListing.findMany({
      where: { materialId: req.params.id, ...activeListingWhere(city) },
      include: { company: true },
      orderBy: { price: "asc" },
    });
    res.json(serialize(listings));
  }),
);

router.get(
  "/prices/compare",
  asyncHandler(async (req, res) => {
    const { materialIds, city } = z
      .object({ materialIds: z.string().min(1), city: z.string().optional() })
      .parse(req.query);
    const ids = materialIds.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    const materials = await prisma.material.findMany({ where: { id: { in: ids }, active: true }, include: { category: true } });
    const listings = await prisma.priceListing.findMany({
      where: { materialId: { in: ids }, ...activeListingWhere(city) },
      include: { company: true },
      orderBy: { price: "asc" },
    });
    const result = ids
      .map((id) => materials.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((material) => {
        const ls = listings.filter((l) => l.materialId === material.id);
        const summary = summarize(ls.map((l) => ({ id: l.id, price: Number(l.price), updatedAt: l.updatedAt })));
        return { material, summary: { materialId: material.id, ...summary }, listings: ls };
      });
    res.json(serialize(result));
  }),
);

router.get(
  "/suppliers",
  asyncHandler(async (req, res) => {
    const { city, q } = z.object({ city: z.string().optional(), q: z.string().optional() }).parse(req.query);
    const suppliers = await prisma.company.findMany({
      where: {
        type: "SUPPLIER",
        ...(city ? { city } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nameAr: { contains: q } }] } : {}),
      },
      include: { _count: { select: { listings: true } } },
      orderBy: [{ verified: "desc" }, { rating: "desc" }, { name: "asc" }],
      take: 200,
    });
    res.json(serialize(suppliers.map(({ _count, ...c }) => ({ ...c, listingCount: _count.listings }))));
  }),
);

router.get(
  "/suppliers/:id/reviews",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const where = { companyId: req.params.id, hidden: false };
    const [total, items] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({ where, include: { buyer: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    res.json(paged(serialize(items), page, pageSize, total));
  }),
);

router.get(
  "/suppliers/:id",
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findFirst({ where: { OR: [{ id: req.params.id }, { slug: req.params.id }] }, include: { branches: { orderBy: [{ isDefault: "desc" }, { name: "asc" }] } } });
    if (!company) throw notFound("Supplier not found");
    const [listings, bids, wonBids, ordersDelivered, reviews] = await Promise.all([
      prisma.priceListing.findMany({ where: { companyId: company.id, ...activeListingWhere() }, include: { material: { include: { category: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
      prisma.bid.count({ where: { companyId: company.id } }),
      prisma.bid.count({ where: { companyId: company.id, status: "ACCEPTED" } }),
      prisma.order.count({ where: { companyId: company.id, status: "DELIVERED" } }),
      prisma.review.findMany({ where: { companyId: company.id, hidden: false }, include: { buyer: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    const { bankName: _b, iban: _i, beneficiary: _bn, verificationNotes: _vn, commissionPct: _c, ...publicCompany } = company;
    res.json(serialize({ ...publicCompany, listings, reviews, stats: { listings: listings.length, bids, wonBids, ordersDelivered, memberSince: company.createdAt } }));
  }),
);

export default router;
