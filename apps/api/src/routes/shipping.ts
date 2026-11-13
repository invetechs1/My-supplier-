import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { audit } from "../lib/audit";
import { notify } from "../services/notifications";
import { recordOrderEvent } from "../services/portal";
import { CARRIERS, carrierEnabled, carrierName, loadForQuote, quoteForSupplier } from "../services/shipping";
import { adapterFor, adapters, carrierStatus, CarrierError, sandboxEnabled } from "../services/carriers";
import { advanceShipment, cancelShipment, carrierBacked, shape, shapeMany, shipmentInclude, shipmentLabel, syncShipment } from "../services/shipments";

const router = Router();
const CARRIER_CODES = ["SUPPLIER", "TRUKKER", "TRELLA", "SMSA", "ARAMEX", "SPL", "OTHER"] as const;

/** Public carrier list. `booksOnline` = the adapter will create the shipment with the carrier (live or sandbox). */
router.get("/shipping/carriers", (_req, res) => {
  res.json(CARRIERS.map((c) => { const mode = adapters[c.code].mode(); return { code: c.code, name: c.name, nameAr: c.nameAr, kind: c.kind, enabled: carrierEnabled(c.code), supportsTracking: c.supportsTracking, maxWeightKg: c.maxWeightKg, apiConfigured: mode !== "manual", mode, booksOnline: mode !== "manual" }; }));
});

router.post(
  "/shipping/quote",
  asyncHandler(async (req, res) => {
    const body = z.object({ supplierCompanyId: z.string().optional(), items: z.array(z.object({ materialId: z.string(), quantity: z.coerce.number().finite().positive().max(1e6) })).min(1).max(50), deliveryCity: z.string().min(2), pickupCity: z.string().optional() }).parse(req.body);
    if (body.supplierCompanyId) {
      const { quotes } = await quoteForSupplier(body.supplierCompanyId, body.items, body.deliveryCity, body.pickupCity);
      return res.json(quotes);
    }
    const { weightKg, volumeM3 } = await loadForQuote(body.items);
    const { quoteAll, loadRates, zoneFor } = await import("../services/shipping");
    res.json(quoteAll(await loadRates(), zoneFor(body.pickupCity ?? body.deliveryCity, body.deliveryCity), weightKg, volumeM3));
  }),
);

async function accessibleOrder(id: string, user: NonNullable<import("express").Request["user"]>) {
  const order = await prisma.order.findUnique({ where: { id }, include: { company: { include: { branches: { where: { isDefault: true }, take: 1 } } }, buyer: { select: { id: true, name: true, phone: true, email: true } }, items: true } });
  if (!order) throw notFound("Order not found");
  const ok = user.role === "ADMIN" || order.buyerId === user.id || (user.companyId !== null && order.companyId === user.companyId);
  if (!ok) throw forbidden();
  return order;
}

/** Supplier of the shipment's order or an admin; 404/403 otherwise. */
async function manageableShipment(id: string, user: NonNullable<import("express").Request["user"]>, req: import("express").Request) {
  const shipment = await prisma.shipment.findUnique({ where: { id }, include: { ...shipmentInclude, order: true } });
  if (!shipment) throw notFound("Shipment not found");
  if (user.role === "SUPPLIER" && shipment.order.companyId !== requireCompany(req)) throw forbidden();
  return shipment;
}

router.get(
  "/orders/:id/shipments",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    const rows = await prisma.shipment.findMany({ where: { orderId: order.id }, include: shipmentInclude, orderBy: { createdAt: "asc" } });
    res.json(serialize(await shapeMany(rows)));
  }),
);

const shipmentSchema = z.object({
  carrier: z.enum(CARRIER_CODES), service: z.string().max(100).optional(), trackingNumber: z.string().max(80).optional(), trackingUrl: z.string().url().optional(),
  pickupBranchId: z.string().optional(), driverName: z.string().max(100).optional(), driverPhone: z.string().max(30).optional(), vehicle: z.string().max(100).optional(), scheduledAt: z.coerce.date().optional(), cost: z.coerce.number().nonnegative().optional(),
  /** Printed on the carrier waybill; defaults to the first order lines. */
  contentDescription: z.string().max(100).optional(), pieces: z.coerce.number().int().positive().max(999).optional(),
});

router.post(
  "/orders/:id/shipments",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    if (req.user!.role === "SUPPLIER" && order.companyId !== requireCompany(req)) throw forbidden();
    if (["CANCELLED", "DELIVERED"].includes(order.status)) throw badRequest(`Order is ${order.status.toLowerCase()}`);
    const body = shipmentSchema.parse(req.body);
    if (body.pickupBranchId) {
      const branch = await prisma.branch.findFirst({ where: { id: body.pickupBranchId, companyId: order.companyId } });
      if (!branch) throw badRequest("Pickup branch must belong to the supplier");
    }
    const { weightKg, volumeM3 } = await loadForQuote(order.items.filter((i) => i.materialId).map((i) => ({ materialId: i.materialId!, quantity: i.quantity })));
    let external: { externalId?: string; trackingNumber?: string; trackingUrl?: string | null; cost?: number | null; labelUrl?: string | null } = {};
    const adapter = adapters[body.carrier];
    const bookOnline = adapter.mode() !== "manual" && !body.trackingNumber;
    if (bookOnline) {
      const branch = body.pickupBranchId ? await prisma.branch.findUnique({ where: { id: body.pickupBranchId } }) : order.company.branches[0];
      if (!order.deliveryCity) throw badRequest("The order has no delivery city; add it before booking a carrier");
      try {
        external = await adapter.book({
          orderReference: order.reference,
          pickup: { city: branch?.city ?? order.company.city, address: branch?.address, phone: branch?.phone ?? order.company.phone, name: order.company.name },
          dropoff: { city: order.deliveryCity, address: order.deliveryAddress, phone: order.contactPhone ?? order.buyer.phone, name: order.buyer.name, email: order.buyer.email },
          weightKg, volumeM3, service: body.service, scheduledAt: body.scheduledAt, pieces: body.pieces,
          contentDescription: body.contentDescription ?? order.items.slice(0, 3).map((i) => i.name).join(", ").slice(0, 100),
          valueSar: Number(order.subtotal), codAmountSar: order.paymentMethod === "COD" && order.paymentStatus !== "PAID" ? Number(order.total) : 0,
        });
      } catch (e) {
        throw badRequest(`${carrierName(body.carrier)} booking failed: ${(e as Error).message}`, e instanceof CarrierError ? { status: e.status } : undefined);
      }
    }
    const existingPending = await prisma.shipment.findFirst({ where: { orderId: order.id, status: "PENDING" } });
    const data = { carrier: body.carrier, carrierName: carrierName(body.carrier), service: body.service, trackingNumber: body.trackingNumber ?? external.trackingNumber, trackingUrl: body.trackingUrl ?? external.trackingUrl ?? undefined, externalId: external.externalId, labelUrl: external.labelUrl ?? undefined, pickupBranchId: body.pickupBranchId, driverName: body.driverName, driverPhone: body.driverPhone, vehicle: body.vehicle, scheduledAt: body.scheduledAt, cost: body.cost ?? external.cost ?? undefined, weightKg, volumeM3, status: "BOOKED" as const };
    const bookedNote = `Booked with ${carrierName(body.carrier)}${bookOnline ? ` (${adapter.mode()})` : ""}`;
    const shipment = existingPending
      ? await prisma.shipment.update({ where: { id: existingPending.id }, data: { ...data, events: { create: { status: "BOOKED", description: bookedNote } } }, include: shipmentInclude })
      : await prisma.shipment.create({ data: { ...data, orderId: order.id, events: { create: [{ status: "PENDING", description: "Shipment created" }, { status: "BOOKED", description: bookedNote }] } }, include: shipmentInclude });
    if (order.status === "PENDING") await prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
    await recordOrderEvent(order.id, "NOTE", { message: `Shipment booked · ${carrierName(body.carrier)}${shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}`, userId: req.user!.id });
    await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `${order.reference} is being shipped`, body: `${carrierName(body.carrier)}${shipment.scheduledAt ? ` · scheduled ${shipment.scheduledAt.toISOString().slice(0, 10)}` : ""}`, link: `/dashboard/orders/${order.id}` });
    res.status(201).json(serialize((await shapeMany([shipment]))[0]));
  }),
);

router.patch(
  "/shipments/:id",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const shipment = await manageableShipment(req.params.id, req.user!, req);
    const body = shipmentSchema.partial().extend({ status: z.enum(["PENDING", "BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"]).optional(), description: z.string().max(300).optional(), location: z.string().max(120).optional() }).parse(req.body);
    const { status, description, location, contentDescription: _c, pieces: _p, ...fields } = body;
    if (fields.pickupBranchId) {
      const branch = await prisma.branch.findFirst({ where: { id: fields.pickupBranchId, companyId: shipment.order.companyId } });
      if (!branch) throw badRequest("Pickup branch must belong to the supplier");
    }
    if (Object.keys(fields).length) await prisma.shipment.update({ where: { id: shipment.id }, data: { ...fields, carrierName: fields.carrier ? carrierName(fields.carrier) : undefined } });
    if (status) return res.json(serialize(await advanceShipment(shipment.id, status, description, location, req.user!.id)));
    res.json(serialize(shape(await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: shipmentInclude }))));
  }),
);

/** Label / waybill: `?format=pdf` streams the PDF, otherwise `{ url?, pdfBase64? }` (404 when the carrier has none). */
router.get(
  "/shipments/:id/label",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const shipment = await manageableShipment(req.params.id, req.user!, req);
    const label = await shipmentLabel(shipment);
    if (!label) throw notFound("No label available for this shipment");
    if (req.query.format === "pdf") {
      if (label.pdfBase64) { res.setHeader("content-type", "application/pdf"); res.setHeader("content-disposition", `attachment; filename="label-${shipment.trackingNumber ?? shipment.id}.pdf"`); return res.send(Buffer.from(label.pdfBase64, "base64")); }
      if (label.url) return res.redirect(label.url);
    }
    res.json({ url: label.url ?? null, pdfBase64: label.pdfBase64 ?? null, trackingNumber: shipment.trackingNumber });
  }),
);

router.post(
  "/shipments/:id/cancel",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const shipment = await manageableShipment(req.params.id, req.user!, req);
    const body = z.object({ reason: z.string().max(200).optional() }).parse(req.body ?? {});
    try {
      const result = await cancelShipment(shipment, req.user!.id, body.reason);
      await audit(req, "shipment.cancel", "Shipment", shipment.id, { carrier: shipment.carrier, remote: result.remote });
      res.json(serialize({ ...result.shipment, cancelledWithCarrier: result.remote, note: result.note }));
    } catch (e) {
      if (e instanceof CarrierError) throw badRequest(`${shipment.carrierName} cancel failed: ${e.message}`);
      throw badRequest((e as Error).message);
    }
  }),
);

/** Pulls the latest tracking from the carrier now (same logic as the hourly poll) and returns the shipment. */
router.post(
  "/shipments/:id/refresh",
  requireAuth("SUPPLIER", "ADMIN", "BUYER"),
  asyncHandler(async (req, res) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { order: { select: { id: true } } } });
    if (!shipment) throw notFound("Shipment not found");
    await accessibleOrder(shipment.order.id, req.user!);
    let result: { applied: number; reason?: string };
    try { result = await syncShipment(shipment.id); }
    catch (e) { throw badRequest(`${shipment.carrierName} tracking failed: ${(e as Error).message}`); }
    const fresh = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: shipmentInclude });
    res.json(serialize({ ...(await shapeMany([fresh]))[0], refreshed: carrierBacked(fresh), applied: result.applied, reason: result.reason ?? null }));
  }),
);

/**
 * Carrier tracking webhook. Verified by the adapter: `<CARRIER>_WEBHOOK_SECRET` as HMAC-SHA256 of the raw body in
 * `x-signature` (or the carrier's own header) or as a shared token in `x-webhook-token`; the legacy platform-wide
 * `CARRIER_WEBHOOK_SECRET` / `x-webhook-secret` pair still works. Payloads are carrier-specific (adapter.parseWebhook).
 */
router.post(
  "/shipping/webhooks/:carrier",
  asyncHandler(async (req, res) => {
    const adapter = adapterFor(req.params.carrier);
    if (!adapter) throw badRequest("Unknown carrier");
    if (!adapter.verifyWebhook({ headers: req.headers, rawBody: req.rawBody, body: req.body })) throw unauthorized("Bad webhook signature");
    const update = adapter.parseWebhook(req.body);
    if (!update) throw badRequest("Unrecognised webhook payload");
    const shipment = await prisma.shipment.findFirst({ where: { carrier: adapter.code, OR: [{ trackingNumber: update.trackingNumber }, { externalId: update.trackingNumber }], status: { notIn: ["DELIVERED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, include: { events: { select: { status: true } } } });
    if (!shipment) return res.json({ ignored: true });
    const status = adapter.mapStatus(update.status);
    if (shipment.status === status && shipment.events.some((e) => e.status === status) && !update.description) return res.json({ ok: true, duplicate: true });
    await advanceShipment(shipment.id, status, update.description ?? `Carrier update: ${update.status}`, update.location, undefined, update.at);
    res.json({ ok: true, status });
  }),
);

// ---------------------------------------------------------------- admin: carrier integrations
router.get("/admin/shipping/carriers", requireAuth("ADMIN"), (_req, res) => {
  res.json({ sandbox: sandboxEnabled(), carriers: CARRIERS.map((c) => ({ ...carrierStatus(c.code, env.apiUrl), name: c.name, nameAr: c.nameAr, kind: c.kind, enabled: carrierEnabled(c.code) })) });
});

/** Sandbox: books and cancels a throw-away shipment; live: a credentials check that creates nothing. */
router.post(
  "/admin/shipping/carriers/:code/test",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const adapter = adapterFor(req.params.code);
    if (!adapter) throw badRequest("Unknown carrier");
    const mode = adapter.mode();
    if (mode === "manual") return res.json({ ok: false, mode, detail: `Not configured: set ${adapter.env.required.join(", ") || "credentials"}`, steps: [] });
    const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
    if (mode === "sandbox") {
      const now = new Date();
      const booking = await adapter.book({ orderReference: `TEST-${now.getTime().toString(36).toUpperCase()}`, pickup: { city: "Riyadh", address: "Exit 18 warehouse", phone: "+966500000001", name: "Test supplier" }, dropoff: { city: "Jeddah", address: "Industrial city", phone: "+966500000002", name: "Test buyer" }, weightKg: 120, volumeM3: 0.4, scheduledAt: now });
      steps.push({ step: "book", ok: true, detail: `Tracking ${booking.trackingNumber}` });
      const events = await adapter.track(booking.trackingNumber);
      steps.push({ step: "track", ok: events.length > 0, detail: `${events.length} event(s), latest ${events.at(-1)?.status ?? "none"}` });
      const label = await adapter.label(booking.externalId);
      steps.push({ step: "label", ok: Boolean(label), detail: label?.pdfBase64 ? `PDF ${Math.round(label.pdfBase64.length * 0.75)} bytes` : label?.url ?? "none" });
      const cancel = await adapter.cancel(booking.externalId);
      steps.push({ step: "cancel", ok: true, detail: cancel.note ?? "Cancelled" });
    } else {
      const ping = await adapter.ping();
      steps.push({ step: "auth", ok: ping.ok, detail: ping.detail });
    }
    await audit(req, "carrier.test", "Carrier", adapter.code, { mode, ok: steps.every((s) => s.ok) });
    res.json({ ok: steps.every((s) => s.ok), mode, detail: steps.map((s) => `${s.step}: ${s.detail}`).join(" · "), steps });
  }),
);

/** Recent shipments across all orders for the admin carriers tab. */
router.get(
  "/admin/shipping/shipments",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), carrier: z.enum(CARRIER_CODES).optional(), status: z.enum(["PENDING", "BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"]).optional() }).parse(req.query);
    const rows = await prisma.shipment.findMany({ where: { carrier: q.carrier, status: q.status }, orderBy: { updatedAt: "desc" }, take: q.limit, include: { order: { select: { id: true, reference: true, deliveryCity: true, company: { select: { name: true } } } } } });
    res.json(serialize(rows.map((s) => ({ id: s.id, carrier: s.carrier, carrierName: s.carrierName, service: s.service, trackingNumber: s.trackingNumber, externalId: s.externalId, status: s.status, sandbox: (s.externalId ?? s.trackingNumber ?? "").startsWith("SBX-"), hasLabel: Boolean(s.labelUrl), cost: s.cost, updatedAt: s.updatedAt, createdAt: s.createdAt, order: { id: s.order.id, reference: s.order.reference, deliveryCity: s.order.deliveryCity, supplier: s.order.company.name } }))));
  }),
);

// ---------------------------------------------------------------- admin rate cards
const rateSchema = z.object({ carrier: z.enum(CARRIER_CODES), zone: z.enum(["SAME_CITY", "SAME_REGION", "NATIONAL"]), service: z.string().min(2), baseFee: z.coerce.number().nonnegative(), perKg: z.coerce.number().nonnegative().default(0), includedKg: z.coerce.number().nonnegative().default(0), perM3: z.coerce.number().nonnegative().default(0), minFee: z.coerce.number().nonnegative().default(0), maxWeightKg: z.coerce.number().positive().nullable().optional(), etaDays: z.coerce.number().int().min(0).default(2), enabled: z.boolean().default(true) });

router.get("/admin/shipping/rates", requireAuth("ADMIN"), asyncHandler(async (_req, res) => res.json(serialize(await prisma.shippingRate.findMany({ orderBy: [{ carrier: "asc" }, { zone: "asc" }] })))));
router.post("/admin/shipping/rates", requireAuth("ADMIN"), asyncHandler(async (req, res) => res.status(201).json(serialize(await prisma.shippingRate.create({ data: rateSchema.parse(req.body) })))));
router.patch("/admin/shipping/rates/:id", requireAuth("ADMIN"), asyncHandler(async (req, res) => res.json(serialize(await prisma.shippingRate.update({ where: { id: req.params.id }, data: rateSchema.partial().parse(req.body) })))));
router.delete("/admin/shipping/rates/:id", requireAuth("ADMIN"), asyncHandler(async (req, res) => { await prisma.shippingRate.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }));

export default router;
