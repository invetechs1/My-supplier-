import { Router } from "express";
import { z } from "zod";
import { httpUrl } from "../lib/security";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { serialize } from "../lib/serialize";
import { importCatalog, runFeed, type ImportRow } from "../services/catalogImport";
import { HttpError } from "../lib/errors";

const router = Router();
router.use("/admin", requireAuth("ADMIN"));

const rowSchema = z.object({
  sku: z.string().optional(), name: z.string().min(2), nameAr: z.string().optional(), category: z.string().min(2), unit: z.string().min(1),
  brand: z.string().optional(), description: z.string().optional(), imageUrl: httpUrl.optional(), price: z.coerce.number().positive(),
  city: z.string().min(2), stock: z.coerce.number().int().nonnegative().optional(), minQty: z.coerce.number().positive().optional(),
  leadTimeDays: z.coerce.number().int().min(0).optional(), tags: z.array(z.string()).optional(),
});

router.get("/admin/feeds", asyncHandler(async (_req, res) => res.json(serialize(await prisma.feed.findMany({ orderBy: { createdAt: "desc" } })))));

router.post("/admin/feeds", asyncHandler(async (req, res) => {
  const data = z.object({ name: z.string().min(2), url: httpUrl, format: z.enum(["json", "csv", "html"]).default("json"), enabled: z.boolean().default(true), companyId: z.string().nullable().optional(), city: z.string().nullable().optional(), autoPublish: z.boolean().default(false) }).parse(req.body);
  res.status(201).json(serialize(await prisma.feed.create({ data })));
}));

router.post("/admin/feeds/:id/run", asyncHandler(async (req, res) => {
  try {
    res.json(await runFeed(req.params.id, req.user!.id));
  } catch (e) {
    throw new HttpError(502, `Feed run failed: ${(e as Error).message}`);
  }
}));

router.post("/admin/feeds/import", asyncHandler(async (req, res) => {
  const { sourceName, items } = z.object({ sourceName: z.string().min(2), items: z.array(rowSchema).min(1).max(5000) }).parse(req.body);
  res.json(await importCatalog(items as ImportRow[], { companyId: null, sourceName, materialSource: "FEED" }));
}));

router.delete("/admin/feeds/:id", asyncHandler(async (req, res) => {
  await prisma.feed.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
