import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adapters, carrierStatus, mapGenericStatus, parseGenericWebhook, sandboxBooking, sandboxTrack, truckTypeFor, verifyWebhookRequest, type BookingRequest } from "../src/services/carriers";
import { mapSmsaStatus, parseSmsaBooking, toSmsaEvents, toSmsaPayload } from "../src/services/carriers/smsa";
import { aramexClientInfo, mapAramexStatus, parseAramexBooking, toAramexEvents, toAramexPayload } from "../src/services/carriers/aramex";
import { mapLoadStatus, toLoadPayload } from "../src/services/carriers/trucking";

const booking: BookingRequest = {
  orderReference: "ORD-2026-000123",
  pickup: { city: "Riyadh", address: "Exit 18, warehouse 4", phone: "0501234567", name: "Al Bina Cement Trading" },
  dropoff: { city: "Jeddah", address: "Industrial city, plot 12", phone: "+966 55 987 6543", name: "Mohammed Al Harbi", email: "buyer@example.com" },
  weightKg: 48.6, volumeM3: 0.12, service: null, scheduledAt: new Date("2026-11-14T06:00:00Z"), contentDescription: "Tile adhesive 25kg x 2", valueSar: 180, codAmountSar: 0, pieces: 2,
};

const ENV = ["CARRIER_SANDBOX", "CARRIER_WEBHOOK_SECRET", "SMSA_API_KEY", "SMSA_WEBHOOK_SECRET", "SMSA_CUSTOMER_CODE", "ARAMEX_USERNAME", "ARAMEX_API_KEY", "ARAMEX_ACCOUNT_NUMBER", "ARAMEX_ACCOUNT_PIN", "ARAMEX_ACCOUNT_ENTITY", "TRUKKER_API_KEY"];
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])); for (const k of ENV) delete process.env[k]; });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("SMSA payload mapping", () => {
  it("maps our booking to the B2C new-shipment contract", () => {
    process.env.SMSA_CUSTOMER_CODE = "C123";
    const p = toSmsaPayload(booking);
    expect(p.ContentDescription).toBe("Tile adhesive 25kg x 2");
    expect(p.ShipmentValue).toBe(180);
    expect(p.CODAmount).toBe(0);
    expect(p.Parcels).toBe(2);
    expect(p.Weight).toBe(48.6);
    expect(p.WeightUnit).toBe("KG");
    expect(p.SMSARetailID).toBe("C123");
    expect(p.ConsigneeAddress).toMatchObject({ ContactName: "Mohammed Al Harbi", ContactPhoneNumber: "+966559876543", City: "Jeddah", Country: "SA", AddressLine1: "Industrial city, plot 12" });
    expect(p.ShipperAddress).toMatchObject({ ContactName: "Al Bina Cement Trading", ContactPhoneNumber: "+966501234567", City: "Riyadh", Country: "SA" });
    expect(p.OrderNumber).toBe("ORD-2026-000123");
  });

  it("parses the waybill response and keeps the label PDF", () => {
    const r = parseSmsaBooking({ sawb: "S1", waybills: [{ awb: "290000012345", awbFile: "JVBERi0=" }] });
    expect(r.trackingNumber).toBe("290000012345");
    expect(r.externalId).toBe("290000012345");
    expect(r.labelUrl).toBe("data:application/pdf;base64,JVBERi0=");
    expect(r.trackingUrl).toContain("290000012345");
    expect(() => parseSmsaBooking({ error: "bad" })).toThrow(/waybill/);
  });

  it("maps SMSA activities and sorts tracking oldest first", () => {
    expect(mapSmsaStatus("DATA RECEIVED")).toBe("BOOKED");
    expect(mapSmsaStatus("PICKED UP FROM SHIPPER")).toBe("PICKED_UP");
    expect(mapSmsaStatus("ARRIVED AT RIYADH HUB")).toBe("IN_TRANSIT");
    expect(mapSmsaStatus("OUT FOR DELIVERY")).toBe("OUT_FOR_DELIVERY");
    expect(mapSmsaStatus("PROOF OF DELIVERY CAPTURED")).toBe("DELIVERED");
    expect(mapSmsaStatus("RETURNED TO SHIPPER")).toBe("FAILED");
    const events = toSmsaEvents({ Tracking: [{ Date: "2026-11-15T08:00:00Z", Activity: "DELIVERED", Location: "Jeddah" }, { Date: "2026-11-14T08:00:00Z", Activity: "PICKED UP", Location: "Riyadh" }] });
    expect(events.map((e) => e.status)).toEqual(["PICKED_UP", "DELIVERED"]);
    expect(events[1].location).toBe("Jeddah");
  });
});

describe("Aramex payload mapping", () => {
  it("builds ClientInfo and a domestic CreateShipments body", () => {
    Object.assign(process.env, { ARAMEX_USERNAME: "u@x.sa", ARAMEX_API_KEY: "pw", ARAMEX_ACCOUNT_NUMBER: "60500000", ARAMEX_ACCOUNT_PIN: "123456" });
    expect(aramexClientInfo()).toMatchObject({ UserName: "u@x.sa", Password: "pw", Version: "v1.0", AccountNumber: "60500000", AccountPin: "123456", AccountEntity: "RUH", AccountCountryCode: "SA" });
    const p = toAramexPayload({ ...booking, codAmountSar: 207 });
    const sh = p.Shipments[0];
    expect(sh.Reference1).toBe("ORD-2026-000123");
    expect(sh.Shipper.AccountNumber).toBe("60500000");
    expect(sh.Shipper.PartyAddress).toMatchObject({ City: "Riyadh", CountryCode: "SA" });
    expect(sh.Consignee.Contact.PhoneNumber1).toBe("+966559876543");
    expect(sh.Details.ActualWeight).toEqual({ Unit: "KG", Value: 48.6 });
    expect(sh.Details).toMatchObject({ ProductGroup: "DOM", ProductType: "OND", NumberOfPieces: 2, DescriptionOfGoods: "Tile adhesive 25kg x 2", Services: "CODS" });
    expect(sh.Details.CashOnDeliveryAmount).toEqual({ CurrencyCode: "SAR", Value: 207 });
    expect(sh.ShippingDateTime).toBe(`/Date(${booking.scheduledAt!.getTime()})/`);
    expect(p.LabelInfo.ReportType).toBe("URL");
  });

  it("parses CreateShipments responses and surfaces Aramex notifications", () => {
    const ok = parseAramexBooking({ HasErrors: false, Shipments: [{ ID: "44770000001", HasErrors: false, ShipmentLabel: { LabelURL: "https://ws.aramex.net/label/1.pdf" } }] });
    expect(ok).toMatchObject({ externalId: "44770000001", trackingNumber: "44770000001", labelUrl: "https://ws.aramex.net/label/1.pdf" });
    expect(() => parseAramexBooking({ HasErrors: true, Notifications: [{ Code: "ERR52", Message: "Invalid account" }], Shipments: [] })).toThrow(/ERR52 Invalid account/);
  });

  it("maps update codes and descriptions, parsing WCF dates", () => {
    expect(mapAramexStatus("SH014")).toBe("DELIVERED");
    expect(mapAramexStatus("Shipment out for delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapAramexStatus("Picked up from shipper")).toBe("PICKED_UP");
    const events = toAramexEvents({ TrackingResults: [{ Key: "447", Value: [{ UpdateCode: "SH014", UpdateDescription: "Delivered", UpdateDateTime: "/Date(1763200000000+0300)/", UpdateLocation: "Jeddah", Comments: "Signed by M." }, { UpdateCode: "SH001", UpdateDescription: "Record created", UpdateDateTime: "/Date(1763100000000+0300)/", UpdateLocation: "Riyadh" }] }] });
    expect(events.map((e) => e.status)).toEqual(["BOOKED", "DELIVERED"]);
    expect(events[1].at?.getTime()).toBe(1763200000000);
    expect(events[1].description).toBe("Delivered · Signed by M.");
  });
});

describe("heavy trucking mapping", () => {
  it("derives the truck type from the load weight", () => {
    expect(truckTypeFor(3000)).toBe("DYNA");
    expect(truckTypeFor(7000)).toBe("DYNA");
    expect(truckTypeFor(18000)).toBe("FLATBED");
    expect(truckTypeFor(30000)).toBe("TRAILER");
    expect(toLoadPayload({ ...booking, weightKg: 12000 }).truck_type).toBe("flatbed");
    expect(toLoadPayload(booking).pickup).toMatchObject({ city: "Riyadh", contact_phone: "+966501234567", scheduled_at: "2026-11-14T06:00:00.000Z" });
    expect(mapLoadStatus("driver_assigned")).toBe("BOOKED");
    expect(mapLoadStatus("unloading")).toBe("OUT_FOR_DELIVERY");
    expect(mapLoadStatus("pod_received")).toBe("DELIVERED");
  });
  it("keeps the generic status table", () => {
    expect(mapGenericStatus("picked-up")).toBe("PICKED_UP");
    expect(mapGenericStatus("Out For Delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapGenericStatus("canceled")).toBe("CANCELLED");
    expect(mapGenericStatus("something odd")).toBe("IN_TRANSIT");
  });
});

describe("webhook verification", () => {
  const secret = "whsec_test_123";
  const body = JSON.stringify({ awb: "290000012345", Activity: "DELIVERED" });
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a matching HMAC (hex, prefixed or base64) and rejects a wrong one", () => {
    expect(verifyWebhookRequest(secret, { headers: { "x-signature": hmac }, rawBody: body })).toBe(true);
    expect(verifyWebhookRequest(secret, { headers: { "x-signature": `sha256=${hmac}` }, rawBody: body })).toBe(true);
    expect(verifyWebhookRequest(secret, { headers: { "x-smsa-signature": Buffer.from(hmac, "hex").toString("base64") }, rawBody: body }, ["x-smsa-signature"])).toBe(true);
    expect(verifyWebhookRequest(secret, { headers: { "x-signature": hmac }, rawBody: body + " " })).toBe(false);
    expect(verifyWebhookRequest(secret, { headers: { "x-signature": "00" } , rawBody: body })).toBe(false);
  });
  it("accepts the shared token header and refuses everything without a secret", () => {
    expect(verifyWebhookRequest(secret, { headers: { "x-webhook-token": secret } })).toBe(true);
    expect(verifyWebhookRequest(secret, { headers: { "x-webhook-token": "nope" } })).toBe(false);
    expect(verifyWebhookRequest(secret, { headers: {} })).toBe(false);
    expect(verifyWebhookRequest("", { headers: { "x-webhook-token": "" } })).toBe(false);
  });
  it("uses the per-carrier secret first and falls back to the legacy shared secret", () => {
    process.env.SMSA_WEBHOOK_SECRET = secret;
    process.env.CARRIER_WEBHOOK_SECRET = "legacy";
    expect(adapters.SMSA.verifyWebhook({ headers: { "x-signature": hmac }, rawBody: body })).toBe(true);
    expect(adapters.SMSA.verifyWebhook({ headers: { "x-webhook-secret": "legacy" }, rawBody: body })).toBe(false);
    delete process.env.SMSA_WEBHOOK_SECRET;
    expect(adapters.SMSA.verifyWebhook({ headers: { "x-webhook-secret": "legacy" }, rawBody: body })).toBe(true);
    expect(adapters.SMSA.parseWebhook(JSON.parse(body))).toMatchObject({ trackingNumber: "290000012345", status: "DELIVERED" });
    expect(parseGenericWebhook({ data: { tracking_number: "T1", status: "in_transit", location: "Dammam" } })).toMatchObject({ trackingNumber: "T1", status: "in_transit", location: "Dammam" });
  });
});

describe("modes and sandbox", () => {
  it("is manual without credentials, live with them, sandbox with CARRIER_SANDBOX=1", async () => {
    expect(adapters.SMSA.mode()).toBe("manual");
    expect(adapters.SUPPLIER.mode()).toBe("manual");
    await expect(adapters.SMSA.book(booking)).rejects.toThrow(/SMSA_API_KEY/);
    process.env.SMSA_API_KEY = "k";
    expect(adapters.SMSA.mode()).toBe("live");
    process.env.CARRIER_SANDBOX = "1";
    expect(adapters.SMSA.mode()).toBe("sandbox");
    expect(adapters.ARAMEX.mode()).toBe("manual"); // needs all four account fields
    const status = carrierStatus("ARAMEX", "https://api.example.sa/api/v1");
    expect(status.missing).toEqual(["ARAMEX_USERNAME", "ARAMEX_API_KEY", "ARAMEX_ACCOUNT_NUMBER", "ARAMEX_ACCOUNT_PIN"]);
    expect(status.webhookUrl).toBe("https://api.example.sa/api/v1/shipping/webhooks/aramex");
  });

  it("books deterministic SBX- shipments and walks the tracking timeline over time", async () => {
    process.env.SMSA_API_KEY = "k";
    process.env.CARRIER_SANDBOX = "1";
    const t0 = Date.UTC(2026, 10, 14, 6, 0, 0);
    const a = sandboxBooking("SMSA", booking, t0), b = sandboxBooking("SMSA", booking, t0);
    expect(a).toEqual(b);
    expect(a.trackingNumber).toMatch(/^SBX-SMSA-[0-9A-Z]+-[0-9A-F]{4}$/);
    expect(sandboxTrack(a.trackingNumber, t0).map((e) => e.status)).toEqual(["BOOKED"]);
    expect(sandboxTrack(a.trackingNumber, t0 + 6 * 60_000).map((e) => e.status)).toEqual(["BOOKED", "PICKED_UP", "IN_TRANSIT"]);
    expect(sandboxTrack(a.trackingNumber, t0 + 60 * 60_000).at(-1)?.status).toBe("DELIVERED");
    const live = await adapters.SMSA.book(booking);
    expect(live.trackingNumber.startsWith("SBX-SMSA-")).toBe(true);
    expect((await adapters.SMSA.track(live.trackingNumber))[0].status).toBe("BOOKED");
    const label = await adapters.SMSA.label(live.externalId);
    expect(Buffer.from(label!.pdfBase64!, "base64").toString("latin1")).toMatch(/^%PDF-1\.4/);
    expect(await adapters.SMSA.cancel(live.externalId)).toMatchObject({ remote: true });
    expect(await adapters.SMSA.ping()).toMatchObject({ ok: true });
    // A sandbox reference never reaches the live API, even after the flag is switched off.
    delete process.env.CARRIER_SANDBOX;
    expect(adapters.SMSA.mode()).toBe("live");
    expect((await adapters.SMSA.track(live.trackingNumber)).length).toBeGreaterThan(0);
  });
});
