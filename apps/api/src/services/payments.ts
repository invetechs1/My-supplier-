/**
 * Payments: Moyasar card gateway (mada / Visa / Mastercard / Apple Pay / STC Pay) plus manual settlements
 * (bank transfer with proof, cash on delivery, credit terms). Card data never touches our servers – the
 * Moyasar form tokenises it; we only ever see a payment id and re-fetch its state with the secret key.
 *
 * Every state the gateway reports is recorded on a `Payment` row (INITIATED → AUTHORIZED/CAPTURED/PAID/
 * FAILED/REFUNDED) and the order's `paymentStatus` follows. `syncGatewayPayment` is the single place that
 * applies a gateway payment (verify, webhook, admin reconcile and the hourly job all go through it), so
 * amount/currency checks, idempotency and notifications live in one spot.
 */
import crypto from "crypto";
import { Prisma, type Company, type PaymentMethod, type PaymentRecordStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { badRequest } from "../lib/errors";
import { companyUserIds, notify } from "./notifications";
import { recordOrderEvent } from "./portal";
import { emitOrderWebhook } from "./webhooks";
import { releaseCredit } from "./commerce";

export const cardPaymentsEnabled = () => Boolean(env.moyasar.secretKey && env.moyasar.publishableKey);

/** Moyasar form methods, sanitised to the ones the form understands. mada is part of `creditcard`. */
export const KNOWN_GATEWAY_METHODS = ["creditcard", "applepay", "stcpay"] as const;
export type GatewayMethod = (typeof KNOWN_GATEWAY_METHODS)[number];
export function moyasarMethods(raw: readonly string[] = env.moyasar.methods): GatewayMethod[] {
  const list = raw.filter((m): m is GatewayMethod => (KNOWN_GATEWAY_METHODS as readonly string[]).includes(m));
  return list.length ? [...new Set(list)] : ["creditcard"];
}
/** Brand names shown next to the form ("mada · Visa · Mastercard · Apple Pay · STC Pay"). */
export function gatewayBrands(methods: readonly GatewayMethod[]): string[] {
  const out: string[] = [];
  if (methods.includes("creditcard")) out.push("mada", "Visa", "Mastercard");
  if (methods.includes("applepay")) out.push("Apple Pay");
  if (methods.includes("stcpay")) out.push("STC Pay");
  return out;
}

export interface MoyasarPayment {
  id: string;
  status: "initiated" | "paid" | "failed" | "authorized" | "captured" | "refunded" | "voided" | string;
  amount: number; // halalas
  currency: string;
  refunded?: number; // halalas
  description?: string;
  source?: { type?: string; company?: string; message?: string; name?: string; number?: string };
  metadata?: Record<string, string>;
}

const authHeader = () => `Basic ${Buffer.from(`${env.moyasar.secretKey}:`).toString("base64")}`;

/** Fetches a payment from Moyasar with the secret key (server-side verification). */
export async function fetchMoyasarPayment(paymentId: string): Promise<MoyasarPayment> {
  const resp = await fetch(`${env.moyasar.apiBase}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: authHeader(), accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Moyasar responded ${resp.status}`);
  return (await resp.json()) as MoyasarPayment;
}

/** Lists the gateway payments created for an order (metadata filter) – used to recover intents that never came back. */
export async function listMoyasarPaymentsForOrder(orderId: string): Promise<MoyasarPayment[]> {
  const resp = await fetch(`${env.moyasar.apiBase}/payments?metadata[order_id]=${encodeURIComponent(orderId)}`, {
    headers: { authorization: authHeader(), accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Moyasar responded ${resp.status}`);
  const body = (await resp.json()) as { payments?: MoyasarPayment[] };
  return Array.isArray(body.payments) ? body.payments : [];
}

export const toHalalas = (sar: number) => Math.round(sar * 100);

/** Refunds a Moyasar payment (full or partial, amount in halalas). */
export async function refundMoyasarPayment(paymentId: string, amountHalalas?: number): Promise<MoyasarPayment> {
  const resp = await fetch(`${env.moyasar.apiBase}/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { authorization: authHeader(), accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(amountHalalas ? { amount: amountHalalas } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Moyasar refund failed (${resp.status}) ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as MoyasarPayment;
}

// ------------------------------------------------------------------ pure helpers (unit-tested)

/** Constant-time secret comparison; false when the expected secret is not configured. */
export function safeEqual(given: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Moyasar sends the shared secret as `secret_token` in the webhook body; we also accept the
 * `x-webhook-secret` header so a dashboard configured the old way keeps working.
 */
export function webhookSecretOf(headers: Record<string, unknown>, body: unknown): string {
  const fromBody = body && typeof body === "object" ? (body as { secret_token?: unknown }).secret_token : undefined;
  if (typeof fromBody === "string" && fromBody) return fromBody;
  const h = headers["x-webhook-secret"];
  return typeof h === "string" ? h : Array.isArray(h) ? String(h[0] ?? "") : "";
}

/** Payment id carried by a Moyasar webhook (`data.id`); null when the body is not a payment event. */
export function webhookPaymentId(body: unknown): string | null {
  const data = body && typeof body === "object" ? (body as { data?: { id?: unknown } }).data : undefined;
  return data && typeof data.id === "string" && data.id.length >= 4 ? data.id : null;
}

/** Maps a gateway status to our ledger status. Unknown statuses are treated as still initiated. */
export function recordStatusFor(gwStatus: string): PaymentRecordStatus {
  switch (gwStatus) {
    case "paid":
    case "captured":
      return "PAID";
    case "authorized":
      return "AUTHORIZED";
    case "failed":
    case "voided":
      return "FAILED";
    case "refunded":
      return "REFUNDED";
    default:
      return "INITIATED";
  }
}

/** The gateway payment must be for exactly the order total in SAR (halalas); anything else is rejected. */
export function checkGatewayAmount(gw: Pick<MoyasarPayment, "amount" | "currency">, orderTotal: number, orderCurrency = "SAR"): { ok: boolean; reason?: string } {
  if ((gw.currency ?? "").toUpperCase() !== orderCurrency.toUpperCase()) return { ok: false, reason: `currency ${gw.currency} ≠ ${orderCurrency}` };
  const expected = toHalalas(orderTotal);
  if (gw.amount !== expected) return { ok: false, reason: `amount ${gw.amount} halalas ≠ ${expected}` };
  return { ok: true };
}

/**
 * Idempotency / ordering rules for a payment id we have seen before:
 * same status twice → no-op; nothing after a refund; a stale failed/authorized event cannot undo a paid record.
 */
export function planSync(existing: PaymentRecordStatus | null | undefined, incoming: PaymentRecordStatus): "apply" | "noop" | "ignore" {
  if (existing === incoming) return "noop";
  if (existing === "REFUNDED") return "ignore";
  if (existing === "PAID" && incoming !== "REFUNDED") return "ignore";
  return "apply";
}

export interface BankDetails {
  bankName: string;
  iban: string;
  beneficiary: string;
  /** "supplier" when the seller has an IBAN on its company profile, otherwise the platform account. */
  source: "supplier" | "platform";
}
/** Bank details the buyer should transfer to: the supplier's own account (house supplier included) or the platform's. */
export function bankDetailsFor(company?: Pick<Company, "bankName" | "iban" | "beneficiary" | "name"> | null): BankDetails {
  if (company?.iban) return { bankName: company.bankName ?? "", iban: company.iban, beneficiary: company.beneficiary ?? company.name, source: "supplier" };
  return { bankName: env.bank.name, iban: env.bank.iban, beneficiary: env.bank.beneficiary, source: "platform" };
}

// ------------------------------------------------------------------ gateway sync

const orderInclude = { company: true, items: { include: { material: true } } } satisfies Prisma.OrderInclude;
const sar = (n: number | Prisma.Decimal) => `SAR ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const json = (v: unknown) => v as Prisma.InputJsonValue;

export type SyncSource = "verify" | "webhook" | "reconcile" | "job";
export interface SyncResult {
  outcome: "applied" | "noop" | "ignored" | "mismatch" | "no_order" | "foreign";
  status?: PaymentRecordStatus;
  payment?: Prisma.PaymentGetPayload<Record<string, never>>;
  order?: Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
}

/**
 * Applies a gateway payment to our ledger and order. Verifies the order binding (metadata.order_id), the
 * amount and currency, records the raw payload, and – only when the state actually changes – moves the
 * order, writes the timeline event, notifies buyer and supplier and emits ERP webhooks.
 */
export async function syncGatewayPayment(gw: MoyasarPayment, opts: { source: SyncSource; expectOrderId?: string; userId?: string }): Promise<SyncResult> {
  const orderId = gw.metadata?.order_id;
  if (!orderId) return { outcome: "no_order" };
  if (opts.expectOrderId && opts.expectOrderId !== orderId) throw badRequest("This payment does not belong to this order");
  const existing = await prisma.payment.findUnique({ where: { providerPaymentId: gw.id } });
  if (existing && existing.orderId !== orderId) {
    if (opts.source === "verify") throw badRequest("This payment is already linked to another order");
    return { outcome: "foreign" };
  }
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) return { outcome: "no_order" };

  const check = checkGatewayAmount(gw, Number(order.total), order.currency);
  const incoming: PaymentRecordStatus = check.ok ? recordStatusFor(gw.status) : "FAILED";
  const plan = planSync(existing?.status, incoming);
  const raw = { ...gw, mysupplier: { source: opts.source, syncedAt: new Date().toISOString(), ...(check.ok ? {} : { mismatch: check.reason }) } };
  const now = new Date();
  const changes: Prisma.PaymentUncheckedUpdateInput = plan === "apply"
    ? { status: incoming, raw: json(raw), method: "CARD", ...(incoming === "PAID" ? { paidAt: now, confirmedAt: now } : {}) }
    : { raw: json(raw) }; // keep the latest payload even when nothing moves

  let payment;
  if (existing) {
    payment = await prisma.payment.update({ where: { id: existing.id }, data: changes });
  } else {
    // Adopt the INITIATED intent row created when the form was opened, so one row tells the whole story.
    const intent = await prisma.payment.findFirst({ where: { orderId, provider: "MOYASAR", providerPaymentId: null, status: "INITIATED" }, orderBy: { createdAt: "desc" } });
    const data = { providerPaymentId: gw.id, status: incoming, raw: json(raw), method: "CARD" as PaymentMethod, amount: order.total, currency: order.currency, ...(incoming === "PAID" ? { paidAt: now, confirmedAt: now } : {}) };
    payment = intent
      ? await prisma.payment.update({ where: { id: intent.id }, data })
      : await prisma.payment.create({ data: { orderId, provider: "MOYASAR", ...data } });
  }
  if (!check.ok) {
    if (plan === "apply") await recordOrderEvent(orderId, "PAYMENT", { message: `Card payment ${gw.id} rejected: ${check.reason}` });
    return { outcome: "mismatch", status: incoming, payment, order };
  }
  if (plan !== "apply") return { outcome: plan === "noop" ? "noop" : "ignored", status: incoming, payment, order };

  const ref = order.reference;
  const supplierUsers = () => companyUserIds([order.companyId]);
  let updated = order;
  if (incoming === "PAID" && order.paymentStatus !== "PAID") {
    const released = order.paymentMethod === "CREDIT" ? await releaseCredit(order.id).catch(() => 0) : 0;
    updated = await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID", paymentMethod: "CARD" }, include: orderInclude });
    await recordOrderEvent(orderId, "PAYMENT", { message: `Card payment received (${gw.id}${gw.source?.company ? `, ${gw.source.company}` : ""})${released ? ` · ${sar(released)} credit released` : ""}`, userId: opts.userId });
    await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `Payment received for ${ref}`, body: `${sar(order.total)} paid by card. Thank you!`, link: `/dashboard/orders/${order.id}`, alert: { kind: "ORDER_STATUS", titleAr: `تم استلام دفعة الطلب ${ref}`, bodyAr: `تم دفع ${sar(order.total)} بالبطاقة. شكراً لك!` } });
    await notify({ userIds: await supplierUsers(), type: "ORDER_UPDATE", title: `${ref} paid`, body: "The buyer paid by card. Please confirm and dispatch.", link: `/supplier/orders/${order.id}` });
    await emitOrderWebhook("order.paid", order.id, { payment: { provider: "MOYASAR", providerPaymentId: gw.id, amount: Number(order.total), method: "CARD" } });
  } else if (incoming === "AUTHORIZED") {
    await recordOrderEvent(orderId, "PAYMENT", { message: `Card payment authorised (${gw.id}) – awaiting capture` });
  } else if (incoming === "FAILED") {
    await recordOrderEvent(orderId, "PAYMENT", { message: `Card payment ${gw.status} (${gw.id})${gw.source?.message ? `: ${gw.source.message}` : ""}` });
    if (order.paymentStatus === "UNPAID") {
      await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `Card payment failed for ${ref}`, body: `${gw.source?.message ?? "The bank declined the payment"}. No money was taken – you can retry or choose another payment method.`, link: `/dashboard/orders/${order.id}` });
    }
  } else if (incoming === "REFUNDED" && order.paymentStatus === "PAID") {
    const refunded = gw.refunded ? gw.refunded / 100 : Number(order.total);
    updated = await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUNDED" }, include: orderInclude });
    await recordOrderEvent(orderId, "PAYMENT", { message: `Refunded ${sar(refunded)} via the gateway (${gw.id})` });
    await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `Refund issued for ${ref}`, body: `${sar(refunded)} is on its way back to your card (5–10 business days).`, link: `/dashboard/orders/${order.id}` });
    await notify({ userIds: await supplierUsers(), type: "ORDER_UPDATE", title: `${ref} refunded`, body: `${sar(refunded)} was refunded to the buyer through the gateway.`, link: `/supplier/orders/${order.id}` });
    await emitOrderWebhook("payment.refunded", order.id, { refund: { amount: refunded, method: "CARD", paymentId: payment.id, source: "gateway" } });
  }
  return { outcome: "applied", status: incoming, payment, order: updated };
}

/**
 * Records a manual settlement when a supplier/admin marks an order PAID: pending bank-transfer proofs
 * become PAID (confirmed by the actor); otherwise a MANUAL PAID row is written so the ledger has every payment.
 */
export async function recordManualSettlement(order: { id: string; total: Prisma.Decimal; currency: string; paymentMethod: PaymentMethod | null }, userId: string) {
  const now = new Date();
  const confirmed = await prisma.payment.updateMany({ where: { orderId: order.id, status: "SUBMITTED" }, data: { status: "PAID", confirmedById: userId, confirmedAt: now } });
  if (confirmed.count > 0) return confirmed.count;
  await prisma.payment.create({ data: { orderId: order.id, provider: "MANUAL", amount: order.total, currency: order.currency, status: "PAID", method: order.paymentMethod ?? undefined, paidAt: now, confirmedById: userId, confirmedAt: now, raw: json({ recordedBy: userId }) } });
  return 1;
}

/**
 * Reconciles stale gateway records: INITIATED/AUTHORIZED Moyasar payments older than one hour are re-fetched
 * (webhook lost, buyer closed the tab after paying); intents that never produced a gateway payment are looked
 * up by order metadata and, after 24 h, marked FAILED as abandoned. Runs from the scheduled jobs and is idempotent.
 */
export async function reconcileStalePayments(opts: { olderThanMs?: number; limit?: number } = {}) {
  const result = { checked: 0, applied: 0, abandoned: 0, errors: 0 };
  if (!cardPaymentsEnabled()) return { ...result, skipped: "gateway not configured" };
  const cutoff = new Date(Date.now() - (opts.olderThanMs ?? 60 * 60 * 1000));
  const stale = await prisma.payment.findMany({ where: { provider: "MOYASAR", status: { in: ["INITIATED", "AUTHORIZED"] }, createdAt: { lt: cutoff } }, orderBy: { createdAt: "asc" }, take: opts.limit ?? 50 });
  for (const p of stale) {
    result.checked++;
    try {
      if (p.providerPaymentId) {
        const r = await syncGatewayPayment(await fetchMoyasarPayment(p.providerPaymentId), { source: "job" });
        if (r.outcome === "applied") result.applied++;
        continue;
      }
      const found = await listMoyasarPaymentsForOrder(p.orderId).catch(() => [] as MoyasarPayment[]);
      let moved = false;
      for (const gw of found) {
        const r = await syncGatewayPayment(gw, { source: "job" });
        if (r.outcome === "applied") { result.applied++; moved = true; }
      }
      if (!moved && p.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        const still = await prisma.payment.findUnique({ where: { id: p.id } });
        if (still?.status === "INITIATED" && !still.providerPaymentId) {
          await prisma.payment.update({ where: { id: p.id }, data: { status: "FAILED", raw: json({ reason: "abandoned", reconciledAt: new Date().toISOString() }) } });
          result.abandoned++;
        }
      }
    } catch (e) {
      result.errors++;
      console.error("[payments] reconcile failed", p.id, e);
    }
  }
  return result;
}
