import { describe, expect, it } from "vitest";
import { priceRate, quoteAll, zoneFor, type RateCard } from "../src/services/shipping";
import { csvCell, isPrivateIp, normaliseSaudiPhone } from "../src/lib/security";
import { invoiceHash } from "../src/services/einvoice";

const rate = (o: Partial<RateCard>): RateCard => ({ carrier: "SUPPLIER", zone: "SAME_CITY", service: "x", baseFee: 100, perKg: 0, includedKg: 0, perM3: 0, minFee: 0, maxWeightKg: null, etaDays: 1, enabled: true, ...o });

describe("shipping", () => {
  it("resolves zones", () => {
    expect(zoneFor("Riyadh", "Riyadh")).toBe("SAME_CITY");
    expect(zoneFor("Dammam", "Khobar")).toBe("SAME_REGION");
    expect(zoneFor("Riyadh", "Jeddah")).toBe("NATIONAL");
  });
  it("prices a rate card with included weight, per-kg and min fee", () => {
    expect(priceRate(rate({ baseFee: 450, perKg: 0.01, includedKg: 5000 }), 12000, 5)).toBe(520);
    expect(priceRate(rate({ baseFee: 25, perKg: 3, includedKg: 5, minFee: 30 }), 3, 0)).toBe(30);
    expect(priceRate(rate({ maxWeightKg: 70 }), 71, 0)).toBeNull();
    expect(priceRate(rate({ enabled: false }), 1, 0)).toBeNull();
  });
  it("quotes sorted by price and applies the supplier's own fee", () => {
    const q = quoteAll([rate({ carrier: "SUPPLIER", baseFee: 150 }), rate({ carrier: "TRELLA", baseFee: 280 }), rate({ carrier: "SMSA", baseFee: 25, maxWeightKg: 70 })], "SAME_CITY", 900, 1, 99);
    expect(q.map((x) => [x.carrier, x.price])).toEqual([["SUPPLIER", 99], ["TRELLA", 280]]);
  });
});

describe("security helpers", () => {
  it("normalises Saudi mobiles", () => {
    expect(normaliseSaudiPhone("0501234567")).toBe("+966501234567");
    expect(normaliseSaudiPhone("+966 50 123 4567")).toBe("+966501234567");
    expect(normaliseSaudiPhone("00966501234567")).toBe("+966501234567");
    expect(normaliseSaudiPhone("0112345678")).toBeNull();
  });
  it("detects private networks", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "::1", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "212.71.32.10"]) expect(isPrivateIp(ip)).toBe(false);
  });
  it("neutralises spreadsheet formulas in CSV cells", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});

describe("e-invoice hash", () => {
  it("is a base64 sha256 of the xml", () => {
    expect(invoiceHash("<Invoice/>")).toHaveLength(44);
    expect(invoiceHash("a")).not.toBe(invoiceHash("b"));
  });
});
