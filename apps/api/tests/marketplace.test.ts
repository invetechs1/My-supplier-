import { describe, expect, it } from "vitest";
import { effectivePricing, enrichmentFromOffers, isSaleLive, priceForQuantity, toOffer, type Offer } from "../src/services/shop";
import { computeFacets, matchesSpecs, parseRange, parseSpecFilters, sortProducts, summarizeRatings, type AttributeDef } from "../src/services/marketplace";

const NOW = new Date("2026-09-25T12:00:00.000Z");

describe("effective price / sale expiry", () => {
  it("uses the list price when there is no sale", () => {
    expect(effectivePricing({ price: 100, salePrice: null }, NOW)).toEqual({ salePrice: null, compareAtPrice: null, effectivePrice: 100 });
  });
  it("applies an open-ended sale", () => {
    expect(effectivePricing({ price: 100, salePrice: 80, saleEndsAt: null }, NOW)).toEqual({ salePrice: 80, compareAtPrice: 100, effectivePrice: 80 });
  });
  it("applies a sale that ends in the future and ignores an expired one", () => {
    expect(effectivePricing({ price: 100, salePrice: 80, saleEndsAt: "2026-10-01T00:00:00.000Z" }, NOW).effectivePrice).toBe(80);
    expect(effectivePricing({ price: 100, salePrice: 80, saleEndsAt: "2026-09-01T00:00:00.000Z" }, NOW)).toEqual({ salePrice: null, compareAtPrice: null, effectivePrice: 100 });
  });
  it("ignores a 'sale' that is not cheaper than the list price", () => {
    expect(isSaleLive({ price: 100, salePrice: 120 }, NOW)).toBe(false);
    expect(isSaleLive({ price: 100, salePrice: 0 }, NOW)).toBe(false);
  });
  it("toOffer exposes sale fields and sorted tiers", () => {
    const offer = toOffer(
      {
        id: "l1", materialId: "m1", companyId: "c1", price: 50 as never, currency: "SAR", minQty: 1, leadTimeDays: 1, city: "Riyadh", source: "SUPPLIER", sourceName: null,
        validUntil: null, stock: 10, active: true, imageUrl: null, salePrice: 45 as never, saleEndsAt: new Date("2026-12-01T00:00:00.000Z"), branchId: null, createdAt: NOW, updatedAt: NOW,
        company: { name: "Acme", verified: true, rating: 4.5 } as never,
        tiers: [{ minQty: 100, price: 40 }, { minQty: 10, price: 43 }],
      },
      NOW,
    );
    expect(offer).toMatchObject({ price: 50, salePrice: 45, compareAtPrice: 50, effectivePrice: 45, saleEndsAt: "2026-12-01T00:00:00.000Z" });
    expect(offer.tiers).toEqual([{ minQty: 10, price: 43 }, { minQty: 100, price: 40 }]);
  });
});

describe("priceForQuantity", () => {
  const offer = { effectivePrice: 50, tiers: [{ minQty: 10, price: 45 }, { minQty: 100, price: 40 }] };
  it("returns the effective price below the first tier", () => expect(priceForQuantity(offer, 5)).toBe(50));
  it("picks the tier whose minQty is met", () => {
    expect(priceForQuantity(offer, 10)).toBe(45);
    expect(priceForQuantity(offer, 99)).toBe(45);
    expect(priceForQuantity(offer, 250)).toBe(40);
  });
  it("never charges more than the live sale price", () => expect(priceForQuantity({ effectivePrice: 30, tiers: offer.tiers }, 500)).toBe(30));
  it("works without tiers", () => expect(priceForQuantity({ effectivePrice: 12.5 }, 3)).toBe(12.5));
});

describe("enrichmentFromOffers", () => {
  const base = { companyName: "x", verified: true, rating: 0, city: "Riyadh", minQty: 1, leadTimeDays: 1, sourceName: null, imageUrl: null, saleEndsAt: null, tiers: [] };
  const mk = (o: Partial<Offer>): Offer => ({ listingId: "l", companyId: "c", price: 100, stock: null, source: "SUPPLIER", salePrice: null, compareAtPrice: null, effectivePrice: 100, ...base, ...o } as Offer);
  it("ranks the best offer by effective (sale) price and flags the deal", () => {
    const e = enrichmentFromOffers([mk({ listingId: "a", price: 100, effectivePrice: 100 }), mk({ listingId: "b", price: 110, salePrice: 90, compareAtPrice: 110, effectivePrice: 90 })]);
    expect(e.bestOffer?.listingId).toBe("b");
    expect(e.minPrice).toBe(90);
    expect(e.maxPrice).toBe(100);
    expect(e.isDeal).toBe(true);
  });
  it("prefers purchasable supplier offers over market references", () => {
    const e = enrichmentFromOffers([mk({ listingId: "ref", companyId: null, source: "MARKET", price: 50, effectivePrice: 50 }), mk({ listingId: "sup", price: 60, effectivePrice: 60 })]);
    expect(e.bestOffer?.listingId).toBe("sup");
    expect(e.inStock).toBe(true);
    expect(e.offerCount).toBe(2);
  });
});

describe("spec range parsing", () => {
  it("parses closed, open-ended and swapped ranges", () => {
    expect(parseRange("10..50")).toEqual({ min: 10, max: 50 });
    expect(parseRange("10..")).toEqual({ min: 10, max: null });
    expect(parseRange("..50")).toEqual({ min: null, max: 50 });
    expect(parseRange("50..10")).toEqual({ min: 10, max: 50 });
    expect(parseRange("2.5..7.5")).toEqual({ min: 2.5, max: 7.5 });
  });
  it("rejects non-ranges", () => {
    expect(parseRange("abc")).toBeNull();
    expect(parseRange("..")).toBeNull();
    expect(parseRange("12")).toBeNull();
  });
  it("extracts spec.* query params", () => {
    const filters = parseSpecFilters({ q: "rebar", "spec.grade": "B500B", "spec.diameter_mm": "10..16", "spec.color": ["Red", "Blue"], "spec.": "x", "spec.empty": "" });
    expect(filters).toEqual([
      { key: "grade", kind: "exact", values: ["B500B"] },
      { key: "diameter_mm", kind: "range", min: 10, max: 16 },
      { key: "color", kind: "exact", values: ["Red", "Blue"] },
    ]);
  });
  it("matches specs case-insensitively and by numeric range", () => {
    const specs = { grade: "b500b", diameter_mm: 12, strength_mpa: "30 MPa" };
    expect(matchesSpecs(specs, [{ key: "grade", kind: "exact", values: ["B500B"] }])).toBe(true);
    expect(matchesSpecs(specs, [{ key: "diameter_mm", kind: "range", min: 10, max: 16 }])).toBe(true);
    expect(matchesSpecs(specs, [{ key: "diameter_mm", kind: "range", min: 14, max: null }])).toBe(false);
    expect(matchesSpecs(specs, [{ key: "strength_mpa", kind: "range", min: 25, max: 35 }])).toBe(true);
    expect(matchesSpecs(specs, [{ key: "missing", kind: "exact", values: ["x"] }])).toBe(false);
    expect(matchesSpecs(null, [{ key: "grade", kind: "exact", values: ["x"] }])).toBe(false);
    expect(matchesSpecs(null, [])).toBe(true);
  });
});

describe("facet counting", () => {
  const attributes: AttributeDef[] = [
    { key: "grade", label: "Grade", labelAr: "الدرجة", type: "SELECT", options: ["B500B", "B500C"], filterable: true, sortOrder: 1 },
    { key: "diameter_mm", label: "Diameter", labelAr: "القطر", type: "NUMBER", unit: "mm", options: [], filterable: true, sortOrder: 2 },
    { key: "internal", label: "Internal", labelAr: "داخلي", type: "TEXT", options: [], filterable: false, sortOrder: 3 },
  ];
  const items = [
    { brand: "SABIC", specs: { grade: "B500B", diameter_mm: 8 }, bestOffer: { effectivePrice: 2700, city: "Riyadh" } },
    { brand: "SABIC", specs: { grade: "B500B", diameter_mm: 12 }, bestOffer: { effectivePrice: 2650, city: "Jeddah" } },
    { brand: "Rajhi Steel", specs: { grade: "B500C", diameter_mm: 16 }, bestOffer: { effectivePrice: 2800, city: "Riyadh" } },
    { brand: null, specs: { grade: "Other" }, bestOffer: null, minPrice: null },
  ];
  it("counts brands, cities, price range and attribute values", () => {
    const f = computeFacets(items, attributes);
    expect(f.total).toBe(4);
    expect(f.brands).toEqual([{ value: "SABIC", count: 2 }, { value: "Rajhi Steel", count: 1 }]);
    expect(f.cities).toEqual([{ value: "Riyadh", count: 2 }, { value: "Jeddah", count: 1 }]);
    expect(f.price).toEqual({ min: 2650, max: 2800 });
    const grade = f.attributes.find((a) => a.key === "grade")!;
    expect(grade.values).toEqual([{ value: "B500B", count: 2 }, { value: "B500C", count: 1 }, { value: "Other", count: 1 }]);
    const dia = f.attributes.find((a) => a.key === "diameter_mm")!;
    expect(dia.min).toBe(8);
    expect(dia.max).toBe(16);
    expect(dia.unit).toBe("mm");
    expect(f.attributes.some((a) => a.key === "internal")).toBe(false);
    expect(f.truncated).toBe(false);
  });
  it("handles an empty list", () => {
    const f = computeFacets([], attributes, { truncated: false, fuzzy: true });
    expect(f.price).toEqual({ min: null, max: null });
    expect(f.brands).toEqual([]);
    expect(f.fuzzy).toBe(true);
  });
});

describe("review summary", () => {
  it("computes the average and star distribution", () => {
    expect(summarizeRatings([5, 4, 4, 1])).toEqual({ average: 3.5, count: 4, distribution: { 1: 1, 2: 0, 3: 0, 4: 2, 5: 1 } });
  });
  it("returns zeros for no reviews", () => {
    expect(summarizeRatings([])).toEqual({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });
  it("rounds the average to one decimal", () => {
    expect(summarizeRatings([5, 5, 4]).average).toBe(4.7);
  });
});

describe("sortProducts", () => {
  const list = [
    { id: "a", bestOffer: { effectivePrice: 30 }, ratingAvg: 4, ratingCount: 2, popularity: 5, createdAt: "2026-01-01" },
    { id: "b", bestOffer: null, ratingAvg: 5, ratingCount: 1, popularity: 9, createdAt: "2026-03-01" },
    { id: "c", bestOffer: { effectivePrice: 10 }, ratingAvg: 4, ratingCount: 7, popularity: 1, createdAt: "2026-02-01" },
  ];
  const ids = (l: typeof list) => l.map((x) => x.id);
  it("sorts by price with missing offers last / first accordingly", () => {
    expect(ids(sortProducts(list, "price_asc"))).toEqual(["c", "a", "b"]);
    expect(ids(sortProducts(list, "price_desc"))).toEqual(["a", "c", "b"]);
  });
  it("sorts by rating then count, newest and popular", () => {
    expect(ids(sortProducts(list, "rating"))).toEqual(["b", "c", "a"]);
    expect(ids(sortProducts(list, "newest"))).toEqual(["b", "c", "a"]);
    expect(ids(sortProducts(list, "popular"))).toEqual(["b", "a", "c"]);
    expect(ids(sortProducts(list, "relevance"))).toEqual(["a", "b", "c"]);
  });
});
