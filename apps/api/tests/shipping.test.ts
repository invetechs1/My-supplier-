import { describe, expect, it } from "vitest";
import { DEFAULT_RATES, isFreeDelivery, quoteAll, type RateCard } from "../src/services/shipping";

const rates: RateCard[] = DEFAULT_RATES.map((r) => ({ carrier: r.carrier as RateCard["carrier"], zone: r.zone as RateCard["zone"], service: r.service, baseFee: Number(r.baseFee), perKg: Number(r.perKg), includedKg: Number(r.includedKg), perM3: Number(r.perM3), minFee: Number(r.minFee), maxWeightKg: r.maxWeightKg === null || r.maxWeightKg === undefined ? null : Number(r.maxWeightKg), etaDays: r.etaDays, enabled: true }));

describe("isFreeDelivery", () => {
  it("is free only when a positive threshold is reached", () => {
    expect(isFreeDelivery(3000, 3000)).toBe(true);
    expect(isFreeDelivery(2999.99, 3000)).toBe(false);
    expect(isFreeDelivery(5000, null)).toBe(false);
    expect(isFreeDelivery(5000, 0)).toBe(false);
    expect(isFreeDelivery(undefined, 3000)).toBe(false);
  });
});

describe("quoteAll free delivery", () => {
  it("zeroes only the supplier's own-fleet quote above the threshold", () => {
    const quotes = quoteAll(rates, "SAME_CITY", 1200, 0, 120, { subtotal: 3200, freeAbove: 3000 });
    const own = quotes.find((q) => q.carrier === "SUPPLIER")!;
    expect(own.price).toBe(0);
    expect(own.free).toBe(true);
    expect(own.freeAbove).toBe(3000);
    expect(own.notes).toContain("3,000");
    for (const q of quotes.filter((q) => q.carrier !== "SUPPLIER")) expect(q.price).toBeGreaterThan(0);
    expect(quotes[0].carrier).toBe("SUPPLIER"); // sorted cheapest first
  });

  it("keeps the published fee below the threshold and tells the buyer the threshold", () => {
    const quotes = quoteAll(rates, "SAME_CITY", 300, 0, 120, { subtotal: 900, freeAbove: 3000 });
    const own = quotes.find((q) => q.carrier === "SUPPLIER")!;
    expect(own.price).toBe(120);
    expect(own.free).toBe(false);
    expect(own.freeAbove).toBe(3000);
  });

  it("is unchanged for suppliers without a threshold", () => {
    const quotes = quoteAll(rates, "SAME_CITY", 300, 0, 120, { subtotal: 90000, freeAbove: null });
    const own = quotes.find((q) => q.carrier === "SUPPLIER")!;
    expect(own.price).toBe(120);
    expect(own.free).toBe(false);
    expect(own.freeAbove).toBeNull();
  });
});
