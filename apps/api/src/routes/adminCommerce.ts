/**
 * Admin capabilities every e-commerce back office needs on top of catalogue, orders and companies:
 * coupons & promotions, review moderation, the payments ledger, reports & analytics, the audit log,
 * broadcast announcements and the customer-support inbox (public contact form + admin triage).
 */
import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { audit } from "../lib/audit";
import { notify } from "../services/notifications";
import { normaliseCode } from "../services/coupons";
import { round2 } from "../services/pricing";

const router = Router();
const admin = requireAuth("ADMIN");

// ------------------------------------------------------------------ coupons & promotions
const couponSchema = z.object({
  code: z.string().min(3).max(32).transform(normaliseCode),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.coerce.number().positive(),
  description: z.string().max(200).optional().nullable(),
  minOrder: z.coerce.number().nonnegative().optional().nullable(),
  maxDiscount: z.coerce.number().positive().optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  active: z.boolean().optional(),
});

router.get("/admin/coupons", admin, asyncHandler(async (_req, res) => {
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  const usage = await prisma.order.groupBy({ by: ["couponCode"], where: { couponCode: { not: null } }, _sum: { discount: true }, _count: { _all: true } });
  const byCode = new Map(usage.map((u) => [u.couponCode!, { orders: u._count._all, discount: Number(u._sum.discount ?? 0) }]));
  res.json(serialize(coupons.map((c) => ({ ...c, orders: byCode.get(c.code)?.orders ?? 0, discountGiven: byCode.get(c.code)?.discount ?? 0 }))));
}));

router.post("/admin/coupons", admin, asyncHandler(async (req, res) => {
  const body = couponSchema.parse(req.body);
  if (body.type === "PERCENT" && body.value > 100) throw badRequest("Percentage discount cannot exceed 100");
  if (body.startsAt && body.endsAt && body.endsAt < body.startsAt) throw badRequest("End date must be after start date");
  const existing = await prisma.coupon.findUnique({ where: { code: body.code } });
  if (existing) throw badRequest("A coupon with this code already exists");
  const coupon = await prisma.coupon.create({ data: body });
  await audit(req, "coupon.create", "Coupon", coupon.id, { code: coupon.code, type: coupon.type, value: Number(coupon.value) });
  res.status(201).json(serialize(coupon));
}));

router.patch("/admin/coupons/:id", admin, asyncHandler(async (req, res) => {
  const body = couponSchema.partial().parse(req.body);
  if (body.type === "PERCENT" && body.value != null && body.value > 100) throw badRequest("Percentage discount cannot exceed 100");
  const coupon = await prisma.coupon.update({ where: { id: req.params.id }, data: body });
  await audit(req, "coupon.update", "Coupon", coupon.id, body as Record<string, unknown>);
  res.json(serialize(coupon));
}));

router.delete("/admin/coupons/:id", admin, asyncHandler(async (req, res) => {
  const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
  if (!coupon) throw notFound("Coupon not found");
  await prisma.coupon.delete({ where: { id: coupon.id } });
  await audit(req, "coupon.delete", "Coupon", coupon.id, { code: coupon.code });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ reviews moderation
const reviewInclude = {
  buyer: { select: { id: true, name: true, email: true } },
  company: { select: { id: true, name: true, slug: true } },
  order: { select: { id: true, reference: true } },
} satisfies Prisma.ReviewInclude;

router.get("/admin/reviews", admin, asyncHandler(async (req, res) => {
  const { rating, hidden, q } = z.object({ rating: z.coerce.number().int().min(1).max(5).optional(), hidden: z.enum(["true", "false"]).optional(), q: z.string().optional() }).parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const where: Prisma.ReviewWhereInput = {
    ...(rating ? { rating } : {}),
    ...(hidden ? { hidden: hidden === "true" } : {}),
    ...(q ? { OR: [{ comment: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }, { buyer: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, items, summary] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const hiddenCount = await prisma.review.count({ where: { hidden: true } });
  res.json({ ...paged(serialize(items), page, pageSize, total), summary: { average: round2(summary._avg.rating ?? 0), total: summary._count._all, hidden: hiddenCount } });
}));

router.patch("/admin/reviews/:id", admin, asyncHandler(async (req, res) => {
  const body = z.object({ hidden: z.boolean().optional(), reply: z.string().max(1000).optional().nullable() }).parse(req.body);
  const review = await prisma.review.update({
    where: { id: req.params.id },
    data: { ...(body.hidden != null ? { hidden: body.hidden } : {}), ...(body.reply !== undefined ? { reply: body.reply, repliedAt: body.reply ? new Date() : null } : {}) },
    include: reviewInclude,
  });
  await audit(req, body.hidden != null ? (body.hidden ? "review.hide" : "review.unhide") : "review.reply", "Review", review.id, { companyId: review.companyId, rating: review.rating });
  res.json(serialize(review));
}));

router.delete("/admin/reviews/:id", admin, asyncHandler(async (req, res) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) throw notFound("Review not found");
  await prisma.review.delete({ where: { id: review.id } });
  await audit(req, "review.delete", "Review", review.id, { companyId: review.companyId, rating: review.rating });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ payments ledger
router.get("/admin/payments", admin, asyncHandler(async (req, res) => {
  const { status, provider, q } = z.object({ status: z.enum(["INITIATED", "PAID", "FAILED", "REFUNDED"]).optional(), provider: z.enum(["MOYASAR", "MANUAL"]).optional(), q: z.string().optional() }).parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const where: Prisma.PaymentWhereInput = {
    ...(status ? { status } : {}),
    ...(provider ? { provider } : {}),
    ...(q ? { OR: [{ providerPaymentId: { contains: q, mode: "insensitive" } }, { order: { reference: { contains: q, mode: "insensitive" } } }, { order: { buyer: { name: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const [total, items, sums] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where, skip, take, orderBy: { createdAt: "desc" },
      include: { order: { select: { id: true, reference: true, paymentMethod: true, paymentStatus: true, total: true, buyer: { select: { id: true, name: true, email: true } }, company: { select: { id: true, name: true } } } } },
    }),
    prisma.payment.groupBy({ by: ["status"], _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const summary: Record<string, { count: number; amount: number }> = {};
  for (const s of sums) summary[s.status] = { count: s._count._all, amount: Number(s._sum.amount ?? 0) };
  const unpaidOrders = await prisma.order.aggregate({ where: { paymentStatus: "UNPAID", status: { notIn: ["CANCELLED"] } }, _sum: { total: true }, _count: { _all: true } });
  res.json({ ...paged(serialize(items), page, pageSize, total), summary, outstanding: { count: unpaidOrders._count._all, amount: Number(unpaidOrders._sum.total ?? 0) } });
}));

// ------------------------------------------------------------------ reports & analytics
router.get("/admin/reports", admin, asyncHandler(async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
  const since = new Date(Date.now() - days * 86400000);
  const prevSince = new Date(since.getTime() - days * 86400000);
  const liveStatuses: Prisma.EnumOrderStatusFilter<"Order"> = { notIn: ["CANCELLED"] };

  const [orders, prevAgg, newUsers, prevUsers, rfqs, awardedRfqs, bids, activeBuyers, contactOpen] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since }, status: liveStatuses },
      select: { id: true, createdAt: true, total: true, subtotal: true, discount: true, status: true, paymentMethod: true, paymentStatus: true, deliveryCity: true, type: true, buyerId: true, companyId: true, company: { select: { name: true } }, items: { select: { materialId: true, name: true, quantity: true, lineTotal: true, material: { select: { category: { select: { name: true } } } } } } },
    }),
    prisma.order.aggregate({ where: { createdAt: { gte: prevSince, lt: since }, status: liveStatuses }, _sum: { total: true }, _count: { _all: true } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
    prisma.rfq.count({ where: { createdAt: { gte: since } } }),
    prisma.rfq.count({ where: { createdAt: { gte: since }, status: "AWARDED" } }),
    prisma.bid.count({ where: { createdAt: { gte: since } } }),
    prisma.order.findMany({ where: { createdAt: { gte: since }, status: liveStatuses }, distinct: ["buyerId"], select: { buyerId: true } }),
    prisma.contactMessage.count({ where: { status: { not: "RESOLVED" } } }),
  ]);

  const gmv = round2(orders.reduce((s, o) => s + Number(o.total), 0));
  const discounts = round2(orders.reduce((s, o) => s + Number(o.discount), 0));
  const prevGmv = Number(prevAgg._sum?.total ?? 0);
  const prevOrders = typeof prevAgg._count === "object" && prevAgg._count ? prevAgg._count._all ?? 0 : 0;
  const pct = (cur: number, prev: number) => (prev > 0 ? round2(((cur - prev) / prev) * 100) : null);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const daily = new Map<string, { gmv: number; orders: number }>();
  for (let i = days - 1; i >= 0; i--) daily.set(dayKey(new Date(Date.now() - i * 86400000)), { gmv: 0, orders: 0 });
  for (const o of orders) {
    const k = dayKey(o.createdAt);
    const row = daily.get(k) ?? { gmv: 0, orders: 0 };
    row.gmv = round2(row.gmv + Number(o.total)); row.orders += 1; daily.set(k, row);
  }

  const bump = <K,>(m: Map<K, { count: number; revenue: number; label: string; qty?: number }>, key: K, label: string, revenue: number, qty = 0) => {
    const row = m.get(key) ?? { count: 0, revenue: 0, label, qty: 0 };
    row.count += 1; row.revenue = round2(row.revenue + revenue); row.qty = (row.qty ?? 0) + qty; m.set(key, row);
  };
  const products = new Map<string, { count: number; revenue: number; label: string; qty?: number }>();
  const suppliers = new Map<string, { count: number; revenue: number; label: string; qty?: number }>();
  const categories = new Map<string, { count: number; revenue: number; label: string; qty?: number }>();
  const cities = new Map<string, { count: number; revenue: number; label: string; qty?: number }>();
  const methods = new Map<string, { count: number; revenue: number; label: string; qty?: number }>();
  const statuses = new Map<string, { count: number; revenue: number; label: string; qty?: number }>();
  for (const o of orders) {
    bump(suppliers, o.companyId, o.company.name, Number(o.total));
    bump(cities, o.deliveryCity ?? "—", o.deliveryCity ?? "Unknown", Number(o.total));
    bump(methods, o.paymentMethod ?? "NONE", o.paymentMethod ?? "Not set", Number(o.total));
    bump(statuses, o.status, o.status, Number(o.total));
    for (const it of o.items) {
      bump(products, it.materialId ?? it.name, it.name, Number(it.lineTotal), Number(it.quantity));
      bump(categories, it.material?.category?.name ?? "Other", it.material?.category?.name ?? "Other", Number(it.lineTotal));
    }
  }
  const top = (m: Map<string, { count: number; revenue: number; label: string; qty?: number }>, n = 10) =>
    [...m.entries()].map(([id, v]) => ({ id, name: v.label, orders: v.count, revenue: v.revenue, quantity: v.qty ?? 0 })).sort((a, b) => b.revenue - a.revenue).slice(0, n);

  res.json({
    days, since: since.toISOString(),
    totals: {
      gmv, gmvChangePct: pct(gmv, prevGmv),
      orders: orders.length, ordersChangePct: pct(orders.length, prevOrders),
      aov: orders.length ? round2(gmv / orders.length) : 0,
      discounts, activeBuyers: activeBuyers.length,
      newUsers, newUsersChangePct: pct(newUsers, prevUsers),
      rfqs, bids, rfqConversionPct: rfqs ? round2((awardedRfqs / rfqs) * 100) : 0,
      paidShare: orders.length ? round2((orders.filter((o) => o.paymentStatus === "PAID").length / orders.length) * 100) : 0,
      supportOpen: contactOpen,
    },
    daily: [...daily.entries()].map(([date, v]) => ({ date, ...v })),
    topProducts: top(products), topSuppliers: top(suppliers), byCategory: top(categories, 12), byCity: top(cities, 8), byPaymentMethod: top(methods, 5), byStatus: top(statuses, 8),
  });
}));

// ------------------------------------------------------------------ audit log
router.get("/admin/audit", admin, asyncHandler(async (req, res) => {
  const { entity, action, q } = z.object({ entity: z.string().optional(), action: z.string().optional(), q: z.string().optional() }).parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entity } : {}),
    ...(action ? { action: { startsWith: action } } : {}),
    ...(q ? { OR: [{ entityId: { contains: q } }, { action: { contains: q, mode: "insensitive" } }, { actor: { email: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { actor: { select: { id: true, name: true, email: true, role: true } } } }),
  ]);
  res.json(paged(serialize(items), page, pageSize, total));
}));

// ------------------------------------------------------------------ announcements
router.post("/admin/announcements", admin, asyncHandler(async (req, res) => {
  const body = z.object({ title: z.string().min(3).max(120), body: z.string().min(3).max(2000), audience: z.enum(["ALL", "BUYERS", "SUPPLIERS"]).default("ALL"), link: z.string().max(300).optional().nullable(), email: z.boolean().optional() }).parse(req.body);
  const users = await prisma.user.findMany({ where: { active: true, ...(body.audience === "BUYERS" ? { role: "BUYER" } : body.audience === "SUPPLIERS" ? { role: "SUPPLIER" } : {}) }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length) await notify({ userIds, type: "ANNOUNCEMENT", title: body.title, body: body.body, link: body.link ?? undefined, email: body.email });
  await audit(req, "announcement.send", "Announcement", null, { title: body.title, body: body.body, audience: body.audience, recipients: userIds.length, email: !!body.email });
  res.status(201).json({ ok: true, recipients: userIds.length });
}));

router.get("/admin/announcements", admin, asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = paginate(req.query);
  const where = { action: "announcement.send" };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { actor: { select: { id: true, name: true } } } }),
  ]);
  res.json(paged(serialize(items), page, pageSize, total));
}));

// ------------------------------------------------------------------ support inbox
const contactLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many messages, please try again later" } });

router.post("/contact", contactLimiter, asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(200),
    phone: z.string().max(30).optional().nullable(),
    subject: z.string().min(3).max(160),
    message: z.string().min(10).max(4000),
    orderRef: z.string().max(40).optional().nullable(),
    website: z.string().max(0).optional(), // honeypot
  }).parse(req.body);
  const created = await prisma.contactMessage.create({ data: { name: body.name, email: body.email, phone: body.phone ?? null, subject: body.orderRef ? `[${body.orderRef}] ${body.subject}` : body.subject, message: body.message, userId: req.user?.id ?? null } });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  if (admins.length) await notify({ userIds: admins.map((a) => a.id), type: "SYSTEM", title: `Support: ${created.subject}`, body: `${created.name} <${created.email}>: ${created.message.slice(0, 140)}`, link: "/admin/support" });
  res.status(201).json({ ok: true, id: created.id });
}));

router.get("/admin/contact", admin, asyncHandler(async (req, res) => {
  const { status, q } = z.object({ status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED"]).optional(), q: z.string().optional() }).parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const where: Prisma.ContactMessageWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, items, counts] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, role: true } } } }),
    prisma.contactMessage.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const summary: Record<string, number> = { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0 };
  for (const c of counts) summary[c.status] = c._count._all;
  res.json({ ...paged(serialize(items), page, pageSize, total), summary });
}));

router.patch("/admin/contact/:id", admin, asyncHandler(async (req, res) => {
  const body = z.object({ status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED"]).optional(), notes: z.string().max(4000).optional().nullable(), assigneeId: z.string().optional().nullable() }).parse(req.body);
  const msg = await prisma.contactMessage.update({ where: { id: req.params.id }, data: { ...body, ...(body.status === "RESOLVED" ? { resolvedAt: new Date() } : {}) }, include: { user: { select: { id: true, name: true, role: true } } } });
  await audit(req, "support.update", "ContactMessage", msg.id, body as Record<string, unknown>);
  res.json(serialize(msg));
}));

export default router;
