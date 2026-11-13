/**
 * Saudi Post | SPL (سبل) – business REST API. Auth: `x-api-key` (SPL_API_KEY) plus the customer account id
 * (`x-customer-id`, SPL_CUSTOMER_ID). SPL_API_URL points at the sandbox or production gateway given at onboarding.
 * Endpoints: POST /shipments, GET /shipments/{id}/tracking, POST /shipments/{id}/cancel, GET /shipments/{id}/label.
 * Confirm field names with SPL onboarding: the payload below follows SPL's domestic parcel contract (consignee /
 * shipper blocks, weight in kg, COD amount), but account-specific products and codes vary.
 */
import type { ShipmentStatus } from "@prisma/client";
import { apiBase, arr, type BookingRequest, type BookingResult, type CancelResult, type CarrierSpec, http, kg, type LabelResult, mapByKeywords, mapGenericStatus, normalizeStatus, obj, parseDate, parseGenericWebhook, phoneE164, readEnv, str, type TrackingEvent, CarrierError } from "./common";

const DEFAULT_BASE = "https://api.splonline.com.sa/v1";
const base = () => apiBase("SPL", DEFAULT_BASE);
const headers = () => ({ "x-api-key": readEnv("SPL_API_KEY"), "x-customer-id": readEnv("SPL_CUSTOMER_ID") });
const party = (p: BookingRequest["pickup"]) => ({ name: p.name.slice(0, 60), phone: phoneE164(p.phone) || "+966500000000", city: p.city, addressLine1: (p.address ?? p.city).slice(0, 120), country: "SA" });

/** Our booking → SPL create-shipment body. Pure. */
export function toSplPayload(req: BookingRequest) {
  return {
    customerId: readEnv("SPL_CUSTOMER_ID") || undefined,
    reference: req.orderReference,
    service: req.service?.trim() || "DOMESTIC_PARCEL",
    description: (req.contentDescription ?? "Construction materials").slice(0, 100),
    pieces: Math.max(1, Math.round(req.pieces ?? 1)),
    weightKg: kg(req.weightKg),
    declaredValue: Math.round((req.valueSar ?? 0) * 100) / 100,
    codAmount: Math.round((req.codAmountSar ?? 0) * 100) / 100,
    currency: "SAR",
    pickupDate: (req.scheduledAt ?? new Date()).toISOString(),
    shipper: party(req.pickup),
    consignee: party(req.dropoff),
  };
}

export function parseSplBooking(json: unknown): BookingResult {
  const j = obj(json);
  const d = Object.keys(obj(j.data)).length ? obj(j.data) : j;
  const tracking = str(d.trackingNumber ?? d.tracking_number ?? d.awb ?? d.barcode);
  const id = str(d.id ?? d.shipmentId ?? d.shipment_id) ?? tracking;
  if (!tracking || !id) throw new CarrierError("SPL did not return a tracking number", 502, json);
  return { externalId: id, trackingNumber: tracking, trackingUrl: `https://splonline.com.sa/en/track/?trackingNumber=${encodeURIComponent(tracking)}`, cost: Number.isFinite(Number(d.price ?? d.cost)) && d.price !== undefined ? Number(d.price ?? d.cost) : null, labelUrl: str(d.labelUrl ?? d.label_url) ?? null };
}

/** SPL status codes are upper-snake (`IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `RETURNED`) or an Arabic/English description. */
export const mapSplStatus = (raw: string): ShipmentStatus => {
  const n = normalizeStatus(raw);
  if (/^(received|accepted|registered)$/.test(n)) return "BOOKED";
  if (/^(dispatched|processing|at_office|at_hub)$/.test(n)) return "IN_TRANSIT";
  if (/تسليم|تم التوصيل/.test(raw)) return "DELIVERED";
  if (/استلام|تم الاستلام/.test(raw)) return "PICKED_UP";
  if (/الطريق|في الطريق|نقل/.test(raw)) return "IN_TRANSIT";
  return mapByKeywords(raw) ?? mapGenericStatus(raw);
};

export function toSplEvents(json: unknown): TrackingEvent[] {
  const j = obj(json);
  const d = Object.keys(obj(j.data)).length ? obj(j.data) : j;
  const rows = arr(d.events ?? d.history ?? d.tracking).map(obj);
  return rows
    .map((r) => { const raw = str(r.status ?? r.code ?? r.event) ?? ""; return { status: mapSplStatus(raw), raw, description: str(r.description ?? r.statusDescription ?? r.message) ?? raw, location: str(r.location ?? r.office ?? r.city), at: parseDate(r.timestamp ?? r.date ?? r.at) ?? null }; })
    .filter((e) => e.raw)
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
}

export const spl: CarrierSpec = {
  code: "SPL",
  env: { required: ["SPL_API_KEY", "SPL_CUSTOMER_ID"], optional: ["SPL_API_URL", "SPL_WEBHOOK_SECRET"] },
  signatureHeaders: ["x-spl-signature"],
  mapStatus: mapSplStatus,
  parseWebhook: parseGenericWebhook,
  live: {
    async book(req) { return parseSplBooking(await http(`${base()}/shipments`, { method: "POST", headers: headers(), body: JSON.stringify(toSplPayload(req)) })); },
    async track(ref) { return toSplEvents(await http(`${base()}/shipments/${encodeURIComponent(ref)}/tracking`, { headers: headers() })); },
    async cancel(id): Promise<CancelResult> { await http(`${base()}/shipments/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: headers(), body: "{}" }); return { remote: true }; },
    async label(id): Promise<LabelResult | null> {
      const j = obj(await http(`${base()}/shipments/${encodeURIComponent(id)}/label`, { headers: headers() }));
      const d = Object.keys(obj(j.data)).length ? obj(j.data) : j;
      const url = str(d.url ?? d.labelUrl ?? d.label_url), file = str(d.pdf ?? d.pdfBase64 ?? d.content);
      return url ? { url } : file ? { pdfBase64: file } : null;
    },
    async ping() {
      try { await http(`${base()}/shipments?limit=1`, { headers: headers(), timeoutMs: 10_000 }); return { ok: true, detail: "SPL accepted the API key" }; }
      catch (e) { const s = e instanceof CarrierError ? e.status : undefined; return s === 401 || s === 403 ? { ok: false, detail: "SPL rejected the API key or customer id" } : s ? { ok: true, detail: `SPL reachable (HTTP ${s})` } : { ok: false, detail: String((e as Error).message) }; }
    },
  },
};
