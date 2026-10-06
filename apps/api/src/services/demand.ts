/**
 * Demand intelligence.
 *
 * Every BOQ line, RFQ item and zero-result shop search is a *demand signal*. Signals are grouped into
 * clusters, one per product: a catalogue material when the request matched one, otherwise a normalised
 * text key ("rebar 16mm" and "16 mm deformed rebar" land in the same cluster). Each cluster knows how
 * often it was requested, by how many distinct buyers, in which cities, and how many live supplier
 * offers exist, so the admin console can answer "what should we add or recruit suppliers for next?".
 *
 * Admins are notified when a cluster crosses a request threshold (3, 10, 25, 50) and receive a weekly
 * digest of the top gaps. The pure helpers at the top are unit-tested without a database.
 */
import type { DemandGapType, DemandSource, DemandStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { activeListingWhere } from "./catalog";
import { notify } from "./notifications";
import { tokenize } from "./boq";

// ------------------------------------------------------------------ pure helpers

/** Stable cluster key for free text: sorted significant tokens, Arabic-normalised, units/noise removed. */
export function demandKey(text: string): string {
  const { words, numbers } = tokenize(text);
  const stop = new Set(["and", "or", "of", "the", "for", "with", "per", "pcs", "pc", "piece", "pieces", "nos", "no", "unit", "units", "each", "ea", "qty", "x", "و", "من", "مع", "عدد", "قطعه", "حبه", "ل", "في"]);
  const toks = [...new Set([...words.filter((w) => w.length > 1 && !stop.has(w)), ...numbers])].sort();
  return toks.join(" ").slice(0, 120);
}

/** Gap classification from the number of active supplier offers (null = no catalogue product). */
export function gapTypeFor(offerCount: number | null): DemandGapType {
  if (offerCount === null) return "UNLISTED";
  if (offerCount <= 0) return "NO_OFFERS";
  if (offerCount < 3) return "THIN_COVERAGE";
  return "COVERED";
}

export const NOTIFY_THRESHOLDS = [3, 10, 25, 50] as const;

/** Highest threshold level (1-based index) reached by a request count; 0 when below the first. */
export function notificationLevel(requests: number): number {
  let level = 0;
  NOTIFY_THRESHOLDS.forEach((t, i) => { if (requests >= t) level = i + 1; });
  return level;
}

/** Ranking score: distinct buyers weigh most (one buyer pasting the same BOQ ten times is not demand). */
export function demandScore(c: { requests: number; buyers: number; totalQuantity: number; lastRequestedAt: Date | string }, now = Date.now()): number {
  const ageDays = Math.max(0, (now - new Date(c.lastRequestedAt).getTime()) / 86_400_000);
  const recency = ageDays <= 30 ? 1 : ageDays <= 90 ? 0.7 : 0.4;
  return Math.round((c.buyers * 10 + c.requests * 3 + Math.log10(1 + Math.max(0, c.totalQuantity)) * 2) * recency * 10) / 10;
}

/** Launch-list readiness for one product in one city (see docs: "3 fresh offers per SKU"). */
export function readiness(fresh: number, total: number): { status: "READY" | "NEEDS_SUPPLIERS" | "NO_OFFERS"; needed: number } {
  if (fresh >= 3) return { status: "READY", needed: 0 };
  if (total === 0 && fresh === 0) return { status: "NO_OFFERS", needed: 3 };
  return { status: "NEEDS_SUPPLIERS", needed: 3 - fresh };
}

const titleCase = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);

// ------------------------------------------------------------------ recording

export interface DemandInput {
  source: DemandSource;
  rawText: string;
  quantity?: number | null;
  unit?: string | null;
  city?: string | null;
  materialId?: string | null;
  confidence?: number | null;
  /** Active supplier offers seen for the matched product at request time (null when unmatched). */
  offerCount?: number | null;
  userId?: string | null;
  companyId?: string | null;
}

/** Records demand signals and updates their clusters; notifies admins on threshold crossings. Never throws. */
export async function recordDemand(inputs: DemandInput[]): Promise<void> {
  const clean = inputs.filter((i) => i.rawText && i.rawText.trim().length >= 3);
  if (!clean.length) return;
  const materialIds = [...new Set(clean.map((i) => i.materialId).filter((x): x is string => Boolean(x)))];
  const [materials, offerRows] = materialIds.length
    ? await Promise.all([
        prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, name: true, unit: true } }),
        prisma.priceListing.groupBy({ by: ["materialId"], where: { materialId: { in: materialIds }, source: "SUPPLIER", ...activeListingWhere() }, _count: { _all: true } }),
      ])
    : [[], []];
  const byId = new Map(materials.map((m) => [m.id, m]));
  // Cluster coverage is national (the launch list handles per-city depth); the per-city count stays on the signal.
  const nationalOffers = new Map(offerRows.map((o) => [o.materialId, o._count._all]));
  const toNotify: { id: string; label: string; requests: number; buyers: number; gapType: DemandGapType; level: number }[] = [];

  for (const input of clean) {
    const material = input.materialId ? byId.get(input.materialId) : undefined;
    const key = material ? `m:${material.id}` : `t:${demandKey(input.rawText)}`;
    if (key === "t:") continue;
    const label = material ? material.name : titleCase(input.rawText);
    const offerCount = material ? nationalOffers.get(material.id) ?? 0 : null;
    const gapType = gapTypeFor(offerCount);
    const buyerKey = input.userId ?? input.companyId ?? null;
    const now = new Date();
    // Signals from overlapping requests may create the same cluster at once; retry on the unique-key race.
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      try {
        await prisma.$transaction(async (tx) => {
        const existing = await tx.demandCluster.findUnique({ where: { key } });
        const buyers = new Set<string>(((existing?.buyerKeys as string[] | undefined) ?? []));
        if (buyerKey) buyers.add(buyerKey);
        const cities = { ...((existing?.cities as Record<string, number> | undefined) ?? {}) };
        if (input.city) cities[input.city] = (cities[input.city] ?? 0) + 1;
        const examples = [...new Set([titleCase(input.rawText), ...(((existing?.examples as string[] | undefined) ?? []))])].slice(0, 6);
        const data = {
          label: existing?.label ?? label,
          unit: input.unit ?? existing?.unit ?? material?.unit ?? null,
          materialId: material?.id ?? existing?.materialId ?? null,
          gapType,
          ...(offerCount !== null ? { offerCount } : {}),
          requests: { increment: 1 },
          totalQuantity: { increment: Math.max(0, input.quantity ?? 0) },
          buyerKeys: [...buyers].slice(0, 500) as unknown as Prisma.InputJsonValue,
          cities: cities as unknown as Prisma.InputJsonValue,
          examples: examples as unknown as Prisma.InputJsonValue,
          lastRequestedAt: now,
        };
        const cluster = existing
          ? await tx.demandCluster.update({ where: { id: existing.id }, data })
          : await tx.demandCluster.create({ data: { key, label, unit: data.unit, materialId: data.materialId, gapType, offerCount: offerCount ?? 0, requests: 1, totalQuantity: Math.max(0, input.quantity ?? 0), buyerKeys: data.buyerKeys, cities: data.cities, examples: data.examples, firstRequestedAt: now, lastRequestedAt: now } });
        await tx.demandSignal.create({ data: { clusterId: cluster.id, source: input.source, rawText: input.rawText.slice(0, 300), quantity: input.quantity ?? null, unit: input.unit ?? null, city: input.city ?? null, materialId: material?.id ?? null, confidence: input.confidence ?? null, offerCount: input.offerCount ?? offerCount, userId: input.userId ?? null, companyId: input.companyId ?? null } });
        // Threshold notifications only for real gaps (unlisted, no offers, thin coverage) that are still open.
        const level = notificationLevel(cluster.requests);
        if (level > cluster.notifiedLevel && cluster.gapType !== "COVERED" && (cluster.status === "NEW" || cluster.status === "PLANNED")) {
          await tx.demandCluster.update({ where: { id: cluster.id }, data: { notifiedLevel: level } });
          toNotify.push({ id: cluster.id, label: cluster.label, requests: cluster.requests, buyers: buyers.size, gapType: cluster.gapType, level });
        }
      });
        break;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if ((code === "P2002" || code === "P2034") && attempt < 3) continue;
        console.error("[demand] failed to record signal", err);
        break;
      }
    }
  }
  if (toNotify.length) await notifyAdmins(toNotify).catch((e) => console.error("[demand] notify failed", e));
}

async function adminUserIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  return admins.map((a) => a.id);
}

const gapLabel: Record<DemandGapType, string> = { UNLISTED: "Unlisted product", NO_OFFERS: "No supplier offers", THIN_COVERAGE: "Fewer than 3 offers", COVERED: "Covered" };

async function notifyAdmins(items: { id: string; label: string; requests: number; buyers: number; gapType: DemandGapType; level: number }[]) {
  const userIds = await adminUserIds();
  if (!userIds.length) return;
  for (const it of items) {
    const action = it.gapType === "UNLISTED" ? "Consider adding it to the catalogue." : "Consider recruiting suppliers for it.";
    await notify({
      userIds,
      type: "SYSTEM",
      title: `${gapLabel[it.gapType]} requested ${it.requests} times: ${it.label}`,
      body: `"${it.label}" has been requested ${it.requests} times${it.buyers ? ` by ${it.buyers} signed-in buyer${it.buyers === 1 ? "" : "s"}` : " (guest requests)"} in BOQs, RFQs and searches. ${action}`,
      link: `/admin/demand?gap=${it.id}`,
      email: true,
    });
  }
}

// ------------------------------------------------------------------ maintenance jobs

/** Re-counts live supplier offers for clusters tied to a catalogue product (coverage changes as suppliers list). */
export async function refreshDemandCoverage(): Promise<{ updated: number }> {
  const clusters = await prisma.demandCluster.findMany({ where: { materialId: { not: null }, status: { in: ["NEW", "PLANNED", "ADDED"] } }, select: { id: true, materialId: true, gapType: true, offerCount: true } });
  if (!clusters.length) return { updated: 0 };
  const counts = await prisma.priceListing.groupBy({ by: ["materialId"], where: { materialId: { in: clusters.map((c) => c.materialId!) }, source: "SUPPLIER", ...activeListingWhere() }, _count: { _all: true } });
  const byMaterial = new Map(counts.map((c) => [c.materialId, c._count._all]));
  let updated = 0;
  for (const c of clusters) {
    const n = byMaterial.get(c.materialId!) ?? 0;
    const gapType = gapTypeFor(n);
    if (n !== c.offerCount || gapType !== c.gapType) {
      await prisma.demandCluster.update({ where: { id: c.id }, data: { offerCount: n, gapType } });
      updated++;
    }
  }
  return { updated };
}

const DIGEST_KEY = "demandDigestSentAt";

/** Weekly digest to admins (Sunday = start of the Saudi work week). Safe to call hourly. */
export async function sendDemandDigestIfDue(now = new Date()): Promise<{ sent: boolean }> {
  if (now.getUTCDay() !== 0) return { sent: false }; // Sunday
  const last = await prisma.platformSetting.findUnique({ where: { key: DIGEST_KEY } });
  if (last && now.getTime() - new Date(String(last.value)).getTime() < 6 * 86_400_000) return { sent: false };
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const gaps = await prisma.demandCluster.findMany({ where: { gapType: { not: "COVERED" }, status: { in: ["NEW", "PLANNED"] }, lastRequestedAt: { gte: since } }, orderBy: [{ requests: "desc" }], take: 50 });
  const ranked = gaps.map((g) => ({ ...g, score: demandScore({ requests: g.requests, buyers: ((g.buyerKeys as string[]) ?? []).length, totalQuantity: g.totalQuantity, lastRequestedAt: g.lastRequestedAt }, now.getTime()) })).sort((a, b) => b.score - a.score).slice(0, 10);
  await prisma.platformSetting.upsert({ where: { key: DIGEST_KEY }, create: { key: DIGEST_KEY, value: now.toISOString() }, update: { value: now.toISOString() } });
  if (!ranked.length) return { sent: false };
  const userIds = await adminUserIds();
  const lines = ranked.map((g, i) => `${i + 1}. ${g.label} — ${g.requests} requests, ${((g.buyerKeys as string[]) ?? []).length} buyers (${gapLabel[g.gapType].toLowerCase()})`);
  await notify({ userIds, type: "SYSTEM", title: `Weekly demand digest: ${ranked.length} products buyers asked for`, body: lines.join("\n"), link: "/admin/demand", email: true });
  return { sent: true };
}

// ------------------------------------------------------------------ queries for the admin console

export interface GapFilters { gapType?: DemandGapType | "OPEN" | "LISTED"; status?: DemandStatus; city?: string; q?: string; days?: number; source?: DemandSource }

export function gapWhere(f: GapFilters): Prisma.DemandClusterWhereInput {
  return {
    ...(f.gapType === "OPEN" ? { gapType: { not: "COVERED" } } : f.gapType === "LISTED" ? { gapType: { in: ["NO_OFFERS", "THIN_COVERAGE"] } } : f.gapType ? { gapType: f.gapType } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.days ? { lastRequestedAt: { gte: new Date(Date.now() - f.days * 86_400_000) } } : {}),
    ...(f.q ? { OR: [{ label: { contains: f.q, mode: "insensitive" } }, { key: { contains: demandKey(f.q) } }] } : {}),
    ...(f.city ? { cities: { path: [f.city], gt: 0 } } : {}),
    ...(f.source ? { signals: { some: { source: f.source } } } : {}),
  };
}

export function shapeCluster<T extends { buyerKeys: unknown; cities: unknown; examples: unknown; requests: number; totalQuantity: number; lastRequestedAt: Date; gapType: DemandGapType }>(c: T) {
  const buyers = ((c.buyerKeys as string[]) ?? []).length;
  const cities = (c.cities as Record<string, number>) ?? {};
  const topCities = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([city, count]) => ({ city, count }));
  const { buyerKeys: _b, cities: _c, ...rest } = c;
  const suggestion = c.gapType === "UNLISTED" ? "Add this product to the catalogue" : c.gapType === "NO_OFFERS" ? "Recruit suppliers: no live offer" : c.gapType === "THIN_COVERAGE" ? "Recruit more suppliers (target 3 offers)" : "Covered";
  return { ...rest, buyers, topCities, examples: (c.examples as string[]) ?? [], score: demandScore({ requests: c.requests, buyers, totalQuantity: c.totalQuantity, lastRequestedAt: c.lastRequestedAt }), suggestion };
}

export async function demandOverview(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [signals, bySource, unmatched, openGaps, byType, topCities, recentClusters] = await Promise.all([
    prisma.demandSignal.count({ where: { createdAt: { gte: since } } }),
    prisma.demandSignal.groupBy({ by: ["source"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.demandSignal.count({ where: { createdAt: { gte: since }, materialId: null } }),
    prisma.demandCluster.count({ where: { gapType: { not: "COVERED" }, status: { in: ["NEW", "PLANNED"] } } }),
    prisma.demandCluster.groupBy({ by: ["gapType"], where: { status: { in: ["NEW", "PLANNED"] } }, _count: { _all: true } }),
    prisma.demandSignal.groupBy({ by: ["city"], where: { createdAt: { gte: since }, city: { not: null } }, _count: { _all: true }, orderBy: { _count: { city: "desc" } }, take: 6 }),
    // One-off searches are noise until they repeat; BOQ/RFQ lines count from the first request.
    prisma.demandCluster.findMany({ where: { gapType: { not: "COVERED" }, status: { in: ["NEW", "PLANNED"] }, lastRequestedAt: { gte: since }, OR: [{ requests: { gte: 2 } }, { signals: { some: { source: { not: "SEARCH" } } } }] }, orderBy: { requests: "desc" }, take: 40 }),
  ]);
  const top = recentClusters.map(shapeCluster).sort((a, b) => b.score - a.score).slice(0, 8);
  return {
    days,
    signals,
    unmatchedSignals: unmatched,
    unmatchedPct: signals ? Math.round((unmatched / signals) * 100) : 0,
    bySource: Object.fromEntries(bySource.map((s) => [s.source, s._count._all])),
    openGaps,
    byType: Object.fromEntries(byType.map((t) => [t.gapType, t._count._all])),
    topCities: topCities.map((c) => ({ city: c.city, count: c._count._all })),
    topGaps: top,
  };
}

/**
 * Launch list: the products worth having live first, ranked by observed demand plus the catalogue's
 * baseline popularity, each with its coverage in the chosen city ("3 fresh offers per SKU" rule).
 */
export async function launchList(opts: { city?: string; size?: number; freshDays?: number }) {
  const size = Math.min(Math.max(opts.size ?? 200, 10), 1000);
  const freshDays = opts.freshDays ?? 14;
  const freshSince = new Date(Date.now() - freshDays * 86_400_000);
  const [materials, clusters, listings] = await Promise.all([
    prisma.material.findMany({ where: { active: true }, select: { id: true, sku: true, name: true, nameAr: true, unit: true, popularity: true, category: { select: { id: true, name: true, slug: true } } } }),
    prisma.demandCluster.findMany({ where: { materialId: { not: null } }, select: { materialId: true, requests: true, buyerKeys: true, totalQuantity: true, lastRequestedAt: true } }),
    prisma.priceListing.findMany({ where: { source: "SUPPLIER", ...activeListingWhere(opts.city) }, select: { materialId: true, companyId: true, updatedAt: true } }),
  ]);
  const demandBy = new Map(clusters.map((c) => [c.materialId!, c]));
  const cov = new Map<string, { total: number; fresh: number; suppliers: Set<string> }>();
  for (const l of listings) {
    const e = cov.get(l.materialId) ?? { total: 0, fresh: 0, suppliers: new Set<string>() };
    e.total++; if (l.updatedAt >= freshSince) e.fresh++; if (l.companyId) e.suppliers.add(l.companyId);
    cov.set(l.materialId, e);
  }
  const maxPop = Math.max(1, ...materials.map((m) => m.popularity));
  const rows = materials.map((m) => {
    const d = demandBy.get(m.id);
    const demand = d ? demandScore({ requests: d.requests, buyers: ((d.buyerKeys as string[]) ?? []).length, totalQuantity: d.totalQuantity, lastRequestedAt: d.lastRequestedAt }) : 0;
    const baseline = Math.round((m.popularity / maxPop) * 50 * 10) / 10;
    const c = cov.get(m.id) ?? { total: 0, fresh: 0, suppliers: new Set<string>() };
    const r = readiness(c.fresh, c.total);
    return { id: m.id, sku: m.sku, name: m.name, nameAr: m.nameAr, unit: m.unit, category: m.category, score: Math.round((demand + baseline) * 10) / 10, demandScore: demand, requests: d?.requests ?? 0, buyers: d ? ((d.buyerKeys as string[]) ?? []).length : 0, offers: c.total, freshOffers: c.fresh, suppliers: c.suppliers.size, ...r };
  }).sort((a, b) => b.score - a.score).slice(0, size);
  const ready = rows.filter((r) => r.status === "READY").length;
  return {
    city: opts.city ?? null, size, freshDays,
    summary: { ready, needsSuppliers: rows.filter((r) => r.status === "NEEDS_SUPPLIERS").length, noOffers: rows.filter((r) => r.status === "NO_OFFERS").length, coveragePct: rows.length ? Math.round((ready / rows.length) * 100) : 0, launchReady: rows.length > 0 && ready / rows.length >= 0.8 },
    items: rows,
  };
}
