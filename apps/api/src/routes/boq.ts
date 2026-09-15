import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { nextReference } from "../lib/reference";
import { activeListingWhere } from "../services/catalog";
import { companyUserIds, notify } from "../services/notifications";
import {
  matchLine, materialTokens, normaliseUnit, optimise, parseBoqText, round2,
  type CatalogueMaterial, type LineForOptimiser, type OfferLike,
} from "../services/boq";

const router = Router();
router.use("/boq", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many BOQ requests, please wait a minute" } }));

const lineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.coerce.number().positive().default(1),
  unit: z.string().optional(),
  materialId: z.string().optional(), // caller can pin a match (after reviewing alternatives)
});

const analyzeSchema = z.object({
  city: z.string().optional(),
  text: z.string().max(50_000).optional(),
  lines: z.array(lineSchema).max(200).optional(),
  verifiedOnly: z.coerce.boolean().optional(),
});

async function loadCatalogue(): Promise<CatalogueMaterial[]> {
  const rows = await prisma.material.findMany({ where: { active: true }, include: { category: true } });
  return rows.map((m) => ({
    id: m.id, sku: m.sku, name: m.name, nameAr: m.nameAr, unit: m.unit, brand: m.brand,
    categoryName: m.category.name, specs: (m.specs as Record<string, unknown> | null) ?? null,
  }));
}

/** Parse pasted BOQ text into structured lines (no matching). */
router.post(
  "/boq/parse",
  asyncHandler(async (req, res) => {
    const { text } = z.object({ text: z.string().min(1).max(50_000) }).parse(req.body);
    res.json({ lines: parseBoqText(text) });
  }),
);

/**
 * Full BOQ research: match each line to the catalogue, pull every supplier's price,
 * and compute cheapest basket / best single supplier / per-supplier breakdown.
 * Public: guests can use it without an account.
 */
router.post(
  "/boq/analyze",
  asyncHandler(async (req, res) => {
    const body = analyzeSchema.parse(req.body);
    const inputLines = body.lines?.length ? body.lines : body.text ? parseBoqText(body.text).map((l) => ({ ...l, materialId: undefined })) : [];
    if (!inputLines.length) throw badRequest("Provide `text` or `lines`");

    const catalogue = await loadCatalogue();
    const tokenCache = new Map(catalogue.map((m) => [m.id, materialTokens(m)]));

    const matched = inputLines.map((line, index) => {
      const candidates = line.materialId
        ? [{ material: catalogue.find((m) => m.id === line.materialId)!, score: 1 }].filter((c) => c.material)
        : matchLine(line.description, catalogue, tokenCache, 4);
      const best = candidates[0] ?? null;
      return { index, input: line, best, alternatives: candidates.slice(1), unit: normaliseUnit(line.unit) ?? best?.material.unit ?? line.unit ?? "piece" };
    });

    const materialIds = [...new Set(matched.map((m) => m.best?.material.id).filter((x): x is string => Boolean(x)))];
    const listings = await prisma.priceListing.findMany({
      where: {
        materialId: { in: materialIds },
        ...activeListingWhere(body.city),
        ...(body.verifiedOnly ? { company: { verified: true } } : {}),
      },
      include: { company: true },
      orderBy: { price: "asc" },
    });

    const toOffer = (l: (typeof listings)[number]): OfferLike => ({
      listingId: l.id,
      supplierId: l.companyId ?? `market:${l.sourceName}`,
      supplierName: l.company?.name ?? `${l.sourceName} (market reference)`,
      verified: l.company?.verified ?? false,
      city: l.city,
      price: Number(l.price),
      minQty: l.minQty,
      leadTimeDays: l.leadTimeDays,
      source: l.source,
    });

    const optimiserLines: LineForOptimiser[] = matched.map((m) => ({
      index: m.index,
      quantity: m.input.quantity,
      offers: m.best ? listings.filter((l) => l.materialId === m.best!.material.id).map(toOffer) : [],
    }));
    const result = optimise(optimiserLines);

    const lines = matched.map((m) => {
      const offers = optimiserLines[m.index].offers;
      const supplierOffers = offers.filter((o) => o.source === "SUPPLIER");
      const best = offers[0] ?? null;
      const avg = offers.length ? round2(offers.reduce((s, o) => s + o.price, 0) / offers.length) : null;
      return {
        index: m.index,
        description: m.input.description,
        quantity: m.input.quantity,
        unit: m.unit,
        match: m.best ? { material: m.best.material, confidence: m.best.score } : null,
        alternatives: m.alternatives.map((a) => ({ material: a.material, confidence: a.score })),
        unitMismatch: Boolean(m.best && normaliseUnit(m.input.unit) && normaliseUnit(m.input.unit) !== m.best.material.unit),
        bestOffer: best ? { ...best, lineTotal: round2(best.price * m.input.quantity) } : null,
        avgUnitPrice: avg,
        offerCount: offers.length,
        supplierCount: new Set(supplierOffers.map((o) => o.supplierId)).size,
        offers: offers.slice(0, 15).map((o) => ({ ...o, lineTotal: round2(o.price * m.input.quantity) })),
      };
    });

    res.json(
      serialize({
        city: body.city ?? null,
        generatedAt: new Date().toISOString(),
        lineCount: lines.length,
        matchedLines: result.matchedLines,
        unmatchedLines: result.unmatchedLines,
        summary: {
          cheapestTotal: result.cheapestTotal,
          averageTotal: result.averageTotal,
          highestTotal: result.highestTotal,
          savingsVsAverage: result.savingsVsAverage,
          savingsVsHighest: result.savingsVsHighest,
          distinctSuppliersInCheapest: result.distinctSuppliersInCheapest,
          bestSingleSupplier: result.bestSingleSupplier,
        },
        cheapestPerLine: result.cheapestPerLine,
        suppliers: result.suppliers.slice(0, 25),
        lines,
      }),
    );
  }),
);

/** Turn an analysed BOQ into an RFQ so registered suppliers can bid (requires login). */
router.post(
  "/boq/to-rfq",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(3),
        deliveryCity: z.string().min(2),
        deliveryAddress: z.string().optional(),
        deliveryDate: z.coerce.date().optional(),
        closesInDays: z.coerce.number().int().min(1).max(60).default(7),
        notes: z.string().optional(),
        lines: z.array(lineSchema).min(1).max(300),
      })
      .parse(req.body);
    const closesAt = new Date(Date.now() + body.closesInDays * 86400000);
    const reference = await nextReference("RFQ");
    const rfq = await prisma.rfq.create({
      data: {
        reference, buyerId: req.user!.id, title: body.title, deliveryCity: body.deliveryCity, deliveryAddress: body.deliveryAddress,
        deliveryDate: body.deliveryDate, closesAt, notes: body.notes ?? "Created from BOQ analysis",
        items: { create: body.lines.map((l) => ({ materialId: l.materialId, description: l.description, quantity: l.quantity, unit: normaliseUnit(l.unit) ?? l.unit ?? "piece" })) },
      },
      include: { items: { include: { material: true } } },
    });
    const materialIds = body.lines.map((l) => l.materialId).filter((x): x is string => Boolean(x));
    const suppliers = await prisma.company.findMany({
      where: { type: "SUPPLIER", OR: [{ city: body.deliveryCity }, ...(materialIds.length ? [{ listings: { some: { materialId: { in: materialIds } } } }] : [])] },
      select: { id: true },
    });
    await notify({
      userIds: await companyUserIds(suppliers.map((s) => s.id)),
      type: "NEW_RFQ",
      title: `New BOQ RFQ in ${body.deliveryCity}: ${body.title}`,
      body: `${body.lines.length} line(s). Bidding closes in ${body.closesInDays} days.`,
      link: `/supplier/marketplace/${rfq.id}`,
    });
    res.status(201).json(serialize({ ...rfq, bidCount: 0 }));
  }),
);

export default router;
