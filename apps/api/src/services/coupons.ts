import type { Coupon } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { round2 } from "./pricing";

export type CouponCheck =
  | { ok: true; coupon: Coupon; discount: number }
  | { ok: false; reason: string; coupon?: Coupon | null };

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Discount a valid coupon yields on `subtotal` (before VAT and delivery). */
export function discountFor(coupon: Pick<Coupon, "type" | "value" | "maxDiscount">, subtotal: number): number {
  const value = Number(coupon.value);
  let discount = coupon.type === "PERCENT" ? (subtotal * value) / 100 : value;
  if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  return round2(Math.max(0, Math.min(discount, subtotal)));
}

/** Pure validity check (no side effects) used by the cart quote and by checkout. */
export function checkCoupon(coupon: Coupon | null, subtotal: number, now = new Date()): CouponCheck {
  if (!coupon) return { ok: false, reason: "Coupon code not found" };
  if (!coupon.active) return { ok: false, reason: "This coupon is no longer active", coupon };
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, reason: "This coupon is not valid yet", coupon };
  if (coupon.endsAt && coupon.endsAt < now) return { ok: false, reason: "This coupon has expired", coupon };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return { ok: false, reason: "This coupon has reached its usage limit", coupon };
  if (coupon.minOrder != null && subtotal < Number(coupon.minOrder)) return { ok: false, reason: `Minimum order for this coupon is SAR ${Number(coupon.minOrder).toLocaleString("en-US")}`, coupon };
  const discount = discountFor(coupon, subtotal);
  if (discount <= 0) return { ok: false, reason: "This coupon gives no discount on this cart", coupon };
  return { ok: true, coupon, discount };
}

export async function validateCoupon(code: string | undefined | null, subtotal: number): Promise<CouponCheck | null> {
  if (!code) return null;
  const coupon = await prisma.coupon.findUnique({ where: { code: normaliseCode(code) } });
  return checkCoupon(coupon, subtotal);
}

/**
 * Split a cart-level discount across per-supplier orders in proportion to their subtotals,
 * pushing rounding remainders onto the largest part so the pieces always sum to the total.
 */
export function splitDiscount(total: number, parts: number[]): number[] {
  const sum = parts.reduce((s, p) => s + p, 0);
  if (total <= 0 || sum <= 0) return parts.map(() => 0);
  const raw = parts.map((p) => round2((total * p) / sum));
  const diff = round2(total - raw.reduce((s, p) => s + p, 0));
  if (diff !== 0) {
    const i = parts.indexOf(Math.max(...parts));
    raw[i] = round2(raw[i] + diff);
  }
  return raw;
}

export function publicCoupon(coupon: Coupon) {
  return { code: coupon.code, type: coupon.type, value: Number(coupon.value), description: coupon.description ?? null, maxDiscount: coupon.maxDiscount != null ? Number(coupon.maxDiscount) : null, minOrder: coupon.minOrder != null ? Number(coupon.minOrder) : null };
}
