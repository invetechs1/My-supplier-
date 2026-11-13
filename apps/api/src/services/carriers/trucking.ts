/**
 * Shared implementation for heavy-trucking marketplaces (TruKKer, Trella). Both expose a bearer-token JSON REST API
 * where a "load" is created with pickup/dropoff stops and a truck type; tracking is a list of status events.
 * The exact field names below are the common denominator of their partner APIs – confirm them with the carrier's
 * onboarding team and adjust `toLoadPayload` / `toLoadEvents` if your account's contract differs.
 */
import type { CarrierCode, ShipmentStatus } from "@prisma/client";
import { apiBase, arr, type BookingRequest, type BookingResult, type CancelResult, type CarrierSpec, http, type LabelResult, mapByKeywords, mapGenericStatus, obj, parseDate, parseGenericWebhook, phoneE164, readEnv, str, num, type TrackingEvent, truckTypeFor, CarrierError } from "./common";

export interface TruckingConfig { code: CarrierCode; defaultBase: string; /** Collection path, e.g. "/shipments" or "/loads". */ path: string; trackingUrl?: (id: string) => string }

/** Our booking → marketplace load request. Truck type: ≤7 t dyna, ≤25 t flatbed, above that a trailer. Pure. */
export function toLoadPayload(req: BookingRequest) {
  const stop = (p: BookingRequest["pickup"]) => ({ city: p.city, address: (p.address ?? p.city).slice(0, 200), contact_name: p.name.slice(0, 80), contact_phone: phoneE164(p.phone) || undefined });
  return {
    reference: req.orderReference,
    truck_type: truckTypeFor(req.weightKg).toLowerCase(), // confirm field names with carrier onboarding
    service: req.service?.trim() || undefined,
    pickup: { ...stop(req.pickup), scheduled_at: (req.scheduledAt ?? new Date()).toISOString() },
    dropoff: stop(req.dropoff),
    cargo: { description: (req.contentDescription ?? "Construction materials").slice(0, 200), weight_kg: Math.round(req.weightKg ?? 0), volume_m3: req.volumeM3 ?? undefined, value_sar: req.valueSar ?? undefined },
    cod_amount_sar: req.codAmountSar && req.codAmountSar > 0 ? req.codAmountSar : undefined,
  };
}

export function parseLoadBooking(json: unknown, trackingUrl?: (id: string) => string): BookingResult {
  const j = obj(json);
  const d = Object.keys(obj(j.data)).length ? obj(j.data) : j;
  const id = str(d.id ?? d.load_id ?? d.shipment_id ?? d.booking_id);
  if (!id) throw new CarrierError("Carrier did not return a load id", 502, json);
  const tracking = str(d.tracking_number ?? d.reference_number ?? d.awb) ?? id;
  return { externalId: id, trackingNumber: tracking, trackingUrl: str(d.tracking_url) ?? trackingUrl?.(id) ?? null, cost: num(d.price ?? d.cost ?? d.total_price) ?? null, labelUrl: str(d.waybill_url ?? d.document_url) ?? null };
}

/** Marketplace statuses are snake-case (`driver_assigned`, `loading`, `in_transit`, `unloading`, `pod_received`). */
export const mapLoadStatus = (raw: string): ShipmentStatus => {
  const n = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (/^(driver_assigned|truck_assigned|pending_assignment|searching|posted|open|quoted)$/.test(n)) return "BOOKED";
  if (/^(at_pickup|arrived_at_pickup|loading|loaded|in_loading)$/.test(n)) return "PICKED_UP";
  if (/^(at_dropoff|arrived_at_dropoff|unloading|in_unloading)$/.test(n)) return "OUT_FOR_DELIVERY";
  if (/^(pod_received|pod_uploaded|unloaded|closed)$/.test(n)) return "DELIVERED";
  if (/^(expired|no_show|disputed)$/.test(n)) return "FAILED";
  return mapByKeywords(raw) ?? mapGenericStatus(raw);
};

/** Tracking: `{ events: [{ status, description, location, timestamp }] }` or a flat `{ status, updated_at }`. */
export function toLoadEvents(json: unknown): TrackingEvent[] {
  const j = obj(json);
  const d = Object.keys(obj(j.data)).length ? obj(j.data) : j;
  const rows = arr(d.events ?? d.history ?? d.status_history ?? d.tracking).map(obj);
  const list = rows.length ? rows : str(d.status) ? [{ status: d.status, description: d.status_description ?? d.message, location: d.current_location ?? d.location, timestamp: d.updated_at ?? d.status_updated_at }] : [];
  return list
    .map((r) => { const raw = str(r.status ?? r.event ?? r.type) ?? ""; const loc = r.location; return { status: mapLoadStatus(raw), raw, description: str(r.description ?? r.message ?? r.note) ?? raw.replace(/_/g, " "), location: typeof loc === "object" ? str(obj(loc).city ?? obj(loc).name ?? obj(loc).address) : str(loc), at: parseDate(r.timestamp ?? r.created_at ?? r.at ?? r.time) ?? null }; })
    .filter((e) => e.raw)
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
}

export function truckingSpec(cfg: TruckingConfig): CarrierSpec {
  const base = () => apiBase(cfg.code, cfg.defaultBase);
  const headers = () => ({ authorization: `Bearer ${readEnv(`${cfg.code}_API_KEY`)}` });
  return {
    code: cfg.code,
    env: { required: [`${cfg.code}_API_KEY`], optional: [`${cfg.code}_API_URL`, `${cfg.code}_WEBHOOK_SECRET`] },
    tracksBy: "externalId",
    signatureHeaders: [`x-${cfg.code.toLowerCase()}-signature`],
    mapStatus: mapLoadStatus,
    parseWebhook: parseGenericWebhook,
    live: {
      async book(req) { return parseLoadBooking(await http(`${base()}${cfg.path}`, { method: "POST", headers: headers(), body: JSON.stringify(toLoadPayload(req)) }), cfg.trackingUrl); },
      async track(id) { return toLoadEvents(await http(`${base()}${cfg.path}/${encodeURIComponent(id)}/tracking`, { headers: headers() })); },
      async cancel(id): Promise<CancelResult> { await http(`${base()}${cfg.path}/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: headers(), body: "{}" }); return { remote: true }; },
      async label(id): Promise<LabelResult | null> {
        // Trucking marketplaces issue a waybill / POD document rather than a parcel label; return it when the API has one.
        try { const d = obj(await http(`${base()}${cfg.path}/${encodeURIComponent(id)}/documents`, { headers: headers() })); const url = str(d.waybill_url ?? d.url ?? obj(arr(d.documents)[0]).url); return url ? { url } : null; }
        catch (e) { if (e instanceof CarrierError && e.status === 404) return null; throw e; }
      },
      async ping() {
        try { await http(`${base()}${cfg.path}?limit=1`, { headers: headers(), timeoutMs: 10_000 }); return { ok: true, detail: `${cfg.code} accepted the API key` }; }
        catch (e) { const s = e instanceof CarrierError ? e.status : undefined; return s === 401 || s === 403 ? { ok: false, detail: `${cfg.code} rejected the API key` } : s ? { ok: true, detail: `${cfg.code} reachable (HTTP ${s})` } : { ok: false, detail: String((e as Error).message) }; }
      },
    },
  };
}
