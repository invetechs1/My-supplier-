/**
 * Admin demand intelligence: which products buyers ask for that we do not list (or list without
 * suppliers), ranked by real demand, plus the launch list ("3 fresh offers per SKU" readiness).
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { audit } from "../lib/audit";
import { demandOverview, gapWhere, gapTypeFor, launchList, refreshDemandCoverage, sendDemandDigestIfDue, shapeCluster } from "../services/demand";

const router = Router();
const admin = requireAuth("ADMIN");

router.get("/admin/demand/overview", admin, asyncHandler(async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
  res.json(serialize(await demandOverview(days)));
}));

const gapQuery = z.object({
  gapType: z.enum(["OPEN", "LISTED", "UNLISTED", "NO_OFFERS", "THIN_COVERAGE", "COVERED"]).optional(),
  status: z.enum(["NEW", "PLANNED", "ADDED", "IGNORED"]).optional(),
  source: z.enum(["BOQ", "RFQ", "SEARCH"]).optional(),
  city: z.string().optional(),
  q: z.string().trim().max(120).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(["score", "requests", "recent", "buyers"]).default("score"),
});

router.get("/admin/demand/gaps", admin, asyncHandler(async (req, res) => {
  const qy = gapQuery.parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const where = gapWhere(qy);
  // Score needs the buyer count (JSON), so rank in memory over a bounded window, then page.
  const rows = await prisma.demandCluster.findMany({ where, include: { material: { select: { id: true, sku: true, name: true, unit: true, category: { select: { id: true, name: true } } } } }, orderBy: [{ requests: "desc" }], take: 2000 });
  const shaped = rows.map(shapeCluster);
  shaped.sort((a, b) => qy.sort === "requests" ? b.requests - a.requests : qy.sort === "recent" ? +new Date(b.lastRequestedAt) - +new Date(a.lastRequestedAt) : qy.sort === "buyers" ? b.buyers - a.buyers : b.score - a.score);
  res.json(paged(serialize(shaped.slice(skip, skip + take)), page, pageSize, shaped.length));
}));

router.get("/admin/demand/gaps/:id", admin, asyncHandler(async (req, res) => {
  const cluster = await prisma.demandCluster.findUnique({ where: { id: req.params.id }, include: { material: { select: { id: true, sku: true, name: true, unit: true, category: { select: { id: true, name: true } } } } } });
  if (!cluster) throw notFound("Demand cluster not found");
  const signals = await prisma.demandSignal.findMany({ where: { clusterId: cluster.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const userIds = [...new Set(signals.map((s) => s.userId).filter((x): x is string => Boolean(x)))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, company: { select: { name: true } } } }) : [];
  const byUser = new Map(users.map((u) => [u.id, { name: u.name, companyName: u.company?.name ?? null }]));
  res.json(serialize({ ...shapeCluster(cluster), signals: signals.map((s) => ({ ...s, buyer: s.userId ? byUser.get(s.userId) ?? null : null })) }));
}));

router.patch("/admin/demand/gaps/:id", admin, asyncHandler(async (req, res) => {
  const body = z.object({ status: z.enum(["NEW", "PLANNED", "ADDED", "IGNORED"]).optional(), note: z.string().max(500).nullable().optional(), materialId: z.string().nullable().optional() }).parse(req.body);
  const cluster = await prisma.demandCluster.findUnique({ where: { id: req.params.id } });
  if (!cluster) throw notFound("Demand cluster not found");
  let gapType = cluster.gapType;
  let offerCount = cluster.offerCount;
  if (body.materialId) {
    const material = await prisma.material.findUnique({ where: { id: body.materialId }, select: { id: true } });
    if (!material) throw badRequest("Material not found");
    offerCount = await prisma.priceListing.count({ where: { materialId: material.id, source: "SUPPLIER", active: true } });
    gapType = gapTypeFor(offerCount);
    await prisma.demandSignal.updateMany({ where: { clusterId: cluster.id, materialId: null }, data: { materialId: material.id } });
  }
  const updated = await prisma.demandCluster.update({ where: { id: cluster.id }, data: { ...(body.status ? { status: body.status } : {}), ...(body.note !== undefined ? { note: body.note } : {}), ...(body.materialId ? { materialId: body.materialId, gapType, offerCount, status: body.status ?? "ADDED" } : {}) }, include: { material: { select: { id: true, sku: true, name: true, unit: true, category: { select: { id: true, name: true } } } } } });
  await audit(req, "demand.update", "DemandCluster", cluster.id, { ...body });
  res.json(serialize(shapeCluster(updated)));
}));

/** One-click: create the catalogue product buyers asked for, link the cluster and its signals, mark ADDED. */
router.post("/admin/demand/gaps/:id/material", admin, asyncHandler(async (req, res) => {
  const body = z.object({
    sku: z.string().min(2).max(40), name: z.string().min(2).max(140), nameAr: z.string().min(1).max(140), unit: z.string().min(1).max(20), categoryId: z.string(),
    brand: z.string().max(80).optional().nullable(), description: z.string().max(2000).optional().nullable(),
  }).parse(req.body);
  const cluster = await prisma.demandCluster.findUnique({ where: { id: req.params.id } });
  if (!cluster) throw notFound("Demand cluster not found");
  if (cluster.materialId) throw conflict("This request is already linked to a product");
  const category = await prisma.category.findUnique({ where: { id: body.categoryId }, select: { id: true } });
  if (!category) throw badRequest("Category not found");
  const material = await prisma.material.create({ data: { ...body, popularity: Math.min(1000, cluster.requests * 10) }, include: { category: true } });
  await prisma.$transaction([
    prisma.demandSignal.updateMany({ where: { clusterId: cluster.id }, data: { materialId: material.id } }),
    prisma.demandCluster.update({ where: { id: cluster.id }, data: { materialId: material.id, status: "ADDED", gapType: "NO_OFFERS", offerCount: 0, label: material.name, unit: material.unit } }),
  ]);
  await audit(req, "demand.material_created", "Material", material.id, { clusterId: cluster.id, requests: cluster.requests });
  res.status(201).json(serialize(material));
}));

router.get("/admin/demand/launch-list", admin, asyncHandler(async (req, res) => {
  const qy = z.object({ city: z.string().optional(), size: z.coerce.number().int().min(10).max(1000).default(200), freshDays: z.coerce.number().int().min(1).max(90).default(14), status: z.enum(["READY", "NEEDS_SUPPLIERS", "NO_OFFERS"]).optional() }).parse(req.query);
  const list = await launchList(qy);
  res.json(serialize({ ...list, items: qy.status ? list.items.filter((i) => i.status === qy.status) : list.items }));
}));

router.get("/admin/demand/launch-list.csv", admin, asyncHandler(async (req, res) => {
  const qy = z.object({ city: z.string().optional(), size: z.coerce.number().int().min(10).max(1000).default(200) }).parse(req.query);
  const list = await launchList(qy);
  const esc = (v: unknown) => { const s = String(v ?? ""); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const header = ["rank", "sku", "name", "nameAr", "unit", "category", "score", "requests", "buyers", "offers", "freshOffers", "suppliers", "status", "offersNeeded"];
  const lines = list.items.map((i, idx) => [idx + 1, i.sku, i.name, i.nameAr, i.unit, i.category.name, i.score, i.requests, i.buyers, i.offers, i.freshOffers, i.suppliers, i.status, i.needed].map(esc).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="launch-list-${qy.city ?? "all"}.csv"`);
  res.send([header.join(","), ...lines].join("\n"));
}));

/** Manual trigger for the maintenance jobs (they also run hourly). */
router.post("/admin/demand/refresh", admin, asyncHandler(async (_req, res) => {
  const coverage = await refreshDemandCoverage();
  const digest = await sendDemandDigestIfDue();
  res.json({ ...coverage, digest });
}));

export default router;
