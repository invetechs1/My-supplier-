/**
 * Shipment lifecycle shared by the routes, the carrier webhook and the hourly tracking poll:
 * status advancement (with order status + buyer notification), carrier tracking sync, labels and cancellation.
 */
import { Prisma, type ShipmentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { notify } from "./notifications";
import { recordOrderEvent } from "./portal";
import { trackingUrlFor } from "./shipping";
import { adapters, isSandboxRef, type LabelResult } from "./carriers";

export const shipmentInclude = { events: { orderBy: { createdAt: "asc" } }, pickupBranch: true } satisfies Prisma.ShipmentInclude;
export type ShipmentRow = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;

export const OPEN_STATUSES: ShipmentStatus[] = ["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"];
const RANK: Record<ShipmentStatus, number> = { PENDING: 0, BOOKED: 1, PICKED_UP: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5, FAILED: 9, CANCELLED: 9 };
const TERMINAL: ShipmentStatus[] = ["DELIVERED", "FAILED", "CANCELLED"];

/** Response shape: fills the public tracking URL and the ETA (scheduled/booked time + the rate card's ETA days). */
export const shape = (s: ShipmentRow, etaDays?: number | null) => {
  const open = !TERMINAL.includes(s.status);
  const base = s.scheduledAt ?? s.events.find((e) => e.status === "BOOKED")?.createdAt ?? s.createdAt;
  return { ...s, trackingUrl: s.trackingUrl ?? trackingUrlFor(s.carrier, s.trackingNumber), etaAt: open && etaDays !== null && etaDays !== undefined ? new Date(base.getTime() + etaDays * 86_400_000) : null, hasLabel: Boolean(s.labelUrl) || (adapters[s.carrier].mode() !== "manual" && Boolean(s.externalId ?? s.trackingNumber)) || isSandboxRef(s.externalId) };
};

/** Shapes a list, looking the ETA up once per carrier/service from the enabled rate cards. */
export async function shapeMany(rows: ShipmentRow[]) {
  const carriers = [...new Set(rows.map((r) => r.carrier))];
  const rates = carriers.length ? await prisma.shippingRate.findMany({ where: { carrier: { in: carriers }, enabled: true }, select: { carrier: true, service: true, etaDays: true } }) : [];
  return rows.map((r) => { const own = rates.filter((x) => x.carrier === r.carrier); const match = own.find((x) => x.service === r.service) ?? own[0]; return shape(r, match?.etaDays ?? null); });
}

const ORDER_STATUS_FOR: Partial<Record<ShipmentStatus, "CONFIRMED" | "IN_TRANSIT" | "DELIVERED">> = { BOOKED: "CONFIRMED", PICKED_UP: "IN_TRANSIT", IN_TRANSIT: "IN_TRANSIT", OUT_FOR_DELIVERY: "IN_TRANSIT", DELIVERED: "DELIVERED" };

/** Moves a shipment to `status` with an event, advances the order when the shipment outruns it and notifies the buyer. */
export async function advanceShipment(shipmentId: string, status: ShipmentStatus, description?: string | null, location?: string | null, userId?: string, at?: Date | null) {
  const shipment = await prisma.shipment.update({ where: { id: shipmentId }, data: { status, deliveredAt: status === "DELIVERED" ? (at ?? new Date()) : undefined, events: { create: { status, description: description ?? undefined, location: location ?? undefined, createdAt: at ?? undefined } } }, include: { ...shipmentInclude, order: true } });
  const target = ORDER_STATUS_FOR[status];
  const order = shipment.order;
  const rank = { PENDING: 0, CONFIRMED: 1, IN_TRANSIT: 2, DELIVERED: 3, CANCELLED: 9 } as const;
  if (target && rank[target] > rank[order.status as keyof typeof rank] && order.status !== "CANCELLED") {
    await prisma.order.update({ where: { id: order.id }, data: { status: target } });
    await recordOrderEvent(order.id, "STATUS", { status: target, userId, message: `via shipment ${shipment.trackingNumber ?? ""}`.trim() });
  }
  await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `${order.reference}: ${status.replace(/_/g, " ").toLowerCase()}`, body: [description, location].filter(Boolean).join(" · ") || shipment.carrierName, link: `/dashboard/orders/${order.id}`, email: status === "DELIVERED" });
  return shape(shipment);
}

/** The reference a carrier's track/cancel/label calls expect for this shipment. */
export const carrierRef = (s: { carrier: ShipmentRow["carrier"]; trackingNumber: string | null; externalId: string | null }) => (adapters[s.carrier].tracksBy === "externalId" ? s.externalId ?? s.trackingNumber : s.trackingNumber ?? s.externalId) ?? null;
/** True when the carrier API (or the sandbox) can answer for this shipment. */
export const carrierBacked = (s: { carrier: ShipmentRow["carrier"]; trackingNumber: string | null; externalId: string | null }) => { const ref = carrierRef(s); return Boolean(ref) && (adapters[s.carrier].mode() !== "manual" || isSandboxRef(ref)); };

/**
 * Pulls the carrier's tracking history and appends the statuses we have not recorded yet (in carrier order, never
 * backwards). Returns how many events were applied; 0 with `reason` when the shipment is manual or has no reference.
 */
export async function syncShipment(shipmentId: string): Promise<{ applied: number; reason?: string }> {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { events: true } });
  if (!s) return { applied: 0, reason: "not found" };
  if (!carrierBacked(s)) return { applied: 0, reason: "manual" };
  if (TERMINAL.includes(s.status)) return { applied: 0, reason: "closed" };
  const events = await adapters[s.carrier].track(carrierRef(s)!);
  const seen = new Set<ShipmentStatus>(s.events.map((e) => e.status));
  let current = s.status, applied = 0;
  for (const ev of events) {
    if (seen.has(ev.status) || TERMINAL.includes(current)) continue;
    if (RANK[ev.status] <= RANK[current] && !TERMINAL.includes(ev.status)) continue;
    await advanceShipment(s.id, ev.status, ev.description ?? `Carrier update: ${ev.raw}`, ev.location ?? undefined, undefined, ev.at ?? undefined);
    seen.add(ev.status); current = ev.status; applied++;
  }
  return { applied };
}

/** Hourly job: refreshes open carrier-backed shipments, oldest update first, at most `limit` per run. */
export async function pollOpenShipments(limit = 50) {
  const live = (Object.keys(adapters) as ShipmentRow["carrier"][]).filter((c) => adapters[c].mode() !== "manual");
  const rows = await prisma.shipment.findMany({ where: { status: { in: OPEN_STATUSES }, OR: [{ carrier: { in: live } }, { externalId: { startsWith: "SBX-" } }], NOT: [{ trackingNumber: null, externalId: null }] }, orderBy: { updatedAt: "asc" }, take: limit, select: { id: true } });
  let applied = 0, failed = 0;
  for (const r of rows) {
    try { applied += (await syncShipment(r.id)).applied; }
    catch (e) { failed++; console.error("[shipments] poll failed", r.id, (e as Error).message); }
  }
  return { checked: rows.length, applied, failed };
}

/** Label for a shipment: the stored one, else fetched from the carrier and cached on the row (hosted URL or data URL). */
export async function shipmentLabel(s: { id: string; carrier: ShipmentRow["carrier"]; trackingNumber: string | null; externalId: string | null; labelUrl: string | null }): Promise<LabelResult | null> {
  if (s.labelUrl) return s.labelUrl.startsWith("data:") ? { pdfBase64: s.labelUrl.slice(s.labelUrl.indexOf(",") + 1) } : { url: s.labelUrl };
  if (!carrierBacked(s)) return null;
  const label = await adapters[s.carrier].label((s.externalId ?? s.trackingNumber)!);
  const stored = label?.url ?? (label?.pdfBase64 && label.pdfBase64.length < 1_500_000 ? `data:application/pdf;base64,${label.pdfBase64}` : null);
  if (stored) await prisma.shipment.update({ where: { id: s.id }, data: { labelUrl: stored } });
  return label;
}

/** Cancels with the carrier when it is API-backed, then closes the shipment locally with an event. */
export async function cancelShipment(s: { id: string; carrier: ShipmentRow["carrier"]; trackingNumber: string | null; externalId: string | null; status: ShipmentStatus }, userId?: string, reason?: string) {
  if (TERMINAL.includes(s.status)) throw new Error(`Shipment is already ${s.status.toLowerCase()}`);
  const remote = carrierBacked(s) ? await adapters[s.carrier].cancel((s.externalId ?? s.trackingNumber)!) : { remote: false as const };
  const note = [reason, remote.note ?? (remote.remote ? `Cancelled with ${adapters[s.carrier].code}` : undefined)].filter(Boolean).join(" · ") || "Cancelled by supplier";
  return { shipment: await advanceShipment(s.id, "CANCELLED", note, undefined, userId), remote: remote.remote, note: remote.note ?? null };
}
