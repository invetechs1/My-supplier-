import { Prisma, type MaterialSource } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { snapshotHistory } from "./catalog";

export interface ImportRow {
  sku?: string;
  name: string;
  nameAr?: string;
  category: string; // slug or name
  unit: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  price: number;
  city: string;
  stock?: number;
  minQty?: number;
  leadTimeDays?: number;
  tags?: string[];
}

export interface ImportResult {
  created: number;
  updated: number;
  listings: number;
  errors: string[];
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

/**
 * Upserts materials + offers from any source: supplier catalogue uploads, admin feeds, scrapers.
 * - companyId set   -> SUPPLIER listings for that company (with stock)
 * - companyId null  -> MARKET listings keyed by sourceName
 */
export async function importCatalog(rows: ImportRow[], opts: { companyId?: string | null; sourceName: string; materialSource: MaterialSource }): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, listings: 0, errors: [] };
  const categories = await prisma.category.findMany();
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const touched = new Set<string>();

  for (const [i, row] of rows.entries()) {
    try {
      if (!row.name || !row.unit || !row.city || !(row.price > 0)) throw new Error("name, unit, city and a positive price are required");
      const category = catBySlug.get(row.category) ?? catByName.get(String(row.category).toLowerCase()) ?? catBySlug.get(slugify(row.category));
      if (!category) throw new Error(`unknown category "${row.category}"`);
      const sku = (row.sku && row.sku.trim()) || `${opts.sourceName.slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "")}-${slugify(row.name).toUpperCase().slice(0, 40)}`;

      let material = await prisma.material.findUnique({ where: { sku } });
      if (!material && !row.sku) {
        material = await prisma.material.findFirst({ where: { name: { equals: row.name, mode: "insensitive" }, categoryId: category.id } });
      }
      const data = {
        name: row.name, nameAr: row.nameAr ?? material?.nameAr ?? row.name, unit: row.unit, categoryId: category.id,
        brand: row.brand ?? material?.brand, description: row.description ?? material?.description, imageUrl: row.imageUrl ?? material?.imageUrl,
        tags: row.tags ?? material?.tags ?? [],
      };
      if (material) {
        material = await prisma.material.update({ where: { id: material.id }, data: { ...data, active: true } });
        result.updated++;
      } else {
        material = await prisma.material.create({ data: { ...data, sku, source: opts.materialSource } });
        result.created++;
      }

      const listingData = {
        price: new Prisma.Decimal(row.price), minQty: row.minQty ?? 1, leadTimeDays: row.leadTimeDays ?? 3,
        stock: row.stock ?? null, validUntil: new Date(Date.now() + 90 * 86400000),
      };
      const existing = await prisma.priceListing.findFirst({
        where: opts.companyId
          ? { materialId: material.id, companyId: opts.companyId, city: row.city, source: "SUPPLIER" }
          : { materialId: material.id, companyId: null, city: row.city, sourceName: opts.sourceName },
      });
      if (existing) await prisma.priceListing.update({ where: { id: existing.id }, data: listingData });
      else
        await prisma.priceListing.create({
          data: {
            ...listingData, materialId: material.id, city: row.city,
            companyId: opts.companyId ?? null, source: opts.companyId ? "SUPPLIER" : "MARKET", sourceName: opts.companyId ? null : opts.sourceName,
          },
        });
      result.listings++;
      touched.add(material.id);
    } catch (e) {
      result.errors.push(`row ${i + 1} (${row.name ?? "?"}): ${(e as Error).message}`);
    }
  }
  await snapshotHistory([...touched]);
  return result;
}

/** Parses CSV text with a header row into import rows (supports quoted fields). */
export function parseCsvRows(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const alias: Record<string, keyof ImportRow> = {
    sku: "sku", name: "name", title: "name", namear: "nameAr", category: "category", categoryslug: "category", unit: "unit", uom: "unit",
    brand: "brand", description: "description", imageurl: "imageUrl", image: "imageUrl", price: "price", city: "city", stock: "stock", qty: "stock",
    minqty: "minQty", leadtimedays: "leadTimeDays", leadtime: "leadTimeDays",
  };
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const key = alias[h];
      if (!key || cells[i] === undefined || cells[i] === "") return;
      row[key] = ["price", "stock", "minQty", "leadTimeDays"].includes(key) ? Number(cells[i]) : cells[i];
    });
    return row as unknown as ImportRow;
  });
}

/** Fetches a feed URL (JSON array or CSV) and imports it as MARKET listings + FEED materials. */
export async function runFeed(feedId: string): Promise<ImportResult> {
  const feed = await prisma.feed.findUniqueOrThrow({ where: { id: feedId } });
  try {
    const resp = await fetch(feed.url, { headers: { accept: "application/json, text/csv;q=0.9, */*;q=0.5" }, signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    let rows: ImportRow[];
    if (feed.format === "csv") rows = parseCsvRows(text);
    else {
      const json = JSON.parse(text) as unknown;
      const arr = Array.isArray(json) ? json : (json as { items?: unknown[]; data?: unknown[]; products?: unknown[] }).items ?? (json as { data?: unknown[] }).data ?? (json as { products?: unknown[] }).products;
      if (!Array.isArray(arr)) throw new Error("JSON feed must be an array or contain items/data/products");
      rows = arr as ImportRow[];
    }
    const result = await importCatalog(rows, { companyId: null, sourceName: feed.name, materialSource: "FEED" });
    await prisma.feed.update({ where: { id: feed.id }, data: { lastRunAt: new Date(), lastStatus: result.errors.length ? `ok with ${result.errors.length} error(s)` : "ok", lastItemCount: result.listings } });
    return result;
  } catch (e) {
    await prisma.feed.update({ where: { id: feed.id }, data: { lastRunAt: new Date(), lastStatus: `failed: ${(e as Error).message}` } });
    throw e;
  }
}

export async function runAllFeeds() {
  const feeds = await prisma.feed.findMany({ where: { enabled: true } });
  for (const f of feeds) await runFeed(f.id).catch((e) => console.error(`feed ${f.name} failed`, e));
  return feeds.length;
}
