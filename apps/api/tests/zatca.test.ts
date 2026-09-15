import { describe, expect, it } from "vitest";
import { zatcaTlvBase64 } from "../src/services/zatca";

describe("zatcaTlvBase64", () => {
  it("encodes the five phase-1 tags as TLV", () => {
    const b64 = zatcaTlvBase64({ sellerName: "Bobs Records", vatNumber: "310122393500003", timestamp: new Date("2022-04-25T15:30:00Z"), total: 1000, vat: 150 });
    const buf = Buffer.from(b64, "base64");
    const fields: Record<number, string> = {};
    for (let i = 0; i < buf.length; ) {
      const tag = buf[i], len = buf[i + 1];
      fields[tag] = buf.subarray(i + 2, i + 2 + len).toString("utf8");
      i += 2 + len;
    }
    expect(fields).toEqual({ 1: "Bobs Records", 2: "310122393500003", 3: "2022-04-25T15:30:00.000Z", 4: "1000.00", 5: "150.00" });
  });
  it("handles Arabic seller names (byte length, not char length)", () => {
    const b64 = zatcaTlvBase64({ sellerName: "شركة الشرقية", vatNumber: "3", timestamp: new Date(0), total: 1, vat: 0 });
    const buf = Buffer.from(b64, "base64");
    expect(buf[1]).toBe(Buffer.byteLength("شركة الشرقية", "utf8"));
  });
});
