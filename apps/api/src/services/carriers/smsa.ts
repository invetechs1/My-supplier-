/**
 * SMSA Express – B2C REST API (https://ecomapis.smsaexpress.com). Auth: `apikey` header issued by SMSA for the
 * customer account. Endpoints used: POST /api/shipment/b2c/new, GET /api/shipment/b2c/query/{awb},
 * POST /api/shipment/b2c/cancel, GET /api/shipment/b2c/label. SMSA has a separate staging host for sandbox accounts:
 * put it in SMSA_API_URL. Field names follow SMSA's published B2C contract; confirm optional ones (district, retail id)
 * with SMSA onboarding.
 */
import type { ShipmentStatus } from "@prisma/client";
import { apiBase, arr, type BookingRequest, type BookingResult, type CancelResult, type CarrierSpec, http, kg, type LabelResult, mapByKeywords, obj, parseDate, phoneE164, readEnv, str, type TrackingEvent, type WebhookUpdate, CarrierError } from "./common";

const DEFAULT_BASE = "https://ecomapis.smsaexpress.com";
const headers = () => ({ apikey: readEnv("SMSA_API_KEY") });
const base = () => apiBase("SMSA", DEFAULT_BASE);
const party = (p: BookingRequest["pickup"]) => ({ ContactName: p.name.slice(0, 50), ContactPhoneNumber: phoneE164(p.phone) || "+966500000000", Country: "SA", City: p.city, AddressLine1: (p.address ?? p.city).slice(0, 100), District: "", PostalCode: "" });

/** Our booking → SMSA "new B2C shipment" body. Pure, unit-tested. */
export function toSmsaPayload(req: BookingRequest) {
  return {
    OrderNumber: req.orderReference,
    ContentDescription: (req.contentDescription ?? "Construction materials").slice(0, 100),
    ShipmentValue: Math.round((req.valueSar ?? 0) * 100) / 100,
    CODAmount: Math.round((req.codAmountSar ?? 0) * 100) / 100,
    DeclaredValue: Math.round((req.valueSar ?? 0) * 100) / 100,
    ShipmentCurrency: "SAR",
    Parcels: Math.max(1, Math.round(req.pieces ?? 1)),
    ShipDate: (req.scheduledAt ?? new Date()).toISOString(),
    SMSARetailID: readEnv("SMSA_CUSTOMER_CODE") || undefined,
    WaybillType: "PDF",
    Weight: kg(req.weightKg),
    WeightUnit: "KG",
    ServiceCode: req.service?.trim() || undefined,
    ConsigneeAddress: party(req.dropoff),
    ShipperAddress: party(req.pickup),
  };
}

/** Response: `{ sawb, waybills: [{ awb, awbFile (base64 PDF) }] }`. The parcel AWB is what query/cancel/label take, so it is the external id too. */
export function parseSmsaBooking(json: unknown): BookingResult {
  const j = obj(json);
  const waybills = arr(j.waybills).map(obj);
  const awb = str(waybills[0]?.awb) ?? str(j.sawb) ?? str(j.awb);
  if (!awb) throw new CarrierError("SMSA did not return a waybill number", 502, json);
  const file = str(waybills[0]?.awbFile);
  return { externalId: awb, trackingNumber: awb, trackingUrl: `https://www.smsaexpress.com/sa/trackingdetails?tracknumbers=${encodeURIComponent(awb)}`, cost: null, labelUrl: file ? `data:application/pdf;base64,${file}` : null };
}

/** SMSA activity names are free text ("DATA RECEIVED", "PROOF OF DELIVERY CAPTURED", "OUT FOR DELIVERY"). */
export const mapSmsaStatus = (raw: string): ShipmentStatus => mapByKeywords(raw) ?? "IN_TRANSIT";

/** Tracking response: `{ sawb, Tracking: [{ awb, Date, Activity, Details, Location }] }`. */
export function toSmsaEvents(json: unknown): TrackingEvent[] {
  const j = obj(json);
  const rows = arr(j.Tracking ?? j.tracking ?? j.data).map(obj);
  return rows
    .map((r) => { const raw = str(r.Activity ?? r.activity ?? r.status) ?? ""; return { status: mapSmsaStatus(raw), raw, description: str(r.Details ?? r.details) ?? raw, location: str(r.Location ?? r.location), at: parseDate(r.Date ?? r.date ?? r.ActivityDate) ?? null }; })
    .filter((e) => e.raw)
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
}

export function parseSmsaWebhook(body: unknown): WebhookUpdate | null {
  const b = obj(body);
  const trackingNumber = str(b.awb ?? b.AWB ?? b.sawb ?? b.trackingNumber);
  const status = str(b.Activity ?? b.activity ?? b.status);
  if (!trackingNumber || !status) return null;
  return { trackingNumber, status, description: str(b.Details ?? b.details ?? b.description), location: str(b.Location ?? b.location), at: parseDate(b.Date ?? b.date ?? b.at) };
}

export const smsa: CarrierSpec = {
  code: "SMSA",
  env: { required: ["SMSA_API_KEY"], optional: ["SMSA_API_URL", "SMSA_CUSTOMER_CODE", "SMSA_WEBHOOK_SECRET"] },
  signatureHeaders: ["x-smsa-signature"],
  mapStatus: mapSmsaStatus,
  parseWebhook: parseSmsaWebhook,
  live: {
    async book(req) { return parseSmsaBooking(await http(`${base()}/api/shipment/b2c/new`, { method: "POST", headers: headers(), body: JSON.stringify(toSmsaPayload(req)) })); },
    async track(ref) { return toSmsaEvents(await http(`${base()}/api/shipment/b2c/query/${encodeURIComponent(ref)}`, { headers: headers() })); },
    async cancel(awb): Promise<CancelResult> { await http(`${base()}/api/shipment/b2c/cancel`, { method: "POST", headers: headers(), body: JSON.stringify({ awb }) }); return { remote: true }; },
    async label(awb): Promise<LabelResult | null> {
      const j = obj(await http(`${base()}/api/shipment/b2c/label?awb=${encodeURIComponent(awb)}`, { headers: headers() }));
      const file = str(j.awbFile ?? j.label ?? j.file);
      const url = str(j.url ?? j.labelUrl);
      return file ? { pdfBase64: file } : url ? { url } : null;
    },
    async ping() {
      // Querying an unknown waybill is a cheap authenticated call: 401/403 means bad key, anything else means we are in.
      try { await http(`${base()}/api/shipment/b2c/query/000000000000`, { headers: headers(), timeoutMs: 10_000 }); return { ok: true, detail: "SMSA accepted the API key" }; }
      catch (e) { const s = e instanceof CarrierError ? e.status : undefined; return s === 401 || s === 403 ? { ok: false, detail: "SMSA rejected the API key" } : s ? { ok: true, detail: `SMSA reachable (HTTP ${s} for a dummy waybill)` } : { ok: false, detail: String((e as Error).message) }; }
    },
  },
};
