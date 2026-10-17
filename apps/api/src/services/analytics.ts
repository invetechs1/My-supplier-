/**
 * First-party product analytics: where buyers come from, what they search, and where they drop out
 * between visit → search → product → cart → checkout → order (and the BOQ → RFQ path).
 *
 * Client events (page views, searches, product views, add-to-cart, checkout start) are sent by the
 * web/mobile apps only after the visitor accepted analytics in the consent banner, keyed by an
 * anonymous session id. Conversion events (order, RFQ, BOQ analysis, sign-up) are recorded by the
 * API itself so the funnel's bottom is exact. No personal data is stored in props. Events are kept
 * for 180 days.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const CLIENT_EVENTS = ["page_view", "search", "product_view", "add_to_cart", "checkout_start", "boq_start", "rfq_start", "supplier_cta"] as const;
export const SERVER_EVENTS = ["order_created", "rfq_created", "boq_analyzed", "signup_buyer", "signup_supplier", "bid_submitted", "price_listed"] as const;
export type EventName = (typeof CLIENT_EVENTS)[number] | (typeof SERVER_EVENTS)[number];

export interface EventInput { name: EventName; sessionId?: string | null; userId?: string | null; role?: string | null; path?: string | null; city?: string | null; props?: Record<string, unknown> | null; createdAt?: Date }

/** Keeps props small and free of obvious personal data (emails/phones) before storing. */
export function sanitiseProps(props: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!props) return null;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n++ >= 20) break;
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v === "string") { if (/@|\+?\d{9,}/.test(v)) continue; out[k] = v.slice(0, 120); }
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** The anonymous analytics session id the web/mobile client sends with every request (after consent). */
export function sessionIdOf(req: { headers: Record<string, unknown> }): string | null {
  const v = req.headers["x-session-id"];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : null;
}

export async function recordEvents(events: EventInput[]): Promise<number> {
  const rows = events.slice(0, 50).map((e) => ({ name: e.name, sessionId: e.sessionId?.slice(0, 64) ?? null, userId: e.userId ?? null, role: e.role ?? null, path: e.path?.slice(0, 200) ?? null, city: e.city?.slice(0, 40) ?? null, props: (sanitiseProps(e.props) ?? undefined) as Prisma.InputJsonValue | undefined, createdAt: e.createdAt }));
  if (!rows.length) return 0;
  const r = await prisma.analyticsEvent.createMany({ data: rows });
  return r.count;
}

/** Server-side conversion event; fire-and-forget, never throws. */
export function track(name: EventName, data: Omit<EventInput, "name"> = {}): void {
  recordEvents([{ name, ...data }]).catch((e) => console.error("[analytics] record failed", e));
}

export async function purgeOldEvents(days = 180): Promise<number> {
  const r = await prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return r.count;
}

// ------------------------------------------------------------------ funnel & reports (pure shaping + queries)

export interface StepCount { step: string; label: string; sessions: number }

/** Conversion between consecutive steps plus overall; pure for tests. */
export function funnelRates(steps: StepCount[]): { step: string; label: string; sessions: number; fromPrevPct: number | null; fromTopPct: number | null }[] {
  const top = steps[0]?.sessions ?? 0;
  return steps.map((s, i) => ({ ...s, fromPrevPct: i === 0 ? null : steps[i - 1].sessions ? Math.round((s.sessions / steps[i - 1].sessions) * 1000) / 10 : null, fromTopPct: i === 0 ? null : top ? Math.round((s.sessions / top) * 1000) / 10 : null }));
}

async function sessionsFor(name: string, since: Date, extra: Prisma.AnalyticsEventWhereInput = {}): Promise<number> {
  const rows = await prisma.analyticsEvent.groupBy({ by: ["sessionId"], where: { name, createdAt: { gte: since }, sessionId: { not: null }, ...extra } });
  return rows.length;
}
async function countFor(name: string, since: Date, extra: Prisma.AnalyticsEventWhereInput = {}): Promise<number> {
  return prisma.analyticsEvent.count({ where: { name, createdAt: { gte: since }, ...extra } });
}

export async function funnelReport(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const prevSince = new Date(since.getTime() - days * 86_400_000);
  const [visits, searches, products, carts, checkouts, orders, boqStarts, boqs, rfqs, signupsB, signupsS, bids, visitsPrev, ordersPrev] = await Promise.all([
    sessionsFor("page_view", since), sessionsFor("search", since), sessionsFor("product_view", since), sessionsFor("add_to_cart", since), sessionsFor("checkout_start", since),
    countFor("order_created", since), sessionsFor("boq_start", since), countFor("boq_analyzed", since), countFor("rfq_created", since), countFor("signup_buyer", since), countFor("signup_supplier", since), countFor("bid_submitted", since),
    sessionsFor("page_view", prevSince, { createdAt: { gte: prevSince, lt: since } }), countFor("order_created", prevSince, { createdAt: { gte: prevSince, lt: since } }),
  ]);
  const shop = funnelRates([
    { step: "page_view", label: "Visits (sessions)", sessions: visits },
    { step: "search", label: "Searched or browsed a category", sessions: searches },
    { step: "product_view", label: "Viewed a product", sessions: products },
    { step: "add_to_cart", label: "Added to cart", sessions: carts },
    { step: "checkout_start", label: "Started checkout", sessions: checkouts },
    { step: "order_created", label: "Orders placed", sessions: orders },
  ]);
  const procurement = funnelRates([
    { step: "page_view", label: "Visits (sessions)", sessions: visits },
    { step: "boq_start", label: "Opened BOQ pricing", sessions: boqStarts },
    { step: "boq_analyzed", label: "BOQs analysed", sessions: boqs },
    { step: "rfq_created", label: "RFQs published", sessions: rfqs },
    { step: "bid_submitted", label: "Bids received", sessions: bids },
  ]);
  // Weekly series for the overview chart.
  const weekly = await prisma.$queryRaw<{ week: Date; name: string; n: bigint }[]>`
    SELECT date_trunc('week', "createdAt") AS week, name, COUNT(DISTINCT COALESCE("sessionId", id)) AS n
    FROM "AnalyticsEvent" WHERE "createdAt" >= ${since} AND name IN ('page_view','product_view','add_to_cart','order_created','boq_analyzed','rfq_created')
    GROUP BY 1, 2 ORDER BY 1`;
  const weeks = new Map<string, Record<string, number>>();
  for (const r of weekly) { const k = new Date(r.week).toISOString().slice(0, 10); const row = weeks.get(k) ?? {}; row[r.name] = Number(r.n); weeks.set(k, row); }
  const topSearches = await prisma.$queryRaw<{ q: string; n: bigint; zero: bigint }[]>`
    SELECT LOWER(props->>'q') AS q, COUNT(*) AS n, COUNT(*) FILTER (WHERE (props->>'results')::int = 0) AS zero
    FROM "AnalyticsEvent" WHERE name = 'search' AND "createdAt" >= ${since} AND props->>'q' IS NOT NULL AND LENGTH(props->>'q') >= 2
    GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
  const topPages = await prisma.$queryRaw<{ path: string; n: bigint }[]>`
    SELECT regexp_replace(path, '/c[a-z0-9]{20,}', '/:id', 'g') AS path, COUNT(*) AS n FROM "AnalyticsEvent"
    WHERE name = 'page_view' AND "createdAt" >= ${since} AND path IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
  const byCity = await prisma.analyticsEvent.groupBy({ by: ["city"], where: { createdAt: { gte: since }, city: { not: null }, name: { in: ["search", "product_view", "boq_analyzed", "rfq_created", "order_created"] } }, _count: { _all: true }, orderBy: { _count: { city: "desc" } }, take: 8 });
  const byRole = await prisma.analyticsEvent.groupBy({ by: ["role"], where: { createdAt: { gte: since }, name: "page_view" }, _count: { _all: true } });
  return {
    days,
    totals: { visits, visitsPrev, orders, ordersPrev, boqs, rfqs, signups: { buyer: signupsB, supplier: signupsS }, overallShopPct: visits ? Math.round((orders / visits) * 1000) / 10 : 0 },
    shop, procurement,
    weekly: [...weeks.entries()].map(([week, row]) => ({ week, ...row })),
    topSearches: topSearches.map((r) => ({ q: r.q, count: Number(r.n), zeroResults: Number(r.zero) })),
    topPages: topPages.map((r) => ({ path: r.path, views: Number(r.n) })),
    byCity: byCity.map((r) => ({ city: r.city, events: r._count._all })),
    byRole: Object.fromEntries(byRole.map((r) => [r.role ?? "guest", r._count._all])),
  };
}
