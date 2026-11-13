/**
 * Aramex – Shipping API v2 (JSON). Production https://ws.aramex.net/ShippingAPI.V2, sandbox
 * https://ws.sbx.aramex.net/ShippingAPI.V2 (ARAMEX_API_URL). Every call carries ClientInfo built from the account
 * fields Aramex issues at onboarding: ARAMEX_USERNAME, ARAMEX_API_KEY (the web-service password), ARAMEX_ACCOUNT_NUMBER,
 * ARAMEX_ACCOUNT_PIN, ARAMEX_ACCOUNT_ENTITY (RUH for Riyadh accounts). Endpoints: Shipping/Service_1_0.svc/json/
 * CreateShipments + PrintLabel, Tracking/Service_1_0.svc/json/TrackShipments. Aramex has no cancel-shipment call in
 * this API: cancellations are agreed with the account manager, so cancel() is local-only.
 */
import type { ShipmentStatus } from "@prisma/client";
import { apiBase, arr, type BookingRequest, type BookingResult, type CancelResult, type CarrierSpec, http, kg, type LabelResult, mapByKeywords, obj, parseDate, phoneE164, readEnv, str, type TrackingEvent, type WebhookUpdate, CarrierError } from "./common";

const DEFAULT_BASE = "https://ws.aramex.net/ShippingAPI.V2";
const base = () => apiBase("ARAMEX", DEFAULT_BASE);
const LABEL = { ReportID: 9729, ReportType: "URL" };

export function aramexClientInfo() {
  return { UserName: readEnv("ARAMEX_USERNAME"), Password: readEnv("ARAMEX_API_KEY"), Version: "v1.0", AccountNumber: readEnv("ARAMEX_ACCOUNT_NUMBER"), AccountPin: readEnv("ARAMEX_ACCOUNT_PIN"), AccountEntity: readEnv("ARAMEX_ACCOUNT_ENTITY") || "RUH", AccountCountryCode: "SA", Source: 24 };
}
const wcfDate = (d: Date) => `/Date(${d.getTime()})/`;
const party = (p: BookingRequest["pickup"], reference: string, accountNumber?: string) => ({
  Reference1: reference,
  AccountNumber: accountNumber ?? "",
  PartyAddress: { Line1: (p.address ?? p.city).slice(0, 50), Line2: "", Line3: "", City: p.city, StateOrProvinceCode: "", PostCode: "", CountryCode: "SA" },
  Contact: { Department: "", PersonName: p.name.slice(0, 50), Title: "", CompanyName: p.name.slice(0, 50), PhoneNumber1: phoneE164(p.phone) || "+966500000000", PhoneNumber1Ext: "", PhoneNumber2: "", PhoneNumber2Ext: "", FaxNumber: "", CellPhone: phoneE164(p.phone) || "+966500000000", EmailAddress: p.email ?? "", Type: "" },
});

/** Our booking → Aramex CreateShipments body (domestic, prepaid, overnight unless a product type is given in `service`). Pure. */
export function toAramexPayload(req: BookingRequest, client = aramexClientInfo()) {
  const when = req.scheduledAt ?? new Date();
  const productType = /^[A-Z]{3}$/.test(req.service?.trim() ?? "") ? req.service!.trim() : "OND";
  const cod = req.codAmountSar && req.codAmountSar > 0 ? { CurrencyCode: "SAR", Value: Math.round(req.codAmountSar * 100) / 100 } : null;
  return {
    ClientInfo: client,
    LabelInfo: LABEL,
    Transaction: { Reference1: req.orderReference, Reference2: "", Reference3: "", Reference4: "", Reference5: "" },
    Shipments: [{
      Reference1: req.orderReference, Reference2: "", Reference3: "", ForeignHAWB: "", TransportType: 0,
      Shipper: party(req.pickup, req.orderReference, client.AccountNumber),
      Consignee: party(req.dropoff, req.orderReference),
      ThirdParty: null,
      ShippingDateTime: wcfDate(when), DueDate: wcfDate(new Date(when.getTime() + 2 * 86_400_000)),
      Comments: (req.contentDescription ?? "Construction materials").slice(0, 100), PickupLocation: "", OperationsInstructions: "", AccountingInstrcutions: "",
      Details: {
        Dimensions: null, ActualWeight: { Unit: "KG", Value: kg(req.weightKg) }, ChargeableWeight: null,
        DescriptionOfGoods: (req.contentDescription ?? "Construction materials").slice(0, 100), GoodsOriginCountry: "SA",
        NumberOfPieces: Math.max(1, Math.round(req.pieces ?? 1)), ProductGroup: "DOM", ProductType: productType, PaymentType: "P", PaymentOptions: "",
        CustomsValueAmount: null, CashOnDeliveryAmount: cod, InsuranceAmount: null, CashAdditionalAmount: null, CashAdditionalAmountDescription: "", CollectAmount: null, Services: cod ? "CODS" : "", Items: [],
      },
      Attachments: [], PickupGUID: "", Number: null, ScheduledDelivery: null,
    }],
  };
}

const notifications = (j: Record<string, unknown>) => arr(j.Notifications).map(obj).map((n) => `${str(n.Code) ?? ""} ${str(n.Message) ?? ""}`.trim()).filter(Boolean).join("; ");

/** Response: `{ HasErrors, Notifications, Shipments: [{ ID, ShipmentLabel: { LabelURL }, HasErrors, Notifications }] }`. */
export function parseAramexBooking(json: unknown): BookingResult {
  const j = obj(json);
  const shipment = arr(j.Shipments).map(obj)[0] ?? {};
  if (j.HasErrors || shipment.HasErrors) throw new CarrierError(`Aramex rejected the shipment: ${notifications(shipment) || notifications(j) || "unknown error"}`, 502, json);
  const awb = str(shipment.ID);
  if (!awb) throw new CarrierError("Aramex did not return a waybill number", 502, json);
  return { externalId: awb, trackingNumber: awb, trackingUrl: `https://www.aramex.com/sa/en/track/results?ShipmentNumber=${encodeURIComponent(awb)}`, cost: null, labelUrl: str(obj(shipment.ShipmentLabel).LabelURL) ?? null };
}

/** Well-known tracking UpdateCodes; anything else falls back to the description keywords. Confirm against Aramex's code list at onboarding. */
const ARAMEX_CODES: Record<string, ShipmentStatus> = { SH001: "BOOKED", SH002: "BOOKED", SH003: "PICKED_UP", SH005: "PICKED_UP", SH006: "IN_TRANSIT", SH007: "IN_TRANSIT", SH008: "IN_TRANSIT", SH012: "OUT_FOR_DELIVERY", SH013: "OUT_FOR_DELIVERY", SH014: "DELIVERED", SH069: "DELIVERED", SH047: "FAILED", SH054: "FAILED", SH057: "FAILED", SH234: "CANCELLED" };
export const mapAramexStatus = (raw: string): ShipmentStatus => ARAMEX_CODES[raw.trim().toUpperCase()] ?? mapByKeywords(raw) ?? "IN_TRANSIT";

/** TrackShipments response: `{ TrackingResults: [{ Key: awb, Value: [{ UpdateCode, UpdateDescription, UpdateDateTime, UpdateLocation, Comments }] }] }`. */
export function toAramexEvents(json: unknown): TrackingEvent[] {
  const j = obj(json);
  const results = arr(j.TrackingResults).map(obj);
  const updates = results.flatMap((r) => arr(r.Value).map(obj));
  return updates
    .map((u) => { const code = str(u.UpdateCode) ?? ""; const desc = str(u.UpdateDescription) ?? code; return { status: ARAMEX_CODES[code.toUpperCase()] ?? mapAramexStatus(desc), raw: code || desc, description: [desc, str(u.Comments)].filter(Boolean).join(" · "), location: str(u.UpdateLocation), at: parseDate(u.UpdateDateTime) ?? null }; })
    .filter((e) => e.raw)
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
}

export function parseAramexWebhook(body: unknown): WebhookUpdate | null {
  const b = obj(body);
  const trackingNumber = str(b.WaybillNumber ?? b.ShipmentNumber ?? b.awb ?? b.trackingNumber);
  const code = str(b.UpdateCode);
  const status = code ?? str(b.UpdateDescription ?? b.status);
  if (!trackingNumber || !status) return null;
  return { trackingNumber, status, description: str(b.UpdateDescription ?? b.Comments ?? b.description), location: str(b.UpdateLocation ?? b.location), at: parseDate(b.UpdateDateTime ?? b.at) };
}

export const aramex: CarrierSpec = {
  code: "ARAMEX",
  env: { required: ["ARAMEX_USERNAME", "ARAMEX_API_KEY", "ARAMEX_ACCOUNT_NUMBER", "ARAMEX_ACCOUNT_PIN"], optional: ["ARAMEX_ACCOUNT_ENTITY", "ARAMEX_API_URL", "ARAMEX_WEBHOOK_SECRET"] },
  signatureHeaders: ["x-aramex-signature"],
  mapStatus: mapAramexStatus,
  parseWebhook: parseAramexWebhook,
  live: {
    async book(req) { return parseAramexBooking(await http(`${base()}/Shipping/Service_1_0.svc/json/CreateShipments`, { method: "POST", body: JSON.stringify(toAramexPayload(req)) })); },
    async track(awb) {
      const j = obj(await http(`${base()}/Tracking/Service_1_0.svc/json/TrackShipments`, { method: "POST", body: JSON.stringify({ ClientInfo: aramexClientInfo(), Transaction: { Reference1: awb }, Shipments: [awb], GetLastTrackingUpdateOnly: false }) }));
      if (j.HasErrors) throw new CarrierError(`Aramex tracking failed: ${notifications(j)}`, 502, j);
      return toAramexEvents(j);
    },
    async cancel(): Promise<CancelResult> { return { remote: false, note: "Aramex has no cancel API: cancel the waybill with your Aramex account manager" }; },
    async label(awb): Promise<LabelResult | null> {
      const j = obj(await http(`${base()}/Shipping/Service_1_0.svc/json/PrintLabel`, { method: "POST", body: JSON.stringify({ ClientInfo: aramexClientInfo(), Transaction: { Reference1: awb }, ShipmentNumber: awb, LabelInfo: LABEL }) }));
      if (j.HasErrors) throw new CarrierError(`Aramex label failed: ${notifications(j)}`, 502, j);
      const label = obj(j.ShipmentLabel);
      const url = str(label.LabelURL), file = str(label.LabelFileContents);
      return url ? { url } : file ? { pdfBase64: file } : null;
    },
    async ping() {
      // TrackShipments with a dummy waybill validates ClientInfo without creating anything.
      try {
        const j = obj(await http(`${base()}/Tracking/Service_1_0.svc/json/TrackShipments`, { method: "POST", body: JSON.stringify({ ClientInfo: aramexClientInfo(), Transaction: { Reference1: "ping" }, Shipments: ["00000000000"], GetLastTrackingUpdateOnly: true }), timeoutMs: 10_000 }));
        const msg = notifications(j);
        return /auth|credential|password|account/i.test(msg) ? { ok: false, detail: msg } : { ok: true, detail: msg || "Aramex accepted the account credentials" };
      } catch (e) { return { ok: false, detail: String((e as Error).message) }; }
    },
  },
};
