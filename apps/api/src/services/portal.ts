import type { NextFunction, Request, Response } from "express";
import { Prisma, type CompanyRole, type OrderEventType, type OrderStatus, type StockMovementType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { forbidden, badRequest } from "../lib/errors";
import { round2 } from "./pricing";

// ------------------------------------------------------------------ roles
const MANAGERS: CompanyRole[] = ["OWNER", "MANAGER"];

/** Restricts a supplier endpoint to given company roles (admins always pass). Users without a role are treated as OWNER. */
export function requireCompanyRole(...roles: CompanyRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const u = req.user!;
      if (u.role === "ADMIN") return next();
      const me = await prisma.user.findUnique({ where: { id: u.id }, select: { companyRole: true } });
      const role = me?.companyRole ?? "OWNER";
      if (!roles.includes(role)) throw forbidden(`Requires company role ${roles.join(" or ")}`);
      next();
    } catch (e) {
      next(e);
    }
  };
}
export const requireManager = () => requireCompanyRole(...MANAGERS);

// ------------------------------------------------------------------ settings
export interface PlatformSettings {
  commissionPct: number;
  payoutDayOfWeek: number;
  lowStockThresholdDefault: number;
}
const DEFAULT_SETTINGS: PlatformSettings = { commissionPct: 3, payoutDayOfWeek: 1, lowStockThresholdDefault: 10 };

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in out) (out as Record<string, unknown>)[r.key] = r.value;
  return out;
}

export async function saveSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await prisma.platformSetting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
  }
  return getSettings();
}

// ------------------------------------------------------------------ commission / finance (pure)
export function commissionFor(total: number, pct: number) {
  const commission = round2((total * pct) / 100);
  return { commission, net: round2(total - commission) };
}

export async function companyCommissionPct(companyId: string): Promise<number> {
  const [company, settings] = await Promise.all([prisma.company.findUnique({ where: { id: companyId }, select: { commissionPct: true } }), getSettings()]);
  return company?.commissionPct !== null && company?.commissionPct !== undefined ? Number(company.commissionPct) : settings.commissionPct;
}

// ------------------------------------------------------------------ order events
export async function recordOrderEvent(orderId: string, type: OrderEventType, opts: { status?: OrderStatus; message?: string; userId?: string } = {}) {
  await prisma.orderEvent.create({ data: { orderId, type, status: opts.status, message: opts.message, userId: opts.userId } });
}

// ------------------------------------------------------------------ inventory
/**
 * Applies a stock movement to a listing. IN adds, OUT/RESERVE subtract, RELEASE adds back,
 * ADJUST sets the absolute level (quantity = new level). Listings with stock=null are "not tracked":
 * IN/ADJUST start tracking, OUT on an untracked listing is recorded without a balance.
 */
export async function applyStockMovement(listingId: string, type: StockMovementType, quantity: number, opts: { reason?: string; orderId?: string; userId?: string; tx?: Prisma.TransactionClient } = {}) {
  const db = opts.tx ?? prisma;
  const listing = await db.priceListing.findUniqueOrThrow({ where: { id: listingId }, select: { id: true, stock: true, companyId: true } });
  if (!listing.companyId) throw badRequest("Only supplier listings carry stock");
  if (quantity < 0) throw badRequest("Quantity must be positive");
  let balance: number | null = listing.stock;
  if (type === "ADJUST") balance = Math.round(quantity);
  else if (type === "IN" || type === "RELEASE") balance = (balance ?? 0) + quantity;
  else if (balance !== null) balance = Math.max(0, balance - quantity);
  await db.priceListing.update({ where: { id: listingId }, data: { stock: balance === null ? undefined : Math.round(balance) } });
  return db.stockMovement.create({
    data: { listingId, companyId: listing.companyId, type, quantity, balanceAfter: balance, reason: opts.reason, orderId: opts.orderId, userId: opts.userId },
  });
}

/** Quantities sitting in orders that are not yet dispatched, per listing. */
export async function reservedByListing(companyId: string): Promise<Map<string, number>> {
  const rows = await prisma.orderItem.groupBy({
    by: ["listingId"],
    where: { order: { companyId, status: { in: ["PENDING", "CONFIRMED"] } }, listingId: { not: null } },
    _sum: { quantity: true },
  });
  return new Map(rows.filter((r) => r.listingId).map((r) => [r.listingId!, r._sum.quantity ?? 0]));
}

export async function soldLast30dByListing(companyId: string): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await prisma.orderItem.groupBy({
    by: ["listingId"],
    where: { order: { companyId, status: { not: "CANCELLED" }, createdAt: { gte: since } }, listingId: { not: null } },
    _sum: { quantity: true },
  });
  return new Map(rows.filter((r) => r.listingId).map((r) => [r.listingId!, r._sum.quantity ?? 0]));
}

// ------------------------------------------------------------------ ratings
export async function refreshCompanyRating(companyId: string) {
  const agg = await prisma.review.aggregate({ where: { companyId }, _avg: { rating: true }, _count: { _all: true } });
  await prisma.company.update({ where: { id: companyId }, data: { rating: round2(agg._avg.rating ?? 0), ratingCount: agg._count._all } });
}

// ------------------------------------------------------------------ misc
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

export function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(Date.now() - i * 86400000)));
  return out;
}
