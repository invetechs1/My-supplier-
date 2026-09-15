import { describe, expect, it } from "vitest";
import { commissionFor, lastNDays, slugify } from "../src/services/portal";

describe("commissionFor", () => {
  it("splits gross into commission and net with 2-decimal rounding", () => {
    expect(commissionFor(1000, 3)).toEqual({ commission: 30, net: 970 });
    expect(commissionFor(3370, 2.5)).toEqual({ commission: 84.25, net: 3285.75 });
    expect(commissionFor(99.99, 0)).toEqual({ commission: 0, net: 99.99 });
  });
});

describe("helpers", () => {
  it("slugifies company names", () => {
    expect(slugify("Al Rajhi Building Materials")).toBe("al-rajhi-building-materials");
    expect(slugify("  Eastern  Steel & Co. ")).toBe("eastern-steel-co");
  });
  it("produces a contiguous day series ending today", () => {
    const days = lastNDays(7);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe(new Date().toISOString().slice(0, 10));
    expect(new Set(days).size).toBe(7);
  });
});
