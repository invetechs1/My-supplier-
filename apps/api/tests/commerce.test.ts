import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { canUseCredit, computeNextRunAt, computeRefund, creditInfoFor, pricingFor, saleIsLive, unitPriceFor, validateTiers } from "../src/services/commerce";

const D = (n: number) => new Prisma.Decimal(n);
const now = new Date("2026-09-25T12:00:00Z");

describe("unitPriceFor / pricingFor", () => {
  const listing = { price: D(100), salePrice: null, saleEndsAt: null, tiers: [{ minQty: 10, price: D(90) }, { minQty: 50, price: D(80) }] };

  it("uses the base price below the first tier", () => {
    expect(unitPriceFor(listing, 1, now)).toBe(100);
    expect(pricingFor(listing, 5, now)).toEqual({ unitPrice: 100, basePrice: 100, tierApplied: null, saleApplied: false, nextTier: { minQty: 10, price: 90, savePerUnit: 10 } });
  });

  it("applies the highest tier reached and hints at the next one", () => {
    expect(unitPriceFor(listing, 10, now)).toBe(90);
    expect(unitPriceFor(listing, 49, now)).toBe(90);
    expect(unitPriceFor(listing, 50, now)).toBe(80);
    expect(unitPriceFor(listing, 500, now)).toBe(80);
    const p = pricingFor(listing, 20, now);
    expect(p.tierApplied).toEqual({ minQty: 10, price: 90 });
    expect(p.nextTier).toEqual({ minQty: 50, price: 80, savePerUnit: 10 });
    expect(pricingFor(listing, 60, now).nextTier).toBeNull();
  });

  it("does not depend on tier order", () => {
    const shuffled = { ...listing, tiers: [listing.tiers[1], listing.tiers[0]] };
    expect(unitPriceFor(shuffled, 12, now)).toBe(90);
  });

  it("prefers a live sale over tiers and base price", () => {
    const sale = { ...listing, salePrice: D(85), saleEndsAt: new Date("2026-10-01T00:00:00Z") };
    expect(unitPriceFor(sale, 1, now)).toBe(85);
    expect(unitPriceFor(sale, 60, now)).toBe(85);
    const p = pricingFor(sale, 60, now);
    expect(p).toMatchObject({ saleApplied: true, tierApplied: null, nextTier: null, basePrice: 100 });
    expect(saleIsLive({ salePrice: D(85), saleEndsAt: null }, now)).toBe(true);
  });

  it("ignores an expired sale", () => {
    const expired = { ...listing, salePrice: D(85), saleEndsAt: new Date("2026-09-01T00:00:00Z") };
    expect(saleIsLive(expired, now)).toBe(false);
    expect(unitPriceFor(expired, 1, now)).toBe(100);
    expect(unitPriceFor(expired, 50, now)).toBe(80);
  });

  it("accepts plain numbers and missing tiers", () => {
    expect(unitPriceFor({ price: 42.5 }, 1000, now)).toBe(42.5);
  });
});

describe("validateTiers", () => {
  it("accepts an ascending ladder with decreasing prices below the base price", () => {
    expect(validateTiers([{ minQty: 10, price: 90 }, { minQty: 50, price: 80 }], 100)).toBeNull();
    expect(validateTiers([], 100)).toBeNull();
  });
  it("rejects minQty <= 1, non-ascending quantities and non-decreasing prices", () => {
    expect(validateTiers([{ minQty: 1, price: 90 }], 100)).toMatch(/greater than 1/);
    expect(validateTiers([{ minQty: 10, price: 90 }, { minQty: 10, price: 80 }], 100)).toMatch(/greater than 10/);
    expect(validateTiers([{ minQty: 10, price: 100 }], 100)).toMatch(/lower than the base price/);
    expect(validateTiers([{ minQty: 10, price: 90 }, { minQty: 20, price: 95 }], 100)).toMatch(/previous tier/);
  });
});

describe("credit terms", () => {
  const company = { creditApproved: true, creditLimit: D(50000), creditTermsDays: 45, creditUsed: D(12000.5) };

  it("summarises credit info", () => {
    expect(creditInfoFor(company)).toEqual({ approved: true, limit: 50000, used: 12000.5, available: 37999.5, termsDays: 45 });
    expect(creditInfoFor(null)).toEqual({ approved: false, limit: 0, used: 0, available: 0, termsDays: 0 });
    expect(creditInfoFor({ ...company, creditApproved: false }).available).toBe(0);
    expect(creditInfoFor({ ...company, creditTermsDays: null }).termsDays).toBe(30);
  });

  it("allows orders that fit in the remaining limit and rejects the rest", () => {
    expect(canUseCredit(company, 37999.5).ok).toBe(true);
    expect(canUseCredit(company, 38000)).toMatchObject({ ok: false, reason: expect.stringContaining("exceeds your available credit") });
    expect(canUseCredit({ ...company, creditApproved: false }, 10)).toMatchObject({ ok: false, reason: expect.stringContaining("not approved") });
    expect(canUseCredit(null, 10).ok).toBe(false);
    expect(canUseCredit({ ...company, creditLimit: null }, 10).ok).toBe(false);
  });
});

describe("computeRefund", () => {
  const order = {
    subtotal: D(1000), discount: D(0),
    items: [{ id: "a", unitPrice: D(100), quantity: 8 }, { id: "b", unitPrice: D(50), quantity: 4 }],
  };

  it("refunds unit price × quantity plus the VAT share", () => {
    expect(computeRefund(order, [{ orderItemId: "a", quantity: 2 }])).toBe(230); // 200 + 15%
    expect(computeRefund(order, [{ orderItemId: "a", quantity: 8 }, { orderItemId: "b", quantity: 4 }])).toBe(1150);
  });

  it("caps quantities at the ordered amount and ignores unknown items", () => {
    expect(computeRefund(order, [{ orderItemId: "b", quantity: 40 }, { orderItemId: "zzz", quantity: 3 }])).toBe(230);
  });

  it("removes the pro-rata coupon discount", () => {
    const discounted = { ...order, discount: D(100) }; // 10% off the order
    expect(computeRefund(discounted, [{ orderItemId: "a", quantity: 2 }])).toBe(207); // 200 × 0.9 × 1.15
  });
});

describe("computeNextRunAt", () => {
  const day = 86400000;

  it("steps forward by the interval", () => {
    const prev = new Date("2026-09-20T08:00:00Z");
    expect(computeNextRunAt(prev, 7, new Date("2026-09-20T09:00:00Z")).toISOString()).toBe("2026-09-27T08:00:00.000Z");
  });

  it("skips missed slots so the next run is always in the future", () => {
    const prev = new Date("2026-06-01T08:00:00Z");
    const next = computeNextRunAt(prev, 14, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(14 * day);
    expect((next.getTime() - prev.getTime()) % (14 * day)).toBe(0);
  });

  it("keeps the original time of day when running exactly on schedule", () => {
    const prev = new Date("2026-09-25T06:00:00Z");
    expect(computeNextRunAt(prev, 30, now).toISOString()).toBe("2026-10-25T06:00:00.000Z");
  });
});
