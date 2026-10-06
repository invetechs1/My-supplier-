import { describe, expect, it } from "vitest";
import { demandKey, demandScore, gapTypeFor, notificationLevel, readiness } from "../src/services/demand";

describe("demandKey", () => {
  it("groups different spellings of the same request", () => {
    expect(demandKey("Deformed rebar 16mm")).toBe(demandKey("16 mm deformed rebar"));
    expect(demandKey("حديد تسليح 16 مم")).toBe(demandKey("حديد تسليح ١٦ مم".replace("١٦", "16")));
  });
  it("ignores noise words, units and punctuation", () => {
    expect(demandKey("Cement, OPC 50kg bags (pcs)")).toBe(demandKey("OPC cement 50 kg bag"));
    expect(demandKey("  ")).toBe("");
  });
  it("keeps sizes that distinguish products", () => {
    expect(demandKey("PVC pipe 4 inch")).not.toBe(demandKey("PVC pipe 6 inch"));
  });
});

describe("gapTypeFor / notificationLevel / readiness", () => {
  it("classifies coverage", () => {
    expect(gapTypeFor(null)).toBe("UNLISTED");
    expect(gapTypeFor(0)).toBe("NO_OFFERS");
    expect(gapTypeFor(2)).toBe("THIN_COVERAGE");
    expect(gapTypeFor(3)).toBe("COVERED");
  });
  it("notifies at 3, 10, 25 and 50 requests only once per level", () => {
    expect(notificationLevel(2)).toBe(0);
    expect(notificationLevel(3)).toBe(1);
    expect(notificationLevel(9)).toBe(1);
    expect(notificationLevel(10)).toBe(2);
    expect(notificationLevel(60)).toBe(4);
  });
  it("needs 3 fresh offers to be launch-ready", () => {
    expect(readiness(3, 5)).toEqual({ status: "READY", needed: 0 });
    expect(readiness(1, 4)).toEqual({ status: "NEEDS_SUPPLIERS", needed: 2 });
    expect(readiness(0, 0)).toEqual({ status: "NO_OFFERS", needed: 3 });
  });
});

describe("demandScore", () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  it("weighs distinct buyers above repeated requests and decays with age", () => {
    const oneBuyerTenTimes = demandScore({ requests: 10, buyers: 1, totalQuantity: 0, lastRequestedAt: "2026-10-05" }, now);
    const fiveBuyersFiveTimes = demandScore({ requests: 5, buyers: 5, totalQuantity: 0, lastRequestedAt: "2026-10-05" }, now);
    expect(fiveBuyersFiveTimes).toBeGreaterThan(oneBuyerTenTimes);
    const old = demandScore({ requests: 5, buyers: 5, totalQuantity: 0, lastRequestedAt: "2026-05-01" }, now);
    expect(old).toBeLessThan(fiveBuyersFiveTimes);
  });
});
