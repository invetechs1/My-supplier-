/**
 * Payment routes: gateway config, card intents / verification / webhook, the hosted pay page used by the
 * mobile app, bank-transfer proofs, refunds and the admin ledger (filters, totals, reconcile).
 * Card data never touches these routes – only Moyasar payment ids do, and every id is re-fetched server-side.
 */
import path from "path";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { downloadPathOf, userFromToken, requireAuth } from "../middleware/auth";
import { htmlPage } from "../lib/htmlPage";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { audit } from "../lib/audit";
import { paged, paginate } from "../lib/pagination";
import { assertMagicBytes, privatePath, uploader } from "../lib/uploads";
import {
  bankDetailsFor, cardPaymentsEnabled, fetchMoyasarPayment, gatewayBrands, listMoyasarPaymentsForOrder, moyasarMethods, refundMoyasarPayment,
  safeEqual, syncGatewayPayment, toHalalas, webhookPaymentId, webhookSecretOf,
} from "../services/payments";
import { requireCompanyRole } from "../services/portal";
import { companyUserIds, notify } from "../services/notifications";
import { recordOrderEvent } from "../services/portal";
import { emitOrderWebhook } from "../services/webhooks";

export { safeEqual };

const router = Router();
const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
const orderInclude = { company: true, items: { include: { material: true } } } satisfies Prisma.OrderInclude;
const sar = (n: number | Prisma.Decimal) => `SAR ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const RECORD_STATUSES = ["INITIATED", "AUTHORIZED", "CAPTURED", "SUBMITTED", "PAID", "FAILED", "REFUNDED"] as const;

router.get("/payments/config", (_req, res) => {
  const enabled = cardPaymentsEnabled();
  const gatewayMethods = enabled ? moyasarMethods() : [];
  res.json({
    provider: enabled ? "MOYASAR" : "MANUAL",
    cardPaymentsEnabled: enabled,
    publishableKey: enabled ? env.moyasar.publishableKey : null,
    currency: "SAR",
    methods: enabled ? ["COD", "BANK_TRANSFER", "CARD"] : ["COD", "BANK_TRANSFER"],
    gatewayMethods,
    brands: gatewayBrands(gatewayMethods),
    // Platform account used when the supplier has no IBAN on its profile.
    bankTransfer: bankDetailsFor(null),
  });
});

async function buyerOrder(orderId: string, userId: string, role: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw notFound("Order not found");
  if (order.buyerId !== userId && role !== "ADMIN") throw forbidden();
  return order;
}

function intentFor(order: { id: string; reference: string; total: Prisma.Decimal; company: { name: string } }) {
  const methods = moyasarMethods();
  return {
    orderId: order.id,
    reference: order.reference,
    amount: Number(order.total),
    amountHalalas: toHalalas(Number(order.total)),
    currency: "SAR",
    description: `MySupplier order ${order.reference} – ${order.company.name}`,
    callbackUrl: `${env.webUrl}/payments/callback?order=${order.id}`,
    metadata: { order_id: order.id },
    methods,
    brands: gatewayBrands(methods),
    publishableKey: cardPaymentsEnabled() ? env.moyasar.publishableKey : null,
    provider: cardPaymentsEnabled() ? "MOYASAR" : "MANUAL",
  };
}

/** Any unpaid, non-cancelled order can be paid by card – direct, RFQ-awarded, recurring or a credit-terms invoice. */
function assertPayable(order: { paymentStatus: string; status: string }) {
  if (order.paymentStatus === "PAID") throw badRequest("Order is already paid");
  if (order.paymentStatus === "REFUNDED") throw badRequest("Refunded orders cannot be paid again");
  if (order.status === "CANCELLED") throw badRequest("Cancelled orders cannot be paid");
  if (!cardPaymentsEnabled()) throw badRequest("Card payments are not enabled. Choose cash on delivery or bank transfer.");
}

router.post(
  "/payments/:orderId/intent",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await buyerOrder(req.params.orderId, req.user!.id, req.user!.role);
    assertPayable(order);
    // One open intent per order: re-opening the form refreshes it instead of piling up INITIATED rows.
    const open = await prisma.payment.findFirst({ where: { orderId: order.id, provider: "MOYASAR", providerPaymentId: null, status: "INITIATED" } });
    if (open) await prisma.payment.update({ where: { id: open.id }, data: { amount: order.total, raw: { intentAt: new Date().toISOString(), by: req.user!.id } } });
    else await prisma.payment.create({ data: { orderId: order.id, provider: "MOYASAR", method: "CARD", amount: order.total, currency: order.currency, status: "INITIATED", raw: { intentAt: new Date().toISOString(), by: req.user!.id } } });
    res.json(intentFor(order));
  }),
);

/** Callback verification: the client only tells us the payment id; the state comes from the gateway. */
router.post(
  "/payments/:orderId/verify",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { paymentId } = z.object({ paymentId: z.string().min(4).max(120) }).parse(req.body);
    const order = await buyerOrder(req.params.orderId, req.user!.id, req.user!.role);
    if (!cardPaymentsEnabled()) throw badRequest("Card payments are not enabled");
    const gw = await fetchMoyasarPayment(paymentId);
    if (gw.metadata?.order_id !== order.id) throw badRequest("This payment does not belong to this order");
    const result = await syncGatewayPayment(gw, { source: "verify", expectOrderId: order.id, userId: req.user!.id });
    if (result.outcome === "mismatch") throw badRequest("Payment amount does not match the order");
    if (result.status !== "PAID") throw badRequest(`Payment ${gw.status}${gw.source?.message ? `: ${gw.source.message}` : ""}`);
    res.json(serialize({ order: result.order, payment: result.payment }));
  }),
);

/**
 * Moyasar webhook (dashboard → Webhooks → `https://<api>/api/v1/payments/webhook/moyasar`, shared secret =
 * MOYASAR_WEBHOOK_SECRET). The body is only a trigger: the payment is re-fetched with the secret key, bound to
 * the order via metadata, amount/currency checked, and repeated deliveries are no-ops.
 */
router.post(
  "/payments/webhook/moyasar",
  asyncHandler(async (req, res) => {
    if (!safeEqual(webhookSecretOf(req.headers, req.body), env.moyasar.webhookSecret)) throw unauthorized("Bad webhook secret");
    const paymentId = webhookPaymentId(req.body);
    if (!paymentId) return res.json({ ignored: true, reason: "no payment id" });
    const gw = await fetchMoyasarPayment(paymentId);
    const result = await syncGatewayPayment(gw, { source: "webhook" });
    res.json({ ok: true, outcome: result.outcome, status: result.status ?? null });
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
    const rows = await prisma.payment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
    res.json(serialize(rows.map(({ raw: _raw, proofFile, ...p }) => ({ ...p, hasProof: Boolean(proofFile) }))));
  }),
);

// ------------------------------------------------------------------ bank transfer proof

const proofUpload = (req: Request, res: Response, next: (err?: unknown) => void) =>
  uploader("document", 10).single("file")(req, res, (err) => (err ? next(badRequest((err as Error).message)) : next()));

/**
 * Buyer submits the transfer receipt (reference, amount, date, optional PDF/image). JSON or multipart.
 * The row is SUBMITTED until the supplier/admin confirms the funds (PATCH /orders/:id/payment → PAID).
 */
router.post(
  "/orders/:id/payments/bank-transfer",
  requireAuth(),
  proofUpload,
  asyncHandler(async (req, res) => {
    const body = z.object({
      reference: z.string().trim().min(2).max(64),
      amount: z.coerce.number().positive(),
      paidAt: z.coerce.date().optional(),
      note: z.string().trim().max(500).optional(),
    }).parse(req.body);
    const order = await buyerOrder(req.params.id, req.user!.id, req.user!.role);
    if (order.paymentStatus !== "UNPAID") throw badRequest("This order is not awaiting payment");
    if (order.status === "CANCELLED") throw badRequest("Cancelled orders cannot be paid");
    if (body.paidAt && body.paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw badRequest("Transfer date cannot be in the future");
    if (req.file) {
      try { assertMagicBytes(req.file.path, req.file.mimetype); } catch (e) { throw badRequest((e as Error).message); }
    }
    const data = { amount: new Prisma.Decimal(body.amount), currency: order.currency, reference: body.reference, paidAt: body.paidAt ?? null, note: body.note ?? null, ...(req.file ? { proofFile: req.file.filename } : {}), submittedById: req.user!.id, status: "SUBMITTED" as const, raw: { submittedAt: new Date().toISOString(), fileName: req.file?.originalname ?? null } };
    // A buyer correcting a typo replaces the pending proof instead of adding a second one.
    const pending = await prisma.payment.findFirst({ where: { orderId: order.id, status: "SUBMITTED", submittedById: req.user!.id }, orderBy: { createdAt: "desc" } });
    const payment = pending
      ? await prisma.payment.update({ where: { id: pending.id }, data })
      : await prisma.payment.create({ data: { orderId: order.id, provider: "MANUAL", method: "BANK_TRANSFER", ...data } });
    // Orders placed as COD / RFQ-awarded become bank-transfer orders; credit-terms invoices keep their method.
    const method = order.paymentMethod === "CREDIT" ? "CREDIT" : "BANK_TRANSFER";
    const updated = method !== order.paymentMethod ? await prisma.order.update({ where: { id: order.id }, data: { paymentMethod: method }, include: orderInclude }) : order;
    const short = body.amount !== Number(order.total) ? ` (order total ${sar(order.total)})` : "";
    await recordOrderEvent(order.id, "PAYMENT", { message: `Bank transfer proof submitted · ref ${body.reference} · ${sar(body.amount)}${short}`, userId: req.user!.id });
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
    const bank = bankDetailsFor(order.company);
    await notify({
      userIds: [...(bank.source === "supplier" ? await companyUserIds([order.companyId]) : []), ...admins.map((a) => a.id)],
      type: "ORDER_UPDATE",
      title: `Transfer proof for ${order.reference}`,
      body: `${sar(body.amount)} · ref ${body.reference}. Check your account and mark the order paid.`,
      link: bank.source === "supplier" ? `/supplier/orders/${order.id}` : `/admin/orders/${order.id}`,
    });
    await audit(req, "payment.bank_transfer.submit", "Order", order.id, { reference: order.reference, amount: body.amount, transferReference: body.reference, hasFile: Boolean(req.file) });
    const { raw: _raw, proofFile, ...safe } = payment;
    // `bank` is sent outside serialize(): its iban/bankName keys are private everywhere else, but here the buyer must see them.
    res.status(201).json({ ...serialize({ order: updated, payment: { ...safe, hasProof: Boolean(proofFile) } }), bank });
  }),
);

/** Transfer receipt (private upload) for the buyer, the supplier's team or an admin; works with a download token too. */
router.get(
  "/orders/:id/payments/:paymentId/file",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({ where: { id: req.params.paymentId, orderId: req.params.id }, include: { order: { select: { buyerId: true, companyId: true, reference: true } } } });
    if (!payment?.proofFile) throw notFound("No receipt attached");
    const u = req.user!;
    if (!(u.role === "ADMIN" || payment.order.buyerId === u.id || payment.order.companyId === u.companyId)) throw forbidden();
    const full = privatePath(payment.proofFile);
    if (!full) throw notFound("File not found");
    const ext = full.split(".").pop()?.toLowerCase();
    res.setHeader("Content-Type", ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename="transfer-${payment.order.reference}.${ext}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(path.resolve(full));
  }),
);

// ------------------------------------------------------------------ hosted page (mobile)

/**
 * Hosted payment page for the mobile app (opened in an in-app browser). Auth via ?token= because
 * it's a navigation. Renders the Moyasar form and redirects back to the app scheme when done.
 */
router.get(
  "/payments/:orderId/page",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const user = await userFromToken(token, { downloadPath: downloadPathOf(req.originalUrl.split("?")[0]) });
    if (!user) throw unauthorized("Invalid or expired token");
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: orderInclude });
    if (!order || order.buyerId !== user.id) throw notFound("Order not found");
    const intent = intentFor(order);
    const redirect = `${env.appScheme}://payment?order=${order.id}`;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const { nonce } = htmlPage(res, { scriptSrc: ["https://cdn.moyasar.com", "https://api.moyasar.com", "https://applepay.cdn-apple.com"], styleSrc: ["https://cdn.moyasar.com"], connectSrc: ["https://api.moyasar.com", "https://cdn.moyasar.com"], frameSrc: ["https://api.moyasar.com", "https://*.moyasar.com"], formAction: ["https://api.moyasar.com", `${env.appScheme}:`] });
    if (!cardPaymentsEnabled() || order.paymentStatus !== "UNPAID" || order.status === "CANCELLED") {
      const why = order.paymentStatus === "PAID" ? "This order is already paid." : order.status === "CANCELLED" ? "This order was cancelled." : "Please pay on delivery or by bank transfer.";
      return res.send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Inter,Arial;padding:24px"><h2>${cardPaymentsEnabled() ? "Nothing to pay" : "Card payments are not enabled yet"}</h2><p>${why}</p><a href="${redirect}&status=disabled">Back to app</a></body>`);
    }
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pay ${esc(order.reference)}</title>
<link rel="stylesheet" href="https://cdn.moyasar.com/mpf/1.14.0/moyasar.css"><script nonce="${nonce}" src="https://cdn.moyasar.com/mpf/1.14.0/moyasar.js"></script>
<style>body{font-family:Inter,Arial,sans-serif;margin:0;background:#f4f6f5}.wrap{max-width:480px;margin:0 auto;padding:20px}.card{background:#fff;border-radius:16px;padding:20px;border:1px solid #e5e7eb}h1{font-size:18px;margin:0 0 4px;color:#0B6E4F}.t{font-size:26px;font-weight:700;margin:8px 0 16px}.brands{color:#6b7280;font-size:12px;margin-top:14px;text-align:center}</style></head>
<body><div class="wrap"><div class="card"><h1>MySupplier</h1><div>Order ${esc(order.reference)} · ${esc(order.company.name)}</div><div class="t">${esc(sar(order.total))}</div><div class="mysr-form"></div><p class="brands">${esc(intent.brands.join(" · "))}. Secured by Moyasar – card details never reach MySupplier.</p></div></div>
<script nonce="${nonce}">Moyasar.init({element:'.mysr-form',amount:${intent.amountHalalas},currency:'SAR',description:${jsonForScript(intent.description)},publishable_api_key:${jsonForScript(intent.publishableKey)},callback_url:${jsonForScript(redirect)},methods:${jsonForScript(intent.methods)},metadata:{order_id:${jsonForScript(order.id)}},on_completed:function(p){window.location.href=${jsonForScript(redirect)}+'&id='+encodeURIComponent(p.id)+'&status='+encodeURIComponent(p.status);}});</script></body></html>`);
  }),
);

// ------------------------------------------------------------------ refunds

/**
 * Refund a paid order. Card payments go back through Moyasar; bank transfer / COD refunds are
 * recorded as manual refunds (the supplier pays the buyer back outside the platform).
 */
router.post(
  "/payments/:orderId/refund",
  requireAuth("SUPPLIER", "ADMIN"),
  requireCompanyRole("OWNER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const { amount, reason } = z.object({ amount: z.coerce.number().positive().optional(), reason: z.string().min(3).max(500) }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: orderInclude });
    if (!order) throw notFound("Order not found");
    if (req.user!.role !== "ADMIN" && order.companyId !== req.user!.companyId) throw forbidden();
    if (order.paymentStatus !== "PAID") throw badRequest("Only paid orders can be refunded");
    const total = Number(order.total);
    const refundAmount = amount ?? total;
    if (refundAmount > total + 0.01) throw badRequest("Refund exceeds the order total");

    let payment;
    const now = new Date();
    if (order.paymentMethod === "CARD") {
      const paid = await prisma.payment.findFirst({ where: { orderId: order.id, status: "PAID", provider: "MOYASAR", providerPaymentId: { not: null } }, orderBy: { createdAt: "desc" } });
      if (!paid?.providerPaymentId || !cardPaymentsEnabled()) throw badRequest("No gateway payment found to refund");
      const gw = await refundMoyasarPayment(paid.providerPaymentId, toHalalas(refundAmount));
      payment = await prisma.payment.create({ data: { orderId: order.id, provider: "MOYASAR", method: "CARD", providerPaymentId: `${paid.providerPaymentId}:refund:${Date.now()}`, amount: -refundAmount, currency: order.currency, status: "REFUNDED", note: reason, confirmedById: req.user!.id, confirmedAt: now, raw: gw as unknown as Prisma.InputJsonValue } });
    } else {
      payment = await prisma.payment.create({ data: { orderId: order.id, provider: "MANUAL", method: order.paymentMethod ?? undefined, amount: -refundAmount, currency: order.currency, status: "REFUNDED", note: reason, confirmedById: req.user!.id, confirmedAt: now, raw: { reason, by: req.user!.id } as Prisma.InputJsonValue } });
    }
    const updated = await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED", ...(order.status !== "DELIVERED" ? { status: "CANCELLED" } : {}) }, include: orderInclude });
    await recordOrderEvent(order.id, "PAYMENT", { message: `Refunded ${sar(refundAmount)} – ${reason}`, userId: req.user!.id });
    await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `Refund issued for ${order.reference}`, body: `${sar(refundAmount)} – ${reason}`, link: `/dashboard/orders/${order.id}` });
    await audit(req, "payment.refund", "Order", order.id, { reference: order.reference, amount: refundAmount, reason, method: order.paymentMethod });
    await emitOrderWebhook("payment.refunded", order.id, { refund: { amount: refundAmount, reason, method: order.paymentMethod, paymentId: payment.id } });
    res.json(serialize({ order: updated, payment, refundedAmount: refundAmount }));
  }),
);

// ------------------------------------------------------------------ admin ledger

/** Start of today / this month in Riyadh (UTC+3, no DST) – the finance team's day, not the server's. */
function riyadhStartOf(unit: "day" | "month", now = new Date()): Date {
  const shifted = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = unit === "day" ? shifted.getUTCDate() : 1;
  return new Date(Date.UTC(y, m, d) - 3 * 60 * 60 * 1000);
}

const collectedSince = async (since: Date) => {
  // Legacy rows without confirmedAt fall back to createdAt.
  const agg = await prisma.payment.aggregate({ where: { status: "PAID", amount: { gt: 0 }, OR: [{ confirmedAt: { gte: since } }, { confirmedAt: null, createdAt: { gte: since } }] }, _sum: { amount: true }, _count: { _all: true } });
  return { count: agg._count._all, amount: Number(agg._sum.amount ?? 0) };
};

router.get(
  "/admin/payments",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const f = z.object({
      status: z.enum(RECORD_STATUSES).optional(),
      provider: z.enum(["MOYASAR", "MANUAL"]).optional(),
      method: z.enum(["COD", "BANK_TRANSFER", "CARD", "CREDIT"]).optional(),
      q: z.string().trim().max(120).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.PaymentWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.provider ? { provider: f.provider } : {}),
      ...(f.method ? { method: f.method } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
      ...(f.q ? { OR: [{ providerPaymentId: { contains: f.q, mode: "insensitive" } }, { reference: { contains: f.q, mode: "insensitive" } }, { order: { reference: { contains: f.q, mode: "insensitive" } } }, { order: { buyer: { name: { contains: f.q, mode: "insensitive" } } } }] } : {}),
    };
    const [total, items, sums, unpaidOrders, pending, refundedMonth, today, month] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where, skip, take, orderBy: { createdAt: "desc" },
        include: { order: { select: { id: true, reference: true, paymentMethod: true, paymentStatus: true, total: true, buyer: { select: { id: true, name: true, email: true } }, company: { select: { id: true, name: true } } } } },
      }),
      prisma.payment.groupBy({ by: ["status"], _sum: { amount: true }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { paymentStatus: "UNPAID", status: { notIn: ["CANCELLED"] } }, _sum: { total: true }, _count: { _all: true } }),
      prisma.payment.aggregate({ where: { status: "SUBMITTED" }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.payment.aggregate({ where: { status: "REFUNDED", createdAt: { gte: riyadhStartOf("month") } }, _sum: { amount: true }, _count: { _all: true } }),
      collectedSince(riyadhStartOf("day")),
      collectedSince(riyadhStartOf("month")),
    ]);
    const summary: Record<string, { count: number; amount: number }> = {};
    for (const s of sums) summary[s.status] = { count: s._count._all, amount: Number(s._sum.amount ?? 0) };
    const rows = items.map(({ raw: _raw, proofFile, ...p }) => ({ ...p, hasProof: Boolean(proofFile) }));
    res.json({
      ...paged(serialize(rows), page, pageSize, total),
      summary,
      outstanding: { count: unpaidOrders._count._all, amount: Number(unpaidOrders._sum.total ?? 0) },
      totals: {
        collectedToday: today,
        collectedMonth: month,
        pendingBankTransfers: { count: pending._count._all, amount: Number(pending._sum.amount ?? 0) },
        refundedMonth: { count: refundedMonth._count._all, amount: Math.abs(Number(refundedMonth._sum.amount ?? 0)) },
      },
    });
  }),
);

/** Re-fetches a gateway payment and syncs the ledger/order (lost webhook, closed tab, manual capture in the dashboard). */
router.post(
  "/admin/payments/:id/reconcile",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw notFound("Payment not found");
    if (payment.provider !== "MOYASAR") throw badRequest("Only gateway payments can be reconciled");
    if (!cardPaymentsEnabled()) throw badRequest("Card payments are not enabled");
    const ids = payment.providerPaymentId ? [payment.providerPaymentId.split(":refund:")[0]] : (await listMoyasarPaymentsForOrder(payment.orderId)).map((p) => p.id);
    if (!ids.length) throw badRequest("The gateway has no payment for this order yet");
    const results = [];
    for (const id of ids) results.push(await syncGatewayPayment(await fetchMoyasarPayment(id), { source: "reconcile", userId: req.user!.id }));
    const latest = await prisma.payment.findUnique({ where: { id: payment.id } });
    await audit(req, "payment.reconcile", "Payment", payment.id, { outcomes: results.map((r) => r.outcome), status: latest?.status });
    res.json(serialize({ payment: latest, outcomes: results.map((r) => ({ outcome: r.outcome, status: r.status ?? null })), order: results.find((r) => r.order)?.order ?? null }));
  }),
);

export default router;
