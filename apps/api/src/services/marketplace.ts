/**
 * Product discovery: spec filters & facets, fuzzy (trigram) search, suggestions, brands,
 * frequently-bought-together, recently viewed / recommendations, review maths and price alerts.
 *
 * The pure helpers at the top are unit-tested (tests/marketplace.test.ts); everything that touches
 * the database lives below them.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notify } from "./notifications";
import { round2 } from "./pricing";
import { emptyEnrichment, enrichMaterials, productInclude, products, withEnrichment, type ProductRow } from "./shop";

// ------------------------------------------------------------------ pure helpers

export type AttributeKind = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";

export interface AttributeDef {
  id?: string;
  categoryId?: string;
  key: string;
  label: string;
  labelAr: string;
  type: AttributeKind;
  unit?: string | null;
  options: string[];
  filterable: boolean;
  sortOrder: number;
}

export type SpecFilter =
  | { key: string; kind: "exact"; values: string[] }
  | { key: string; kind: "range"; min: number | null; max: number | null };

/** Parses "min..max" (either side optional, e.g. "10..", "..50", "10..50"). Returns null when not a range. */
export function parseRange(value: string): { min: number | null; max: number | null } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)?\s*\.\.\s*(-?\d+(?:\.\d+)?)?\s*$/.exec(value);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const min = m[1] !== undefined ? Number(m[1]) : null;
  const max = m[2] !== undefined ? Number(m[2]) : null;
  if (min !== null && max !== null && min > max) return { min: max, max: min };
  return { min, max };
}

/**
 * Extracts `spec.<key>=value` query params. Values may repeat (`spec.grade=A&spec.grade=B` or
 * comma separated) for OR matching; NUMBER attributes accept `min..max` ranges.
 */
export function parseSpecFilters(query: Record<string, unknown>): SpecFilter[] {
  const out: SpecFilter[] = [];
  for (const [rawKey, rawValue] of Object.entries(query)) {
    if (!rawKey.startsWith("spec.") || rawKey.length <= 5) continue;
    const key = rawKey.slice(5);
    const values = (Array.isArray(rawValue) ? rawValue : [rawValue])
      .flatMap((v) => String(v ?? "").split(","))
      .map((v) => v.trim())
      .filter(Boolean);
    if (!values.length) continue;
    const range = values.length === 1 ? parseRange(values[0]) : null;
    if (range) out.push({ key, kind: "range", ...range });
    else out.push({ key, kind: "exact", values });
  }
  return out;
}

const normalise = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function specNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.+-]/g, ""));
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/** True when a material's specs JSON satisfies every filter. */
export function matchesSpecs(specs: unknown, filters: SpecFilter[]): boolean {
  if (!filters.length) return true;
  const obj = specs && typeof specs === "object" && !Array.isArray(specs) ? (specs as Record<string, unknown>) : {};
  for (const f of filters) {
    const v = obj[f.key];
    if (v === undefined || v === null || v === "") return false;
    if (f.kind === "exact") {
      const wanted = f.values.map(normalise);
      if (!wanted.includes(normalise(v))) return false;
    } else {
      const n = specNumber(v);
      if (n === null) return false;
      if (f.min !== null && n < f.min) return false;
      if (f.max !== null && n > f.max) return false;
    }
  }
  return true;
}

export interface FacetOption { value: string; count: number }
export interface AttributeFacet extends AttributeDef { values: FacetOption[]; min?: number | null; max?: number | null }
export interface Facets {
  attributes: AttributeFacet[];
  brands: FacetOption[];
  price: { min: number | null; max: number | null };
  cities: FacetOption[];
  total: number;
  truncated: boolean;
  fuzzy?: boolean;
}

interface FacetInput {
  specs?: unknown;
  brand?: string | null;
  bestOffer?: { effectivePrice: number; city?: string } | null;
  minPrice?: number | null;
}

const sortOptions = (m: Map<string, number>) =>
  [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

/**
 * Counts facet values over an in-memory list of (filtered) products. Catalogue sizes are a few
 * thousand rows so a JS pass is cheap; the caller bounds the candidate set (5000) and flags truncation.
 */
export function computeFacets(items: FacetInput[], attributes: AttributeDef[], opts: { truncated?: boolean; fuzzy?: boolean } = {}): Facets {
  const brandCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  let priceMin: number | null = null;
  let priceMax: number | null = null;
  const attrValueCounts = new Map<string, Map<string, number>>();
  const attrRange = new Map<string, { min: number; max: number }>();
  const defs = attributes.filter((a) => a.filterable !== false).sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

  for (const it of items) {
    if (it.brand) brandCounts.set(it.brand, (brandCounts.get(it.brand) ?? 0) + 1);
    const city = it.bestOffer?.city;
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
    const price = it.bestOffer?.effectivePrice ?? it.minPrice ?? null;
    if (price !== null && price !== undefined) {
      priceMin = priceMin === null ? price : Math.min(priceMin, price);
      priceMax = priceMax === null ? price : Math.max(priceMax, price);
    }
    const specs = it.specs && typeof it.specs === "object" && !Array.isArray(it.specs) ? (it.specs as Record<string, unknown>) : null;
    if (!specs) continue;
    for (const def of defs) {
      const v = specs[def.key];
      if (v === undefined || v === null || v === "") continue;
      if (def.type === "NUMBER") {
        const n = specNumber(v);
        if (n === null) continue;
        const r = attrRange.get(def.key);
        attrRange.set(def.key, r ? { min: Math.min(r.min, n), max: Math.max(r.max, n) } : { min: n, max: n });
      } else {
        const key = def.type === "BOOLEAN" ? (["true", "1", "yes"].includes(normalise(v)) ? "true" : "false") : String(v).trim();
        const m = attrValueCounts.get(def.key) ?? new Map<string, number>();
        m.set(key, (m.get(key) ?? 0) + 1);
        attrValueCounts.set(def.key, m);
      }
    }
  }

  const attrs: AttributeFacet[] = defs.map((def) => {
    if (def.type === "NUMBER") {
      const r = attrRange.get(def.key);
      return { ...def, values: [], min: r?.min ?? null, max: r?.max ?? null };
    }
    const counts = attrValueCounts.get(def.key) ?? new Map<string, number>();
    // Keep the admin-defined option order for SELECT, then append observed values not in the list.
    const values = def.type === "SELECT" && def.options.length
      ? [
          ...def.options.map((o) => ({ value: o, count: counts.get(o) ?? 0 })),
          ...sortOptions(counts).filter((v) => !def.options.includes(v.value)),
        ]
      : sortOptions(counts);
    return { ...def, values: values.slice(0, 50) };
  });

  return {
    attributes: attrs,
    brands: sortOptions(brandCounts).slice(0, 50),
    price: { min: priceMin === null ? null : round2(priceMin), max: priceMax === null ? null : round2(priceMax) },
    cities: sortOptions(cityCounts),
    total: items.length,
    truncated: Boolean(opts.truncated),
    ...(opts.fuzzy ? { fuzzy: true } : {}),
  };
}

export interface ReviewSummary { average: number; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> }

/** Pure: average (1 dp) + star distribution over a list of ratings. */
export function summarizeRatings(ratings: number[]): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let count = 0;
  for (const r of ratings) {
    const star = Math.min(5, Math.max(1, Math.round(r))) as 1 | 2 | 3 | 4 | 5;
    distribution[star] += 1;
    sum += star;
    count += 1;
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, distribution };
}

export type ProductSort = "relevance" | "price_asc" | "price_desc" | "rating" | "newest" | "popular";

/** Pure: in-memory sort for enriched products (price/rating sorts need live offers). */
export function sortProducts<T extends { bestOffer?: { effectivePrice: number } | null; ratingAvg?: number; ratingCount?: number; popularity?: number; createdAt?: Date | string; featured?: boolean }>(list: T[], sort: ProductSort): T[] {
  const price = (p: T, missing: number) => p.bestOffer?.effectivePrice ?? missing;
  const arr = [...list];
  switch (sort) {
    case "price_asc": return arr.sort((a, b) => price(a, Infinity) - price(b, Infinity));
    case "price_desc": return arr.sort((a, b) => price(b, -1) - price(a, -1));
    case "rating": return arr.sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0));
    case "newest": return arr.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    case "popular": return arr.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    default: return arr; // relevance: keep DB order (featured, popularity, name) / fuzzy rank
  }
}

// ------------------------------------------------------------------ search helpers (DB)

export const FUZZY_MIN_RESULTS = 3;
export const SEARCH_BOUND = 5000;

/** Case-insensitive search across name, Arabic name, SKU, brand, tags and category (exact ILIKE). */
export function textSearchWhere(q: string): Prisma.MaterialWhereInput {
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { nameAr: { contains: q } },
      { sku: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
      { category: { name: { contains: q, mode: "insensitive" } } },
    ],
  };
}

/**
 * Trigram fuzzy match (pg_trgm) ordered by similarity; used when the exact search returns too few
 * rows so that "cemnt" still finds cement. Fails soft (empty) if the extension is missing.
 */
export async function fuzzyMaterialIds(q: string, limit = 60, threshold = 0.35): Promise<string[]> {
  const term = q.trim();
  if (term.length < 3) return [];
  try {
    const rows = await prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT m."id",
             GREATEST(word_similarity(${term}, m."name"), word_similarity(${term}, m."nameAr"), similarity(m."name", ${term}), COALESCE(word_similarity(${term}, m."brand"), 0)) AS score
      FROM "Material" m
      WHERE m."active" = true
        AND (word_similarity(${term}, m."name") > ${threshold} OR word_similarity(${term}, m."nameAr") > ${threshold} OR similarity(m."name", ${term}) > ${threshold} OR word_similarity(${term}, m."brand") > ${threshold})
      ORDER BY score DESC, m."popularity" DESC
      LIMIT ${limit}`;
    return rows.map((r) => r.id);
  } catch (err) {
    console.warn("[search] trigram fallback unavailable", (err as Error).message);
    return [];
  }
}

/** Category + its direct children (the shop treats a parent category as its whole subtree). */
export async function categoryScope(categoryId: string): Promise<string[]> {
  const children = await prisma.category.findMany({ where: { parentId: categoryId }, select: { id: true } });
  return [categoryId, ...children.map((c) => c.id)];
}

export async function attributesForCategories(categoryIds: string[]) {
  if (!categoryIds.length) return [];
  const rows = await prisma.categoryAttribute.findMany({ where: { categoryId: { in: categoryIds } }, orderBy: [{ sortOrder: "asc" }, { key: "asc" }] });
  // Parent + child categories may both define the same key: keep the first (parent-first order not guaranteed, so dedupe by key).
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

/** Attributes for a material's category and its parent (parent-level definitions apply to children). */
export async function attributesForMaterialCategory(categoryId: string) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, parentId: true } });
  if (!cat) return [];
  return attributesForCategories(cat.parentId ? [cat.id, cat.parentId] : [cat.id]);
}

// ------------------------------------------------------------------ suggestions & brands

export async function suggest(q: string) {
  const term = q.trim();
  if (!term) return { products: [], categories: [], brands: [] };
  const select = { id: true, name: true, nameAr: true, sku: true, imageUrl: true, popularity: true, category: { select: { name: true } } } as const;
  const [prefix, contains, categories, brandRows] = await Promise.all([
    prisma.material.findMany({ where: { active: true, OR: [{ name: { startsWith: term, mode: "insensitive" } }, { nameAr: { startsWith: term } }, { sku: { startsWith: term, mode: "insensitive" } }] }, select, orderBy: { popularity: "desc" }, take: 8 }),
    prisma.material.findMany({ where: { active: true, OR: [{ name: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term } }, { brand: { contains: term, mode: "insensitive" } }, { tags: { has: term.toLowerCase() } }] }, select, orderBy: { popularity: "desc" }, take: 8 }),
    prisma.category.findMany({ where: { OR: [{ name: { contains: term, mode: "insensitive" } }, { nameAr: { contains: term } }, { slug: { contains: term.toLowerCase() } }] }, select: { id: true, slug: true, name: true, nameAr: true, icon: true }, orderBy: { name: "asc" }, take: 4 }),
    prisma.material.findMany({ where: { active: true, brand: { contains: term, mode: "insensitive" } }, select: { brand: true }, distinct: ["brand"], orderBy: { brand: "asc" }, take: 4 }),
  ]);
  const seen = new Set<string>();
  const merged = [...prefix, ...contains].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  if (merged.length < FUZZY_MIN_RESULTS) {
    const ids = (await fuzzyMaterialIds(term, 8)).filter((id) => !seen.has(id));
    if (ids.length) {
      const rows = await prisma.material.findMany({ where: { id: { in: ids } }, select });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const id of ids) {
        const r = byId.get(id);
        if (r) merged.push(r);
      }
    }
  }
  const productIds = merged.slice(0, 8).map((m) => m.id);
  const enrich = await enrichMaterials(productIds);
  return {
    products: merged.slice(0, 8).map((m) => ({ id: m.id, name: m.name, nameAr: m.nameAr, sku: m.sku, imageUrl: m.imageUrl ?? enrich.get(m.id)?.listingImageUrl ?? null, categoryName: m.category.name })),
    categories,
    brands: brandRows.map((b) => b.brand).filter((b): b is string => Boolean(b)),
  };
}

export async function brandSummaries() {
  const rows = await prisma.material.findMany({ where: { active: true, brand: { not: null } }, select: { brand: true, imageUrl: true, popularity: true }, orderBy: { popularity: "desc" }, take: SEARCH_BOUND });
  const map = new Map<string, { brand: string; productCount: number; imageUrl: string | null }>();
  for (const r of rows) {
    if (!r.brand) continue;
    const cur = map.get(r.brand) ?? { brand: r.brand, productCount: 0, imageUrl: null };
    cur.productCount += 1;
    if (!cur.imageUrl && r.imageUrl) cur.imageUrl = r.imageUrl;
    map.set(r.brand, cur);
  }
  return [...map.values()].sort((a, b) => b.productCount - a.productCount || a.brand.localeCompare(b.brand));
}

// ------------------------------------------------------------------ product page extras

/** Top materials that co-occur with this one in the same orders; padded with same-category popular items. */
export async function frequentlyBoughtTogether(materialId: string, categoryId: string, city?: string, limit = 6) {
  const orders = await prisma.orderItem.findMany({ where: { materialId, order: { status: { not: "CANCELLED" } } }, select: { orderId: true }, distinct: ["orderId"], take: 500 });
  let ids: string[] = [];
  if (orders.length) {
    const grouped = await prisma.orderItem.groupBy({
      by: ["materialId"],
      where: { orderId: { in: orders.map((o) => o.orderId) }, materialId: { not: null, notIn: [materialId] }, material: { active: true } },
      _count: { _all: true },
      orderBy: { _count: { materialId: "desc" } },
      take: limit,
    });
    ids = grouped.map((g) => g.materialId!).filter(Boolean);
  }
  const rows = ids.length ? await prisma.material.findMany({ where: { id: { in: ids }, active: true }, include: productInclude }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: ProductRow[] = ids.map((id) => byId.get(id)).filter((r): r is ProductRow => Boolean(r));
  if (ordered.length < limit) {
    const fill = await prisma.material.findMany({ where: { active: true, categoryId, id: { notIn: [materialId, ...ids] } }, include: productInclude, orderBy: { popularity: "desc" }, take: limit - ordered.length });
    ordered.push(...fill);
  }
  return withEnrichment(ordered, city);
}

export async function productReviewSummary(materialId: string): Promise<ReviewSummary> {
  const grouped = await prisma.productReview.groupBy({ by: ["rating"], where: { materialId, hidden: false }, _count: { _all: true } });
  const ratings: number[] = [];
  for (const g of grouped) for (let i = 0; i < g._count._all; i++) ratings.push(g.rating);
  return summarizeRatings(ratings);
}

/** Recomputes Material.ratingAvg / ratingCount from visible reviews (call after create/edit/hide/delete). */
export async function recomputeMaterialRating(materialId: string) {
  const agg = await prisma.productReview.aggregate({ where: { materialId, hidden: false }, _avg: { rating: true }, _count: { _all: true } });
  await prisma.material.update({ where: { id: materialId }, data: { ratingAvg: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0, ratingCount: agg._count._all } });
}

export const RECENTLY_VIEWED_LIMIT = 50;

/** Upserts a view and trims the user's history to the most recent 50. Never throws. */
export async function recordRecentlyViewed(userId: string, materialId: string) {
  try {
    await prisma.recentlyViewed.upsert({ where: { userId_materialId: { userId, materialId } }, create: { userId, materialId }, update: { viewedAt: new Date() } });
    const overflow = await prisma.recentlyViewed.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, skip: RECENTLY_VIEWED_LIMIT, select: { id: true } });
    if (overflow.length) await prisma.recentlyViewed.deleteMany({ where: { id: { in: overflow.map((o) => o.id) } } });
  } catch (err) {
    console.warn("[recently-viewed] failed", (err as Error).message);
  }
}

export async function recentlyViewedProducts(userId: string, city?: string, take = 24) {
  const rows = await prisma.recentlyViewed.findMany({ where: { userId, material: { active: true } }, include: { material: { include: productInclude } }, orderBy: { viewedAt: "desc" }, take });
  const enriched = await withEnrichment(rows.map((r) => r.material), city);
  return enriched.map((m, i) => ({ ...m, viewedAt: rows[i].viewedAt }));
}

/** Logged-in: popular items from the categories the user browsed recently (excluding what they saw). Public: popular. */
export async function recommendations(userId: string | undefined, city?: string, take = 12) {
  if (userId) {
    const recent = await prisma.recentlyViewed.findMany({ where: { userId }, include: { material: { select: { id: true, categoryId: true } } }, orderBy: { viewedAt: "desc" }, take: 20 });
    if (recent.length) {
      const weight = new Map<string, number>();
      recent.forEach((r, i) => weight.set(r.material.categoryId, (weight.get(r.material.categoryId) ?? 0) + (20 - i)));
      const categoryIds = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
      const seen = recent.map((r) => r.materialId);
      const picks = await products({ categoryId: { in: categoryIds }, id: { notIn: seen } }, [{ featured: "desc" }, { popularity: "desc" }], take, city);
      if (picks.length >= Math.min(4, take)) return { basis: "recently_viewed" as const, items: picks };
      const fill = await products({ id: { notIn: [...seen, ...picks.map((p) => p.id)] } }, { popularity: "desc" }, take - picks.length, city);
      return { basis: "recently_viewed" as const, items: [...picks, ...fill] };
    }
  }
  return { basis: "popular" as const, items: await products({}, [{ featured: "desc" }, { popularity: "desc" }], take, city) };
}

// ------------------------------------------------------------------ price alerts

/**
 * Checks every active alert against the current best effective price / stock (per requested city)
 * and notifies the owner in-app + push (SYSTEM). Triggered alerts are deactivated. Scheduled by the app.
 */
export async function runPriceAlerts(now: Date = new Date()): Promise<{ checked: number; triggered: number }> {
  const alerts = await prisma.priceAlert.findMany({ where: { active: true, material: { active: true } }, include: { material: { select: { id: true, name: true, unit: true } } } });
  if (!alerts.length) return { checked: 0, triggered: 0 };
  const byCity = new Map<string, typeof alerts>();
  for (const a of alerts) byCity.set(a.city ?? "", [...(byCity.get(a.city ?? "") ?? []), a]);
  let triggered = 0;
  for (const [city, group] of byCity) {
    const enrich = await enrichMaterials([...new Set(group.map((a) => a.materialId))], city || undefined);
    for (const a of group) {
      const e = enrich.get(a.materialId) ?? emptyEnrichment;
      const best = e.bestOffer;
      const target = a.targetPrice === null ? null : Number(a.targetPrice);
      const priceHit = target !== null && best !== null && e.inStock && best.effectivePrice <= target;
      const stockHit = a.notifyBackInStock && e.inStock && best !== null;
      if (!priceHit && !stockHit) continue;
      await prisma.priceAlert.update({ where: { id: a.id }, data: { active: false, triggeredAt: now } });
      const price = best!.effectivePrice.toLocaleString("en-US");
      await notify({
        userIds: [a.userId],
        type: "SYSTEM",
        title: priceHit ? `Price drop: ${a.material.name}` : `Back in stock: ${a.material.name}`,
        body: priceHit
          ? `Now SAR ${price} / ${a.material.unit} from ${best!.companyName}${city ? ` in ${city}` : ""} (your target: SAR ${target!.toLocaleString("en-US")}).`
          : `${a.material.name} is available again from ${best!.companyName} at SAR ${price} / ${a.material.unit}.`,
        link: `/shop/products/${a.materialId}`,
        email: true,
      });
      triggered += 1;
    }
  }
  return { checked: alerts.length, triggered };
}
