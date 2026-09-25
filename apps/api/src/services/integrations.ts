/**
 * ERP integration helpers: API key generation / hashing, scope checks, bulk price-row validation and the
 * ERP-facing order shape. Everything here except the Prisma-backed key helpers is pure so it can be unit tested.
 */
import crypto from "crypto";
import { z } from "zod";
import type { OrderStatus, Prisma } from "@prisma/client";

// ------------------------------------------------------------------ scopes
export const API_SCOPES = ["catalog:read", "prices:write", "stock:write", "orders:read", "orders:write", "invoices:read", "rfqs:read", "rfqs:write", "webhooks:manage"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "catalog:read": "Read categories, materials and best offers",
  "prices:write": "Create and update the company's price listings (bulk)",
  "stock:write": "Update stock levels of the company's listings",
  "orders:read": "Read the company's sales orders / purchases",
  "orders:write": "Update order status (confirm, ship, deliver)",
  "invoices:read": "Read e-invoice records",
  "rfqs:read": "Read open RFQs / own RFQs",
  "rfqs:write": "Create RFQs and submit bids",
  "webhooks:manage": "Create and manage webhook endpoints",
};

export const scopeSchema = z.enum(API_SCOPES);

/** True when the granted scopes cover every required scope. */
export function hasScope(granted: readonly string[] | undefined | null, required: readonly string[]): boolean {
  if (!required.length) return true;
  if (!granted?.length) return false;
  const set = new Set(granted);
  return required.every((s) => set.has(s));
}

// ------------------------------------------------------------------ keys
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const API_KEY_PREFIX = "msk_live_";
export const API_KEY_RANDOM_LENGTH = 32;
export const API_KEY_DISPLAY_PREFIX_LENGTH = 12;
const API_KEY_RE = /^msk_(live|test)_[0-9A-Za-z]{32}$/;

/** Random base62 string using rejection sampling (uniform). */
export function randomBase62(length: number): string {
  let out = "";
  while (out.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (const b of bytes) {
      if (b >= 248) continue; // 248 = 62 * 4 – reject to keep the distribution uniform
      out += BASE62[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

export const hashApiKey = (key: string) => crypto.createHash("sha256").update(key, "utf8").digest("hex");
export const apiKeyPrefix = (key: string) => key.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
export const isApiKeyFormat = (key: string) => API_KEY_RE.test(key);

/** Generates a new plaintext key plus what we persist (sha256 hash + display prefix). */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBase62(API_KEY_RANDOM_LENGTH)}`;
  return { key, prefix: apiKeyPrefix(key), hash: hashApiKey(key) };
}

/** Reads the API key from `X-API-Key: <key>` or `Authorization: ApiKey <key>`. */
export function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const direct = headers["x-api-key"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const auth = headers.authorization;
  if (typeof auth === "string") {
    const m = auth.match(/^ApiKey\s+(\S+)$/i);
    if (m) return m[1];
  }
  return null;
}

// ------------------------------------------------------------------ bulk rows
const optionalNullableDate = z.preprocess((v) => (v === "" ? null : v), z.coerce.date().nullable().optional());

export const priceRowSchema = z
  .object({
    sku: z.string().trim().min(1).max(80).optional(),
    materialId: z.string().trim().min(1).optional(),
    city: z.string().trim().min(2).max(60),
    price: z.coerce.number().positive().finite(),
    minQty: z.coerce.number().positive().finite().optional(),
    leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
    validUntil: optionalNullableDate,
    salePrice: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().positive().finite().nullable().optional()),
    stock: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(0).nullable().optional()),
    active: z.coerce.boolean().optional(),
    currency: z.literal("SAR").optional(),
  })
  .refine((r) => Boolean(r.sku || r.materialId), { message: "Either sku or materialId is required", path: ["sku"] })
  .refine((r) => r.salePrice == null || r.salePrice < r.price, { message: "salePrice must be lower than price", path: ["salePrice"] });
export type PriceRow = z.infer<typeof priceRowSchema>;

export const stockRowSchema = z
  .object({
    sku: z.string().trim().min(1).max(80).optional(),
    listingId: z.string().trim().min(1).optional(),
    city: z.string().trim().min(2).max(60).optional(),
    stock: z.coerce.number().int().min(0),
  })
  .refine((r) => Boolean(r.listingId || (r.sku && r.city)), { message: "Either listingId or sku + city is required", path: ["sku"] });
export type StockRow = z.infer<typeof stockRowSchema>;

export const MAX_BULK_ROWS = 1000;

/** Accepts either a bare array or `{ rows: [...] }` / `{ items: [...] }` and validates each row individually. */
export function validateRows<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): { rows: Array<{ index: number; data: T } | { index: number; error: string; raw: unknown }>; total: number } {
  const list = Array.isArray(body) ? body : body && typeof body === "object" ? ((body as Record<string, unknown>).rows ?? (body as Record<string, unknown>).items) : undefined;
  if (!Array.isArray(list)) throw new RowsError("Body must be an array of rows or { rows: [...] }");
  if (!list.length) throw new RowsError("At least one row is required");
  if (list.length > MAX_BULK_ROWS) throw new RowsError(`At most ${MAX_BULK_ROWS} rows per request`);
  const rows = list.map((raw, index) => {
    const parsed = schema.safeParse(raw);
    if (parsed.success) return { index, data: parsed.data };
    const error = parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`).join("; ");
    return { index, error, raw };
  });
  return { rows, total: list.length };
}
export class RowsError extends Error {}

// ------------------------------------------------------------------ order status (ERP aliases + transitions, mirrors routes/orders.ts)
export const INTEGRATION_ORDER_STATUSES = ["CONFIRMED", "PROCESSING", "SHIPPED", "IN_TRANSIT", "DELIVERED", "CANCELLED"] as const;
export type IntegrationOrderStatus = (typeof INTEGRATION_ORDER_STATUSES)[number];

const STATUS_ALIASES: Record<IntegrationOrderStatus, OrderStatus> = {
  CONFIRMED: "CONFIRMED",
  PROCESSING: "CONFIRMED",
  SHIPPED: "IN_TRANSIT",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};
export const mapIntegrationStatus = (s: IntegrationOrderStatus): OrderStatus => STATUS_ALIASES[s];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};
export const canTransition = (from: OrderStatus, to: OrderStatus) => ORDER_TRANSITIONS[from]?.includes(to) ?? false;

// ------------------------------------------------------------------ ERP order shape
export const erpOrderInclude = {
  company: { select: { id: true, name: true, nameAr: true, vatNumber: true, crNumber: true, city: true } },
  items: { include: { material: { select: { id: true, sku: true, name: true, nameAr: true, unit: true } } } },
  buyer: { select: { id: true, name: true, email: true, phone: true, company: { select: { id: true, name: true, vatNumber: true, crNumber: true, city: true } } } },
  address: true,
  einvoice: { select: { id: true, invoiceNumber: true, uuid: true, status: true, createdAt: true } },
  shipments: { select: { id: true, carrier: true, carrierName: true, trackingNumber: true, trackingUrl: true, status: true, deliveredAt: true } },
} satisfies Prisma.OrderInclude;
export type ErpOrderRow = Prisma.OrderGetPayload<{ include: typeof erpOrderInclude }>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Flat, ERP friendly representation of an order (Decimals as numbers, SKUs on lines, one address block). */
export function shapeOrderForErp(o: ErpOrderRow) {
  return {
    id: o.id,
    reference: o.reference,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    currency: o.currency,
    poNumber: o.poNumber ?? null,
    dueDate: o.dueDate,
    couponCode: o.couponCode ?? null,
    subtotal: num(o.subtotal),
    vat: num(o.vat),
    deliveryFee: num(o.deliveryFee),
    discount: num(o.discount),
    total: num(o.total),
    notes: o.notes ?? null,
    rfqId: o.rfqId ?? null,
    bidId: o.bidId ?? null,
    supplier: o.company,
    buyer: {
      userId: o.buyer.id,
      name: o.buyer.name,
      email: o.buyer.email,
      phone: o.buyer.phone ?? o.contactPhone ?? null,
      company: o.buyer.company ?? null,
    },
    shipTo: o.address
      ? { recipient: o.address.recipient, phone: o.address.phone, city: o.address.city, district: o.address.district, street: o.address.street, building: o.address.building, notes: o.address.notes, lat: o.address.lat, lng: o.address.lng }
      : { recipient: o.buyer.name, phone: o.contactPhone ?? o.buyer.phone ?? null, city: o.deliveryCity ?? null, district: null, street: o.deliveryAddress ?? null, building: null, notes: null, lat: null, lng: null },
    items: o.items.map((i) => ({
      id: i.id,
      sku: i.material?.sku ?? null,
      materialId: i.materialId,
      listingId: i.listingId,
      name: i.name,
      nameAr: i.material?.nameAr ?? null,
      unit: i.unit,
      quantity: i.quantity,
      unitPrice: num(i.unitPrice),
      lineTotal: num(i.lineTotal),
    })),
    einvoice: o.einvoice ? { id: o.einvoice.id, invoiceNumber: o.einvoice.invoiceNumber, uuid: o.einvoice.uuid, status: o.einvoice.status, issuedAt: o.einvoice.createdAt } : null,
    shipments: o.shipments,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
