/**
 * Shared contract and helpers for carrier adapters (one module per carrier in this folder).
 *
 * Modes: "live" (credentials set, real API), "sandbox" (credentials set + CARRIER_SANDBOX=1: deterministic fake
 * bookings prefixed "SBX-", no network) and "manual" (no credentials: the supplier types the tracking number and
 * updates the status by hand or through the carrier webhook). Env vars are read lazily so the admin "test" button
 * and the tests see the live process.env.
 */
import crypto from "crypto";
import type { CarrierCode, ShipmentStatus } from "@prisma/client";

export type CarrierMode = "live" | "sandbox" | "manual";

export interface BookingParty { city: string; address?: string | null; phone?: string | null; name: string; email?: string | null }
export interface BookingRequest {
  orderReference: string;
  pickup: BookingParty;
  dropoff: BookingParty;
  weightKg: number | null;
  volumeM3: number | null;
  service?: string | null;
  scheduledAt?: Date | null;
  /** Goods summary printed on the waybill (defaults to "Construction materials"). */
  contentDescription?: string | null;
  /** Declared value (SAR) and cash to collect on delivery (SAR, 0 for prepaid). */
  valueSar?: number | null;
  codAmountSar?: number | null;
  pieces?: number | null;
}
export interface BookingResult { externalId: string; trackingNumber: string; trackingUrl?: string | null; cost?: number | null; labelUrl?: string | null }
export interface TrackingEvent { status: ShipmentStatus; raw: string; description?: string | null; location?: string | null; at?: Date | null }
export interface LabelResult { url?: string; pdfBase64?: string }
export interface CancelResult { remote: boolean; note?: string }
export interface WebhookUpdate { trackingNumber: string; status: string; description?: string; location?: string; at?: Date }
export interface WebhookRequest { headers: Record<string, string | string[] | undefined>; rawBody?: string; body?: unknown }
export interface CarrierEnv { required: string[]; optional: string[] }

export interface CarrierAdapter {
  code: CarrierCode;
  env: CarrierEnv;
  /** Which stored reference the carrier's track/cancel/label calls take (parcel carriers: the waybill; trucking: the load id). */
  tracksBy: "trackingNumber" | "externalId";
  configured(): boolean;
  mode(): CarrierMode;
  book(req: BookingRequest): Promise<BookingResult>;
  /** Tracking history for a tracking number / external id, oldest first. */
  track(ref: string): Promise<TrackingEvent[]>;
  cancel(externalId: string): Promise<CancelResult>;
  label(externalId: string): Promise<LabelResult | null>;
  /** Lightweight credentials check used by the admin "Test" button in live mode. */
  ping(): Promise<{ ok: boolean; detail: string }>;
  verifyWebhook(req: WebhookRequest): boolean;
  parseWebhook(body: unknown): WebhookUpdate | null;
  mapStatus(raw: string): ShipmentStatus;
}

/** What a carrier module provides; `defineAdapter` adds env handling, sandbox and webhook verification. */
export interface CarrierSpec {
  code: CarrierCode;
  env: CarrierEnv;
  tracksBy?: CarrierAdapter["tracksBy"];
  /** Header(s) carrying the HMAC signature on webhooks, besides the generic `x-signature`. */
  signatureHeaders?: string[];
  mapStatus(raw: string): ShipmentStatus;
  parseWebhook(body: unknown): WebhookUpdate | null;
  live: {
    book(req: BookingRequest): Promise<BookingResult>;
    track(ref: string): Promise<TrackingEvent[]>;
    cancel(externalId: string): Promise<CancelResult>;
    label(externalId: string): Promise<LabelResult | null>;
    ping(): Promise<{ ok: boolean; detail: string }>;
  };
}

// ---------------------------------------------------------------- env
export const readEnv = (name: string) => (process.env[name] ?? "").trim();
export const sandboxEnabled = () => /^(1|true|yes)$/i.test(readEnv("CARRIER_SANDBOX"));
/** `<CODE>_API_URL` or the carrier's default base URL, without a trailing slash. */
export const apiBase = (code: CarrierCode, fallback: string) => (readEnv(`${code}_API_URL`) || fallback).replace(/\/+$/, "");
export const SANDBOX_PREFIX = "SBX-";
export const isSandboxRef = (ref: string | null | undefined) => Boolean(ref && ref.startsWith(SANDBOX_PREFIX));

// ---------------------------------------------------------------- http
export class CarrierError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
  }
}

/** JSON request with a timeout; throws CarrierError with the HTTP status on non-2xx. */
export async function http<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  const resp = await fetch(url, { ...rest, headers: { accept: "application/json", "content-type": "application/json", ...(rest.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(timeoutMs) });
  const text = await resp.text();
  let json: unknown = text;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body (e.g. a PDF or HTML error page) */ }
  if (!resp.ok) throw new CarrierError(`${new URL(url).host} responded ${resp.status}`, resp.status, json);
  return json as T;
}

export const str = (v: unknown): string | undefined => (v === null || v === undefined || v === "" ? undefined : String(v));
export const num = (v: unknown): number | undefined => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Parses ISO strings, unix seconds/ms and the WCF "/Date(1700000000000+0300)/" form; undefined when unreadable. */
export function parseDate(v: unknown): Date | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  const s = String(v);
  const wcf = /\/Date\((-?\d+)/.exec(s);
  const ms = wcf ? Number(wcf[1]) : /^\d+$/.test(s) ? (s.length <= 10 ? Number(s) * 1000 : Number(s)) : Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}
export const phoneE164 = (p: string | null | undefined) => (p ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+").replace(/^0(5\d{8})$/, "+966$1").replace(/^(5\d{8})$/, "+966$1");
export const kg = (w: number | null | undefined) => Math.max(0.5, Math.round((w ?? 1) * 100) / 100);

// ---------------------------------------------------------------- status mapping
const GENERIC_STATUS: Record<string, ShipmentStatus> = {
  created: "BOOKED", booked: "BOOKED", accepted: "BOOKED", assigned: "BOOKED", confirmed: "BOOKED", pending_pickup: "BOOKED", scheduled: "BOOKED",
  picked_up: "PICKED_UP", pickedup: "PICKED_UP", collected: "PICKED_UP", loaded: "PICKED_UP", loading: "PICKED_UP",
  in_transit: "IN_TRANSIT", intransit: "IN_TRANSIT", on_the_way: "IN_TRANSIT", departed: "IN_TRANSIT", arrived: "IN_TRANSIT", at_hub: "IN_TRANSIT", en_route: "IN_TRANSIT",
  out_for_delivery: "OUT_FOR_DELIVERY", ofd: "OUT_FOR_DELIVERY", unloading: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED", completed: "DELIVERED", pod: "DELIVERED",
  failed: "FAILED", exception: "FAILED", returned: "FAILED", undelivered: "FAILED", rejected: "FAILED",
  cancelled: "CANCELLED", canceled: "CANCELLED",
};
export const normalizeStatus = (raw: string) => raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
export const mapGenericStatus = (raw: string): ShipmentStatus => GENERIC_STATUS[normalizeStatus(raw)] ?? mapByKeywords(raw) ?? "IN_TRANSIT";

/** Keyword rules for free-text carrier activity descriptions ("Shipment out for delivery", "Proof of delivery captured"). Order matters. */
const KEYWORDS: Array<[RegExp, ShipmentStatus]> = [
  [/cancel/i, "CANCELLED"],
  [/return|refus|undeliver|fail|exception|damag|lost|held|on hold|address (issue|problem)|not reach/i, "FAILED"],
  [/deliver(ed)?\b(?!.*out)|proof of delivery|pod\b|signed|received by/i, "DELIVERED"],
  [/out for delivery|with courier|with driver|final delivery|delivery attempt|unloading/i, "OUT_FOR_DELIVERY"],
  [/pick(ed)? ?up|collected|received at origin|received from (shipper|customer)|loaded|loading/i, "PICKED_UP"],
  [/transit|depart|arriv|hub|facility|sorting|en route|on the way|customs|clearance|forwarded|processed/i, "IN_TRANSIT"],
  [/creat|book|data received|record|accepted|assigned|confirmed|scheduled|pending|manifest|label/i, "BOOKED"],
];
export function mapByKeywords(raw: string): ShipmentStatus | undefined {
  for (const [re, status] of KEYWORDS) if (re.test(raw)) return status;
  return undefined;
}

/** Truck type for heavy-trucking marketplaces, from the total load weight. */
export const truckTypeFor = (weightKg: number | null | undefined): "DYNA" | "FLATBED" | "TRAILER" => ((weightKg ?? 0) <= 7_000 ? "DYNA" : (weightKg ?? 0) <= 25_000 ? "FLATBED" : "TRAILER");

// ---------------------------------------------------------------- webhooks
const constantTimeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const header = (headers: WebhookRequest["headers"], name: string) => { const v = headers[name.toLowerCase()] ?? headers[name]; return Array.isArray(v) ? v[0] : v; };

/**
 * Accepts either an HMAC-SHA256 of the raw body (hex or base64, optional `sha256=` prefix) in one of the signature
 * headers, or the shared secret itself in `x-webhook-token` / `x-webhook-secret`. Constant-time; false without a secret.
 */
export function verifyWebhookRequest(secret: string, req: WebhookRequest, signatureHeaders: string[] = []): boolean {
  if (!secret) return false;
  const sig = [...signatureHeaders, "x-signature", "x-hub-signature-256"].map((h) => header(req.headers, h)).find(Boolean);
  if (sig) {
    const body = req.rawBody ?? (req.body === undefined ? "" : typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    const mac = crypto.createHmac("sha256", secret).update(body, "utf8");
    const given = String(sig).trim().replace(/^sha256=/i, "");
    const hex = mac.digest();
    return constantTimeEqual(given.toLowerCase(), hex.toString("hex")) || constantTimeEqual(given, hex.toString("base64"));
  }
  const token = header(req.headers, "x-webhook-token") ?? header(req.headers, "x-webhook-secret");
  return token !== undefined && constantTimeEqual(String(token), secret);
}

/** Lenient parser for the "generic" webhook shape many carriers can be configured to send. */
export function parseGenericWebhook(body: unknown): WebhookUpdate | null {
  const b = obj(body);
  const data = Object.keys(obj(b.data)).length ? obj(b.data) : b;
  const trackingNumber = str(data.trackingNumber ?? data.tracking_number ?? data.awb ?? data.AWB ?? data.waybill ?? data.shipment_id ?? data.shipmentId ?? data.load_id ?? data.id ?? data.reference);
  const status = str(data.status ?? data.Status ?? data.event ?? data.activity ?? data.Activity ?? data.state);
  if (!trackingNumber || !status) return null;
  return { trackingNumber, status, description: str(data.description ?? data.details ?? data.Details ?? data.message ?? data.note), location: str(data.location ?? data.Location ?? data.city), at: parseDate(data.at ?? data.timestamp ?? data.time ?? data.date ?? data.Date ?? data.occurred_at) };
}

// ---------------------------------------------------------------- sandbox
/** Minutes after booking at which the sandbox shipment reaches each status (so staging can watch the whole flow). */
export const SANDBOX_TIMELINE: Array<[ShipmentStatus, number, string]> = [["BOOKED", 0, "Shipment booked (sandbox)"], ["PICKED_UP", 2, "Collected from pickup branch"], ["IN_TRANSIT", 5, "Departed origin hub"], ["OUT_FOR_DELIVERY", 10, "With delivery driver"], ["DELIVERED", 15, "Delivered and signed for"]];
const hash4 = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 4).toUpperCase();

/** Deterministic fake booking: the tracking number encodes the carrier, booking time and order reference. */
export function sandboxBooking(code: CarrierCode, req: BookingRequest, now = Date.now()): BookingResult {
  const ref = `${SANDBOX_PREFIX}${code}-${now.toString(36).toUpperCase()}-${hash4(req.orderReference)}`;
  return { externalId: ref, trackingNumber: ref, trackingUrl: null, cost: null, labelUrl: null };
}
export function sandboxBookedAt(ref: string): number | null {
  const m = new RegExp(`^${SANDBOX_PREFIX}[A-Z]+-([0-9A-Z]+)-[0-9A-F]{4}$`).exec(ref);
  const ms = m ? parseInt(m[1], 36) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
/** Events reached so far on the sandbox timeline (oldest first). */
export function sandboxTrack(ref: string, now = Date.now()): TrackingEvent[] {
  const booked = sandboxBookedAt(ref) ?? now;
  return SANDBOX_TIMELINE.filter(([, min]) => booked + min * 60_000 <= now).map(([status, min, description]) => ({ status, raw: status, description, location: status === "BOOKED" || status === "PICKED_UP" ? "Origin" : "Destination", at: new Date(booked + min * 60_000) }));
}
/** A tiny valid one-page PDF naming the tracking number, so the label download works end to end in staging. */
export function sandboxLabel(ref: string): LabelResult {
  const text = `SANDBOX LABEL ${ref.replace(/[()\\]/g, "")}`;
  const stream = `BT /F1 18 Tf 40 700 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 750] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { pdfBase64: Buffer.from(pdf, "latin1").toString("base64") };
}

// ---------------------------------------------------------------- adapter factory
/** Wraps a carrier module: env-based configured()/mode(), sandbox short-circuits, webhook secret handling. */
export function defineAdapter(spec: CarrierSpec): CarrierAdapter {
  const configured = () => spec.env.required.every((n) => readEnv(n) !== "");
  const mode = (): CarrierMode => (!configured() ? "manual" : sandboxEnabled() ? "sandbox" : "live");
  const fake = (ref?: string) => mode() === "sandbox" || isSandboxRef(ref);
  const notConfigured = () => new CarrierError(`${spec.code} is not configured (set ${spec.env.required.join(", ")})`, 503);
  return {
    code: spec.code,
    env: spec.env,
    tracksBy: spec.tracksBy ?? "trackingNumber",
    configured,
    mode,
    mapStatus: spec.mapStatus,
    parseWebhook: (body) => spec.parseWebhook(body) ?? parseGenericWebhook(body),
    verifyWebhook: (req) => {
      const own = readEnv(`${spec.code}_WEBHOOK_SECRET`);
      // Per-carrier secret wins; the legacy platform-wide CARRIER_WEBHOOK_SECRET still works as a shared token.
      return own ? verifyWebhookRequest(own, req, spec.signatureHeaders) : verifyWebhookRequest(readEnv("CARRIER_WEBHOOK_SECRET"), req, spec.signatureHeaders);
    },
    async book(req) {
      if (!configured()) throw notConfigured();
      return fake() ? sandboxBooking(spec.code, req) : spec.live.book(req);
    },
    async track(ref) {
      if (fake(ref)) return sandboxTrack(ref);
      if (!configured()) throw notConfigured();
      return spec.live.track(ref);
    },
    async cancel(externalId) {
      if (fake(externalId)) return { remote: true, note: "Sandbox booking cancelled" };
      if (!configured()) throw notConfigured();
      return spec.live.cancel(externalId);
    },
    async label(externalId) {
      if (fake(externalId)) return sandboxLabel(externalId);
      if (!configured()) throw notConfigured();
      return spec.live.label(externalId);
    },
    async ping() {
      if (!configured()) return { ok: false, detail: `Missing ${spec.env.required.filter((n) => !readEnv(n)).join(", ")}` };
      if (mode() === "sandbox") return { ok: true, detail: "Sandbox mode: no network call made" };
      return spec.live.ping();
    },
  };
}
