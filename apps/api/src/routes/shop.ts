import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { activeListingWhere, platformStats } from "../services/catalog";
import { emptyEnrichment, enrichMaterials, productImageSvg, toOffer } from "../services/shop";
import { summarize } from "../services/pricing";

const router = Router();
const productInclude = { category: true } satisfies Prisma.MaterialInclude;

async function products(where: Prisma.MaterialWhereInput, orderBy: Prisma.MaterialOrderByWithRelationInput | Prisma.MaterialOrderByWithRelationInput[], take: number, city?: string) {
  const rows = await prisma.material.findMany({ where: { active: true, ...where }, include: productInclude, orderBy, take });
  const enrich = await enrichMaterials(rows.map((r) => r.id), city);
  return rows.map((r) => {
    const e = enrich.get(r.id) ?? emptyEnrichment;
    return { ...r, ...e, imageUrl: r.imageUrl ?? e.listingImageUrl };
  });
}

router.get(
  "/shop/home",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const [featured, popular, newArrivals, categories, stats] = await Promise.all([
      products({ featured: true }, { popularity: "desc" }, 12, city),
      products({}, { popularity: "desc" }, 60, city),
      products({}, { createdAt: "desc" }, 12, city),
      prisma.category.findMany({ where: { parentId: null }, include: { _count: { select: { materials: { where: { active: true } } } } }, orderBy: { name: "asc" } }),
      platformStats(),
    ]);
    const deals = popular.filter((p) => p.isDeal).slice(0, 12);
    res.json(
      serialize({
        featured, deals, newArrivals,
        categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, nameAr: c.nameAr, icon: c.icon, parentId: c.parentId, materialCount: c._count.materials })),
        stats,
      }),
    );
  }),
);

router.get(
  "/shop/brands",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.material.findMany({ where: { active: true, brand: { not: null } }, select: { brand: true }, distinct: ["brand"], orderBy: { brand: "asc" } });
    res.json(rows.map((r) => r.brand).filter(Boolean));
  }),
);

const listQuery = z.object({
  q: z.string().trim().optional(),
  categoryId: z.string().optional(),
  city: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  inStock: z.enum(["1", "true", "0", "false"]).optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest", "popular"]).default("relevance"),
});

router.get(
  "/shop/products",
  asyncHandler(async (req, res) => {
    const qy = listQuery.parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    let categoryIds: string[] | undefined;
    if (qy.categoryId) {
      const children = await prisma.category.findMany({ where: { parentId: qy.categoryId }, select: { id: true } });
      categoryIds = [qy.categoryId, ...children.map((c) => c.id)];
    }
    const where: Prisma.MaterialWhereInput = {
      active: true,
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(qy.brand ? { brand: { equals: qy.brand, mode: "insensitive" } } : {}),
      ...(qy.q
        ? {
            OR: [
              { name: { contains: qy.q, mode: "insensitive" } },
              { nameAr: { contains: qy.q } },
              { sku: { contains: qy.q, mode: "insensitive" } },
              { brand: { contains: qy.q, mode: "insensitive" } },
              { tags: { has: qy.q.toLowerCase() } },
              { category: { name: { contains: qy.q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(qy.city ? { listings: { some: { city: qy.city } } } : {}),
    };
    // Storefront filters (price range, stock, price sorts) depend on live offers, so we enrich the
    // whole candidate set (bounded) and page in memory. Catalogue sizes up to ~10k are fine here.
    const rows = await prisma.material.findMany({
      where, include: productInclude, take: 5000,
      orderBy: qy.sort === "newest" ? { createdAt: "desc" } : qy.sort === "popular" ? { popularity: "desc" } : [{ featured: "desc" }, { popularity: "desc" }, { name: "asc" }],
    });
    const enrich = await enrichMaterials(rows.map((r) => r.id), qy.city);
    let list = rows.map((r) => ({ ...r, ...(enrich.get(r.id) ?? emptyEnrichment) }));
    const wantStock = qy.inStock === "1" || qy.inStock === "true";
    list = list.filter((p) => {
      const price = p.bestOffer?.price ?? null;
      if (qy.minPrice !== undefined && (price === null || price < qy.minPrice)) return false;
      if (qy.maxPrice !== undefined && (price === null || price > qy.maxPrice)) return false;
      if (wantStock && !p.inStock) return false;
      return true;
    });
    if (qy.sort === "price_asc") list.sort((a, b) => (a.bestOffer?.price ?? Infinity) - (b.bestOffer?.price ?? Infinity));
    if (qy.sort === "price_desc") list.sort((a, b) => (b.bestOffer?.price ?? -1) - (a.bestOffer?.price ?? -1));
    res.json(paged(serialize(list.slice(skip, skip + take)), page, pageSize, list.length));
  }),
);

router.get(
  "/shop/products/:id",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const material = await prisma.material.findFirst({ where: { id: req.params.id, active: true }, include: productInclude });
    if (!material) throw notFound("Product not found");
    const [listings, history, relatedRows] = await Promise.all([
      prisma.priceListing.findMany({ where: { materialId: material.id, ...activeListingWhere(city) }, include: { company: true }, orderBy: { price: "asc" } }),
      prisma.priceHistory.findMany({ where: { materialId: material.id }, orderBy: { date: "asc" }, take: 180 }),
      prisma.material.findMany({ where: { active: true, categoryId: material.categoryId, id: { not: material.id } }, include: productInclude, orderBy: { popularity: "desc" }, take: 8 }),
    ]);
    const offers = listings.map(toOffer);
    const enrich = (await enrichMaterials([material.id], city)).get(material.id) ?? emptyEnrichment;
    const relatedEnrich = await enrichMaterials(relatedRows.map((r) => r.id), city);
    const summary = summarize(listings.map((l) => ({ id: l.id, price: Number(l.price), updatedAt: l.updatedAt })));
    // Popularity signal: product views.
    prisma.material.update({ where: { id: material.id }, data: { popularity: { increment: 1 } } }).catch(() => undefined);
    res.json(
      serialize({
        ...material, ...enrich, offers, imageUrl: material.imageUrl ?? enrich.listingImageUrl,
        summary: { materialId: material.id, ...summary },
        history: history.map((h) => ({ date: h.date.toISOString().slice(0, 10), avg: Number(h.avg), min: Number(h.min), max: Number(h.max) })),
        related: relatedRows.map((r) => ({ ...r, ...(relatedEnrich.get(r.id) ?? emptyEnrichment) })),
      }),
    );
  }),
);

router.get(
  "/images/materials/:sku",
  asyncHandler(async (req, res) => {
    const sku = req.params.sku.replace(/\.svg$/i, "");
    const material = await prisma.material.findUnique({ where: { sku }, include: { category: true } });
    const svg = productImageSvg(sku, material?.name ?? sku, material?.category.icon ?? "🏗️");
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(svg);
  }),
);

export default router;
