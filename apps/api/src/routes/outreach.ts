import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { escapeHtml, layout, mailEnabled, sendMail } from "../services/mailer";
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

export interface OutreachRequestOptions {
  /** Products buyers asked for that this supplier is invited to price (demand-driven outreach). */
  requestedMaterialIds?: string[];
  requestedCity?: string | null;
  note?: string | null;
}

export async function createUpdateRequest(companyId: string, channel: "EMAIL" | "WHATSAPP" | "LINK", createdById?: string, message?: string, opts: OutreachRequestOptions = {}) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, include: { users: { where: { active: true }, take: 1 } } });
  const requestedIds = [...new Set(opts.requestedMaterialIds ?? [])].slice(0, 50);
  const requested = requestedIds.length ? await prisma.material.findMany({ where: { id: { in: requestedIds } }, select: { id: true, name: true, unit: true } }) : [];
  const token = crypto.randomBytes(24).toString("hex");
  await prisma.priceUpdateRequest.create({ data: { companyId, tokenHash: hash(token), channel, createdById, expiresAt: new Date(Date.now() + 14 * 86400000), requestedMaterialIds: requested.map((m) => m.id), requestedCity: opts.requestedCity ?? null, note: opts.note ?? null } });
  const link = `${env.webUrl}/update-prices/${token}`;
  const where = opts.requestedCity ? ` in ${opts.requestedCity}` : "";
  const productLines = requested.slice(0, 8).map((m) => `• ${m.name} (${m.unit})`).join("\n");
  const text = message ?? (requested.length
    ? `Hello ${company.name}, contractors on MySupplier are asking for these products${where} and we have no price from you yet:\n${productLines}${requested.length > 8 ? `\n…and ${requested.length - 8} more` : ""}\nAdd your prices in 2 minutes, no login: ${link}`
    : `Hello ${company.name}, please update your prices on MySupplier (takes 2 minutes, no login): ${link}`);
  const phone = (company.phone ?? company.users[0]?.phone ?? "").replace(/[^\d]/g, "");
  const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;
  let emailed = false;
  const email = company.users[0]?.email;
  if (channel === "EMAIL" && email && mailEnabled) {
    const intro = requested.length
      ? `<p>Hello ${escapeHtml(company.name)},</p><p>Contractors on MySupplier are asking for the products below${escapeHtml(where)} and we do not have a price from you yet:</p><ul>${requested.map((m) => `<li>${escapeHtml(m.name)} <span style="color:#6b7280">(${escapeHtml(m.unit)})</span></li>`).join("")}</ul><p>Add your prices in about 2 minutes, no login needed. Suppliers with live prices appear in comparisons, BOQ pricing and the shop.</p>`
      : `<p>Hello ${escapeHtml(company.name)},</p><p>Contractors are searching for your products right now. Keep your prices current so you appear in comparisons, BOQ pricing and the shop.</p><p>This link needs no login and takes about 2 minutes.</p>`;
    await sendMail(email, requested.length ? "Buyers are asking for your products on MySupplier" : "Please update your prices on MySupplier", layout(requested.length ? "Buyers are asking for these products" : "Update your prices", intro, { label: requested.length ? "Add my prices" : "Update prices", url: link }), text);
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
    const listed = new Set(listings.map((l) => l.materialId));
    const requested = r.requestedMaterialIds.length
      ? (await prisma.material.findMany({ where: { id: { in: r.requestedMaterialIds }, active: true }, include: { category: true } })).filter((m) => !listed.has(m.id))
      : [];
    const { id, name, nameAr, city, verified } = r.company;
    res.json(serialize({ company: { id, name, nameAr, city, verified }, expiresAt: r.expiresAt, completedAt: r.completedAt, listings, requested, requestedCity: r.requestedCity, note: r.note }));
  }),
);

router.post(
  "/price-update/:token",
  asyncHandler(async (req, res) => {
    const r = await requestByToken(req.params.token);
    const body = z.object({
      items: z.array(z.object({ listingId: z.string(), price: z.coerce.number().positive(), stock: z.coerce.number().int().nonnegative().nullable().optional(), leadTimeDays: z.coerce.number().int().min(0).optional() })).default([]),
      newItems: z.array(z.object({ name: z.string().min(2), nameAr: z.string().optional(), categorySlug: z.string(), unit: z.string(), brand: z.string().optional(), price: z.coerce.number().positive(), city: z.string().min(2), stock: z.coerce.number().int().nonnegative().optional() })).optional(),
      // Prices for catalogue products the supplier was invited to list (demand-driven outreach).
      requestedItems: z.array(z.object({ materialId: z.string(), price: z.coerce.number().positive(), city: z.string().min(2), stock: z.coerce.number().int().nonnegative().nullable().optional(), leadTimeDays: z.coerce.number().int().min(0).optional(), minQty: z.coerce.number().positive().optional() })).max(50).optional(),
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
    if (body.requestedItems?.length) {
      const allowed = new Set(r.requestedMaterialIds);
      for (const item of body.requestedItems) {
        if (!allowed.has(item.materialId)) continue;
        const existing = await prisma.priceListing.findFirst({ where: { companyId: r.companyId, materialId: item.materialId, city: item.city, source: "SUPPLIER" } });
        const data = { price: item.price, stock: item.stock ?? null, leadTimeDays: item.leadTimeDays ?? 0, minQty: item.minQty ?? 1, validUntil: new Date(Date.now() + 90 * 86400000), active: true };
        if (existing) await prisma.priceListing.update({ where: { id: existing.id }, data });
        else await prisma.priceListing.create({ data: { ...data, companyId: r.companyId, materialId: item.materialId, city: item.city, source: "SUPPLIER" } });
        touched.add(item.materialId);
        added++;
      }
    }
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
