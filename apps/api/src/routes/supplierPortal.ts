import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { publicUrl, uploader } from "../lib/uploads";
import { layout, sendMail } from "../services/mailer";
import { notify } from "../services/notifications";
import { activeListingWhere } from "../services/catalog";
import { round2 } from "../services/pricing";
import {
  applyStockMovement, commissionFor, companyCommissionPct, dayKey, getSettings, lastNDays, requireCompanyRole, requireManager,
  reservedByListing, saveSettings, slugify, soldLast30dByListing,
} from "../services/portal";

const router = Router();
const supplier = [requireAuth("SUPPLIER", "ADMIN")] as const;
const orderInclude = { company: true, items: { include: { material: true } }, buyer: { select: { id: true, name: true, company: true } } } satisfies Prisma.OrderInclude;

// ================================================================ dashboard
router.get(
  "/supplier/dashboard",
  ...supplier,
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const days = Math.min(365, Math.max(7, Number(req.query.days ?? 30)));
    const since = new Date(Date.now() - days * 86400000);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const [ordersRecent, ordersAll, byStatus, bids, bidsWon, listings, openRfqs, unread, recentReviews, recentOrders] = await Promise.all([
      prisma.order.findMany({ where: { companyId, createdAt: { gte: since }, status: { not: "CANCELLED" } }, select: { total: true, createdAt: true, paymentStatus: true, status: true } }),
      prisma.order.aggregate({ where: { companyId, status: { not: "CANCELLED" } }, _sum: { total: true } }),
      prisma.order.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
      prisma.bid.count({ where: { companyId } }),
      prisma.bid.count({ where: { companyId, status: "ACCEPTED" } }),
      prisma.priceListing.findMany({ where: { companyId }, select: { id: true, stock: true, materialId: true, price: true, city: true } }),
      prisma.rfq.count({ where: { status: "OPEN", closesAt: { gt: new Date() }, deliveryCity: { in: [company.city, ...company.citiesServed] } } }),
      prisma.orderMessage.count({ where: { order: { companyId }, readAt: null, sender: { companyId: { not: companyId } } } }),
      prisma.review.findMany({ where: { companyId }, include: { buyer: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.order.findMany({ where: { companyId }, include: orderInclude, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);
    const daysKeys = lastNDays(days);
    const revenueMap = new Map(daysKeys.map((d) => [d, 0]));
    const ordersMap = new Map(daysKeys.map((d) => [d, 0]));
    for (const o of ordersRecent) {
      const k = dayKey(o.createdAt);
      revenueMap.set(k, round2((revenueMap.get(k) ?? 0) + Number(o.total)));
      ordersMap.set(k, (ordersMap.get(k) ?? 0) + 1);
    }
    const ordersByStatus: Record<string, number> = { PENDING: 0, CONFIRMED: 0, IN_TRANSIT: 0, DELIVERED: 0, CANCELLED: 0 };
    for (const r of byStatus) ordersByStatus[r.status] = r._count._all;

    // Top products by revenue (all time, non-cancelled)
    const top = await prisma.orderItem.groupBy({
      by: ["materialId"], where: { order: { companyId, status: { not: "CANCELLED" } }, materialId: { not: null } },
      _sum: { lineTotal: true, quantity: true }, _count: { _all: true }, orderBy: { _sum: { lineTotal: "desc" } }, take: 8,
    });
    const topMats = await prisma.material.findMany({ where: { id: { in: top.map((t) => t.materialId!) } }, include: { category: true } });
    const topProducts = top.map((t) => ({ material: topMats.find((m) => m.id === t.materialId), quantity: t._sum.quantity ?? 0, revenue: Number(t._sum.lineTotal ?? 0), orders: t._count._all })).filter((t) => t.material);

    // Price competitiveness: my listing vs all active offers for the same material in the same city
    const matIds = [...new Set(listings.map((l) => l.materialId))].slice(0, 200);
    const market = await prisma.priceListing.findMany({ where: { materialId: { in: matIds }, ...activeListingWhere() }, select: { materialId: true, city: true, price: true, companyId: true } });
    const mats = await prisma.material.findMany({ where: { id: { in: matIds } }, include: { category: true } });
    const competitiveness = listings.map((l) => {
      const peers = market.filter((m) => m.materialId === l.materialId && m.city === l.city);
      const prices = peers.map((p) => Number(p.price)).sort((a, b) => a - b);
      const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : Number(l.price);
      const my = Number(l.price);
      return {
        material: mats.find((m) => m.id === l.materialId)!, listingId: l.id, myPrice: my, marketAvg: round2(avg), marketMin: prices[0] ?? my,
        diffPct: round2(((my - avg) / avg) * 100), rank: prices.findIndex((p) => p >= my) + 1 || prices.length, sellers: new Set(peers.map((p) => p.companyId ?? "m")).size,
      };
    }).filter((c) => c.material).sort((a, b) => b.diffPct - a.diffPct).slice(0, 25);

    const lowStock = listings.filter((l) => l.stock !== null && l.stock <= company.lowStockThreshold).length;
    const views = await prisma.material.aggregate({ where: { id: { in: matIds } }, _sum: { popularity: true } });

    res.json(
      serialize({
        company,
        kpis: {
          revenue30d: round2(ordersRecent.reduce((s, o) => s + Number(o.total), 0)), revenueTotal: Number(ordersAll._sum.total ?? 0),
          orders30d: ordersRecent.length, pendingOrders: ordersByStatus.PENDING, unpaidOrders: ordersRecent.filter((o) => o.paymentStatus === "UNPAID" && o.status !== "CANCELLED").length,
          openRfqsInMyCities: openRfqs, bidsSubmitted: bids, bidsWon, winRatePct: bids ? Math.round((bidsWon / bids) * 100) : 0,
          listings: listings.length, lowStockItems: lowStock, unreadMessages: unread, rating: company.rating, ratingCount: company.ratingCount,
          productViews30d: views._sum.popularity ?? 0,
        },
        revenueByDay: daysKeys.map((d) => ({ date: d, value: revenueMap.get(d) ?? 0 })),
        ordersByDay: daysKeys.map((d) => ({ date: d, value: ordersMap.get(d) ?? 0 })),
        ordersByStatus, topProducts, priceCompetitiveness: competitiveness, recentOrders, recentReviews,
      }),
    );
  }),
);

// ================================================================ company profile
const profileSchema = z.object({
  name: z.string().min(2).optional(), nameAr: z.string().nullable().optional(), slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/).nullable().optional(),
  description: z.string().max(3000).nullable().optional(), descriptionAr: z.string().max(3000).nullable().optional(),
  citiesServed: z.array(z.string()).max(30).optional(), minOrderValue: z.coerce.number().nonnegative().nullable().optional(),
  deliveryFee: z.coerce.number().nonnegative().nullable().optional(), deliveryDays: z.coerce.number().int().min(0).nullable().optional(),
  workingHours: z.string().max(200).nullable().optional(), phone: z.string().nullable().optional(), email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(), bankName: z.string().nullable().optional(), iban: z.string().nullable().optional(), beneficiary: z.string().nullable().optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(), city: z.string().optional(), crNumber: z.string().nullable().optional(), vatNumber: z.string().nullable().optional(),
});

router.get("/supplier/company", ...supplier, asyncHandler(async (req, res) => res.json(serialize(await prisma.company.findUniqueOrThrow({ where: { id: requireCompany(req) } })))));

router.patch(
  "/supplier/company",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const data = profileSchema.parse(req.body);
    if (data.slug) {
      const taken = await prisma.company.findFirst({ where: { slug: data.slug, id: { not: companyId } } });
      if (taken) throw conflict("This storefront address is already taken");
    }
    res.json(serialize(await prisma.company.update({ where: { id: companyId }, data })));
  }),
);

router.post(
  "/supplier/company/logo",
  ...supplier, requireManager(),
  (req, res, next) => uploader("image", 2).single("file")(req, res, (err) => (err ? next(badRequest((err as Error).message)) : next())),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("Upload an image");
    res.json(serialize(await prisma.company.update({ where: { id: requireCompany(req) }, data: { logoUrl: publicUrl(req.file.filename) } })));
  }),
);

router.get("/supplier/company/documents", ...supplier, asyncHandler(async (req, res) => res.json(serialize(await prisma.companyDocument.findMany({ where: { companyId: requireCompany(req) }, orderBy: { createdAt: "desc" } })))));

router.post(
  "/supplier/company/documents",
  ...supplier, requireManager(),
  (req, res, next) => uploader("document", 10).single("file")(req, res, (err) => (err ? next(badRequest((err as Error).message)) : next())),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { type } = z.object({ type: z.enum(["CR", "VAT", "LICENSE", "OTHER"]) }).parse(req.body);
    if (!req.file) throw badRequest("Upload a file");
    const doc = await prisma.companyDocument.create({ data: { companyId, type, fileName: req.file.originalname, fileUrl: publicUrl(req.file.filename), uploadedById: req.user!.id } });
    await prisma.company.updateMany({ where: { id: companyId, verificationStatus: { in: ["PENDING", "REJECTED"] } }, data: { verificationStatus: "UNDER_REVIEW" } });
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
    await notify({ userIds: admins.map((a) => a.id), type: "SYSTEM", title: "Supplier document uploaded", body: `${req.file.originalname} (${type}) awaits verification.`, link: `/admin/companies/${companyId}`, email: false });
    res.status(201).json(serialize(doc));
  }),
);

router.delete(
  "/supplier/company/documents/:id",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const doc = await prisma.companyDocument.findFirst({ where: { id: req.params.id, companyId: requireCompany(req) } });
    if (!doc) throw notFound("Document not found");
    if (doc.status === "APPROVED") throw badRequest("Approved documents cannot be deleted");
    await prisma.companyDocument.delete({ where: { id: doc.id } });
    res.json({ ok: true });
  }),
);

// ================================================================ branches
const branchSchema = z.object({ name: z.string().min(2), city: z.string().min(2), address: z.string().nullable().optional(), phone: z.string().nullable().optional(), isDefault: z.boolean().optional() });

router.get("/supplier/branches", ...supplier, asyncHandler(async (req, res) => res.json(serialize(await prisma.branch.findMany({ where: { companyId: requireCompany(req) }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] })))));

router.post(
  "/supplier/branches",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const data = branchSchema.parse(req.body);
    const count = await prisma.branch.count({ where: { companyId } });
    if (data.isDefault) await prisma.branch.updateMany({ where: { companyId }, data: { isDefault: false } });
    const branch = await prisma.branch.create({ data: { ...data, companyId, isDefault: data.isDefault ?? count === 0 } });
    if (!company_citiesIncludes(await prisma.company.findUniqueOrThrow({ where: { id: companyId } }), data.city)) {
      await prisma.company.update({ where: { id: companyId }, data: { citiesServed: { push: data.city } } });
    }
    res.status(201).json(serialize(branch));
  }),
);
const company_citiesIncludes = (c: { city: string; citiesServed: string[] }, city: string) => c.city === city || c.citiesServed.includes(city);

router.patch(
  "/supplier/branches/:id",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const data = branchSchema.partial().parse(req.body);
    const branch = await prisma.branch.findFirst({ where: { id: req.params.id, companyId } });
    if (!branch) throw notFound("Branch not found");
    if (data.isDefault) await prisma.branch.updateMany({ where: { companyId }, data: { isDefault: false } });
    res.json(serialize(await prisma.branch.update({ where: { id: branch.id }, data })));
  }),
);

router.delete(
  "/supplier/branches/:id",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const branch = await prisma.branch.findFirst({ where: { id: req.params.id, companyId: requireCompany(req) } });
    if (!branch) throw notFound("Branch not found");
    await prisma.branch.delete({ where: { id: branch.id } });
    res.json({ ok: true });
  }),
);

// ================================================================ team
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

router.get(
  "/supplier/team",
  ...supplier,
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const [members, invites] = await Promise.all([
      prisma.user.findMany({ where: { companyId }, select: { id: true, email: true, name: true, phone: true, createdAt: true, companyRole: true, active: true, lastLoginAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.companyInvite.findMany({ where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } }, include: { invitedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
    ]);
    res.json(serialize({ members: members.map((m) => ({ ...m, companyRole: m.companyRole ?? "OWNER" })), invites }));
  }),
);

router.post(
  "/supplier/team/invite",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { email, role, name } = z.object({ email: z.string().email().transform((s) => s.toLowerCase()), role: z.enum(["OWNER", "MANAGER", "SALES", "WAREHOUSE"]), name: z.string().optional() }).parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.companyId === companyId) throw conflict("This person is already in your team");
    const token = crypto.randomBytes(24).toString("hex");
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const invite = await prisma.companyInvite.create({
      data: { companyId, email, name, role, tokenHash: hash(token), invitedById: req.user!.id, expiresAt: new Date(Date.now() + 7 * 86400000) },
      include: { invitedBy: { select: { id: true, name: true } } },
    });
    const url = `${env.webUrl}/join?token=${token}`;
    await sendMail(email, `${req.user!.name} invited you to ${company.name} on MySupplier`, layout("You're invited", `<p>${req.user!.name} invited you to join <strong>${company.name}</strong> on MySupplier as <strong>${role.toLowerCase()}</strong>.</p><p>The link is valid for 7 days.</p>`, { label: "Accept invitation", url }), `Accept your invitation: ${url}`);
    res.status(201).json(serialize({ ...invite, inviteUrl: env.isProd ? undefined : url }));
  }),
);

router.delete(
  "/supplier/team/invite/:id",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    await prisma.companyInvite.deleteMany({ where: { id: req.params.id, companyId: requireCompany(req) } });
    res.json({ ok: true });
  }),
);

router.patch(
  "/supplier/team/:userId",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const data = z.object({ role: z.enum(["OWNER", "MANAGER", "SALES", "WAREHOUSE"]).optional(), active: z.boolean().optional() }).parse(req.body);
    const member = await prisma.user.findFirst({ where: { id: req.params.userId, companyId } });
    if (!member) throw notFound("Member not found");
    const owners = await prisma.user.count({ where: { companyId, active: true, OR: [{ companyRole: "OWNER" }, { companyRole: null }] } });
    const isOwner = (member.companyRole ?? "OWNER") === "OWNER";
    if (isOwner && owners <= 1 && ((data.role && data.role !== "OWNER") || data.active === false)) throw badRequest("A company must keep at least one active owner");
    const updated = await prisma.user.update({ where: { id: member.id }, data: { companyRole: data.role, active: data.active }, select: { id: true, email: true, name: true, phone: true, createdAt: true, companyRole: true, active: true, lastLoginAt: true } });
    res.json(serialize(updated));
  }),
);

// ================================================================ inventory
const inventoryInclude = { material: { include: { category: true } }, branch: true } satisfies Prisma.PriceListingInclude;

router.get(
  "/supplier/inventory",
  ...supplier,
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const q = z.object({ q: z.string().optional(), branchId: z.string().optional(), lowStock: z.enum(["1", "true"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const where: Prisma.PriceListingWhereInput = {
      companyId, ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.q ? { material: { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { nameAr: { contains: q.q } }, { sku: { contains: q.q, mode: "insensitive" } }] } } : {}),
      ...(q.lowStock ? { stock: { lte: company.lowStockThreshold } } : {}),
    };
    const [total, rows, reserved, sold] = await Promise.all([
      prisma.priceListing.count({ where }),
      prisma.priceListing.findMany({ where, include: inventoryInclude, orderBy: [{ stock: "asc" }, { updatedAt: "desc" }], skip, take }),
      reservedByListing(companyId), soldLast30dByListing(companyId),
    ]);
    const data = rows.map((l) => {
      const r = reserved.get(l.id) ?? 0;
      return { listing: l, stock: l.stock, reserved: r, available: l.stock === null ? null : Math.max(0, l.stock - r), lowStock: l.stock !== null && l.stock <= company.lowStockThreshold, soldLast30d: sold.get(l.id) ?? 0 };
    });
    res.json(paged(serialize(data), page, pageSize, total));
  }),
);

router.get(
  "/supplier/inventory/export.csv",
  ...supplier,
  asyncHandler(async (req, res) => {
    const rows = await prisma.priceListing.findMany({ where: { companyId: requireCompany(req) }, include: inventoryInclude, orderBy: { material: { name: "asc" } } });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["sku,name,unit,city,branch,price,stock,minQty,leadTimeDays,updatedAt", ...rows.map((l) => [l.material.sku, l.material.name, l.material.unit, l.city, l.branch?.name ?? "", Number(l.price), l.stock ?? "", l.minQty, l.leadTimeDays, l.updatedAt.toISOString()].map(esc).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inventory.csv"');
    res.send(csv);
  }),
);

router.patch(
  "/supplier/inventory/:listingId",
  ...supplier, requireCompanyRole("OWNER", "MANAGER", "WAREHOUSE", "SALES"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { stock, branchId } = z.object({ stock: z.coerce.number().int().min(0).nullable().optional(), branchId: z.string().nullable().optional() }).parse(req.body);
    const listing = await prisma.priceListing.findFirst({ where: { id: req.params.listingId, companyId } });
    if (!listing) throw notFound("Listing not found");
    if (branchId !== undefined) await prisma.priceListing.update({ where: { id: listing.id }, data: { branchId } });
    if (stock === null) await prisma.priceListing.update({ where: { id: listing.id }, data: { stock: null } });
    else if (stock !== undefined) await applyStockMovement(listing.id, "ADJUST", stock, { reason: "Stock count", userId: req.user!.id });
    res.json(serialize(await prisma.priceListing.findUniqueOrThrow({ where: { id: listing.id }, include: inventoryInclude })));
  }),
);

router.post(
  "/supplier/inventory/:listingId/movements",
  ...supplier, requireCompanyRole("OWNER", "MANAGER", "WAREHOUSE", "SALES"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const { type, quantity, reason } = z.object({ type: z.enum(["IN", "OUT", "ADJUST"]), quantity: z.coerce.number().min(0), reason: z.string().max(200).optional() }).parse(req.body);
    const listing = await prisma.priceListing.findFirst({ where: { id: req.params.listingId, companyId } });
    if (!listing) throw notFound("Listing not found");
    const mv = await applyStockMovement(listing.id, type, quantity, { reason, userId: req.user!.id });
    res.status(201).json(serialize(mv));
  }),
);

router.get(
  "/supplier/inventory/:listingId/movements",
  ...supplier,
  asyncHandler(async (req, res) => {
    const listing = await prisma.priceListing.findFirst({ where: { id: req.params.listingId, companyId: requireCompany(req) } });
    if (!listing) throw notFound("Listing not found");
    res.json(serialize(await prisma.stockMovement.findMany({ where: { listingId: listing.id }, include: { order: { select: { id: true, reference: true } }, user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 100 })));
  }),
);

// ================================================================ finance
async function statementLines(companyId: string, from?: Date, to?: Date) {
  const pct = await companyCommissionPct(companyId);
  const orders = await prisma.order.findMany({
    where: { companyId, status: { not: "CANCELLED" }, ...(from || to ? { createdAt: { gte: from, lte: to } } : {}) },
    include: { payout: { select: { id: true, status: true, reference: true } } }, orderBy: { createdAt: "desc" },
  });
  return orders.map((o) => {
    const gross = Number(o.total);
    const { commission, net } = commissionFor(gross, pct);
    return { order: { id: o.id, reference: o.reference, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, total: gross }, gross, commissionPct: pct, commission, net, payout: o.payout };
  });
}

router.get(
  "/supplier/finance/summary",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const pct = await companyCommissionPct(companyId);
    const orders = await prisma.order.findMany({ where: { companyId, status: { not: "CANCELLED" } }, include: { payout: { select: { status: true } } } });
    let grossPaid = 0, commission = 0, paidOut = 0, pendingPayout = 0, awaitingDelivery = 0, unpaid = 0;
    for (const o of orders) {
      const total = Number(o.total);
      const c = commissionFor(total, pct);
      if (o.paymentStatus === "PAID") {
        grossPaid += total; commission += c.commission;
        if (o.status === "DELIVERED") {
          if (o.payout?.status === "PAID") paidOut += c.net; else pendingPayout += c.net;
        } else awaitingDelivery += c.net;
      } else unpaid += total;
    }
    res.json({ currency: "SAR", commissionPct: pct, grossPaid: round2(grossPaid), commission: round2(commission), netEarned: round2(grossPaid - commission), paidOut: round2(paidOut), pendingPayout: round2(pendingPayout), awaitingDelivery: round2(awaitingDelivery), unpaidReceivables: round2(unpaid) });
  }),
);

const rangeSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

router.get(
  "/supplier/finance/statement",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const { from, to } = rangeSchema.parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const lines = await statementLines(requireCompany(req), from, to);
    res.json(paged(serialize(lines.slice(skip, skip + take)), page, pageSize, lines.length));
  }),
);

router.get(
  "/supplier/finance/statement.csv",
  ...supplier, requireManager(),
  asyncHandler(async (req, res) => {
    const { from, to } = rangeSchema.parse(req.query);
    const lines = await statementLines(requireCompany(req), from, to);
    const csv = ["reference,date,status,payment,gross,commissionPct,commission,net,payout", ...lines.map((l) => [l.order.reference, l.order.createdAt.toISOString().slice(0, 10), l.order.status, l.order.paymentStatus, l.gross, l.commissionPct, l.commission, l.net, l.payout?.status ?? ""].join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="statement.csv"');
    res.send(csv);
  }),
);

router.get("/supplier/payouts", ...supplier, requireManager(), asyncHandler(async (req, res) => res.json(serialize(await prisma.payout.findMany({ where: { companyId: requireCompany(req) }, orderBy: { createdAt: "desc" } })))));

// ================================================================ admin: settings, payouts, verification
router.get("/admin/settings", requireAuth("ADMIN"), asyncHandler(async (_req, res) => res.json(await getSettings())));
router.patch(
  "/admin/settings",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const patch = z.object({ commissionPct: z.coerce.number().min(0).max(50).optional(), payoutDayOfWeek: z.coerce.number().int().min(0).max(6).optional(), lowStockThresholdDefault: z.coerce.number().int().min(0).optional() }).parse(req.body);
    res.json(await saveSettings(patch));
  }),
);

router.get(
  "/admin/payouts",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["PENDING", "PAID"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where = status ? { status } : {};
    const [total, items] = await Promise.all([prisma.payout.count({ where }), prisma.payout.findMany({ where, include: { company: true }, orderBy: { createdAt: "desc" }, skip, take })]);
    res.json(paged(serialize(items), page, pageSize, total));
  }),
);

router.post(
  "/admin/payouts/generate",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { periodStart, periodEnd, companyId } = z.object({ periodStart: z.coerce.date(), periodEnd: z.coerce.date(), companyId: z.string().optional() }).parse(req.body);
    const orders = await prisma.order.findMany({ where: { status: "DELIVERED", paymentStatus: "PAID", payoutId: null, updatedAt: { gte: periodStart, lte: periodEnd }, ...(companyId ? { companyId } : {}) } });
    const byCompany = new Map<string, typeof orders>();
    for (const o of orders) byCompany.set(o.companyId, [...(byCompany.get(o.companyId) ?? []), o]);
    const created = [];
    for (const [cid, list] of byCompany) {
      const pct = await companyCommissionPct(cid);
      const amount = round2(list.reduce((s, o) => s + commissionFor(Number(o.total), pct).net, 0));
      const payout = await prisma.payout.create({ data: { companyId: cid, amount, periodStart, periodEnd, orderCount: list.length, createdById: req.user!.id }, include: { company: true } });
      await prisma.order.updateMany({ where: { id: { in: list.map((o) => o.id) } }, data: { payoutId: payout.id } });
      created.push(payout);
    }
    res.status(201).json(serialize({ created }));
  }),
);

router.patch(
  "/admin/payouts/:id",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { status, reference } = z.object({ status: z.enum(["PENDING", "PAID"]), reference: z.string().optional() }).parse(req.body);
    const payout = await prisma.payout.update({ where: { id: req.params.id }, data: { status, reference, paidAt: status === "PAID" ? new Date() : null }, include: { company: true } });
    if (status === "PAID") {
      const users = await prisma.user.findMany({ where: { companyId: payout.companyId, active: true, OR: [{ companyRole: { in: ["OWNER", "MANAGER"] } }, { companyRole: null }] }, select: { id: true } });
      await notify({ userIds: users.map((u) => u.id), type: "SYSTEM", title: `Payout of SAR ${Number(payout.amount).toLocaleString("en-US")} sent`, body: `Reference ${reference ?? payout.id} for ${payout.orderCount} delivered order(s).`, link: "/supplier/finance" });
    }
    res.json(serialize(payout));
  }),
);

router.get(
  "/admin/companies/:id",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: { documents: { orderBy: { createdAt: "desc" } }, branches: true, users: { select: { id: true, email: true, name: true, phone: true, createdAt: true, companyRole: true, active: true, lastLoginAt: true } } },
    });
    if (!company) throw notFound("Company not found");
    const { users, ...rest } = company;
    res.json(serialize({ ...rest, members: users.map((u) => ({ ...u, companyRole: u.companyRole ?? "OWNER" })) }));
  }),
);

router.patch(
  "/admin/companies/:id/verification",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { status, notes, commissionPct } = z.object({ status: z.enum(["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED"]), notes: z.string().optional(), commissionPct: z.coerce.number().min(0).max(50).nullable().optional() }).parse(req.body);
    const company = await prisma.company.update({ where: { id: req.params.id }, data: { verificationStatus: status, verificationNotes: notes, verified: status === "VERIFIED", commissionPct: commissionPct === undefined ? undefined : commissionPct } });
    const users = await prisma.user.findMany({ where: { companyId: company.id, active: true }, select: { id: true } });
    await notify({ userIds: users.map((u) => u.id), type: "SYSTEM", title: status === "VERIFIED" ? "Your company is verified" : `Verification ${status.toLowerCase().replace("_", " ")}`, body: notes ?? (status === "VERIFIED" ? "You now carry the verified badge across MySupplier." : "Check your documents page for details."), link: "/supplier/documents" });
    res.json(serialize(company));
  }),
);

router.patch(
  "/admin/companies/:id/documents/:docId",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { status, notes } = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]), notes: z.string().optional() }).parse(req.body);
    const doc = await prisma.companyDocument.update({ where: { id: req.params.docId }, data: { status, notes } });
    res.json(serialize(doc));
  }),
);

export default router;
