import { describe, expect, it } from "vitest";
import { companyCreateData, normaliseSaudiContact, registerCompanySchema } from "../src/lib/companyRegistration";

const valid = { name: "Alpha Building Materials", type: "SUPPLIER", city: "Riyadh", crNumber: "1010123456", vatNumber: "300012345600003", phone: "0501234567", citiesServed: ["Riyadh", "Jeddah"] };

describe("company registration", () => {
  it("normalises Saudi mobiles and landlines", () => {
    for (const input of ["0501234567", "501234567", "+966501234567", "966501234567", "00966 50 123 4567"]) expect(normaliseSaudiContact(input)).toBe("+966501234567");
    expect(normaliseSaudiContact("0112345678")).toBe("+966112345678");
    expect(normaliseSaudiContact("+966 11 234 5678")).toBe("+966112345678");
    for (const bad of ["12345", "0601234567", "+971501234567", "0191234567"]) expect(normaliseSaudiContact(bad)).toBeNull();
  });

  it("accepts a complete company block and normalises the phone", () => {
    const parsed = registerCompanySchema.parse(valid);
    expect(parsed.phone).toBe("+966501234567");
    expect(parsed.crNumber).toBe("1010123456");
  });

  it("rejects malformed CR, VAT, phone and unknown cities", () => {
    expect(() => registerCompanySchema.parse({ ...valid, crNumber: "123" })).toThrow(/10 digits/);
    expect(() => registerCompanySchema.parse({ ...valid, vatNumber: "123456789012345" })).toThrow(/start and end with 3/);
    expect(() => registerCompanySchema.parse({ ...valid, vatNumber: "30001234560000" })).toThrow();
    expect(() => registerCompanySchema.parse({ ...valid, phone: "12345" })).toThrow();
    expect(() => registerCompanySchema.parse({ ...valid, citiesServed: ["Atlantis"] })).toThrow();
    expect(() => registerCompanySchema.parse({ ...valid, crNumber: undefined })).toThrow();
  });

  it("builds supplier create data with delivery zone and region", () => {
    const data = companyCreateData("SUPPLIER", registerCompanySchema.parse({ ...valid, type: "CONTRACTOR", citiesServed: ["Dammam", "Khobar", "Dammam"] }));
    expect(data.type).toBe("SUPPLIER");
    expect(data.citiesServed).toEqual(["Dammam", "Khobar"]);
    expect(data.region).toBe("Eastern");
    expect(data.branches.create.city).toBe("Riyadh");
  });

  it("builds buyer create data: never SUPPLIER, zone is the head-office city", () => {
    const data = companyCreateData("BUYER", registerCompanySchema.parse({ ...valid, type: "SUPPLIER", citiesServed: undefined }));
    expect(data.type).toBe("CONTRACTOR");
    expect(data.citiesServed).toEqual(["Riyadh"]);
    expect(data.region).toBe("Central");
    expect(companyCreateData("BUYER", registerCompanySchema.parse({ ...valid, type: "CONSULTANT" })).type).toBe("CONSULTANT");
  });
});
