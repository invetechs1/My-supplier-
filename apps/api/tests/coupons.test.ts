import { describe, expect, it } from "vitest";
import type { Coupon } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { checkCoupon, discountFor, normaliseCode, splitDiscount } from "../src/services/coupons";

const D = (n: number) => new Prisma.Decimal(n);
const base = (over: Partial<Coupon> = {}): Coupon => ({
  id: "c1", code: "WELCOME10", type: "PERCENT", value: D(10), description: null, minOrder: null, maxDiscount: null,
  startsAt: null, endsAt: null, usageLimit: null, usedCount: 0, active: true, createdAt: new Date(), updatedAt: new Date(), ...over,
});

describe("coupons", () => {
  it("normalises codes", () => {
    expect(normaliseCode("  welcome 10 ")).toBe("WELCOME10");
  });

  it("computes percent and fixed discounts with caps", () => {
    expect(discountFor(base(), 1000)).toBe(100);
    expect(discountFor(base({ maxDiscount: D(50) }), 1000)).toBe(50);
    expect(discountFor(base({ type: "FIXED", value: D(500) }), 300)).toBe(300); // never more than the subtotal
    expect(discountFor(base({ type: "FIXED", value: D(500) }), 12000)).toBe(500);
  });

  it("rejects inactive, expired, scheduled, exhausted and below-minimum coupons", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(checkCoupon(null, 1000, now)).toMatchObject({ ok: false, reason: "Coupon code not found" });
    expect(checkCoupon(base({ active: false }), 1000, now).ok).toBe(false);
    expect(checkCoupon(base({ endsAt: new Date("2026-09-01") }), 1000, now)).toMatchObject({ ok: false, reason: expect.stringContaining("expired") });
    expect(checkCoupon(base({ startsAt: new Date("2026-10-01") }), 1000, now)).toMatchObject({ ok: false, reason: expect.stringContaining("not valid yet") });
    expect(checkCoupon(base({ usageLimit: 5, usedCount: 5 }), 1000, now)).toMatchObject({ ok: false, reason: expect.stringContaining("usage limit") });
    expect(checkCoupon(base({ minOrder: D(5000) }), 1000, now)).toMatchObject({ ok: false, reason: expect.stringContaining("Minimum order") });
    expect(checkCoupon(base({ minOrder: D(1000), maxDiscount: D(500) }), 6927, now)).toMatchObject({ ok: true, discount: 500 });
  });

  it("splits a discount pro rata and keeps the pieces summing to the total", () => {
    expect(splitDiscount(500, [2664, 4263])).toEqual([192.29, 307.71]);
    const parts = splitDiscount(100, [33.33, 33.33, 33.34]);
    expect(Math.round(parts.reduce((s, p) => s + p, 0) * 100) / 100).toBe(100);
    expect(splitDiscount(0, [10, 20])).toEqual([0, 0]);
    expect(splitDiscount(50, [0, 0])).toEqual([0, 0]);
  });
});
