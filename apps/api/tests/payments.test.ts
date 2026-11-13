import { describe, expect, it } from "vitest";
import {
  checkGatewayAmount, gatewayBrands, moyasarMethods, planSync, recordStatusFor, safeEqual, toHalalas, webhookPaymentId, webhookSecretOf,
} from "../src/services/payments";

describe("webhook secret verification", () => {
  it("accepts only the exact configured secret (constant-time compare)", () => {
    expect(safeEqual("whsec_abc", "whsec_abc")).toBe(true);
    expect(safeEqual("whsec_abd", "whsec_abc")).toBe(false);
    expect(safeEqual("whsec_ab", "whsec_abc")).toBe(false); // different lengths never throw
    expect(safeEqual("", "whsec_abc")).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(safeEqual("anything", "")).toBe(false);
    expect(safeEqual("", undefined)).toBe(false);
  });

  it("reads Moyasar's secret_token from the body, falling back to the legacy header", () => {
    expect(webhookSecretOf({}, { secret_token: "s1", data: { id: "p1" } })).toBe("s1");
    expect(webhookSecretOf({ "x-webhook-secret": "s2" }, { data: { id: "p1" } })).toBe("s2");
    expect(webhookSecretOf({ "x-webhook-secret": ["s3"] }, {})).toBe("s3");
    expect(webhookSecretOf({}, null)).toBe("");
    expect(webhookSecretOf({}, { secret_token: 42 })).toBe("");
  });

  it("extracts the payment id only from a well-formed payment event", () => {
    expect(webhookPaymentId({ type: "payment_paid", data: { id: "pay_123456" } })).toBe("pay_123456");
    expect(webhookPaymentId({ type: "payment_paid", data: {} })).toBeNull();
    expect(webhookPaymentId({ data: { id: 1 } })).toBeNull();
    expect(webhookPaymentId("junk")).toBeNull();
  });
});

describe("amount and currency verification", () => {
  it("accepts the exact order total in halalas and SAR", () => {
    expect(toHalalas(1234.56)).toBe(123456);
    expect(toHalalas(0.1 + 0.2)).toBe(30); // float rounding
    expect(checkGatewayAmount({ amount: 123456, currency: "SAR" }, 1234.56)).toEqual({ ok: true });
    expect(checkGatewayAmount({ amount: 123456, currency: "sar" }, 1234.56).ok).toBe(true);
  });

  it("rejects an amount mismatch (halalas) and names the difference", () => {
    const r = checkGatewayAmount({ amount: 123455, currency: "SAR" }, 1234.56);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("123455");
    expect(r.reason).toContain("123456");
  });

  it("rejects a currency mismatch even when the number matches", () => {
    const r = checkGatewayAmount({ amount: 123456, currency: "USD" }, 1234.56);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("USD");
  });
});

describe("gateway status mapping", () => {
  it("maps every Moyasar status to a ledger state", () => {
    expect(recordStatusFor("paid")).toBe("PAID");
    expect(recordStatusFor("captured")).toBe("PAID");
    expect(recordStatusFor("authorized")).toBe("AUTHORIZED");
    expect(recordStatusFor("failed")).toBe("FAILED");
    expect(recordStatusFor("voided")).toBe("FAILED");
    expect(recordStatusFor("refunded")).toBe("REFUNDED");
    expect(recordStatusFor("initiated")).toBe("INITIATED");
    expect(recordStatusFor("something_new")).toBe("INITIATED");
  });
});

describe("idempotency and ordering (planSync)", () => {
  it("is a no-op when the same payment id reports the same status twice", () => {
    expect(planSync("PAID", "PAID")).toBe("noop");
    expect(planSync("FAILED", "FAILED")).toBe("noop");
    expect(planSync("INITIATED", "INITIATED")).toBe("noop");
  });

  it("applies the first sighting and normal forward transitions", () => {
    expect(planSync(null, "PAID")).toBe("apply");
    expect(planSync(undefined, "FAILED")).toBe("apply");
    expect(planSync("INITIATED", "PAID")).toBe("apply");
    expect(planSync("AUTHORIZED", "PAID")).toBe("apply");
    expect(planSync("FAILED", "PAID")).toBe("apply"); // retry on the same gateway payment after a 3-DS failure
    expect(planSync("PAID", "REFUNDED")).toBe("apply");
  });

  it("never lets a stale or out-of-order event undo a paid or refunded record", () => {
    expect(planSync("PAID", "FAILED")).toBe("ignore");
    expect(planSync("PAID", "AUTHORIZED")).toBe("ignore");
    expect(planSync("PAID", "INITIATED")).toBe("ignore");
    expect(planSync("REFUNDED", "PAID")).toBe("ignore");
    expect(planSync("REFUNDED", "FAILED")).toBe("ignore");
  });
});

describe("gateway methods", () => {
  it("defaults to creditcard, applepay and stcpay and drops unknown entries", () => {
    expect(moyasarMethods(["creditcard", "applepay", "stcpay"])).toEqual(["creditcard", "applepay", "stcpay"]);
    expect(moyasarMethods(["creditcard", "paypal", "creditcard"])).toEqual(["creditcard"]);
    expect(moyasarMethods(["bogus"])).toEqual(["creditcard"]); // never an empty form
  });

  it("lists the brands shown to buyers (mada is part of creditcard)", () => {
    expect(gatewayBrands(["creditcard"])).toEqual(["mada", "Visa", "Mastercard"]);
    expect(gatewayBrands(["creditcard", "applepay", "stcpay"])).toEqual(["mada", "Visa", "Mastercard", "Apple Pay", "STC Pay"]);
    expect(gatewayBrands(["stcpay"])).toEqual(["STC Pay"]);
  });
});
