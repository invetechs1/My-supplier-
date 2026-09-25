import { describe, expect, it } from "vitest";
import { listingStatus } from "../src/routes/supplierProducts";

const now = new Date("2026-09-25T09:00:00Z");

describe("listingStatus", () => {
  it("is ACTIVE when live, in stock or untracked, and not expired", () => {
    expect(listingStatus({ active: true, stock: null, validUntil: null }, now)).toBe("ACTIVE");
    expect(listingStatus({ active: true, stock: 12, validUntil: new Date("2026-12-01") }, now)).toBe("ACTIVE");
  });
  it("PAUSED wins over everything else", () => {
    expect(listingStatus({ active: false, stock: 0, validUntil: new Date("2020-01-01") }, now)).toBe("PAUSED");
  });
  it("EXPIRED when validUntil is in the past", () => {
    expect(listingStatus({ active: true, stock: 5, validUntil: new Date("2026-09-24T23:59:59Z") }, now)).toBe("EXPIRED");
  });
  it("OUT_OF_STOCK when tracked stock is zero", () => {
    expect(listingStatus({ active: true, stock: 0, validUntil: null }, now)).toBe("OUT_OF_STOCK");
  });
});
