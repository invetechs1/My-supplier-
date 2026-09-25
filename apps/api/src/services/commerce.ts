/**
 * B2B commerce: volume tiers & sale pricing, credit terms (net terms), per-supplier direct order
 * creation shared by checkout and recurring orders, returns/RMA refund maths and recurring order runs.
 *
 * Pure helpers (unitPriceFor, pricingFor, creditInfoFor, canUseCredit, computeRefund, computeNextRunAt)
 * are DB-free so they can be unit tested; the async functions wrap Prisma.
 */
import { Prisma, type CarrierCode, type PaymentMethod } from "@prisma/client";
import type { CartItemPricing, CreditInfo, ListingTier } from "@mysupplier/shared";
import { prisma } from "../lib/prisma";
import { badRequest } from "../lib/errors";
import { round2 } from "./pricing";
import { VAT_RATE, deliveryFee, isPurchasable, toOffer, type ListingWithCompany } from "./shop";
import { applyStockMovement } from "./portal";
import { carrierName, quoteForSupplier } from "./shipping";
import { splitDiscount, validateCoupon } from "./coupons";
import { companyUserIds, notify } from "./notifications";

type Num = Prisma.Decimal | number | string;
const num = (v: Num | null | undefined) => (v === null || v === undefined ? null : Number(v));

// ================================================================== pricing
export interface PricedListing {
  price: Num;
  salePrice?: Num | null;
  saleEndsAt?: Date | string | null;
  tiers?: Array<{ minQty: number; price: Num }> | null;
}

export function saleIsLive(listing: Pick<PricedListing, "salePrice" | "saleEndsAt">, now = new Date()): boolean {
  const sale = num(listing.salePrice);
  if (sale === null || sale <= 0) return false;
  if (!listing.saleEndsAt) return true;
  return new Date(listing.saleEndsAt).getTime() > now.getTime();
}

function sortedTiers(listing: PricedListing): ListingTier[] {
  return (listing.tiers ?? []).map((t) => ({ minQty: Number(t.minQty), price: Number(t.price) })).sort((a, b) => a.minQty - b.minQty);
}

/** Full pricing breakdown for a line (what the cart shows). */
export function pricingFor(listing: PricedListing, qty: number, now = new Date()): CartItemPricing {
  const basePrice = Number(listing.price);
  if (saleIsLive(listing, now)) return { unitPrice: Number(listing.salePrice), basePrice, tierApplied: null, saleApplied: true, nextTier: null };
  const tiers = sortedTiers(listing);
  let applied: ListingTier | null = null;
  for (const t of tiers) if (t.minQty <= qty) applied = t; // highest tier reached (tiers are ascending)
  const unitPrice = applied ? applied.price : basePrice;
  const next = tiers.find((t) => t.minQty > qty && t.price < unitPrice) ?? null;
  return {
    unitPrice, basePrice, tierApplied: applied, saleApplied: false,
    nextTier: next ? { ...next, savePerUnit: round2(unitPrice - next.price) } : null,
  };
}

/** Effective unit price: sale price if live, else the highest tier whose minQty <= qty, else the base price. */
export function unitPriceFor(listing: PricedListing, qty: number, now = new Date()): number {
  return pricingFor(listing, qty, now).unitPrice;
}

/** Validates a supplier's tier ladder: ascending minQty (> 1), strictly decreasing prices, all below the base price. */
export function validateTiers(tiers: Array<{ minQty: number; price: number }>, basePrice: number): string | null {
  let prevQty = 1;
  let prevPrice = basePrice;
  for (const [i, t] of tiers.entries()) {
    if (!(t.minQty > prevQty)) return `Tier ${i + 1}: minimum quantity must be greater than ${prevQty}`;
    if (!(t.price > 0)) return `Tier ${i + 1}: price must be positive`;
    if (!(t.price < prevPrice)) return `Tier ${i + 1}: price must be lower than ${i === 0 ? "the base price" : "the previous tier"} (${prevPrice})`;
    prevQty = t.minQty;
    prevPrice = t.price;
  }
  return null;
}

// ================================================================== credit terms
export interface CreditCompany {
  creditApproved: boolean;
  creditLimit: Num | null;
  creditTermsDays: number | null;
  creditUsed: Num;
}

export const DEFAULT_CREDIT_TERMS_DAYS = 30;

export function creditInfoFor(company: CreditCompany | null | undefined): CreditInfo {
  if (!company) return { approved: false, limit: 0, used: 0, available: 0, termsDays: 0 };
  const limit = round2(num(company.creditLimit) ?? 0);
  const used = round2(num(company.creditUsed) ?? 0);
  return {
    approved: company.creditApproved,
    limit, used,
    available: company.creditApproved ? round2(Math.max(0, limit - used)) : 0,
    termsDays: company.creditTermsDays ?? (company.creditApproved ? DEFAULT_CREDIT_TERMS_DAYS : 0),
  };
}

/** Can this company put `amount` on account? (creditApproved and creditUsed + amount <= creditLimit) */
export function canUseCredit(company: CreditCompany | null | undefined, amount: number): { ok: true; info: CreditInfo } | { ok: false; reason: string; info: CreditInfo } {
  const info = creditInfoFor(company);
  if (!company || !info.approved) return { ok: false, reason: "Credit terms are not approved for your company. Pay by card, bank transfer or cash on delivery.", info };
  if (round2(info.used + amount) > info.limit + 1e-9) return { ok: false, reason: `This order (SAR ${round2(amount).toLocaleString("en-US")}) exceeds your available credit of SAR ${info.available.toLocaleString("en-US")}`, info };
  return { ok: true, info };
}

export function creditDueDate(termsDays: number, now = new Date()): Date {
  return new Date(now.getTime() + Math.max(0, termsDays) * 86400000);
}

/**
 * Gives credit back to the buyer's company when a CREDIT order is settled (paid), cancelled or refunded.
 * `amount` defaults to the order total; the balance never goes below zero. Safe to call for non-credit orders (no-op).
 */
export async function releaseCredit(orderId: string, opts: { amount?: number; tx?: Prisma.TransactionClient } = {}): Promise<number> {
  const db = opts.tx ?? prisma;
  const order = await db.order.findUnique({ where: { id: orderId }, select: { paymentMethod: true, total: true, buyer: { select: { companyId: true } } } });
  if (!order || order.paymentMethod !== "CREDIT" || !order.buyer.companyId) return 0;
  const company = await db.company.findUnique({ where: { id: order.buyer.companyId }, select: { creditUsed: true } });
  if (!company) return 0;
  const release = round2(Math.min(Number(company.creditUsed), opts.amount ?? Number(order.total)));
  if (release <= 0) return 0;
  await db.company.update({ where: { id: order.buyer.companyId }, data: { creditUsed: { decrement: release } } });
  return release;
}

// ================================================================== references
/** RET-2026-000001 style references (same counter mechanism as ORD/RFQ). */
export async function nextCommerceReference(prefix: "RET"): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}

async function nextOrderReference(): Promise<string> {
  const year = new Date().getFullYear();
  const key = `ORD-${year}`;
  const counter = await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `ORD-${year}-${String(counter.value).padStart(6, "0")}`;
}

// ================================================================== line validation
export const orderLineInclude = { company: true, material: { include: { category: true } }, tiers: true } satisfies Prisma.PriceListingInclude;
export type OrderLineListing = Prisma.PriceListingGetPayload<{ include: typeof orderLineInclude }>;
export interface OrderLine { listing: OrderLineListing; quantity: number }
export interface OrderGroup { companyId: string; items: OrderLine[] }

/** Throws a 400 when the listing cannot be bought in this quantity right now. */
export function assertPurchasable(listing: ListingWithCompany & { active?: boolean; validUntil?: Date | null }, quantity: number) {
  const offer = toOffer(listing);
  if (listing.active === false) throw badRequest("This offer is paused by the supplier");
  if (listing.validUntil && listing.validUntil < new Date()) throw badRequest("This offer has expired");
  if (!isPurchasable(offer)) throw badRequest("This offer is a reference price or out of stock and cannot be purchased. Request a quote instead.");
  if (quantity < offer.minQty) throw badRequest(`Minimum order quantity for this offer is ${offer.minQty}`);
  if (offer.stock !== null && quantity > offer.stock) throw badRequest(`Only ${offer.stock} available from this supplier`);
  return offer;
}

export function groupBySupplier(lines: OrderLine[]): OrderGroup[] {
  const map = new Map<string, OrderLine[]>();
  for (const line of lines) {
    const key = line.listing.companyId;
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), line]);
  }
  return [...map.entries()].map(([companyId, items]) => ({ companyId, items }));
}

export type SupplierQuote = Awaited<ReturnType<typeof quoteForSupplier>>["quotes"][number];

/** Cheapest (or chosen) delivery quote per supplier for a set of lines (null when quoting is impossible). */
export async function quotesForGroups(groups: OrderGroup[], deliveryCity?: string, carrierBySupplier: Record<string, CarrierCode> = {}) {
  const out: Record<string, SupplierQuote | null> = {};
  if (!deliveryCity) return out;
  for (const g of groups) {
    const { quotes } = await quoteForSupplier(g.companyId, g.items.map((i) => ({ materialId: i.listing.materialId, quantity: i.quantity })), deliveryCity);
    const wanted = carrierBySupplier[g.companyId];
    out[g.companyId] = (wanted ? quotes.find((q) => q.carrier === wanted) : undefined) ?? quotes[0] ?? null;
  }
  return out;
}

// ================================================================== direct order creation (checkout + recurring)
export interface CreateDirectOrdersInput {
  userId: string;
  groups: OrderGroup[];
  deliveryCity: string;
  deliveryAddress: string;
  contactPhone: string;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  addressId?: string | null;
  poNumber?: string | null;
  couponCode?: string | null;
  carrierBySupplier?: Record<string, CarrierCode>;
  recurringOrderId?: string | null;
  now?: Date;
}

export const directOrderInclude = { company: true, items: { include: { material: true } } } satisfies Prisma.OrderInclude;
export type DirectOrder = Prisma.OrderGetPayload<{ include: typeof directOrderInclude }>;

/**
 * Creates one DIRECT order per supplier group (marketplace-style split checkout): effective tier/sale
 * pricing, coupon split pro rata, delivery quote per supplier, stock reservation, CREDIT terms
 * (due date + company creditUsed), shipment placeholder, order event and supplier notification.
 * Does not touch the cart – the caller clears it.
 */
export async function createDirectOrders(input: CreateDirectOrdersInput) {
  const now = input.now ?? new Date();
  const groups = input.groups.filter((g) => g.items.length);
  if (!groups.length) throw badRequest("Nothing to order");
  const carrierBySupplier = input.carrierBySupplier ?? {};

  const priced = groups.map((g) => ({
    ...g,
    lines: g.items.map((i) => {
      const unitPrice = unitPriceFor(i.listing, i.quantity, now);
      return { ...i, unitPrice, lineTotal: round2(unitPrice * i.quantity) };
    }),
  }));
  const groupSubtotals = priced.map((g) => round2(g.lines.reduce((s, l) => s + l.lineTotal, 0)));
  const cartSubtotal = round2(groupSubtotals.reduce((s, v) => s + v, 0));

  // Coupon: validated against the whole basket, then split across the per-supplier orders pro rata.
  const couponCheck = await validateCoupon(input.couponCode ?? undefined, cartSubtotal);
  if (couponCheck && !couponCheck.ok) throw badRequest(couponCheck.reason);
  const discounts = splitDiscount(couponCheck?.ok ? couponCheck.discount : 0, groupSubtotals);
  const couponCode = couponCheck?.ok ? couponCheck.coupon.code : null;

  const quotes = await quotesForGroups(groups, input.deliveryCity, carrierBySupplier);
  const totals = priced.map((g, gi) => {
    const subtotal = groupSubtotals[gi];
    const discount = discounts[gi];
    const vat = round2((subtotal - discount) * VAT_RATE);
    const quote = quotes[g.companyId] ?? null;
    const fee = quote?.price ?? deliveryFee(g.items[0].listing.city, input.deliveryCity);
    return { subtotal, discount, vat, fee, quote, total: round2(subtotal - discount + vat + fee) };
  });
  const grandTotal = round2(totals.reduce((s, t) => s + t.total, 0));

  // Credit terms: the whole basket must fit in the buyer company's available credit.
  const buyer = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { id: true, companyId: true, company: { select: { creditApproved: true, creditLimit: true, creditTermsDays: true, creditUsed: true } } } });
  let termsDays = 0;
  if (input.paymentMethod === "CREDIT") {
    const check = canUseCredit(buyer.company, grandTotal);
    if (!check.ok) throw badRequest(check.reason);
    termsDays = check.info.termsDays;
  }

  const orders: DirectOrder[] = [];
  for (const [gi, g] of priced.entries()) {
    const reference = await nextOrderReference();
    const { subtotal, discount, vat, fee, quote, total } = totals[gi];
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          reference, type: "DIRECT", buyerId: input.userId, companyId: g.companyId, subtotal, vat, deliveryFee: fee, total, discount, couponCode,
          paymentMethod: input.paymentMethod, deliveryCity: input.deliveryCity, deliveryAddress: input.deliveryAddress,
          contactPhone: input.contactPhone, notes: input.notes ?? undefined,
          addressId: input.addressId ?? undefined, poNumber: input.poNumber ?? undefined, recurringOrderId: input.recurringOrderId ?? undefined,
          dueDate: input.paymentMethod === "CREDIT" ? creditDueDate(termsDays, now) : undefined,
          items: {
            create: g.lines.map((l) => ({
              materialId: l.listing.materialId, listingId: l.listing.id, name: l.listing.material.name, unit: l.listing.material.unit,
              unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.lineTotal,
            })),
          },
        },
        include: directOrderInclude,
      });
      for (const l of g.lines) {
        await applyStockMovement(l.listing.id, "OUT", l.quantity, { reason: `Order ${reference}`, orderId: created.id, userId: input.userId, tx });
        await tx.material.update({ where: { id: l.listing.materialId }, data: { popularity: { increment: 5 } } });
      }
      if (input.paymentMethod === "CREDIT" && buyer.companyId) {
        // Re-check inside the transaction so concurrent checkouts cannot overshoot the limit.
        const fresh = await tx.company.findUniqueOrThrow({ where: { id: buyer.companyId }, select: { creditApproved: true, creditLimit: true, creditTermsDays: true, creditUsed: true } });
        const check = canUseCredit(fresh, total);
        if (!check.ok) throw badRequest(check.reason);
        await tx.company.update({ where: { id: buyer.companyId }, data: { creditUsed: { increment: total } } });
      }
      const via = input.recurringOrderId ? " · recurring order" : "";
      const po = input.poNumber ? ` · PO ${input.poNumber}` : "";
      await tx.orderEvent.create({ data: { orderId: created.id, type: "CREATED", status: "PENDING", message: `Order placed · ${input.paymentMethod.replace("_", " ").toLowerCase()}${input.paymentMethod === "CREDIT" ? ` (net ${termsDays} days)` : ""}${po}${via}`, userId: input.userId } });
      await tx.shipment.create({ data: { orderId: created.id, carrier: quote?.carrier ?? "SUPPLIER", carrierName: carrierName(quote?.carrier ?? "SUPPLIER"), service: quote?.service, cost: fee, weightKg: quote?.weightKg, volumeM3: quote?.volumeM3, status: "PENDING", events: { create: { status: "PENDING", description: quote ? `${quote.carrierName} · ${quote.service} · ETA ${quote.etaDays} day(s)` : "Awaiting supplier booking" } } } });
      return created;
    });
    orders.push(order);
    await notify({
      userIds: await companyUserIds([g.companyId]),
      type: "ORDER_UPDATE",
      title: `New order ${reference}`,
      body: `${g.lines.length} item(s), SAR ${total.toLocaleString("en-US")} incl. VAT, deliver to ${input.deliveryCity}.${input.poNumber ? ` PO ${input.poNumber}.` : ""} Please confirm.`,
      link: `/supplier/orders/${order.id}`,
    });
  }
  if (couponCode) await prisma.coupon.update({ where: { code: couponCode }, data: { usedCount: { increment: 1 } } });
  return { orders, total: grandTotal, couponCode };
}

// ================================================================== returns / RMA
export interface RefundOrder {
  subtotal: Num;
  discount: Num;
  items: Array<{ id: string; unitPrice: Num; quantity: number }>;
}

/**
 * Refund for returned lines: unit price × quantity, minus the order's pro-rata coupon discount,
 * plus the VAT share (VAT was charged on the discounted subtotal).
 */
export function computeRefund(order: RefundOrder, returned: Array<{ orderItemId: string; quantity: number }>, vatRate = VAT_RATE): number {
  const subtotal = Number(order.subtotal);
  const discount = Number(order.discount ?? 0);
  const factor = subtotal > 0 ? Math.max(0, (subtotal - discount) / subtotal) : 1;
  let goods = 0;
  for (const r of returned) {
    const item = order.items.find((i) => i.id === r.orderItemId);
    if (!item) continue;
    goods += Number(item.unitPrice) * Math.min(r.quantity, item.quantity);
  }
  return round2(goods * factor * (1 + vatRate));
}

export const RETURN_WINDOW_DAYS = 14;
export const RETURN_REASONS = ["DAMAGED", "DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED", "EXCESS", "OTHER"] as const;

// ================================================================== recurring orders
/** Next run strictly after `now`, stepping `intervalDays` from the previous schedule (catch-up skips missed slots). */
export function computeNextRunAt(previous: Date, intervalDays: number, now = new Date()): Date {
  const step = Math.max(1, Math.round(intervalDays)) * 86400000;
  let next = previous.getTime() + step;
  if (next <= now.getTime()) {
    const missed = Math.floor((now.getTime() - previous.getTime()) / step);
    next = previous.getTime() + (missed + 1) * step;
  }
  return new Date(next);
}

export interface RecurringLine { listingId: string; quantity: number; name?: string; unit?: string; companyName?: string }

export function parseRecurringItems(raw: Prisma.JsonValue): RecurringLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => (r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, unknown>) : null))
    .filter((r): r is Record<string, unknown> => !!r && typeof r.listingId === "string" && typeof r.quantity === "number" && r.quantity > 0)
    .map((r) => ({ listingId: r.listingId as string, quantity: r.quantity as number, name: r.name as string | undefined, unit: r.unit as string | undefined, companyName: r.companyName as string | undefined }));
}

/** Loads live listings for recurring lines, separating purchasable lines from skipped ones. */
export async function resolveRecurringLines(lines: RecurringLine[]) {
  const listings = await prisma.priceListing.findMany({ where: { id: { in: lines.map((l) => l.listingId) } }, include: orderLineInclude });
  const byId = new Map(listings.map((l) => [l.id, l]));
  const ok: OrderLine[] = [];
  const skipped: Array<{ listingId: string; quantity: number; reason: string }> = [];
  for (const line of lines) {
    const listing = byId.get(line.listingId);
    if (!listing) {
      skipped.push({ listingId: line.listingId, quantity: line.quantity, reason: "Offer no longer exists" });
      continue;
    }
    try {
      assertPurchasable(listing, line.quantity);
      ok.push({ listing, quantity: line.quantity });
    } catch (e) {
      skipped.push({ listingId: line.listingId, quantity: line.quantity, reason: e instanceof Error ? e.message : "Not purchasable" });
    }
  }
  return { ok, skipped };
}

/** Runs one recurring order now: creates the per-supplier orders and advances the schedule. Notifies the buyer. */
export async function runRecurringOrder(id: string, now = new Date(), opts: { userId?: string } = {}) {
  const ro = await prisma.recurringOrder.findUniqueOrThrow({ where: { id } });
  const { ok, skipped } = await resolveRecurringLines(parseRecurringItems(ro.items));
  const nextRunAt = computeNextRunAt(ro.nextRunAt, ro.intervalDays, now);
  let orders: DirectOrder[] = [];
  let error: string | null = null;
  if (ok.length) {
    try {
      const result = await createDirectOrders({
        userId: ro.userId, groups: groupBySupplier(ok), deliveryCity: ro.deliveryCity, deliveryAddress: ro.deliveryAddress, contactPhone: ro.contactPhone,
        paymentMethod: ro.paymentMethod, notes: `Recurring order "${ro.name}"`, recurringOrderId: ro.id, now,
      });
      orders = result.orders;
    } catch (e) {
      error = e instanceof Error ? e.message : "Order could not be placed";
    }
  } else error = skipped.length ? "No line is purchasable right now" : "Recurring order has no items";

  await prisma.recurringOrder.update({ where: { id: ro.id }, data: { lastRunAt: now, lastOrderId: orders[0]?.id ?? ro.lastOrderId, nextRunAt } });
  const total = round2(orders.reduce((s, o) => s + Number(o.total), 0));
  await notify({
    userIds: [ro.userId], type: "ORDER_UPDATE",
    title: orders.length ? `Recurring order "${ro.name}" placed` : `Recurring order "${ro.name}" could not be placed`,
    body: orders.length
      ? `${orders.length} order(s), SAR ${total.toLocaleString("en-US")} incl. VAT.${skipped.length ? ` ${skipped.length} line(s) skipped.` : ""} Next run ${nextRunAt.toISOString().slice(0, 10)}.`
      : `${error ?? "Unknown error"}. Next attempt ${nextRunAt.toISOString().slice(0, 10)}.`,
    link: orders.length ? `/dashboard/orders/${orders[0].id}` : `/dashboard/recurring`,
  });
  return { orders, skipped, nextRunAt, error, total };
}

/** Scheduler entry point: runs every active recurring order that is due. */
export async function runRecurringOrders(now = new Date()) {
  const due = await prisma.recurringOrder.findMany({ where: { active: true, nextRunAt: { lte: now } }, select: { id: true } });
  const summary = { processed: 0, created: 0, failed: 0 };
  for (const { id } of due) {
    summary.processed++;
    try {
      const r = await runRecurringOrder(id, now);
      if (r.orders.length) summary.created += r.orders.length;
      else summary.failed++;
    } catch (err) {
      summary.failed++;
      console.error("[recurring] run failed", id, err);
    }
  }
  return summary;
}

// ================================================================== frequently ordered (buy again)
export async function frequentlyOrdered(userId: string, limit = 20, months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const rows = await prisma.orderItem.findMany({
    where: { materialId: { not: null }, order: { buyerId: userId, status: { not: "CANCELLED" }, createdAt: { gte: since } } },
    select: { materialId: true, quantity: true, unitPrice: true, order: { select: { createdAt: true } } },
    orderBy: { order: { createdAt: "desc" } },
  });
  const agg = new Map<string, { quantity: number; orders: number; lastOrderedAt: Date; lastUnitPrice: number }>();
  for (const r of rows) {
    const cur = agg.get(r.materialId!);
    if (cur) {
      cur.quantity += r.quantity;
      cur.orders += 1;
    } else agg.set(r.materialId!, { quantity: r.quantity, orders: 1, lastOrderedAt: r.order.createdAt, lastUnitPrice: Number(r.unitPrice) });
  }
  const top = [...agg.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, limit);
  const ids = top.map(([id]) => id);
  const materials = await prisma.material.findMany({ where: { id: { in: ids } }, include: { category: true } });
  const byId = new Map(materials.map((m) => [m.id, m]));
  const listings = await prisma.priceListing.findMany({ where: { materialId: { in: ids }, active: true, source: "SUPPLIER", companyId: { not: null }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }, include: { company: true, tiers: true }, orderBy: { price: "asc" } });
  const best = new Map<string, ReturnType<typeof toOffer>>();
  for (const l of listings) {
    const offer = toOffer(l);
    if (!isPurchasable(offer) || best.has(l.materialId)) continue;
    best.set(l.materialId, offer);
  }
  return top
    .filter(([id]) => byId.has(id))
    .map(([materialId, a]) => ({ materialId, material: byId.get(materialId)!, quantity: round2(a.quantity), orders: a.orders, lastOrderedAt: a.lastOrderedAt, lastUnitPrice: a.lastUnitPrice, bestOffer: best.get(materialId) ?? null }));
}

/** Cheapest purchasable offer for a material (used when a reordered listing is gone). */
export async function cheapestOffer(materialId: string, city?: string) {
  const listings = await prisma.priceListing.findMany({ where: { materialId, active: true, source: "SUPPLIER", companyId: { not: null }, OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] }, include: orderLineInclude, orderBy: { price: "asc" } });
  const purchasable = listings.filter((l) => isPurchasable(toOffer(l)));
  return purchasable.find((l) => city && l.city === city) ?? purchasable[0] ?? null;
}
