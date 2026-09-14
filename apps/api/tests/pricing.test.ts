import { describe, expect, it } from "vitest";
import { bidTotal, percentChange, rankBids, summarize } from "../src/services/pricing";

describe("summarize", () => {
  it("returns nulls for empty input", () => {
    expect(summarize([])).toMatchObject({ min: null, avg: null, median: null, max: null, count: 0 });
  });
  it("computes min/avg/median/max and cheapest id", () => {
    const s = summarize([
      { id: "a", price: 30, updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", price: 10, updatedAt: "2026-02-01T00:00:00.000Z" },
      { id: "c", price: 20 },
      { id: "d", price: 40 },
    ]);
    expect(s).toEqual({
      min: 10, avg: 25, median: 25, max: 40, count: 4,
      cheapestListingId: "b", lastUpdated: "2026-02-01T00:00:00.000Z",
    });
  });
  it("median for odd length", () => {
    expect(summarize([{ price: 5 }, { price: 1 }, { price: 3 }]).median).toBe(3);
  });
});

describe("percentChange", () => {
  it("handles zero/null baseline", () => {
    expect(percentChange(0, 10)).toBe(0);
    expect(percentChange(null, 10)).toBe(0);
  });
  it("computes rounded change", () => {
    expect(percentChange(200, 190)).toBe(-5);
    expect(percentChange(100, 133.333)).toBe(33.33);
  });
});

describe("bids", () => {
  it("totals bid items", () => {
    expect(bidTotal([{ unitPrice: 12.5, quantity: 4 }, { unitPrice: 3, quantity: 10 }])).toBe(80);
  });
  it("ranks by price then delivery", () => {
    const ranked = rankBids([
      { id: 1, totalPrice: 100, deliveryDays: 10 },
      { id: 2, totalPrice: 90, deliveryDays: 12 },
      { id: 3, totalPrice: 100, deliveryDays: 3 },
    ]);
    expect(ranked.map((b) => b.id)).toEqual([2, 3, 1]);
  });
});
