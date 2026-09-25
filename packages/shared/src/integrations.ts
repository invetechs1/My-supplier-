// ERP / third-party integration types (API keys, webhooks, bulk sync payloads).
// Mirrors apps/api/src/services/integrations.ts and services/webhooks.ts – keep dependency-free.

/** Permissions an API key can carry. Keys are company scoped; scopes limit what the key may do. */
export type ApiScope =
  | "catalog:read"
  | "prices:write"
  | "stock:write"
  | "orders:read"
  | "orders:write"
  | "invoices:read"
  | "rfqs:read"
  | "rfqs:write"
  | "webhooks:manage";

export const API_SCOPES: readonly ApiScope[] = [
  "catalog:read",
  "prices:write",
  "stock:write",
  "orders:read",
  "orders:write",
  "invoices:read",
  "rfqs:read",
  "rfqs:write",
  "webhooks:manage",
] as const;

/** Events an ERP can subscribe to. "*" subscribes to everything. */
export type WebhookEvent =
  | "order.created"
  | "order.status_changed"
  | "order.paid"
  | "order.cancelled"
  | "payment.refunded"
  | "invoice.issued"
  | "rfq.created"
  | "bid.received"
  | "bid.accepted"
  | "stock.low"
  | "return.requested"
  | "ping";

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  "order.created",
  "order.status_changed",
  "order.paid",
  "order.cancelled",
  "payment.refunded",
  "invoice.issued",
  "rfq.created",
  "bid.received",
  "bid.accepted",
  "stock.low",
  "return.requested",
  "ping",
] as const;

export type WebhookDeliveryStatus = "PENDING" | "SUCCESS" | "FAILED";

/** An API key as returned by the management endpoints (the secret itself is never returned again). */
export interface ApiKey {
  id: string;
  companyId: string;
  createdById: string;
  name: string;
  /** First 12 characters of the key (e.g. `msk_live_a1B`) so users can recognise it. */
  prefix: string;
  scopes: ApiScope[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface ApiKeyCreatePayload {
  name: string;
  scopes: ApiScope[];
  expiresAt?: string | null;
}

/** Returned once from POST /integrations/keys – `key` is the plaintext secret and cannot be retrieved later. */
export interface ApiKeyCreateResult {
  apiKey: ApiKey;
  key: string;
}

export interface WebhookEndpoint {
  id: string;
  companyId: string;
  url: string;
  events: Array<WebhookEvent | "*">;
  description?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpointPayload {
  url: string;
  events: Array<WebhookEvent | "*">;
  description?: string | null;
}

/** Returned once from POST /integrations/webhooks – `secret` signs every delivery and is never shown again. */
export interface WebhookEndpointCreateResult {
  endpoint: WebhookEndpoint;
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: WebhookEvent | string;
  payload: unknown;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseCode?: number | null;
  responseBody?: string | null;
  nextAttemptAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

/** Body of every webhook POST. The signature covers `${timestamp}.${rawBody}`. */
export interface WebhookEnvelope<T = unknown> {
  id: string;
  event: WebhookEvent | string;
  createdAt: string;
  data: T;
}

/** One row of PUT /integrations/v1/prices. Either `sku` or `materialId` identifies the material. */
export interface IntegrationPriceRow {
  sku?: string;
  materialId?: string;
  city: string;
  price: number;
  minQty?: number;
  leadTimeDays?: number;
  validUntil?: string | null;
  salePrice?: number | null;
  stock?: number | null;
  active?: boolean;
  currency?: "SAR";
}

/** One row of PUT /integrations/v1/stock. Either `listingId` or `sku` + `city` identifies the offer. */
export interface IntegrationStockRow {
  sku?: string;
  listingId?: string;
  city?: string;
  stock: number;
}

export type IntegrationRowStatus = "created" | "updated" | "error";

export interface IntegrationRowResult {
  index: number;
  status: IntegrationRowStatus;
  sku?: string | null;
  city?: string | null;
  listingId?: string | null;
  materialId?: string | null;
  error?: string;
}

/** Response of the bulk price / stock endpoints. */
export interface IntegrationResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  results: IntegrationRowResult[];
}

export interface IntegrationPing {
  ok: true;
  company: { id: string; name: string; type: string; city: string };
  keyName: string;
  scopes: ApiScope[];
  serverTime: string;
}

/** Statuses an ERP may push. PROCESSING maps to CONFIRMED, SHIPPED maps to IN_TRANSIT. */
export type IntegrationOrderStatus = "CONFIRMED" | "PROCESSING" | "SHIPPED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";

export interface IntegrationOrderStatusPayload {
  status: IntegrationOrderStatus;
  trackingNumber?: string;
  note?: string;
}
