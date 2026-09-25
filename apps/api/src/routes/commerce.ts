/**
 * B2B commerce on top of the basic cart: address book, credit terms (net terms), reorder / buy again,
 * returns (RMA) and recurring orders. Mounted by app.ts next to cart/orders.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { audit } from "../lib/audit";
import { companyUserIds, notify } from "../services/notifications";
import { applyStockMovement, recordOrderEvent } from "../services/portal";
import { round2 } from "../services/pricing";
import { isPurchasable, toOffer } from "../services/shop";
import { getOrCreateCart, shapeCart } from "./cart";
import {
  RETURN_REASONS, RETURN_WINDOW_DAYS, assertPurchasable, cheapestOffer, computeNextRunAt, computeRefund, creditInfoFor, nextCommerceReference,
  orderLineInclude, parseRecurringItems, releaseCredit, runRecurringOrder,
} from "../services/commerce";

const router = Router();
const auth = requireAuth();
const admin = requireAuth("ADMIN");

// ================================================================== address book
const addressSchema = z.object({
  label: z.string().trim().min(1).max(60),
  recipient: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().max(120).nullable().optional(),
  street: z.string().trim().min(2).max(200),
  building: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().optional(),
});

router.get("/addresses", auth, asyncHandler(async (req, res) => {
  const addresses = await prisma.address.findMany({ where: { userId: req.user!.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  res.json(serialize(addresses));
}));

router.post("/addresses", auth, asyncHandler(async (req, res) => {
  const body = addressSchema.parse(req.body);
  const userId = req.user!.id;
  const count = await prisma.address.count({ where: { userId } });
  const isDefault = body.isDefault ?? count === 0;
  const address = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.create({ data: { ...body, isDefault, userId, companyId: req.user!.companyId } });
  });
  res.status(201).json(serialize(address));
}));

router.patch("/addresses/:id", auth, asyncHandler(async (req, res) => {
  const body = addressSchema.partial().parse(req.body);
  const userId = req.user!.id;
  const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw notFound("Address not found");
  const address = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.address.updateMany({ where: { userId, isDefault: true, NOT: { id: existing.id } }, data: { isDefault: false } });
    return tx.address.update({ where: { id: existing.id }, data: body });
  });
  res.json(serialize(address));
}));

router.delete("/addresses/:id", auth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw notFound("Address not found");
  await prisma.address.delete({ where: { id: existing.id } });
  if (existing.isDefault) {
    const next = await prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  res.json({ ok: true });
}));

router.post("/addresses/:id/default", auth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId } });
  if (!existing) throw notFound("Address not found");
  const address = await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.update({ where: { id: existing.id }, data: { isDefault: true } });
  });
  res.json(serialize(address));
}));

// ================================================================== credit terms
const creditSelect = { creditApproved: true, creditLimit: true, creditTermsDays: true, creditUsed: true } satisfies Prisma.CompanySelect;

router.get("/me/credit", auth, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: creditSelect }) : null;
  const info = creditInfoFor(company);
  const openOrders = companyId
    ? await prisma.order.findMany({ where: { paymentMethod: "CREDIT", paymentStatus: "UNPAID", status: { not: "CANCELLED" }, buyer: { companyId } }, select: { id: true, reference: true, total: true, dueDate: true, createdAt: true, company: { select: { id: true, name: true } } }, orderBy: { dueDate: "asc" } })
    : [];
  const now = Date.now();
  res.json(serialize({ ...info, openOrders, overdue: openOrders.filter((o) => o.dueDate && o.dueDate.getTime() < now).length }));
}));

router.get("/admin/companies/:id/credit", admin, asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, type: true, verified: true, ...creditSelect } });
  if (!company) throw notFound("Company not found");
  const openOrders = await prisma.order.findMany({ where: { paymentMethod: "CREDIT", paymentStatus: "UNPAID", status: { not: "CANCELLED" }, buyer: { companyId: company.id } }, select: { id: true, reference: true, total: true, dueDate: true, createdAt: true, buyer: { select: { id: true, name: true } }, company: { select: { id: true, name: true } } }, orderBy: { dueDate: "asc" } });
  const settled = await prisma.order.aggregate({ where: { paymentMethod: "CREDIT", paymentStatus: "PAID", buyer: { companyId: company.id } }, _sum: { total: true }, _count: { _all: true } });
  const now = Date.now();
  res.json(serialize({
    company: { id: company.id, name: company.name, type: company.type, verified: company.verified },
    credit: creditInfoFor(company),
    openOrders,
    overdue: openOrders.filter((o) => o.dueDate && o.dueDate.getTime() < now).length,
    settled: { orders: settled._count._all, amount: Number(settled._sum.total ?? 0) },
  }));
}));

router.patch("/admin/companies/:id/credit", admin, asyncHandler(async (req, res) => {
  const body = z.object({
    creditApproved: z.boolean().optional(),
    creditLimit: z.coerce.number().nonnegative().max(1e9).nullable().optional(),
    creditTermsDays: z.coerce.number().int().min(0).max(180).nullable().optional(),
  }).parse(req.body);
  const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, ...creditSelect } });
  if (!company) throw notFound("Company not found");
  const approved = body.creditApproved ?? company.creditApproved;
  const limit = body.creditLimit === undefined ? company.creditLimit : body.creditLimit;
  if (approved && (limit === null || Number(limit) <= 0)) throw badRequest("Set a positive credit limit before approving credit terms");
  const updated = await prisma.company.update({
    where: { id: company.id },
    data: { ...body, ...(approved && body.creditTermsDays === undefined && company.creditTermsDays === null ? { creditTermsDays: 30 } : {}) },
    select: { id: true, name: true, ...creditSelect },
  });
  await audit(req, "company.credit", "Company", company.id, { before: creditInfoFor(company), after: creditInfoFor(updated), patch: body as Record<string, unknown> });
  if (body.creditApproved !== undefined && body.creditApproved !== company.creditApproved) {
    await notify({
      userIds: await companyUserIds([company.id]), type: "SYSTEM",
      title: body.creditApproved ? "Credit terms approved" : "Credit terms suspended",
      body: body.creditApproved ? `You can now pay on account up to SAR ${Number(updated.creditLimit ?? 0).toLocaleString("en-US")} (net ${updated.creditTermsDays ?? 30} days).` : "Pay by card, bank transfer or cash on delivery until credit is re-enabled.",
      link: "/dashboard/orders",
    });
  }
  res.json(serialize({ company: { id: updated.id, name: updated.name }, credit: creditInfoFor(updated) }));
}));

// ================================================================== reorder
router.post("/orders/:id/reorder", auth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, buyerId: userId }, include: { items: true } });
  if (!order) throw notFound("Order not found");
  const skipped: Array<{ orderItemId: string; name: string; quantity: number; reason: string }> = [];
  let added = 0;
  for (const item of order.items) {
    let listing = item.listingId ? await prisma.priceListing.findUnique({ where: { id: item.listingId }, include: orderLineInclude }) : null;
    let replaced = false;
    if (!listing || !isPurchasable(toOffer(listing)) || listing.active === false || (listing.validUntil && listing.validUntil < new Date())) {
      if (!item.materialId) {
        skipped.push({ orderItemId: item.id, name: item.name, quantity: item.quantity, reason: "Product is no longer in the catalogue" });
        continue;
      }
      const alt = await cheapestOffer(item.materialId, order.deliveryCity ?? undefined);
      if (!alt) {
        skipped.push({ orderItemId: item.id, name: item.name, quantity: item.quantity, reason: "No supplier currently offers this product" });
        continue;
      }
      listing = alt;
      replaced = true;
    }
    const cart = await getOrCreateCart(userId);
    const existing = cart.items.find((ci) => ci.listingId === listing!.id);
    const newQty = (existing?.quantity ?? 0) + item.quantity;
    try {
      assertPurchasable(listing, newQty);
    } catch (e) {
      skipped.push({ orderItemId: item.id, name: item.name, quantity: item.quantity, reason: e instanceof Error ? e.message : "Not purchasable" });
      continue;
    }
    if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
    else await prisma.cartItem.create({ data: { cartId: cart.id, listingId: listing.id, quantity: item.quantity } });
    added++;
    if (replaced) skipped.push({ orderItemId: item.id, name: item.name, quantity: item.quantity, reason: `Original offer unavailable – added the cheapest current offer from ${listing.company?.name ?? "another supplier"} instead` });
  }
  const cart = await shapeCart(await getOrCreateCart(userId), order.deliveryCity ?? undefined);
  res.status(added ? 201 : 200).json(serialize({ cart, added, skipped }));
}));

// ================================================================== returns / RMA
const returnInclude = {
  order: { select: { id: true, reference: true, total: true, paymentMethod: true, paymentStatus: true, status: true, buyerId: true, companyId: true } },
  buyer: { select: { id: true, name: true, email: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.ReturnInclude;

function returnScope(req: Request): Prisma.ReturnWhereInput {
  const user = req.user!;
  if (user.role === "ADMIN") return {};
  if (user.role === "SUPPLIER") return { companyId: user.companyId ?? "__none__" };
  return { buyerId: user.id };
}

type ReturnLine = { orderItemId: string; name: string; unit: string; quantity: number; unitPrice: number };
const returnLines = (raw: Prisma.JsonValue): ReturnLine[] => (Array.isArray(raw) ? (raw as unknown as ReturnLine[]) : []);

router.post("/orders/:id/returns", requireAuth("BUYER", "ADMIN"), asyncHandler(async (req, res) => {
  const body = z.object({
    reason: z.enum(RETURN_REASONS),
    details: z.string().trim().max(2000).optional(),
    items: z.array(z.object({ orderItemId: z.string(), quantity: z.coerce.number().positive() })).min(1),
  }).parse(req.body);
  const user = req.user!;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, ...(user.role === "ADMIN" ? {} : { buyerId: user.id }) }, include: { items: true, events: { where: { type: "STATUS", status: "DELIVERED" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!order) throw notFound("Order not found");
  if (order.status !== "DELIVERED" && order.status !== "IN_TRANSIT") throw badRequest("Returns can only be requested for shipped or delivered orders");
  const since = order.events[0]?.createdAt ?? order.updatedAt;
  if (Date.now() - since.getTime() > RETURN_WINDOW_DAYS * 86400000) throw badRequest(`The ${RETURN_WINDOW_DAYS}-day return window for this order has closed`);

  // Quantities already claimed by open or accepted returns on this order.
  const prior = await prisma.return.findMany({ where: { orderId: order.id, status: { notIn: ["REJECTED", "CANCELLED"] } }, select: { items: true } });
  const claimed = new Map<string, number>();
  for (const r of prior) for (const l of returnLines(r.items)) claimed.set(l.orderItemId, (claimed.get(l.orderItemId) ?? 0) + l.quantity);

  const lines: ReturnLine[] = [];
  for (const it of body.items) {
    const item = order.items.find((i) => i.id === it.orderItemId);
    if (!item) throw badRequest(`Item ${it.orderItemId} does not belong to this order`);
    const remaining = item.quantity - (claimed.get(item.id) ?? 0);
    if (it.quantity > remaining + 1e-9) throw badRequest(`Only ${remaining} ${item.unit} of "${item.name}" can still be returned`);
    lines.push({ orderItemId: item.id, name: item.name, unit: item.unit, quantity: it.quantity, unitPrice: Number(item.unitPrice) });
  }
  const reference = await nextCommerceReference("RET");
  const ret = await prisma.return.create({
    data: { reference, orderId: order.id, buyerId: order.buyerId, companyId: order.companyId, reason: body.reason, details: body.details, items: lines as unknown as Prisma.InputJsonValue },
    include: returnInclude,
  });
  await recordOrderEvent(order.id, "NOTE", { message: `Return ${reference} requested · ${body.reason.replace("_", " ").toLowerCase()} · ${lines.length} line(s)`, userId: user.id });
  await notify({
    userIds: await companyUserIds([order.companyId]), type: "ORDER_UPDATE",
    title: `Return request ${reference} for ${order.reference}`,
    body: `${lines.map((l) => `${l.quantity} ${l.unit} ${l.name}`).join(", ")} · ${body.reason.replace("_", " ").toLowerCase()}. Please approve or reject.`,
    link: `/supplier/returns/${ret.id}`,
  });
  res.status(201).json(serialize(ret));
}));

router.get("/returns", auth, asyncHandler(async (req, res) => {
  const { page, pageSize, skip, take } = paginate(req.query);
  const f = z.object({ status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "RECEIVED", "REFUNDED", "CANCELLED"]).optional(), orderId: z.string().optional() }).parse(req.query);
  const where: Prisma.ReturnWhereInput = { ...returnScope(req), ...(f.status ? { status: f.status } : {}), ...(f.orderId ? { orderId: f.orderId } : {}) };
  const [total, returns] = await Promise.all([prisma.return.count({ where }), prisma.return.findMany({ where, include: returnInclude, orderBy: { createdAt: "desc" }, skip, take })]);
  res.json(paged(serialize(returns), page, pageSize, total));
}));

router.get("/returns/:id", auth, asyncHandler(async (req, res) => {
  const ret = await prisma.return.findFirst({ where: { id: req.params.id, ...returnScope(req) }, include: returnInclude });
  if (!ret) throw notFound("Return not found");
  const order = await prisma.order.findUnique({ where: { id: ret.orderId }, select: { subtotal: true, discount: true, vat: true, items: { select: { id: true, unitPrice: true, quantity: true } } } });
  const estimatedRefund = order ? computeRefund(order, returnLines(ret.items)) : null;
  res.json(serialize({ ...ret, estimatedRefund }));
}));

const returnTransitions: Record<string, string[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["RECEIVED", "CANCELLED", "REJECTED"],
  RECEIVED: ["REFUNDED"],
  REJECTED: [],
  REFUNDED: [],
  CANCELLED: [],
};

router.patch("/returns/:id", auth, asyncHandler(async (req, res) => {
  const body = z.object({
    status: z.enum(["APPROVED", "REJECTED", "RECEIVED", "REFUNDED", "CANCELLED"]),
    resolution: z.string().trim().max(2000).optional(),
    refundAmount: z.coerce.number().nonnegative().optional(),
  }).parse(req.body);
  const user = req.user!;
  const ret = await prisma.return.findFirst({ where: { id: req.params.id, ...returnScope(req) }, include: returnInclude });
  if (!ret) throw notFound("Return not found");
  if (user.role === "BUYER" && body.status !== "CANCELLED") throw forbidden("Buyers can only cancel their return requests");
  if (!returnTransitions[ret.status].includes(body.status)) throw badRequest(`Cannot move return from ${ret.status} to ${body.status}`);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: ret.orderId }, include: { items: true, payments: { where: { status: "REFUNDED" } } } });
  const lines = returnLines(ret.items);
  const data: Prisma.ReturnUpdateInput = { status: body.status, resolution: body.resolution ?? ret.resolution };
  let refundAmount = ret.refundAmount === null ? null : Number(ret.refundAmount);

  if (body.status === "RECEIVED") {
    const computed = computeRefund(order, lines);
    if (body.refundAmount !== undefined && body.refundAmount > computed + 0.01) throw badRequest(`Refund cannot exceed the computed amount of SAR ${computed.toLocaleString("en-US")}`);
    refundAmount = body.refundAmount ?? computed;
    data.refundAmount = refundAmount;
    // Returned goods go back on the shelf (best effort: listings may have been removed).
    for (const l of lines) {
      const item = order.items.find((i) => i.id === l.orderItemId);
      if (item?.listingId) await applyStockMovement(item.listingId, "IN", l.quantity, { reason: `Return ${ret.reference} received`, orderId: order.id, userId: user.id }).catch(() => undefined);
    }
  }

  let payment = null;
  if (body.status === "REFUNDED") {
    if (refundAmount === null) refundAmount = computeRefund(order, lines);
    if (body.refundAmount !== undefined) {
      if (body.refundAmount > refundAmount + 0.01) throw badRequest(`Refund cannot exceed SAR ${refundAmount.toLocaleString("en-US")}`);
      refundAmount = body.refundAmount;
    }
    data.refundAmount = refundAmount;
    const alreadyRefunded = order.payments.reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
    const full = round2(alreadyRefunded + refundAmount) >= Number(order.total) - 0.01;
    payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({ data: { orderId: order.id, provider: "MANUAL", amount: -refundAmount!, status: "REFUNDED", raw: { returnId: ret.id, reference: ret.reference, by: user.id } as Prisma.InputJsonValue } });
      if (full) await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED" } });
      if (order.paymentMethod === "CREDIT" && order.paymentStatus === "UNPAID") await releaseCredit(order.id, { amount: refundAmount!, tx });
      return p;
    });
    await recordOrderEvent(order.id, "PAYMENT", { message: `Refunded SAR ${refundAmount.toLocaleString("en-US")} for return ${ret.reference}${full ? " (order fully refunded)" : ""}`, userId: user.id });
  }

  const updated = await prisma.return.update({ where: { id: ret.id }, data, include: returnInclude });
  if (body.status !== "REFUNDED") await recordOrderEvent(order.id, "NOTE", { message: `Return ${ret.reference} ${body.status.toLowerCase()}${body.resolution ? ` – ${body.resolution}` : ""}`, userId: user.id });

  const buyerFacing: Record<string, string> = {
    APPROVED: "was approved – please hand the goods to the supplier or courier.",
    REJECTED: "was rejected.",
    RECEIVED: `was received by the supplier. Refund of SAR ${(refundAmount ?? 0).toLocaleString("en-US")} is being processed.`,
    REFUNDED: `has been refunded: SAR ${(refundAmount ?? 0).toLocaleString("en-US")}.`,
    CANCELLED: "was cancelled.",
  };
  const recipients = user.role === "BUYER" ? await companyUserIds([ret.companyId]) : [ret.buyerId];
  await notify({
    userIds: recipients, type: "ORDER_UPDATE",
    title: `Return ${ret.reference} ${body.status.toLowerCase()}`,
    body: `Return for order ${order.reference} ${buyerFacing[body.status]}${body.resolution ? ` ${body.resolution}` : ""}`,
    link: user.role === "BUYER" ? `/supplier/returns/${ret.id}` : `/dashboard/returns/${ret.id}`,
  });
  if (user.role === "ADMIN") await audit(req, `return.${body.status.toLowerCase()}`, "Return", ret.id, { reference: ret.reference, refundAmount });
  res.json(serialize({ ...updated, payment }));
}));

// ================================================================== recurring orders
const recurringBase = z.object({
  name: z.string().trim().min(2).max(80),
  items: z.array(z.object({ listingId: z.string(), quantity: z.coerce.number().finite().positive().max(1e6) })).min(1).max(100),
  intervalDays: z.coerce.number().int().min(7).max(90),
  deliveryCity: z.string().trim().min(2),
  deliveryAddress: z.string().trim().min(5),
  contactPhone: z.string().trim().min(7),
  paymentMethod: z.enum(["COD", "BANK_TRANSFER", "CREDIT"]),
  startAt: z.coerce.date().optional(),
});

/** Validates the lines against live offers and snapshots names for display. */
async function snapshotLines(items: Array<{ listingId: string; quantity: number }>) {
  const listings = await prisma.priceListing.findMany({ where: { id: { in: items.map((i) => i.listingId) } }, include: orderLineInclude });
  const byId = new Map(listings.map((l) => [l.id, l]));
  return items.map((i) => {
    const listing = byId.get(i.listingId);
    if (!listing) throw notFound(`Offer ${i.listingId} not found`);
    assertPurchasable(listing, i.quantity);
    return { listingId: i.listingId, quantity: i.quantity, name: listing.material.name, unit: listing.material.unit, companyName: listing.company?.name ?? null };
  });
}

async function assertCreditAllowed(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: creditSelect });
  if (!company?.creditApproved) throw badRequest("Credit terms are not approved for your company");
}

async function withLastOrders<T extends { lastOrderId: string | null; items: Prisma.JsonValue }>(rows: T[]) {
  const ids = rows.map((r) => r.lastOrderId).filter((id): id is string => !!id);
  const orders = ids.length ? await prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true, reference: true, status: true, total: true, createdAt: true } }) : [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  return rows.map((r) => ({ ...r, items: parseRecurringItems(r.items), lastOrder: r.lastOrderId ? byId.get(r.lastOrderId) ?? null : null }));
}

const buyer = requireAuth("BUYER");

router.get("/recurring", buyer, asyncHandler(async (req, res) => {
  const rows = await prisma.recurringOrder.findMany({ where: { userId: req.user!.id }, orderBy: [{ active: "desc" }, { nextRunAt: "asc" }] });
  res.json(serialize(await withLastOrders(rows)));
}));

router.post("/recurring", buyer, asyncHandler(async (req, res) => {
  const companyId = requireCompany(req);
  const body = recurringBase.parse(req.body);
  if (body.paymentMethod === "CREDIT") await assertCreditAllowed(companyId);
  const items = await snapshotLines(body.items);
  const now = new Date();
  const nextRunAt = body.startAt && body.startAt > now ? body.startAt : new Date(now.getTime() + body.intervalDays * 86400000);
  const ro = await prisma.recurringOrder.create({
    data: {
      userId: req.user!.id, companyId, name: body.name, items: items as unknown as Prisma.InputJsonValue, intervalDays: body.intervalDays, nextRunAt,
      deliveryCity: body.deliveryCity, deliveryAddress: body.deliveryAddress, contactPhone: body.contactPhone, paymentMethod: body.paymentMethod,
    },
  });
  res.status(201).json(serialize((await withLastOrders([ro]))[0]));
}));

router.patch("/recurring/:id", buyer, asyncHandler(async (req, res) => {
  const body = recurringBase.partial().extend({ active: z.boolean().optional(), nextRunAt: z.coerce.date().optional() }).parse(req.body);
  const ro = await prisma.recurringOrder.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!ro) throw notFound("Recurring order not found");
  if (body.paymentMethod === "CREDIT") await assertCreditAllowed(ro.companyId);
  const { startAt, items, ...rest } = body;
  const data: Prisma.RecurringOrderUpdateInput = { ...rest };
  if (items) data.items = (await snapshotLines(items)) as unknown as Prisma.InputJsonValue;
  const now = new Date();
  if (body.nextRunAt) data.nextRunAt = body.nextRunAt;
  else if (startAt) data.nextRunAt = startAt;
  else if (body.active === true && !ro.active && ro.nextRunAt < now) data.nextRunAt = computeNextRunAt(ro.nextRunAt, body.intervalDays ?? ro.intervalDays, now); // resume without an immediate catch-up run
  const updated = await prisma.recurringOrder.update({ where: { id: ro.id }, data });
  res.json(serialize((await withLastOrders([updated]))[0]));
}));

router.delete("/recurring/:id", buyer, asyncHandler(async (req, res) => {
  const ro = await prisma.recurringOrder.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!ro) throw notFound("Recurring order not found");
  await prisma.recurringOrder.delete({ where: { id: ro.id } });
  res.json({ ok: true });
}));

router.post("/recurring/:id/run-now", buyer, asyncHandler(async (req, res) => {
  const ro = await prisma.recurringOrder.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!ro) throw notFound("Recurring order not found");
  const result = await runRecurringOrder(ro.id, new Date(), { userId: req.user!.id });
  if (!result.orders.length) throw badRequest(result.error ?? "No order could be placed");
  const refreshed = await prisma.recurringOrder.findUniqueOrThrow({ where: { id: ro.id } });
  res.status(201).json(serialize({
    orders: result.orders.map((o) => ({ id: o.id, reference: o.reference, total: Number(o.total), companyId: o.companyId })),
    skipped: result.skipped, total: result.total, nextRunAt: result.nextRunAt, recurringOrder: (await withLastOrders([refreshed]))[0],
  }));
}));

export default router;
