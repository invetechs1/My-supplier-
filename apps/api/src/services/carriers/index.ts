/**
 * Carrier adapters. Each adapter exposes book()/track(); when the carrier's API key is missing the
 * adapter reports `configured: false` and the shipment is managed manually (tracking number typed
 * by the supplier, status updated by hand or by the carrier webhook).
 *
 * To integrate a real carrier: implement book() with the carrier's create-shipment call, map its
 * status codes in mapStatus(), and set the API key env var. Everything else (quotes, timeline,
 * notifications, webhooks) already works.
 */
import type { CarrierCode, ShipmentStatus } from "@prisma/client";

export interface BookingRequest {
  orderReference: string;
  pickup: { city: string; address?: string | null; phone?: string | null; name: string };
  dropoff: { city: string; address?: string | null; phone?: string | null; name: string };
  weightKg: number | null;
  volumeM3: number | null;
  service?: string | null;
  scheduledAt?: Date | null;
}
export interface BookingResult { externalId: string; trackingNumber: string; trackingUrl?: string | null; cost?: number | null }

export interface CarrierAdapter {
  code: CarrierCode;
  configured(): boolean;
  book(req: BookingRequest): Promise<BookingResult>;
  mapStatus(raw: string): ShipmentStatus;
}

const GENERIC_STATUS: Record<string, ShipmentStatus> = {
  created: "BOOKED", booked: "BOOKED", accepted: "BOOKED", assigned: "BOOKED",
  picked_up: "PICKED_UP", pickedup: "PICKED_UP", collected: "PICKED_UP",
  in_transit: "IN_TRANSIT", intransit: "IN_TRANSIT", on_the_way: "IN_TRANSIT", departed: "IN_TRANSIT",
  out_for_delivery: "OUT_FOR_DELIVERY", ofd: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED", completed: "DELIVERED", pod: "DELIVERED",
  failed: "FAILED", exception: "FAILED", returned: "FAILED",
  cancelled: "CANCELLED", canceled: "CANCELLED",
};
export const mapGenericStatus = (raw: string): ShipmentStatus => GENERIC_STATUS[raw.toLowerCase().replace(/[\s-]+/g, "_")] ?? "IN_TRANSIT";

function apiAdapter(code: CarrierCode, envKey: string, endpoint: string): CarrierAdapter {
  return {
    code,
    configured: () => Boolean(process.env[envKey]),
    async book(req) {
      const key = process.env[envKey];
      if (!key) throw new Error(`${code} is not configured (set ${envKey})`);
      // Generic JSON booking call; adjust payload/response mapping to the carrier's contract when onboarding.
      const resp = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(req), signal: AbortSignal.timeout(20_000) });
      if (!resp.ok) throw new Error(`${code} booking failed (${resp.status})`);
      const json = (await resp.json()) as { id?: string; shipment_id?: string; tracking_number?: string; awb?: string; tracking_url?: string; cost?: number };
      return { externalId: String(json.id ?? json.shipment_id ?? ""), trackingNumber: String(json.tracking_number ?? json.awb ?? json.id ?? ""), trackingUrl: json.tracking_url ?? null, cost: json.cost ?? null };
    },
    mapStatus: mapGenericStatus,
  };
}

const manual: CarrierAdapter = { code: "SUPPLIER", configured: () => true, async book() { throw new Error("Manual carrier does not book online"); }, mapStatus: mapGenericStatus };

export const adapters: Record<CarrierCode, CarrierAdapter> = {
  SUPPLIER: manual,
  OTHER: { ...manual, code: "OTHER" },
  TRUKKER: apiAdapter("TRUKKER", "TRUKKER_API_KEY", process.env.TRUKKER_API_URL ?? "https://api.trukker.com/v1/shipments"),
  TRELLA: apiAdapter("TRELLA", "TRELLA_API_KEY", process.env.TRELLA_API_URL ?? "https://api.trella.app/v1/loads"),
  SMSA: apiAdapter("SMSA", "SMSA_API_KEY", process.env.SMSA_API_URL ?? "https://ecomapis.smsaexpress.com/api/shipment/b2c/new"),
  ARAMEX: apiAdapter("ARAMEX", "ARAMEX_API_KEY", process.env.ARAMEX_API_URL ?? "https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/CreateShipments"),
  SPL: apiAdapter("SPL", "SPL_API_KEY", process.env.SPL_API_URL ?? "https://api.splonline.com.sa/v1/shipments"),
};
