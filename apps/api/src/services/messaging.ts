/**
 * Instant alerts to phones: WhatsApp (Meta Cloud API) with SMS (Unifonic) fallback.
 *
 * Saudi suppliers answer WhatsApp within minutes and email within days, so the events that make or
 * lose money (a new order, an RFQ in their city, a buyer asking for a price) also go to the phone.
 * Every message is logged in MessageLog (cost control, audit, admin visibility) and capped per user
 * per day. The pure helpers at the top are unit-tested without a database or network.
 */
import type { MessageChannel, MessageStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { normaliseSaudiPhone } from "../lib/security";
import { sendSms, smsEnabled } from "./sms";

export type AlertKind = "NEW_ORDER" | "ORDER_STATUS" | "NEW_RFQ" | "NEW_BID" | "BID_WON" | "PRICE_REQUEST" | "RETURN" | "GENERIC";

export const DAILY_ALERT_CAP = Number(process.env.ALERT_DAILY_CAP ?? 15);

export const whatsappEnabled = () => Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);

// ------------------------------------------------------------------ pure helpers

export interface AlertPrefs { phone: string | null; alertSms: boolean; alertWhatsapp: boolean }

/** Which channel to use for a user given their preferences and what is configured; null = nothing to send. */
export function pickChannel(prefs: AlertPrefs, enabled: { whatsapp: boolean; sms: boolean }): MessageChannel | null {
  if (!prefs.phone) return null;
  if (prefs.alertWhatsapp && enabled.whatsapp) return "WHATSAPP";
  if (prefs.alertSms && enabled.sms) return "SMS";
  return null;
}

/** Short bilingual alert text with the deep link; SMS-friendly (one message segment where possible). */
export function buildAlertText(opts: { locale: string; title: string; body?: string; link?: string | null; titleAr?: string; bodyAr?: string }): string {
  const ar = opts.locale === "ar";
  const title = ar ? opts.titleAr ?? opts.title : opts.title;
  const body = ar ? opts.bodyAr ?? opts.body : opts.body;
  const brand = ar ? "موردي MySupplier" : "MySupplier";
  const url = opts.link ? `${env.webUrl}${opts.link}` : env.webUrl;
  const parts = [`${brand}: ${title}`];
  if (body) parts.push(body.length > 160 ? `${body.slice(0, 157)}…` : body);
  parts.push(url);
  return parts.join("\n");
}

export function underDailyCap(sentToday: number, cap = DAILY_ALERT_CAP): boolean {
  return sentToday < cap;
}

// ------------------------------------------------------------------ providers

async function sendWhatsApp(to: string, text: string): Promise<{ providerId: string | null }> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const token = process.env.WHATSAPP_ACCESS_TOKEN!;
  const template = process.env.WHATSAPP_TEMPLATE_ALERT; // approved template with one body parameter {{1}}
  const payload = template
    ? { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name: template, language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "ar" }, components: [{ type: "body", parameters: [{ type: "text", text }] }] } }
    : { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: text, preview_url: true } };
  const resp = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v21.0"}/${phoneId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await resp.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!resp.ok) throw new Error(data.error?.message ?? `WhatsApp API responded ${resp.status}`);
  return { providerId: data.messages?.[0]?.id ?? null };
}

/** Sends one message on one channel and logs it. Never throws. */
export async function deliver(opts: { channel: MessageChannel; to: string; text: string; kind: AlertKind | string; userId?: string | null; companyId?: string | null }): Promise<MessageStatus> {
  let status: MessageStatus = "FAILED";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    if (opts.channel === "WHATSAPP") {
      if (!whatsappEnabled()) { status = "DEV"; if (!env.isProd) console.log(`[whatsapp:dev] to=${opts.to} body="${opts.text}"`); }
      else { providerId = (await sendWhatsApp(opts.to, opts.text)).providerId; status = "SENT"; }
    } else {
      const r = await sendSms(opts.to, opts.text);
      status = r.sent ? "SENT" : "DEV";
    }
  } catch (err) {
    error = (err as Error).message?.slice(0, 300) ?? "send failed";
    status = "FAILED";
  }
  await prisma.messageLog.create({ data: { userId: opts.userId ?? null, companyId: opts.companyId ?? null, channel: opts.channel, kind: String(opts.kind), to: opts.to, body: opts.text.slice(0, 1000), status, providerId, error } }).catch(() => undefined);
  return status;
}

// ------------------------------------------------------------------ fan-out

export interface AlertInput {
  userIds: string[];
  kind: AlertKind;
  title: string;
  body?: string;
  link?: string | null;
  titleAr?: string;
  bodyAr?: string;
}

/**
 * Sends the alert to every user that has a phone, has not opted out, and is under the daily cap.
 * WhatsApp first, SMS as fallback. Best-effort: never throws, never blocks the caller.
 */
export async function alertUsers(input: AlertInput): Promise<{ attempted: number; sent: number }> {
  const enabled = { whatsapp: whatsappEnabled(), sms: smsEnabled() };
  const unique = [...new Set(input.userIds)].filter(Boolean);
  if (!unique.length || (!enabled.whatsapp && !enabled.sms && env.isProd)) return { attempted: 0, sent: 0 };
  const users = await prisma.user.findMany({ where: { id: { in: unique }, active: true }, select: { id: true, phone: true, locale: true, companyId: true, alertSms: true, alertWhatsapp: true } });
  const since = new Date(Date.now() - 86_400_000);
  const counts = await prisma.messageLog.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, createdAt: { gte: since }, status: { in: ["SENT", "DEV"] } }, _count: { _all: true } });
  const sentToday = new Map(counts.map((c) => [c.userId, c._count._all]));
  let attempted = 0, sent = 0;
  for (const u of users) {
    const phone = u.phone ? normaliseSaudiPhone(u.phone) : null;
    const channel = pickChannel({ phone, alertSms: u.alertSms, alertWhatsapp: u.alertWhatsapp }, enabled) ?? (!env.isProd && phone ? "SMS" : null);
    if (!channel || !phone) continue;
    if (!underDailyCap(sentToday.get(u.id) ?? 0)) {
      await prisma.messageLog.create({ data: { userId: u.id, companyId: u.companyId, channel, kind: input.kind, to: phone, body: "", status: "SKIPPED", error: "daily cap reached" } }).catch(() => undefined);
      continue;
    }
    attempted++;
    const text = buildAlertText({ locale: u.locale, title: input.title, body: input.body, link: input.link, titleAr: input.titleAr, bodyAr: input.bodyAr });
    const status = await deliver({ channel, to: phone, text, kind: input.kind, userId: u.id, companyId: u.companyId });
    if (status === "SENT" || status === "DEV") sent++;
  }
  return { attempted, sent };
}

/** Admin overview of phone messaging for the last N days. */
export async function messagingSummary(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [byChannel, byStatus, byKind] = await Promise.all([
    prisma.messageLog.groupBy({ by: ["channel"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.messageLog.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.messageLog.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  return {
    days,
    configured: { whatsapp: whatsappEnabled(), sms: smsEnabled(), template: process.env.WHATSAPP_TEMPLATE_ALERT ?? null, dailyCap: DAILY_ALERT_CAP },
    byChannel: Object.fromEntries(byChannel.map((r) => [r.channel, r._count._all])),
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    byKind: Object.fromEntries(byKind.map((r) => [r.kind, r._count._all])),
  };
}
