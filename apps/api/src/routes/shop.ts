import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { activeListingWhere, platformStats } from "../services/catalog";
import { emptyEnrichment, enrichMaterials, offerInclude, productImageSvg, productInclude, products, toOffer, withEnrichment } from "../services/shop";
import { summarize } from "../services/pricing";
import {
  FUZZY_MIN_RESULTS, SEARCH_BOUND, attributesForCategories, attributesForMaterialCategory, brandSummaries, categoryScope, computeFacets,
  frequentlyBoughtTogether, fuzzyMaterialIds, matchesSpecs, parseSpecFilters, productReviewSummary, recordRecentlyViewed, sortProducts, suggest, textSearchWhere,
} from "../services/marketplace";

const router = Router();

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

// ------------------------------------------------------------------ suggestions & brands
router.get(
  "/shop/suggest",
  asyncHandler(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().max(80).default("") }).parse(req.query);
    res.json(await suggest(q));
  }),
);

router.get("/shop/brands", asyncHandler(async (_req, res) => res.json(await brandSummaries())));

router.get(
  "/shop/brands/:brand",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.MaterialWhereInput = { brand: { equals: req.params.brand, mode: "insensitive" } };
    const [total, list] = await Promise.all([
      prisma.material.count({ where: { active: true, ...where } }),
      products(where, [{ featured: "desc" }, { popularity: "desc" }, { name: "asc" }], SEARCH_BOUND, city),
    ]);
    if (!total) throw notFound("Brand not found");
    const image = list.find((p) => p.imageUrl)?.imageUrl ?? null;
    res.json({ ...paged(serialize(list.slice(skip, skip + take)), page, pageSize, total), brand: { brand: list[0]?.brand ?? req.params.brand, productCount: total, imageUrl: image } });
  }),
);

// ------------------------------------------------------------------ search & filters
const boolish = z.enum(["1", "true", "0", "false"]).optional();
const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().optional(),
  city: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  inStock: boolish,
  rating: z.coerce.number().min(0).max(5).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "rating", "newest", "popular"]).default("relevance"),
});

router.get(
  "/shop/products",
  asyncHandler(async (req, res) => {
    const qy = listQuery.parse(req.query);
    const specFilters = parseSpecFilters(req.query as Record<string, unknown>);
    const { page, pageSize, skip, take } = paginate(req.query);
    const categoryIds = qy.categoryId ? await categoryScope(qy.categoryId) : undefined;
    const minRating = qy.minRating ?? qy.rating;
    const brands = qy.brand ? qy.brand.split(",").map((b) => b.trim()).filter(Boolean) : [];

    const baseWhere: Prisma.MaterialWhereInput = {
      active: true,
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
      ...(brands.length ? { OR: brands.map((b) => ({ brand: { equals: b, mode: "insensitive" as const } })) } : {}),
      ...(minRating ? { ratingAvg: { gte: minRating } } : {}),
      ...(qy.city ? { listings: { some: { ...activeListingWhere(qy.city) } } } : {}),
    };
    const orderBy: Prisma.MaterialOrderByWithRelationInput[] =
      qy.sort === "newest" ? [{ createdAt: "desc" }] : qy.sort === "popular" ? [{ popularity: "desc" }] : qy.sort === "rating" ? [{ ratingAvg: "desc" }, { ratingCount: "desc" }] : [{ featured: "desc" }, { popularity: "desc" }, { name: "asc" }];

    // Storefront filters (specs, price range, stock, price sorts) depend on live offers and JSON specs,
    // so we load the candidate set (bounded to SEARCH_BOUND = 5000 rows) and filter/facet/page in memory.
    // The catalogue is a few thousand rows; `facets.truncated` flags when the bound was hit.
    let rows = await prisma.material.findMany({ where: { ...baseWhere, ...(qy.q ? textSearchWhere(qy.q) : {}) }, include: productInclude, orderBy, take: SEARCH_BOUND });
    let fuzzy = false;
    if (qy.q && rows.length < FUZZY_MIN_RESULTS) {
      // Typo tolerance: mix in trigram-similar materials (e.g. "cemnt" -> cement), ranked by similarity.
      const ids = await fuzzyMaterialIds(qy.q);
      const missing = ids.filter((id) => !rows.some((r) => r.id === id));
      if (missing.length) {
        const extra = await prisma.material.findMany({ where: { ...baseWhere, id: { in: missing } }, include: productInclude });
        const byId = new Map(extra.map((r) => [r.id, r]));
        rows = [...rows, ...missing.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r))];
        fuzzy = extra.length > 0;
      }
    }
    const truncated = rows.length >= SEARCH_BOUND;
    const enrich = await enrichMaterials(rows.map((r) => r.id), qy.city);
    let list = rows.map((r) => {
      const e = enrich.get(r.id) ?? emptyEnrichment;
      return { ...r, ...e, imageUrl: r.imageUrl ?? e.listingImageUrl };
    });
    const wantStock = qy.inStock === "1" || qy.inStock === "true";
    list = list.filter((p) => {
      const price = p.bestOffer?.effectivePrice ?? null;
      if (qy.minPrice !== undefined && (price === null || price < qy.minPrice)) return false;
      if (qy.maxPrice !== undefined && (price === null || price > qy.maxPrice)) return false;
      if (wantStock && !p.inStock) return false;
      if (specFilters.length && !matchesSpecs(p.specs, specFilters)) return false;
      return true;
    });
    // Relevance with fuzzy results keeps DB order (exact matches first, then similarity rank).
    list = sortProducts(list, qy.sort);
    const attributes = categoryIds ? await attributesForCategories(categoryIds) : [];
    const facets = computeFacets(list, attributes, { truncated, fuzzy });
    res.json({ ...paged(serialize(list.slice(skip, skip + take)), page, pageSize, list.length), facets: serialize(facets) });
  }),
);

// ------------------------------------------------------------------ product detail
router.get(
  "/shop/products/:id",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const material = await prisma.material.findFirst({ where: { id: req.params.id, active: true }, include: productInclude });
    if (!material) throw notFound("Product not found");
    const [listings, history, relatedRows, attributes, reviewSummary, questionsCount, frequentlyBought] = await Promise.all([
      prisma.priceListing.findMany({ where: { materialId: material.id, ...activeListingWhere(city) }, include: offerInclude, orderBy: { price: "asc" } }),
      prisma.priceHistory.findMany({ where: { materialId: material.id }, orderBy: { date: "asc" }, take: 180 }),
      prisma.material.findMany({ where: { active: true, categoryId: material.categoryId, id: { not: material.id } }, include: productInclude, orderBy: { popularity: "desc" }, take: 8 }),
      attributesForMaterialCategory(material.categoryId),
      productReviewSummary(material.id),
      prisma.productQuestion.count({ where: { materialId: material.id, hidden: false } }),
      frequentlyBoughtTogether(material.id, material.categoryId, city),
    ]);
    const now = new Date();
    const offers = listings.map((l) => toOffer(l, now)).sort((a, b) => a.effectivePrice - b.effectivePrice);
    const enrich = (await enrichMaterials([material.id], city)).get(material.id) ?? emptyEnrichment;
    const related = await withEnrichment(relatedRows, city);
    const summary = summarize(offers.map((o) => ({ id: o.listingId, price: o.effectivePrice, updatedAt: listings.find((l) => l.id === o.listingId)?.updatedAt })));
    // Popularity signal: product views; personal history when logged in (optionalAuth is global).
    prisma.material.update({ where: { id: material.id }, data: { popularity: { increment: 1 } } }).catch(() => undefined);
    if (req.user) void recordRecentlyViewed(req.user.id, material.id);
    res.json(
      serialize({
        ...material, ...enrich, offers, imageUrl: material.imageUrl ?? enrich.listingImageUrl,
        summary: { materialId: material.id, ...summary },
        history: history.map((h) => ({ date: h.date.toISOString().slice(0, 10), avg: Number(h.avg), min: Number(h.min), max: Number(h.max) })),
        related,
        attributes,
        reviewSummary,
        questionsCount,
        frequentlyBoughtTogether: frequentlyBought,
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
