import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { ACCEPTED_TYPES, MAX_FILE_MB, aiConfig } from "../services/ai";
import { createImport, importInclude, publishImport, shapeImport } from "../services/imports";
import { normaliseUnit } from "../services/boq";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = ACCEPTED_TYPES.includes(file.mimetype) || /\.(pdf|xlsx|xls|csv|txt|png|jpe?g|webp)$/i.test(file.originalname);
    if (!ok) return cb(new Error(`Unsupported file type ${file.mimetype}`));
    cb(null, true);
  },
});

router.get("/ai/config", (_req, res) => res.json(aiConfig()));

const createSchema = z.object({
  kind: z.enum(["SUPPLIER_PRICE_LIST", "BUYER_QUOTATION", "WEB_PAGE", "TEXT"]).optional(),
  text: z.string().max(400_000).optional(),
  city: z.string().optional(),
  sourceName: z.string().optional(),
  supplierName: z.string().optional(),
  quotationDate: z.string().optional(),
});

const mimeFromName = (name: string, given: string) => {
  if (given && given !== "application/octet-stream") return given;
  const ext = name.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as Record<string, string>)[ext ?? ""] ?? given;
};

router.post(
  "/imports",
  requireAuth(),
  (req, res, next) => upload.single("file")(req, res, (err) => (err ? next(badRequest((err as Error).message)) : next())),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const user = req.user!;
    const file = req.file;
    if (!file && !body.text?.trim()) throw badRequest("Upload a file or paste text");
    const kind = body.kind ?? (user.role === "SUPPLIER" ? "SUPPLIER_PRICE_LIST" : user.role === "BUYER" ? "BUYER_QUOTATION" : "TEXT");
    if (kind === "SUPPLIER_PRICE_LIST" && user.role === "SUPPLIER" && !user.companyId) throw forbidden("Supplier account has no company");
    if (kind === "BUYER_QUOTATION" && !body.supplierName?.trim()) throw badRequest("supplierName is required for quotations");
    if (user.role === "BUYER" && kind !== "BUYER_QUOTATION") throw forbidden("Buyers can only upload quotations");
    if (user.role === "SUPPLIER" && kind !== "SUPPLIER_PRICE_LIST") throw forbidden("Suppliers can only import their own price lists");
    const company = user.role === "SUPPLIER" && kind === "SUPPLIER_PRICE_LIST" ? await prisma.company.findUnique({ where: { id: user.companyId! } }) : null;

    const imp = await createImport({
      kind, uploadedById: user.id, companyId: company?.id ?? null,
      sourceName: body.sourceName ?? company?.name ?? (kind === "BUYER_QUOTATION" ? `Quotation – ${body.supplierName}` : "Manual import"),
      supplierName: body.supplierName, city: body.city, quotationDate: body.quotationDate ? new Date(body.quotationDate) : undefined,
      fileName: file?.originalname, mimeType: file ? mimeFromName(file.originalname, file.mimetype) : undefined,
      input: { text: body.text, file: file ? { buffer: file.buffer, mimeType: mimeFromName(file.originalname, file.mimetype), fileName: file.originalname } : undefined },
    });
    res.status(imp.status === "FAILED" ? 422 : 201).json(serialize(await shapeImport(imp)));
  }),
);

function scope(user: NonNullable<import("express").Request["user"]>): Prisma.PriceImportWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "SUPPLIER" && user.companyId) return { OR: [{ uploadedById: user.id }, { companyId: user.companyId }] };
  return { uploadedById: user.id };
}

router.get(
  "/imports",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.enum(["PROCESSING", "REVIEW", "PUBLISHED", "FAILED", "REJECTED"]).optional(), kind: z.enum(["SUPPLIER_PRICE_LIST", "BUYER_QUOTATION", "WEB_PAGE", "TEXT"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.PriceImportWhereInput = { ...scope(req.user!), ...(q.status ? { status: q.status } : {}), ...(q.kind ? { kind: q.kind } : {}) };
    const [total, items] = await Promise.all([
      prisma.priceImport.count({ where }),
      prisma.priceImport.findMany({ where, include: { company: true, uploadedBy: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    res.json(paged(serialize(items), page, pageSize, total));
  }),
);

async function ownedImport(id: string, user: NonNullable<import("express").Request["user"]>) {
  const imp = await prisma.priceImport.findFirst({ where: { id, ...scope(user) }, include: importInclude });
  if (!imp) throw notFound("Import not found");
  return imp;
}

router.get("/imports/:id", requireAuth(), asyncHandler(async (req, res) => res.json(serialize(await shapeImport(await ownedImport(req.params.id, req.user!))))));

router.patch(
  "/imports/:id/rows/:rowId",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const imp = await ownedImport(req.params.id, req.user!);
    const row = imp.rows.find((r) => r.id === req.params.rowId);
    if (!row) throw notFound("Row not found");
    const patch = z.object({
      materialId: z.string().nullable().optional(), price: z.coerce.number().positive().nullable().optional(), unit: z.string().optional(),
      city: z.string().nullable().optional(), status: z.enum(["SUGGESTED", "APPROVED", "REJECTED"]).optional(), createMaterial: z.boolean().optional(),
    }).parse(req.body);
    if (patch.materialId) {
      const m = await prisma.material.findUnique({ where: { id: patch.materialId } });
      if (!m) throw notFound("Material not found");
    }
    const updated = await prisma.priceImportRow.update({
      where: { id: row.id },
      data: {
        ...patch, unit: patch.unit ? normaliseUnit(patch.unit) ?? patch.unit : undefined,
        ...(patch.materialId !== undefined ? { confidence: patch.materialId ? 1 : 0, createMaterial: patch.materialId ? false : row.createMaterial } : {}),
      },
      include: { material: { include: { category: true } } },
    });
    res.json(serialize({ ...updated, alternatives: [] }));
  }),
);

router.post(
  "/imports/:id/approve-all",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const imp = await ownedImport(req.params.id, req.user!);
    const { minConfidence } = z.object({ minConfidence: z.coerce.number().min(0).max(1).default(0.8) }).parse(req.body ?? {});
    await prisma.priceImportRow.updateMany({ where: { importId: imp.id, status: "SUGGESTED", materialId: { not: null }, confidence: { gte: minConfidence }, price: { not: null } }, data: { status: "APPROVED" } });
    res.json(serialize(await shapeImport(await ownedImport(imp.id, req.user!))));
  }),
);

router.post(
  "/imports/:id/publish",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const imp = await ownedImport(req.params.id, req.user!);
    if (imp.status === "REJECTED" || imp.status === "FAILED") throw badRequest(`Cannot publish a ${imp.status.toLowerCase()} import`);
    const opts = z.object({ includeSuggested: z.boolean().optional(), minConfidence: z.coerce.number().min(0).max(1).optional() }).parse(req.body ?? {});
    res.json(serialize(await publishImport(imp.id, opts)));
  }),
);

router.post(
  "/imports/:id/reject",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const imp = await ownedImport(req.params.id, req.user!);
    const updated = await prisma.priceImport.update({ where: { id: imp.id }, data: { status: "REJECTED" }, include: importInclude });
    res.json(serialize(await shapeImport(updated)));
  }),
);

export default router;
