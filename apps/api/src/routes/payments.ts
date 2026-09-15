import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { cardPaymentsEnabled, fetchMoyasarPayment, toHalalas } from "../services/payments";
import { companyUserIds, notify } from "../services/notifications";

const router = Router();
const orderInclude = { company: true, items: { include: { material: true } } } satisfies Prisma.OrderInclude;

router.get("/payments/config", (_req, res) => {
  const enabled = cardPaymentsEnabled();
  res.json({
    provider: enabled ? "MOYASAR" : "MANUAL",
    cardPaymentsEnabled: enabled,
    publishableKey: enabled ? env.moyasar.publishableKey : null,
    currency: "SAR",
    methods: enabled ? ["COD", "BANK_TRANSFER", "CARD"] : ["COD", "BANK_TRANSFER"],
  });
});

async function buyerOrder(orderId: string, userId: string, role: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw notFound("Order not found");
  if (order.buyerId !== userId && role !== "ADMIN") throw forbidden();
  return order;
}

function intentFor(order: { id: string; reference: string; total: Prisma.Decimal; company: { name: string } }) {
  return {
    orderId: order.id,
    reference: order.reference,
    amount: Number(order.total),
    amountHalalas: toHalalas(Number(order.total)),
    currency: "SAR",
    description: `MySupplier order ${order.reference} – ${order.company.name}`,
    callbackUrl: `${env.webUrl}/payments/callback?order=${order.id}`,
    publishableKey: cardPaymentsEnabled() ? env.moyasar.publishableKey : null,
    provider: cardPaymentsEnabled() ? "MOYASAR" : "MANUAL",
  };
}

router.post(
  "/payments/:orderId/intent",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await buyerOrder(req.params.orderId, req.user!.id, req.user!.role);
    if (order.paymentStatus === "PAID") throw badRequest("Order is already paid");
    if (!cardPaymentsEnabled()) throw badRequest("Card payments are not enabled. Choose cash on delivery or bank transfer.");
    await prisma.payment.create({ data: { orderId: order.id, provider: "MOYASAR", amount: order.total, status: "INITIATED" } });
    res.json(intentFor(order));
  }),
);

/** Marks an order paid after verifying the gateway payment (idempotent). */
async function settle(orderId: string, providerPaymentId: string, raw: unknown, status: "PAID" | "FAILED") {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  const payment = await prisma.payment.upsert({
    where: { providerPaymentId },
    create: { orderId, provider: "MOYASAR", providerPaymentId, amount: order.total, status, raw: raw as Prisma.InputJsonValue },
    update: { status, raw: raw as Prisma.InputJsonValue },
  });
  if (status === "PAID" && order.paymentStatus !== "PAID") {
    const updated = await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID", paymentMethod: "CARD" }, include: orderInclude });
    await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `Payment received for ${order.reference}`, body: `SAR ${Number(order.total).toLocaleString("en-US")} paid by card. Thank you!`, link: `/dashboard/orders/${order.id}` });
    await notify({ userIds: await companyUserIds([order.companyId]), type: "ORDER_UPDATE", title: `${order.reference} paid`, body: "The buyer paid by card. Please confirm and dispatch.", link: `/supplier/orders/${order.id}` });
    return { order: updated, payment };
  }
  return { order, payment };
}

router.post(
  "/payments/:orderId/verify",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { paymentId } = z.object({ paymentId: z.string().min(4) }).parse(req.body);
    const order = await buyerOrder(req.params.orderId, req.user!.id, req.user!.role);
    if (!cardPaymentsEnabled()) throw badRequest("Card payments are not enabled");
    const gw = await fetchMoyasarPayment(paymentId);
    const paidStatuses = ["paid", "captured", "authorized"];
    if (gw.amount !== toHalalas(Number(order.total)) || gw.currency !== "SAR") {
      await settle(order.id, gw.id, gw, "FAILED");
      throw badRequest("Payment amount does not match the order");
    }
    const result = await settle(order.id, gw.id, gw, paidStatuses.includes(gw.status) ? "PAID" : "FAILED");
    if (!paidStatuses.includes(gw.status)) throw badRequest(`Payment ${gw.status}${gw.source?.message ? `: ${gw.source.message}` : ""}`);
    res.json(serialize(result));
  }),
);

/** Moyasar webhook: configure the endpoint in the Moyasar dashboard with the shared secret. */
router.post(
  "/payments/webhook/moyasar",
  asyncHandler(async (req, res) => {
    if (!env.moyasar.webhookSecret || req.headers["x-webhook-secret"] !== env.moyasar.webhookSecret) throw unauthorized("Bad webhook secret");
    const body = req.body as { type?: string; data?: { id?: string; status?: string; metadata?: { order_id?: string } } };
    const paymentId = body.data?.id;
    const orderId = body.data?.metadata?.order_id;
    if (!paymentId || !orderId) return res.json({ ignored: true });
    const gw = await fetchMoyasarPayment(paymentId);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.json({ ignored: true });
    const ok = ["paid", "captured"].includes(gw.status) && gw.amount === toHalalas(Number(order.total));
    await settle(orderId, gw.id, gw, ok ? "PAID" : "FAILED");
    res.json({ ok: true });
  }),
);

router.get(
  "/payments/:orderId",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) throw notFound("Order not found");
    const u = req.user!;
    if (!(u.role === "ADMIN" || order.buyerId === u.id || order.companyId === u.companyId)) throw forbidden();
    res.json(serialize(await prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } })));
  }),
);

/**
 * Hosted payment page for the mobile app (opened in an in-app browser). Auth via ?token= because
 * it's a navigation. Renders the Moyasar form and redirects back to the app scheme when done.
 */
router.get(
  "/payments/:orderId/page",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    let userId: string;
    try {
      userId = String((jwt.verify(token, env.jwtSecret) as jwt.JwtPayload).sub);
    } catch {
      throw unauthorized("Invalid or expired token");
    }
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: orderInclude });
    if (!order || order.buyerId !== userId) throw notFound("Order not found");
    const intent = intentFor(order);
    const redirect = `${env.appScheme}://payment?order=${order.id}`;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!cardPaymentsEnabled()) {
      return res.send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Inter,Arial;padding:24px"><h2>Card payments are not enabled yet</h2><p>Please pay on delivery or by bank transfer.</p><a href="${redirect}&status=disabled">Back to app</a></body>`);
    }
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pay ${esc(order.reference)}</title>
<link rel="stylesheet" href="https://cdn.moyasar.com/mpf/1.14.0/moyasar.css"><script src="https://cdn.moyasar.com/mpf/1.14.0/moyasar.js"></script>
<style>body{font-family:Inter,Arial,sans-serif;margin:0;background:#f4f6f5}.wrap{max-width:480px;margin:0 auto;padding:20px}.card{background:#fff;border-radius:16px;padding:20px;border:1px solid #e5e7eb}h1{font-size:18px;margin:0 0 4px;color:#0B6E4F}.t{font-size:26px;font-weight:700;margin:8px 0 16px}</style></head>
<body><div class="wrap"><div class="card"><h1>MySupplier</h1><div>Order ${esc(order.reference)} · ${esc(order.company.name)}</div><div class="t">SAR ${Number(order.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div><div class="mysr-form"></div></div></div>
<script>Moyasar.init({element:'.mysr-form',amount:${intent.amountHalalas},currency:'SAR',description:${JSON.stringify(intent.description)},publishable_api_key:${JSON.stringify(intent.publishableKey)},callback_url:${JSON.stringify(redirect)},methods:['creditcard','applepay'],metadata:{order_id:${JSON.stringify(order.id)}},on_completed:function(p){window.location.href=${JSON.stringify(redirect)}+'&id='+encodeURIComponent(p.id)+'&status='+encodeURIComponent(p.status);}});</script></body></html>`);
  }),
);

export default router;
