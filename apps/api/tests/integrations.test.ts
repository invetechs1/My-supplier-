import { describe, expect, it } from "vitest";
import crypto from "crypto";
import {
  API_KEY_DISPLAY_PREFIX_LENGTH, ORDER_TRANSITIONS, canTransition, extractApiKey, generateApiKey, hasScope, hashApiKey, isApiKeyFormat, mapIntegrationStatus,
  priceRowSchema, shapeOrderForErp, stockRowSchema, validateRows, type ErpOrderRow,
} from "../src/services/integrations";
import { BACKOFF_MS, MAX_ATTEMPTS, buildEnvelope, generateWebhookSecret, nextAttemptAt, signWebhook, verifyWebhookSignature } from "../src/services/webhooks";
import { requireScope } from "../src/middleware/apiKey";

describe("API keys", () => {
  it("generates msk_live_ keys with a 32-char base62 body, 12-char prefix and sha256 hash", () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^msk_live_[0-9A-Za-z]{32}$/);
    expect(isApiKeyFormat(key)).toBe(true);
    expect(prefix).toBe(key.slice(0, 12));
    expect(prefix).toHaveLength(API_KEY_DISPLAY_PREFIX_LENGTH);
    expect(hash).toBe(crypto.createHash("sha256").update(key).digest("hex"));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).not.toContain(key.slice(9));
  });
  it("produces unique keys", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().key));
    expect(keys.size).toBe(50);
  });
  it("rejects malformed keys", () => {
    expect(isApiKeyFormat("msk_live_short")).toBe(false);
    expect(isApiKeyFormat("sk_live_" + "a".repeat(32))).toBe(false);
    expect(isApiKeyFormat("msk_live_" + "a".repeat(31) + "!")).toBe(false);
  });
  it("reads the key from X-API-Key or Authorization: ApiKey", () => {
    const { key } = generateApiKey();
    expect(extractApiKey({ "x-api-key": key })).toBe(key);
    expect(extractApiKey({ authorization: `ApiKey ${key}` })).toBe(key);
    expect(extractApiKey({ authorization: `apikey ${key}` })).toBe(key);
    expect(extractApiKey({ authorization: "Bearer jwt.token.here" })).toBeNull();
    expect(extractApiKey({})).toBeNull();
  });
});

describe("scopes", () => {
  it("checks granted scopes cover required ones", () => {
    expect(hasScope(["catalog:read", "orders:read"], ["orders:read"])).toBe(true);
    expect(hasScope(["catalog:read"], ["orders:read"])).toBe(false);
    expect(hasScope(["catalog:read"], ["catalog:read", "prices:write"])).toBe(false);
    expect(hasScope([], [])).toBe(true);
    expect(hasScope(undefined, ["orders:read"])).toBe(false);
  });
  const run = (req: Record<string, unknown>, ...scopes: Parameters<typeof requireScope>) =>
    new Promise<unknown>((resolve) => requireScope(...scopes)(req as never, {} as never, (err?: unknown) => resolve(err)));
  it("requireScope rejects JWT-only callers with 401 and missing scopes with 403", async () => {
    const noKey = (await run({ user: { id: "u1" } }, "orders:read")) as { status: number; message: string };
    expect(noKey.status).toBe(401);
    expect(noKey.message).toMatch(/X-API-Key/);
    const wrong = (await run({ apiKey: { id: "k", name: "erp", companyId: "c", scopes: ["catalog:read"] } }, "orders:read")) as { status: number; details: { required: string[] } };
    expect(wrong.status).toBe(403);
    expect(wrong.details.required).toEqual(["orders:read"]);
    expect(await run({ apiKey: { id: "k", name: "erp", companyId: "c", scopes: ["orders:read", "orders:write"] } }, "orders:read")).toBeUndefined();
    expect(await run({ apiKey: { id: "k", name: "erp", companyId: "c", scopes: [] } })).toBeUndefined();
  });
});

describe("webhook signatures", () => {
  const secret = generateWebhookSecret();
  const body = JSON.stringify({ id: "d1", event: "order.created", createdAt: "2026-09-25T10:00:00.000Z", data: { reference: "ORD-2026-000001" } });
  const ts = Math.floor(Date.now() / 1000);

  it("signs as sha256=hex HMAC over timestamp.body", () => {
    const sig = signWebhook(secret, ts, body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(sig.slice(7)).toBe(crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex"));
    expect(secret).toMatch(/^whsec_[0-9A-Za-z]{40}$/);
  });
  it("verifies genuine deliveries and rejects tampering", () => {
    const sig = signWebhook(secret, ts, body);
    expect(verifyWebhookSignature(secret, ts, body, sig)).toBe(true);
    expect(verifyWebhookSignature(secret, String(ts), body, sig)).toBe(true);
    expect(verifyWebhookSignature(secret, ts, body.replace("000001", "000002"), sig)).toBe(false);
    expect(verifyWebhookSignature("whsec_other", ts, body, sig)).toBe(false);
    expect(verifyWebhookSignature(secret, ts + 1, body, sig)).toBe(false);
    expect(verifyWebhookSignature(secret, ts, body, "sha256=" + "0".repeat(64))).toBe(false);
    expect(verifyWebhookSignature(secret, ts, body, "")).toBe(false);
    expect(verifyWebhookSignature(secret, "abc", body, sig)).toBe(false);
  });
  it("rejects stale timestamps unless tolerance is disabled", () => {
    const old = ts - 3600;
    const sig = signWebhook(secret, old, body);
    expect(verifyWebhookSignature(secret, old, body, sig)).toBe(false);
    expect(verifyWebhookSignature(secret, old, body, sig, { toleranceSec: 0 })).toBe(true);
    expect(verifyWebhookSignature(secret, old, body, sig, { now: old * 1000 + 1000 })).toBe(true);
  });
  it("builds the documented envelope", () => {
    const env = buildEnvelope({ id: "d1", event: "ping", createdAt: new Date("2026-09-25T10:00:00Z"), payload: { a: 1 } });
    expect(env).toEqual({ id: "d1", event: "ping", createdAt: "2026-09-25T10:00:00.000Z", data: { a: 1 } });
  });
});

describe("webhook backoff", () => {
  it("retries after 1m, 5m, 30m, 2h, 12h and then gives up", () => {
    const now = Date.UTC(2026, 8, 25, 10, 0, 0);
    const minutes = (d: Date | null) => (d ? (d.getTime() - now) / 60_000 : null);
    expect(BACKOFF_MS).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    expect([1, 2, 3, 4, 5].map((n) => minutes(nextAttemptAt(n, now)))).toEqual([1, 5, 30, 120, 720]);
    expect(nextAttemptAt(6, now)).toBeNull();
    expect(nextAttemptAt(99, now)).toBeNull();
    expect(MAX_ATTEMPTS).toBe(6);
  });
});

describe("price rows", () => {
  it("accepts SKU or materialId rows and coerces numbers / dates", () => {
    const r = priceRowSchema.parse({ sku: "CEM-OPC-50", city: "Riyadh", price: "15.75", minQty: "10", leadTimeDays: "2", validUntil: "2026-12-31", stock: "1200", active: true });
    expect(r).toMatchObject({ sku: "CEM-OPC-50", city: "Riyadh", price: 15.75, minQty: 10, leadTimeDays: 2, stock: 1200, active: true });
    expect(r.validUntil).toBeInstanceOf(Date);
    expect(priceRowSchema.parse({ materialId: "ckx1", city: "Jeddah", price: 100, validUntil: "" }).validUntil).toBeNull();
  });
  it("rejects rows without an identifier, non-positive prices and sale prices above the list price", () => {
    expect(priceRowSchema.safeParse({ city: "Riyadh", price: 10 }).success).toBe(false);
    expect(priceRowSchema.safeParse({ sku: "X", city: "Riyadh", price: 0 }).success).toBe(false);
    expect(priceRowSchema.safeParse({ sku: "X", city: "Riyadh", price: -5 }).success).toBe(false);
    expect(priceRowSchema.safeParse({ sku: "X", city: "R", price: 5 }).success).toBe(false);
    expect(priceRowSchema.safeParse({ sku: "X", city: "Riyadh", price: 10, salePrice: 12 }).success).toBe(false);
    expect(priceRowSchema.safeParse({ sku: "X", city: "Riyadh", price: 10, salePrice: 9 }).success).toBe(true);
    expect(priceRowSchema.safeParse({ sku: "X", city: "Riyadh", price: 10, stock: -1 }).success).toBe(false);
  });
  it("validates stock rows by listingId or sku + city", () => {
    expect(stockRowSchema.safeParse({ listingId: "l1", stock: 5 }).success).toBe(true);
    expect(stockRowSchema.safeParse({ sku: "X", city: "Riyadh", stock: "5" }).success).toBe(true);
    expect(stockRowSchema.safeParse({ sku: "X", stock: 5 }).success).toBe(false);
    expect(stockRowSchema.safeParse({ listingId: "l1", stock: 1.5 }).success).toBe(false);
  });
  it("reports per-row errors and enforces the batch limits", () => {
    const out = validateRows(priceRowSchema, { rows: [{ sku: "A", city: "Riyadh", price: 10 }, { sku: "B", city: "Riyadh", price: "abc" }, { city: "Riyadh", price: 1 }] });
    expect(out.total).toBe(3);
    expect(out.rows[0]).toMatchObject({ index: 0, data: { sku: "A" } });
    expect(out.rows[1]).toMatchObject({ index: 1, error: expect.stringContaining("price") });
    expect(out.rows[2]).toMatchObject({ index: 2, error: expect.stringContaining("sku or materialId") });
    expect(validateRows(priceRowSchema, [{ sku: "A", city: "Riyadh", price: 10 }]).total).toBe(1);
    expect(() => validateRows(priceRowSchema, { rows: [] })).toThrow(/At least one/);
    expect(() => validateRows(priceRowSchema, { nope: true })).toThrow(/array/);
    expect(() => validateRows(priceRowSchema, Array.from({ length: 1001 }, () => ({ sku: "A", city: "Riyadh", price: 1 })))).toThrow(/1000/);
  });
});

describe("order status mapping", () => {
  it("maps ERP aliases onto marketplace statuses", () => {
    expect(mapIntegrationStatus("PROCESSING")).toBe("CONFIRMED");
    expect(mapIntegrationStatus("SHIPPED")).toBe("IN_TRANSIT");
    expect(mapIntegrationStatus("CONFIRMED")).toBe("CONFIRMED");
    expect(mapIntegrationStatus("DELIVERED")).toBe("DELIVERED");
  });
  it("mirrors the transition table of routes/orders.ts", () => {
    expect(ORDER_TRANSITIONS).toEqual({ PENDING: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["IN_TRANSIT", "CANCELLED"], IN_TRANSIT: ["DELIVERED"], DELIVERED: [], CANCELLED: [] });
    expect(canTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransition("PENDING", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
  });
});

describe("shapeOrderForErp", () => {
  it("flattens decimals, SKUs and the address block", () => {
    const row = {
      id: "o1", reference: "ORD-2026-000001", type: "DIRECT", status: "CONFIRMED", paymentStatus: "PAID", paymentMethod: "CARD", currency: "SAR", poNumber: "PO-77", dueDate: null, couponCode: null,
      subtotal: "1000.00", vat: "150.00", deliveryFee: "50", discount: "0", total: "1200.00", notes: null, rfqId: null, bidId: null,
      company: { id: "c1", name: "Steel Co", nameAr: null, vatNumber: "3001", crNumber: null, city: "Riyadh" },
      buyer: { id: "u1", name: "Ali", email: "ali@x.sa", phone: null, company: null },
      contactPhone: "+966500000000", deliveryCity: "Riyadh", deliveryAddress: "Olaya St", address: null,
      items: [{ id: "i1", materialId: "m1", listingId: "l1", name: "Rebar 12mm", unit: "ton", quantity: 2, unitPrice: "500.00", lineTotal: "1000.00", material: { id: "m1", sku: "RB-12", name: "Rebar 12mm", nameAr: "حديد", unit: "ton" } }],
      einvoice: { id: "e1", invoiceNumber: "INV-2026-000001", uuid: "uuid", status: "GENERATED", createdAt: new Date("2026-09-25T00:00:00Z") },
      shipments: [], createdAt: new Date("2026-09-24T00:00:00Z"), updatedAt: new Date("2026-09-25T00:00:00Z"),
    } as unknown as ErpOrderRow;
    const o = shapeOrderForErp(row);
    expect(o.total).toBe(1200);
    expect(o.vat).toBe(150);
    expect(o.items[0]).toMatchObject({ sku: "RB-12", unitPrice: 500, lineTotal: 1000, quantity: 2 });
    expect(o.shipTo).toMatchObject({ recipient: "Ali", phone: "+966500000000", city: "Riyadh", street: "Olaya St" });
    expect(o.einvoice?.invoiceNumber).toBe("INV-2026-000001");
    expect(o.supplier.name).toBe("Steel Co");
  });
});
