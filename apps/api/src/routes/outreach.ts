import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { layout, mailEnabled, sendMail } from "../services/mailer";
import { importCatalog, type ImportRow } from "../services/catalogImport";
import { snapshotHistory } from "../services/catalog";

const router = Router();
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function outreachSuppliers(staleDays = 14, q?: string) {
  const companies = await prisma.company.findMany({
    where: { type: "SUPPLIER", ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    include: {
      users: { where: { active: true }, select: { email: true, phone: true }, take: 1 },
      _count: { select: { listings: true } },
      updateRequests: { where: { completedAt: null, expiresAt: { gt: new Date() } }, orderBy: { sentAt: "desc" }, take: 1 },
    },
  });
  const latest = await prisma.priceListing.groupBy({ by: ["companyId"], where: { companyId: { in: companies.map((c) => c.id) } }, _max: { updatedAt: true } });
  const latestBy = new Map(latest.map((l) => [l.companyId, l._max.updatedAt]));
  const now = Date.now();
  return companies
    .map((c) => {
      const { users, _count, updateRequests, ...company } = c;
      const last = latestBy.get(c.id) ?? null;
      const staleDaysActual = last ? Math.floor((now - last.getTime()) / 86400000) : null;
      const pr = updateRequests[0];
      return {
        company, contactEmail: users[0]?.email ?? null, contactPhone: c.phone ?? users[0]?.phone ?? null,
        listingCount: _count.listings, lastPriceUpdate: last, staleDays: staleDaysActual,
        pendingRequest: pr ? { id: pr.id, channel: pr.channel, sentAt: pr.sentAt, expiresAt: pr.expiresAt } : null,
      };
    })
    .filter((s) => s.staleDays === null || s.staleDays >= staleDays)
    .sort((a, b) => (b.staleDays ?? 9999) - (a.staleDays ?? 9999));
}

export async function createUpdateRequest(companyId: string, channel: "EMAIL" | "WHATSAPP" | "LINK", createdById?: string, message?: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { users: { where: { active: true }, take: 1 } } });
  const token = crypto.randomBytes(24).toString("hex");
  await prisma.priceUpdateRequest.create({ data: { companyId, tokenHash: hash(token), channel, createdById, expiresAt: new Date(Date.now() + 14 * 86400000) } });
  const link = `${env.webUrl}/update-prices/${token}`;
  const text = message ?? `Hello ${company.name}, please update your prices on MySupplier (takes 2 minutes, no login): ${link}`;
  const phone = (company.phone ?? company.users[0]?.phone ?? "").replace(/[^\d]/g, "");
  const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;
  let emailed = false;
  const email = company.users[0]?.email;
  if (channel === "EMAIL" && email && mailEnabled) {
    await sendMail(email, "Please update your prices on MySupplier", layout("Update your prices", `<p>Hello ${company.name},</p><p>Contractors are searching for your products right now. Keep your prices current so you appear in comparisons, BOQ pricing and the shop.</p><p>This link needs no login and takes about 2 minutes.</p>`, { label: "Update prices", url: link }), text);
    emailed = true;
  }
  return { companyId, companyName: company.name, link, whatsappUrl, emailed };
}

router.get(
  "/admin/outreach",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { staleDays, q } = z.object({ staleDays: z.coerce.number().int().min(0).default(14), q: z.string().optional() }).parse(req.query);
    res.json(serialize(await outreachSuppliers(staleDays, q)));
  }),
);

router.post(
  "/admin/outreach/requests",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { companyIds, channel, message } = z.object({ companyIds: z.array(z.string()).min(1).max(200), channel: z.enum(["EMAIL", "WHATSAPP", "LINK"]), message: z.string().optional() }).parse(req.body);
    const results = [];
    for (const id of companyIds) results.push(await createUpdateRequest(id, channel, req.user!.id, message));
    res.json(results);
  }),
);

async function requestByToken(token: string) {
  const r = await prisma.priceUpdateRequest.findUnique({ where: { tokenHash: hash(token) }, include: { company: true } });
  if (!r) throw notFound("This link is invalid");
  if (r.expiresAt.getTime() < Date.now()) throw badRequest("This link has expired. Ask MySupplier for a new one.");
  return r;
}

router.get(
  "/price-update/:token",
  asyncHandler(async (req, res) => {
    const r = await requestByToken(req.params.token);
    const listings = await prisma.priceListing.findMany({ where: { companyId: r.companyId }, include: { material: { include: { category: true } } }, orderBy: { material: { name: "asc" } } });
    const { id, name, nameAr, city, verified } = r.company;
    res.json(serialize({ company: { id, name, nameAr, city, verified }, expiresAt: r.expiresAt, completedAt: r.completedAt, listings }));
  }),
);

router.post(
  "/price-update/:token",
  asyncHandler(async (req, res) => {
    const r = await requestByToken(req.params.token);
    const body = z.object({
      items: z.array(z.object({ listingId: z.string(), price: z.coerce.number().positive(), stock: z.coerce.number().int().nonnegative().nullable().optional(), leadTimeDays: z.coerce.number().int().min(0).optional() })).default([]),
      newItems: z.array(z.object({ name: z.string().min(2), nameAr: z.string().optional(), categorySlug: z.string(), unit: z.string(), brand: z.string().optional(), price: z.coerce.number().positive(), city: z.string().min(2), stock: z.coerce.number().int().nonnegative().optional() })).optional(),
      contactName: z.string().optional(),
    }).parse(req.body);
    let updated = 0;
    const touched = new Set<string>();
    for (const item of body.items) {
      const listing = await prisma.priceListing.findFirst({ where: { id: item.listingId, companyId: r.companyId } });
      if (!listing) continue;
      await prisma.priceListing.update({ where: { id: listing.id }, data: { price: item.price, stock: item.stock === undefined ? undefined : item.stock, leadTimeDays: item.leadTimeDays, validUntil: new Date(Date.now() + 90 * 86400000) } });
      touched.add(listing.materialId);
      updated++;
    }
    let added = 0;
    if (body.newItems?.length) {
      const rows: ImportRow[] = body.newItems.map(({ categorySlug, ...rest }) => ({ ...rest, category: categorySlug }));
      const result = await importCatalog(rows, { companyId: r.companyId, sourceName: r.company.name, materialSource: "SUPPLIER" });
      added = result.listings;
    }
    await snapshotHistory([...touched]);
    const done = await prisma.priceUpdateRequest.update({ where: { id: r.id }, data: { completedAt: new Date(), updatedRows: updated + added } });
    res.json({ updated, added, completedAt: done.completedAt });
  }),
);

export default router;
