/**
 * Outbound webhooks for ERP integrations.
 *
 * emitWebhook(event, companyIds, payload) queues one PENDING delivery per active endpoint of those companies
 * that subscribed to the event (or "*") and kicks an immediate async dispatch. dispatchWebhooks() (also run
 * every minute by the scheduler) POSTs due deliveries with an HMAC signature and applies exponential backoff.
 */
import crypto from "crypto";
import { Prisma, type WebhookDelivery, type WebhookEndpoint } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { assertPublicUrl } from "../lib/security";
import { serialize } from "../lib/serialize";
import { erpOrderInclude, randomBase62, shapeOrderForErp } from "./integrations";

// ------------------------------------------------------------------ events
export const WEBHOOK_EVENTS = [
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
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const isWebhookEvent = (e: string): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e);

// ------------------------------------------------------------------ signatures (pure)
export const SIGNATURE_HEADER = "X-MySupplier-Signature";
export const TIMESTAMP_HEADER = "X-MySupplier-Timestamp";
export const EVENT_HEADER = "X-MySupplier-Event";
export const DELIVERY_HEADER = "X-MySupplier-Delivery";
export const DEFAULT_SIGNATURE_TOLERANCE_SEC = 300;

export const generateWebhookSecret = () => `whsec_${randomBase62(40)}`;

/** `sha256=` + hex HMAC-SHA256 of `${timestamp}.${body}` using the endpoint secret. */
export function signWebhook(secret: string, timestamp: string | number, body: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex")}`;
}

/**
 * Verifies a delivery. `timestamp` is the X-MySupplier-Timestamp header (unix seconds), `body` the raw request
 * body exactly as received, `signature` the X-MySupplier-Signature header. Rejects stale timestamps (replay guard)
 * unless `toleranceSec` is 0.
 */
export function verifyWebhookSignature(secret: string, timestamp: string | number, body: string, signature: string, opts: { toleranceSec?: number; now?: number } = {}): boolean {
  if (!secret || signature === undefined || signature === null) return false;
  const tolerance = opts.toleranceSec ?? DEFAULT_SIGNATURE_TOLERANCE_SEC;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (tolerance > 0) {
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    if (Math.abs(now - ts) > tolerance) return false;
  }
  const expected = signWebhook(secret, timestamp, body);
  const a = Buffer.from(expected), b = Buffer.from(String(signature).trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------------ backoff (pure)
/** Delay before retry N (1-based) after a failed attempt; after the last one the delivery is marked FAILED. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
export const REQUEST_TIMEOUT_MS = 10_000;
export const RESPONSE_BODY_LIMIT = 2048;

/** Given the number of attempts made so far (including the one that just failed), when to try again – or null to give up. */
export function nextAttemptAt(attemptsMade: number, now: number = Date.now()): Date | null {
  const delay = BACKOFF_MS[attemptsMade - 1];
  if (delay === undefined) return null;
  return new Date(now + delay);
}

// ------------------------------------------------------------------ envelope
export interface WebhookEnvelope<T = unknown> {
  id: string;
  event: string;
  createdAt: string;
  data: T;
}
export const buildEnvelope = (d: Pick<WebhookDelivery, "id" | "event" | "createdAt" | "payload">): WebhookEnvelope => ({ id: d.id, event: d.event, createdAt: d.createdAt.toISOString(), data: d.payload });

// ------------------------------------------------------------------ emit
/**
 * Queues `event` for every active endpoint of the given companies subscribed to it (or to "*").
 * Never throws – webhooks must not break the business action they describe.
 */
export async function emitWebhook(event: WebhookEvent, companyIds: Array<string | null | undefined>, payload: unknown): Promise<number> {
  const ids = [...new Set(companyIds.filter((c): c is string => Boolean(c)))];
  if (!ids.length) return 0;
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { companyId: { in: ids }, active: true, events: { hasSome: [event, "*"] } }, select: { id: true } });
    if (!endpoints.length) return 0;
    const data = serialize(payload) as Prisma.InputJsonValue;
    await prisma.webhookDelivery.createMany({ data: endpoints.map((e) => ({ endpointId: e.id, event, payload: data, status: "PENDING", nextAttemptAt: new Date() })) });
    setImmediate(() => void dispatchWebhooks().catch((err) => console.warn("[webhooks] dispatch failed", err)));
    return endpoints.length;
  } catch (err) {
    console.warn("[webhooks] emit failed", event, err);
    return 0;
  }
}

/** Companies of the given users (buyers usually belong to a contractor company; may be empty). */
export async function companyIdsOfUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { companyId: true } });
  return [...new Set(users.map((u) => u.companyId).filter((c): c is string => Boolean(c)))];
}

/**
 * Convenience for order events: loads the order in the ERP shape and emits to the supplier company and the
 * buyer's company (when the buyer belongs to one). `extra` is merged next to `order` in the payload.
 */
export async function emitOrderWebhook(event: WebhookEvent, orderId: string, extra: Record<string, unknown> = {}): Promise<number> {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: erpOrderInclude });
    if (!order) return 0;
    return emitWebhook(event, [order.companyId, order.buyer.company?.id], { order: shapeOrderForErp(order), ...extra });
  } catch (err) {
    console.warn("[webhooks] order emit failed", event, orderId, err);
    return 0;
  }
}

// ------------------------------------------------------------------ dispatch
let dispatching: Promise<DispatchResult> | null = null;
export interface DispatchResult { processed: number; delivered: number; retried: number; failed: number }

/** Sends every due delivery (PENDING with nextAttemptAt <= now). Re-entrant calls join the running pass. */
export function dispatchWebhooks(opts: { limit?: number } = {}): Promise<DispatchResult> {
  if (dispatching) return dispatching;
  dispatching = runDispatch(opts.limit ?? 100).finally(() => {
    dispatching = null;
  });
  return dispatching;
}

async function runDispatch(limit: number): Promise<DispatchResult> {
  const result: DispatchResult = { processed: 0, delivered: 0, retried: 0, failed: 0 };
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
    include: { endpoint: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  // Deliver per endpoint sequentially (keeps ordering per receiver), endpoints in parallel with a small cap.
  const byEndpoint = new Map<string, typeof due>();
  for (const d of due) byEndpoint.set(d.endpointId, [...(byEndpoint.get(d.endpointId) ?? []), d]);
  const groups = [...byEndpoint.values()];
  const CONCURRENCY = 5;
  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    await Promise.all(
      groups.slice(i, i + CONCURRENCY).map(async (list) => {
        for (const d of list) {
          const outcome = await deliverOne(d);
          result.processed++;
          result[outcome]++;
        }
      }),
    );
  }
  return result;
}

type Outcome = "delivered" | "retried" | "failed";

/** Sends one delivery and records the outcome. Exported for the retry / test routes. */
export async function deliverOne(delivery: WebhookDelivery & { endpoint: WebhookEndpoint }): Promise<Outcome> {
  const { endpoint } = delivery;
  const body = JSON.stringify(buildEnvelope(delivery));
  const timestamp = String(Math.floor(Date.now() / 1000));
  let responseCode: number | null = null;
  let responseBody = "";
  let ok = false;

  if (!endpoint.active) {
    responseBody = "Endpoint is disabled";
  } else {
    try {
      await assertPublicUrl(endpoint.url); // re-check at send time (DNS may have changed since registration)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "MySupplier-Webhooks/1.0",
            [EVENT_HEADER]: delivery.event,
            [DELIVERY_HEADER]: delivery.id,
            [TIMESTAMP_HEADER]: timestamp,
            [SIGNATURE_HEADER]: signWebhook(endpoint.secret, timestamp, body),
          },
          body,
          signal: controller.signal,
          redirect: "manual",
        });
        responseCode = res.status;
        responseBody = (await readLimited(res)).slice(0, RESPONSE_BODY_LIMIT);
        ok = res.status >= 200 && res.status < 300;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      responseBody = (err instanceof Error ? (err.name === "AbortError" ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : err.message) : String(err)).slice(0, RESPONSE_BODY_LIMIT);
    }
  }

  const attempts = delivery.attempts + 1;
  if (ok) {
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "SUCCESS", attempts, responseCode, responseBody, deliveredAt: new Date(), nextAttemptAt: null } });
    return "delivered";
  }
  const next = endpoint.active ? nextAttemptAt(attempts) : null;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: next ? "PENDING" : "FAILED", attempts, responseCode, responseBody, nextAttemptAt: next },
  });
  return next ? "retried" : "failed";
}

async function readLimited(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text;
  } catch {
    return "";
  }
}

/** Puts a delivery back in the queue (manual retry from the dashboard / API) and sends it right away. */
export async function retryDelivery(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "PENDING", nextAttemptAt: new Date(), attempts: 0, responseCode: null, responseBody: null }, include: { endpoint: true } });
  const outcome = await deliverOne(delivery);
  return { outcome, delivery: await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } }) };
}

/** Sends a synchronous `ping` to one endpoint (connection test) regardless of its subscriptions. */
export async function sendTestPing(endpointId: string, meta: Record<string, unknown> = {}) {
  const created = await prisma.webhookDelivery.create({
    data: { endpointId, event: "ping", payload: { message: "MySupplier webhook test", ...meta } as Prisma.InputJsonValue, status: "PENDING", nextAttemptAt: new Date() },
    include: { endpoint: true },
  });
  const outcome = await deliverOne(created);
  return { outcome, delivery: await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: created.id } }) };
}
