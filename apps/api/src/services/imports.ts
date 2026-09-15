import { Prisma, type ImportKind, type MaterialSource } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { extractPrices, type ExtractInput, type Extraction } from "./ai";
import { matchLine, materialTokens, normaliseUnit, type CatalogueMaterial } from "./boq";
import { snapshotHistory } from "./catalog";
import { round2 } from "./pricing";

export const importInclude = {
  company: true,
  uploadedBy: { select: { id: true, name: true, role: true } },
  rows: { include: { material: { include: { category: true } } }, orderBy: { position: "asc" } },
} satisfies Prisma.PriceImportInclude;

async function loadCatalogue(): Promise<CatalogueMaterial[]> {
  const rows = await prisma.material.findMany({ where: { active: true }, include: { category: true } });
  return rows.map((m) => ({ id: m.id, sku: m.sku, name: m.name, nameAr: m.nameAr, unit: m.unit, brand: m.brand, categoryName: m.category.name, specs: (m.specs as Record<string, unknown> | null) ?? null }));
}

export interface CreateImportArgs {
  kind: ImportKind;
  uploadedById: string;
  companyId?: string | null;
  sourceName?: string;
  supplierName?: string;
  city?: string;
  quotationDate?: Date;
  fileName?: string;
  mimeType?: string;
  feedId?: string;
  input: ExtractInput;
}

/** Runs extraction + catalogue matching and stores the import with its rows for review. */
export async function createImport(args: CreateImportArgs) {
  const record = await prisma.priceImport.create({
    data: {
      kind: args.kind, uploadedById: args.uploadedById, companyId: args.companyId ?? null,
      sourceName: args.sourceName ?? args.supplierName ?? "Import", supplierName: args.supplierName, city: args.city,
      quotationDate: args.quotationDate, fileName: args.fileName, mimeType: args.mimeType, feedId: args.feedId,
      rawText: args.input.text?.slice(0, 20_000),
    },
  });
  try {
    const { extraction, aiUsed, model } = await extractPrices({ ...args.input, hints: { city: args.city, supplierName: args.supplierName, kind: args.kind } });
    await storeRows(record.id, extraction, args.city, aiUsed, model, args.supplierName);
  } catch (e) {
    await prisma.priceImport.update({ where: { id: record.id }, data: { status: "FAILED", error: (e as Error).message } });
  }
  return prisma.priceImport.findUniqueOrThrow({ where: { id: record.id }, include: importInclude });
}

async function storeRows(importId: string, extraction: Extraction, defaultCity: string | undefined, aiUsed: boolean, model: string | null, supplierNameHint?: string) {
  const catalogue = await loadCatalogue();
  const cache = new Map(catalogue.map((m) => [m.id, materialTokens(m)]));
  const vatFactor = extraction.pricesIncludeVat ? 1 / 1.15 : 1;
  const rows = extraction.rows
    .filter((r) => r.name && r.name.trim().length >= 2)
    .map((r, position) => {
      const candidates = matchLine(`${r.brand ?? ""} ${r.name} ${r.nameAr ?? ""}`, catalogue, cache, 4);
      const best = candidates[0];
      const price = r.price !== null && r.price > 0 ? round2(r.price * vatFactor) : null;
      // Keep the document's unit when we cannot normalise it (e.g. "truck", "carton") so the reviewer sees it,
      // and lower confidence when it differs from the matched material's unit (price per truck != price per m3).
      const unit = normaliseUnit(r.unit) ?? (r.unit?.trim() || best?.material.unit || "piece");
      const unitMismatch = Boolean(best && unit !== best.material.unit);
      const confidence = best ? (unitMismatch ? round2(best.score * 0.7) : best.score) : 0;
      return {
        importId, position,
        rawName: r.name, rawUnit: r.unit, rawPrice: r.price === null ? null : String(r.price), rawCity: r.city, brand: r.brand,
        notes: [r.nameAr, r.quantity ? `qty ${r.quantity}` : null, r.notes].filter(Boolean).join(" · ") || null,
        price, unit,
        city: r.city ?? extraction.city ?? defaultCity ?? null,
        materialId: best && confidence >= 0.5 ? best.material.id : null,
        confidence,
        alternatives: candidates.slice(0, 3).map((c) => ({ materialId: c.material.id, confidence: c.score })) as Prisma.InputJsonValue,
        createMaterial: !best || confidence < 0.5,
      };
    });
  await prisma.priceImportRow.createMany({ data: rows });
  const supplierName = supplierNameHint ?? extraction.supplierName ?? undefined;
  await prisma.priceImport.update({
    where: { id: importId },
    data: {
      status: "REVIEW", aiUsed, model, extractedCount: rows.length,
      supplierName, sourceName: supplierName ? undefined : undefined,
      city: extraction.city ?? defaultCity ?? undefined,
      quotationDate: extraction.documentDate ? new Date(extraction.documentDate) : undefined,
    },
  });
}

/** Expands stored alternative ids into material objects for the API response. */
export async function shapeImport(imp: Prisma.PriceImportGetPayload<{ include: typeof importInclude }>) {
  const altIds = new Set<string>();
  for (const r of imp.rows) for (const a of (r.alternatives as Array<{ materialId: string }> | null) ?? []) altIds.add(a.materialId);
  const mats = altIds.size ? await prisma.material.findMany({ where: { id: { in: [...altIds] } }, include: { category: true } }) : [];
  const byId = new Map(mats.map((m) => [m.id, m]));
  return {
    ...imp,
    rows: imp.rows.map((r) => ({
      ...r,
      alternatives: ((r.alternatives as Array<{ materialId: string; confidence: number }> | null) ?? [])
        .map((a) => ({ material: byId.get(a.materialId), confidence: a.confidence }))
        .filter((a) => a.material),
    })),
  };
}

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9؀-ۿ]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

/** Publishes approved rows as listings (and optionally suggested rows above a confidence). */
export async function publishImport(importId: string, opts: { includeSuggested?: boolean; minConfidence?: number }) {
  const imp = await prisma.priceImport.findUniqueOrThrow({ where: { id: importId }, include: { rows: true, company: true } });
  const min = opts.minConfidence ?? 0.8;
  const eligible = imp.rows.filter((r) => r.status === "APPROVED" || (opts.includeSuggested && r.status === "SUGGESTED" && (r.materialId ? r.confidence >= min : r.createMaterial)));

  // Attribution of the published prices.
  let companyId: string | null = imp.companyId;
  let source: "SUPPLIER" | "MARKET" | "QUOTATION" = "MARKET";
  let sourceName: string | null = imp.sourceName;
  let materialSource: MaterialSource = "FEED";
  if (imp.kind === "SUPPLIER_PRICE_LIST" && companyId) {
    source = "SUPPLIER"; sourceName = null; materialSource = "SUPPLIER";
  } else if (imp.kind === "BUYER_QUOTATION") {
    // Quoted prices are shown under the supplier's *name* but never attributed to a registered company
    // (a buyer must not be able to publish prices on a supplier's storefront).
    source = "QUOTATION";
    companyId = null;
    sourceName = `Quotation – ${imp.supplierName?.trim() || "supplier"}`;
  } else if (companyId) {
    source = "SUPPLIER"; sourceName = null; materialSource = "SUPPLIER";
  }

  let published = 0, skipped = 0, createdMaterials = 0;
  const touched = new Set<string>();
  const fallbackCategory = await prisma.category.findFirst({ orderBy: { name: "asc" } });
  for (const row of eligible) {
    if (row.price === null || !row.city) { skipped++; continue; }
    let materialId = row.materialId;
    if (!materialId) {
      if (!row.createMaterial || !fallbackCategory) { skipped++; continue; }
      const sku = `${imp.kind === "BUYER_QUOTATION" ? "QT" : "IMP"}-${slug(row.rawName)}`;
      const existing = await prisma.material.findUnique({ where: { sku } });
      const mat = existing ?? (await prisma.material.create({ data: { sku, name: row.rawName, nameAr: row.rawName, unit: row.unit, brand: row.brand, categoryId: fallbackCategory.id, source: materialSource, description: row.notes ?? undefined } }));
      if (!existing) createdMaterials++;
      materialId = mat.id;
    }
    const where: Prisma.PriceListingWhereInput = source === "SUPPLIER"
      ? { materialId, companyId, city: row.city, source: "SUPPLIER" }
      : { materialId, companyId: companyId ?? null, city: row.city, sourceName, source };
    const existingListing = await prisma.priceListing.findFirst({ where });
    const data = { price: new Prisma.Decimal(row.price), validUntil: new Date(Date.now() + (source === "QUOTATION" ? 45 : 90) * 86400000) };
    if (existingListing) await prisma.priceListing.update({ where: { id: existingListing.id }, data });
    else await prisma.priceListing.create({ data: { ...data, materialId, city: row.city, companyId: source === "SUPPLIER" ? companyId : companyId ?? null, source, sourceName: source === "SUPPLIER" ? null : sourceName, minQty: 1, leadTimeDays: 3 } });
    await prisma.priceImportRow.update({ where: { id: row.id }, data: { status: "PUBLISHED", materialId } });
    touched.add(materialId);
    published++;
  }
  await snapshotHistory([...touched]);
  const updated = await prisma.priceImport.update({
    where: { id: importId },
    data: { status: published ? "PUBLISHED" : imp.status, publishedCount: { increment: published }, companyId: companyId ?? undefined },
    include: importInclude,
  });
  return { published, skipped, createdMaterials, import: await shapeImport(updated) };
}
