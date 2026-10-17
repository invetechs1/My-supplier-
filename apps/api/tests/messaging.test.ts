import { describe, expect, it } from "vitest";
import { buildAlertText, pickChannel, underDailyCap } from "../src/services/messaging";

describe("pickChannel", () => {
  const both = { whatsapp: true, sms: true };
  it("prefers WhatsApp, falls back to SMS, respects opt-outs and missing phones", () => {
    expect(pickChannel({ phone: "+966501234567", alertSms: true, alertWhatsapp: true }, both)).toBe("WHATSAPP");
    expect(pickChannel({ phone: "+966501234567", alertSms: true, alertWhatsapp: false }, both)).toBe("SMS");
    expect(pickChannel({ phone: "+966501234567", alertSms: true, alertWhatsapp: true }, { whatsapp: false, sms: true })).toBe("SMS");
    expect(pickChannel({ phone: "+966501234567", alertSms: false, alertWhatsapp: false }, both)).toBeNull();
    expect(pickChannel({ phone: null, alertSms: true, alertWhatsapp: true }, both)).toBeNull();
    expect(pickChannel({ phone: "+966501234567", alertSms: true, alertWhatsapp: true }, { whatsapp: false, sms: false })).toBeNull();
  });
});

describe("buildAlertText", () => {
  it("uses the Arabic copy for Arabic users and always ends with the deep link", () => {
    const ar = buildAlertText({ locale: "ar", title: "New order ORD-1", titleAr: "طلب جديد ORD-1", body: "2 items", bodyAr: "بندان", link: "/supplier/orders/x" });
    expect(ar.startsWith("موردي MySupplier: طلب جديد ORD-1")).toBe(true);
    expect(ar).toContain("بندان");
    expect(ar.endsWith("/supplier/orders/x")).toBe(true);
    const en = buildAlertText({ locale: "en", title: "New order ORD-1", body: "2 items", link: "/supplier/orders/x" });
    expect(en.startsWith("MySupplier: New order ORD-1")).toBe(true);
  });
  it("truncates long bodies to keep SMS short", () => {
    const text = buildAlertText({ locale: "en", title: "T", body: "x".repeat(400) });
    expect(text.split("\n")[1].length).toBeLessThanOrEqual(160);
  });
});

describe("underDailyCap", () => {
  it("stops at the cap", () => {
    expect(underDailyCap(0, 15)).toBe(true);
    expect(underDailyCap(14, 15)).toBe(true);
    expect(underDailyCap(15, 15)).toBe(false);
  });
});
