import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { userFromToken, requireAuth, type AuthUser } from "../middleware/auth";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { companyUserIds, notify } from "../services/notifications";
import { recordOrderEvent, refreshCompanyRating } from "../services/portal";

const router = Router();

async function accessibleOrder(id: string, user: Pick<AuthUser, "id" | "role" | "companyId">) {
  const order = await prisma.order.findUnique({ where: { id }, include: { company: true, items: { include: { material: true } }, buyer: { select: { id: true, name: true, email: true, phone: true, company: true } } } });
  if (!order) throw notFound("Order not found");
  const ok = user.role === "ADMIN" || order.buyerId === user.id || (user.companyId !== null && order.companyId === user.companyId);
  if (!ok) throw forbidden();
  return order;
}

router.get(
  "/orders/:id/events",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    res.json(serialize(await prisma.orderEvent.findMany({ where: { orderId: order.id }, include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "asc" } })));
  }),
);

router.get(
  "/orders/:id/messages",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    // Mark messages from the other side as read, then return the thread.
    const mine = req.user!.role === "BUYER" ? order.buyerId : null;
    await prisma.orderMessage.updateMany({
      where: { orderId: order.id, readAt: null, ...(mine ? { senderId: { not: mine } } : { sender: { companyId: { not: req.user!.companyId ?? "__" } } }) },
      data: { readAt: new Date() },
    });
    const messages = await prisma.orderMessage.findMany({ where: { orderId: order.id }, include: { sender: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "asc" } });
    res.json(serialize(messages));
  }),
);

router.post(
  "/orders/:id/messages",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    const { body } = z.object({ body: z.string().min(1).max(2000) }).parse(req.body);
    const message = await prisma.orderMessage.create({ data: { orderId: order.id, senderId: req.user!.id, body }, include: { sender: { select: { id: true, name: true, role: true } } } });
    await recordOrderEvent(order.id, "MESSAGE", { message: body.slice(0, 140), userId: req.user!.id });
    const isBuyer = req.user!.id === order.buyerId;
    const recipients = isBuyer ? await companyUserIds([order.companyId]) : [order.buyerId];
    await notify({ userIds: recipients, type: "ORDER_UPDATE", title: `New message on ${order.reference}`, body: body.slice(0, 160), link: isBuyer ? `/supplier/orders/${order.id}` : `/dashboard/orders/${order.id}`, email: false });
    res.status(201).json(serialize(message));
  }),
);

router.get(
  "/orders/:id/delivery-note.html",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const user = await userFromToken(token);
    if (!user) throw unauthorized("Invalid or expired token");
    const o = await accessibleOrder(req.params.id, user);
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const rows = o.items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${esc(i.name)}<div class="muted">${esc(i.material?.sku ?? "")}</div></td><td>${esc(i.unit)}</td><td class="r">${i.quantity}</td><td class="chk"></td></tr>`).join("");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Delivery note ${esc(o.reference)}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#111827;max-width:900px;margin:0 auto;padding:32px}h1{color:#0B6E4F;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}.box{border:1px solid #e5e7eb;border-radius:12px;padding:16px}.muted{color:#6b7280;font-size:12px}table{width:100%;border-collapse:collapse}th,td{padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:14px}th{background:#f4f6f5;font-size:12px;text-transform:uppercase}.r{text-align:right}.chk{width:60px;border-left:1px solid #e5e7eb}.sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}.sig div{border-top:1px solid #111;padding-top:8px;font-size:13px}@media print{.noprint{display:none}}</style></head>
<body><div class="noprint" style="text-align:right"><button onclick="window.print()" style="background:#0B6E4F;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600">Print</button></div>
<div style="display:flex;justify-content:space-between"><div><h1>Delivery Note · سند تسليم</h1><div class="muted">MySupplier · Build for less</div></div><div style="text-align:right"><div style="font-size:20px;font-weight:700">${esc(o.reference)}</div><div class="muted">${esc(o.createdAt.toISOString().slice(0, 10))} · ${esc(o.status)}</div></div></div>
<div class="grid"><div class="box"><div class="muted">From / المورد</div><strong>${esc(o.company.name)}</strong><div>${esc(o.company.city)} · ${esc(o.company.phone ?? "")}</div></div>
<div class="box"><div class="muted">Deliver to / التسليم إلى</div><strong>${esc(o.buyer.company?.name ?? o.buyer.name)}</strong><div>${esc(o.buyer.name)} · ${esc(o.contactPhone ?? o.buyer.phone ?? "")}</div><div>${esc(o.deliveryAddress ?? "")}${o.deliveryCity ? `, ${esc(o.deliveryCity)}` : ""}</div>${o.notes ? `<div class="muted">Notes: ${esc(o.notes)}</div>` : ""}</div></div>
<table><thead><tr><th>#</th><th>Item</th><th>Unit</th><th class="r">Qty</th><th>Received ✓</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sig"><div>Delivered by (name, signature, date)</div><div>Received by (name, signature, stamp, date)</div></div>
<p class="muted" style="margin-top:32px">Prices are on the tax invoice. Report shortages or damage within 24 hours via the order messages on MySupplier.</p></body></html>`);
  }),
);

router.post(
  "/orders/:id/review",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    if (order.buyerId !== req.user!.id && req.user!.role !== "ADMIN") throw forbidden();
    if (order.status !== "DELIVERED") throw badRequest("You can rate a supplier once the order is delivered");
    const { rating, comment } = z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().max(1000).optional() }).parse(req.body);
    const existing = await prisma.review.findUnique({ where: { orderId: order.id } });
    if (existing) throw badRequest("This order already has a review");
    const review = await prisma.review.create({ data: { orderId: order.id, companyId: order.companyId, buyerId: order.buyerId, rating, comment }, include: { buyer: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } } });
    await refreshCompanyRating(order.companyId);
    await recordOrderEvent(order.id, "REVIEW", { message: `${rating}★${comment ? ` – ${comment.slice(0, 100)}` : ""}`, userId: req.user!.id });
    await notify({ userIds: await companyUserIds([order.companyId]), type: "SYSTEM", title: `New ${rating}-star review on ${order.reference}`, body: comment ?? "No comment", link: `/supplier/orders/${order.id}` });
    res.status(201).json(serialize(review));
  }),
);

router.post(
  "/reviews/:id/reply",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review || (req.user!.role !== "ADMIN" && review.companyId !== req.user!.companyId)) throw notFound("Review not found");
    if (review.reply) throw badRequest("This review already has a reply");
    const { reply } = z.object({ reply: z.string().min(1).max(1000) }).parse(req.body);
    const updated = await prisma.review.update({ where: { id: review.id }, data: { reply, repliedAt: new Date() }, include: { buyer: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } } });
    await notify({ userIds: [review.buyerId], type: "SYSTEM", title: "The supplier replied to your review", body: reply.slice(0, 160), link: `/dashboard/orders/${review.orderId}` });
    res.json(serialize(updated));
  }),
);

export default router;
