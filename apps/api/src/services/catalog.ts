import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { percentChange, round2, summarize } from "./pricing";

/** Only listings that are still valid (no validUntil or in the future). */
export const activeListingWhere = (city?: string): Prisma.PriceListingWhereInput => ({
  AND: [
    { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
    city ? { city } : {},
  ],
});

export interface MaterialAggregate {
  minPrice: number | null;
  avgPrice: number | null;
  maxPrice: number | null;
  supplierCount: number;
  lastUpdated: string | null;
}

/** Batch aggregate prices for many materials in one query. */
export async function aggregateForMaterials(materialIds: string[], city?: string): Promise<Map<string, MaterialAggregate>> {
  const map = new Map<string, MaterialAggregate>();
  if (!materialIds.length) return map;
  const grouped = await prisma.priceListing.groupBy({
    by: ["materialId"],
    where: { materialId: { in: materialIds }, ...activeListingWhere(city) },
    _min: { price: true },
    _avg: { price: true },
    _max: { price: true, updatedAt: true },
    _count: { _all: true },
  });
  for (const g of grouped) {
    map.set(g.materialId, {
      minPrice: g._min.price ? Number(g._min.price) : null,
      avgPrice: g._avg.price ? round2(Number(g._avg.price)) : null,
      maxPrice: g._max.price ? Number(g._max.price) : null,
      supplierCount: g._count._all,
      lastUpdated: g._max.updatedAt ? g._max.updatedAt.toISOString() : null,
    });
  }
  return map;
}

export const emptyAggregate: MaterialAggregate = {
  minPrice: null, avgPrice: null, maxPrice: null, supplierCount: 0, lastUpdated: null,
};

export async function materialWithPrices(materialId: string, city?: string) {
  const material = await prisma.material.findFirst({
    where: { id: materialId, active: true },
    include: { category: true },
  });
  if (!material) return null;
  const listings = await prisma.priceListing.findMany({
    where: { materialId, ...activeListingWhere(city) },
    include: { company: true },
    orderBy: { price: "asc" },
  });
  const summary = summarize(listings.map((l) => ({ id: l.id, price: Number(l.price), updatedAt: l.updatedAt })));
  const history = await prisma.priceHistory.findMany({
    where: { materialId },
    orderBy: { date: "asc" },
    take: 180,
  });
  return {
    material,
    listings,
    summary: { materialId, ...summary },
    history: history.map((h) => ({
      date: h.date.toISOString().slice(0, 10),
      avg: Number(h.avg),
      min: Number(h.min),
      max: Number(h.max),
    })),
  };
}

/** Category-level price index: today's average vs ~30 days ago. */
export async function priceIndex() {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: { children: { select: { id: true } } },
    orderBy: { name: "asc" },
  });
  const since = new Date();
  since.setDate(since.getDate() - 35);
  const results = [];
  for (const cat of categories) {
    const categoryIds = [cat.id, ...cat.children.map((c) => c.id)];
    const materials = await prisma.material.findMany({
      where: { categoryId: { in: categoryIds }, active: true },
      select: { id: true },
    });
    const ids = materials.map((m) => m.id);
    if (!ids.length) continue;
    const current = await prisma.priceListing.aggregate({
      where: { materialId: { in: ids }, ...activeListingWhere() },
      _avg: { price: true },
    });
    const past = await prisma.priceHistory.findMany({
      where: { materialId: { in: ids }, date: { lte: new Date(since.getTime() + 5 * 86400000), gte: since } },
      select: { avg: true },
    });
    const currentAvg = current._avg.price ? Number(current._avg.price) : null;
    const pastAvg = past.length ? past.reduce((s, p) => s + Number(p.avg), 0) / past.length : null;
    results.push({
      category: { id: cat.id, slug: cat.slug, name: cat.name, nameAr: cat.nameAr, icon: cat.icon, parentId: null, materialCount: ids.length },
      avgPrice: currentAvg ? round2(currentAvg) : 0,
      changePct30d: percentChange(pastAvg, currentAvg),
      materialCount: ids.length,
    });
  }
  return results;
}

export async function platformStats() {
  const [materials, suppliers, priceListings, openRfqs, bids, orders, gmv] = await Promise.all([
    prisma.material.count({ where: { active: true } }),
    prisma.company.count({ where: { type: "SUPPLIER" } }),
    prisma.priceListing.count(),
    prisma.rfq.count({ where: { status: "OPEN", closesAt: { gt: new Date() } } }),
    prisma.bid.count(),
    prisma.order.count(),
    prisma.order.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { total: true } }),
  ]);
  return { materials, suppliers, priceListings, openRfqs, bids, orders, gmv: gmv._sum.total ? Number(gmv._sum.total) : 0 };
}

/** Snapshot today's aggregates into PriceHistory (called after price writes and by a daily job). */
export async function snapshotHistory(materialIds: string[]) {
  if (!materialIds.length) return;
  const agg = await aggregateForMaterials(materialIds);
  const today = new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (const id of materialIds) {
    const a = agg.get(id);
    if (!a || a.avgPrice === null || a.minPrice === null || a.maxPrice === null) continue;
    await prisma.priceHistory.upsert({
      where: { materialId_date: { materialId: id, date } },
      create: { materialId: id, date, avg: a.avgPrice, min: a.minPrice, max: a.maxPrice },
      update: { avg: a.avgPrice, min: a.minPrice, max: a.maxPrice },
    });
  }
}
