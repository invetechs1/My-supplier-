// ERP integration client: API keys, webhook endpoints and the delivery log.
// See docs/API.md → "ERP integration" and docs/INTEGRATIONS.md. The machine API itself
// (`/integrations/v1/*`) is called by the ERP with an API key, never from the browser.
import type {
  ApiKey,
  ApiKeyCreatePayload,
  ApiKeyCreateResult,
  ApiScope,
  Paginated,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEndpointCreateResult,
  WebhookEndpointPayload,
  WebhookEvent,
} from "@mysupplier/shared";
import { API_URL, request } from "@/lib/api";

/** Base URL of the machine API – what an ERP puts in its connector settings. */
export const INTEGRATION_API_URL = `${API_URL.replace(/\/+$/, "")}/integrations/v1`;

export interface ScopeInfo {
  scope: ApiScope;
  description: string;
}

/** `GET /integrations/scopes` */
export interface ScopesResponse {
  scopes: ScopeInfo[];
  events: WebhookEvent[];
}

/** `GET /integrations/keys` also embeds who created each key. */
export type ApiKeyWithCreator = ApiKey & { createdBy?: { id: string; name: string; email: string } | null };

/** `POST /integrations/keys` – the plaintext `key` is returned exactly once. */
export type ApiKeyCreated = ApiKeyCreateResult & { warning?: string };

/** `GET /integrations/webhooks` adds per-status delivery counts to each endpoint. */
export type WebhookEndpointWithStats = WebhookEndpoint & { deliveries?: Record<WebhookDeliveryStatus, number> };

/** `POST /integrations/webhooks` – the signing `secret` is returned exactly once. */
export type WebhookEndpointCreated = WebhookEndpointCreateResult & { warning?: string };

export type WebhookEndpointPatch = Partial<WebhookEndpointPayload> & { active?: boolean };

export type WebhookOutcome = "delivered" | "retried" | "failed";

/** Result of a test ping or a manual retry. */
export interface WebhookDeliveryResult {
  ok: boolean;
  outcome: WebhookOutcome;
  delivery: WebhookDelivery;
}

export interface DeliveryQuery {
  status?: WebhookDeliveryStatus | "";
  event?: string;
  page?: number;
  pageSize?: number;
}

export const integrationsApi = {
  // ---- reference data
  scopes: () => request<ScopesResponse>("/integrations/scopes"),

  // ---- API keys (JWT company OWNER/MANAGER)
  keys: () => request<ApiKeyWithCreator[]>("/integrations/keys"),
  createKey: (body: ApiKeyCreatePayload) => request<ApiKeyCreated>("/integrations/keys", { method: "POST", body }),
  revokeKey: (id: string) => request<ApiKey>(`/integrations/keys/${encodeURIComponent(id)}/revoke`, { method: "POST" }),

  // ---- webhook endpoints
  webhooks: () => request<WebhookEndpointWithStats[]>("/integrations/webhooks"),
  createWebhook: (body: WebhookEndpointPayload) => request<WebhookEndpointCreated>("/integrations/webhooks", { method: "POST", body }),
  updateWebhook: (id: string, body: WebhookEndpointPatch) => request<WebhookEndpoint>(`/integrations/webhooks/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteWebhook: (id: string) => request<{ ok: boolean }>(`/integrations/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testWebhook: (id: string) => request<WebhookDeliveryResult>(`/integrations/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" }),

  // ---- delivery log
  deliveries: (endpointId: string, query: DeliveryQuery = {}) =>
    request<Paginated<WebhookDelivery>>(`/integrations/webhooks/${encodeURIComponent(endpointId)}/deliveries`, {
      query: { status: query.status || undefined, event: query.event || undefined, page: query.page, pageSize: query.pageSize },
    }),
  retryDelivery: (id: string) => request<WebhookDeliveryResult>(`/integrations/deliveries/${encodeURIComponent(id)}/retry`, { method: "POST" }),
};
