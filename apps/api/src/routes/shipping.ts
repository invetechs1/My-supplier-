import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { companyUserIds, notify } from "../services/notifications";
import { recordOrderEvent } from "../services/portal";
import { CARRIERS, carrierEnabled, carrierName, loadForQuote, quoteForSupplier, trackingUrlFor } from "../services/shipping";
import { adapters } from "../services/carriers";

const router = Router();
const shipmentInclude = { events: { orderBy: { createdAt: "asc" } }, pickupBranch: true } satisfies Prisma.ShipmentInclude;

router.get("/shipping/carriers", (_req, res) => {
  res.json(CARRIERS.map((c) => ({ code: c.code, name: c.name, nameAr: c.nameAr, kind: c.kind, enabled: carrierEnabled(c.code), supportsTracking: c.supportsTracking, maxWeightKg: c.maxWeightKg, apiConfigured: adapters[c.code].configured() && Boolean(c.envKey) })));
});

router.post(
  "/shipping/quote",
  asyncHandler(async (req, res) => {
    const body = z.object({ supplierCompanyId: z.string().optional(), items: z.array(z.object({ materialId: z.string(), quantity: z.coerce.number().positive() })).min(1).max(200), deliveryCity: z.string().min(2), pickupCity: z.string().optional() }).parse(req.body);
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
  const order = await prisma.order.findUnique({ where: { id }, include: { company: { include: { branches: { where: { isDefault: true }, take: 1 } } }, buyer: { select: { id: true, name: true, phone: true } }, items: true } });
  if (!order) throw notFound("Order not found");
  const ok = user.role === "ADMIN" || order.buyerId === user.id || (user.companyId !== null && order.companyId === user.companyId);
  if (!ok) throw forbidden();
  return order;
}

const shape = (s: Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>) => ({ ...s, trackingUrl: s.trackingUrl ?? trackingUrlFor(s.carrier, s.trackingNumber) });

router.get(
  "/orders/:id/shipments",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    const rows = await prisma.shipment.findMany({ where: { orderId: order.id }, include: shipmentInclude, orderBy: { createdAt: "asc" } });
    res.json(serialize(rows.map(shape)));
  }),
);

const shipmentSchema = z.object({
  carrier: z.enum(["SUPPLIER", "TRUKKER", "TRELLA", "SMSA", "ARAMEX", "SPL", "OTHER"]), service: z.string().max(100).optional(), trackingNumber: z.string().max(80).optional(), trackingUrl: z.string().url().optional(),
  pickupBranchId: z.string().optional(), driverName: z.string().max(100).optional(), driverPhone: z.string().max(30).optional(), vehicle: z.string().max(100).optional(), scheduledAt: z.coerce.date().optional(), cost: z.coerce.number().nonnegative().optional(),
});

router.post(
  "/orders/:id/shipments",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const order = await accessibleOrder(req.params.id, req.user!);
    if (req.user!.role === "SUPPLIER" && order.companyId !== requireCompany(req)) throw forbidden();
    if (["CANCELLED", "DELIVERED"].includes(order.status)) throw badRequest(`Order is ${order.status.toLowerCase()}`);
    const body = shipmentSchema.parse(req.body);
    const { weightKg, volumeM3 } = await loadForQuote(order.items.filter((i) => i.materialId).map((i) => ({ materialId: i.materialId!, quantity: i.quantity })));
    let external: { externalId?: string; trackingNumber?: string; trackingUrl?: string | null; cost?: number | null } = {};
    const adapter = adapters[body.carrier];
    if (adapter.configured() && !["SUPPLIER", "OTHER"].includes(body.carrier) && !body.trackingNumber) {
      const branch = body.pickupBranchId ? await prisma.branch.findUnique({ where: { id: body.pickupBranchId } }) : order.company.branches[0];
      external = await adapter.book({ orderReference: order.reference, pickup: { city: branch?.city ?? order.company.city, address: branch?.address, phone: branch?.phone ?? order.company.phone, name: order.company.name }, dropoff: { city: order.deliveryCity ?? "", address: order.deliveryAddress, phone: order.contactPhone ?? order.buyer.phone, name: order.buyer.name }, weightKg, volumeM3, service: body.service, scheduledAt: body.scheduledAt });
    }
    const existingPending = await prisma.shipment.findFirst({ where: { orderId: order.id, status: "PENDING" } });
    const data = { carrier: body.carrier, carrierName: carrierName(body.carrier), service: body.service, trackingNumber: body.trackingNumber ?? external.trackingNumber, trackingUrl: body.trackingUrl ?? external.trackingUrl ?? undefined, externalId: external.externalId, pickupBranchId: body.pickupBranchId, driverName: body.driverName, driverPhone: body.driverPhone, vehicle: body.vehicle, scheduledAt: body.scheduledAt, cost: body.cost ?? external.cost ?? undefined, weightKg, volumeM3, status: "BOOKED" as const };
    const shipment = existingPending
      ? await prisma.shipment.update({ where: { id: existingPending.id }, data: { ...data, events: { create: { status: "BOOKED", description: `Booked with ${carrierName(body.carrier)}` } } }, include: shipmentInclude })
      : await prisma.shipment.create({ data: { ...data, orderId: order.id, events: { create: [{ status: "PENDING", description: "Shipment created" }, { status: "BOOKED", description: `Booked with ${carrierName(body.carrier)}` }] } }, include: shipmentInclude });
    if (order.status === "PENDING") await prisma.order.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
    await recordOrderEvent(order.id, "NOTE", { message: `Shipment booked · ${carrierName(body.carrier)}${shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}`, userId: req.user!.id });
    await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `${order.reference} is being shipped`, body: `${carrierName(body.carrier)}${shipment.scheduledAt ? ` · scheduled ${shipment.scheduledAt.toISOString().slice(0, 10)}` : ""}`, link: `/dashboard/orders/${order.id}` });
    res.status(201).json(serialize(shape(shipment)));
  }),
);

const ORDER_STATUS_FOR: Partial<Record<string, "CONFIRMED" | "IN_TRANSIT" | "DELIVERED">> = { BOOKED: "CONFIRMED", PICKED_UP: "IN_TRANSIT", IN_TRANSIT: "IN_TRANSIT", OUT_FOR_DELIVERY: "IN_TRANSIT", DELIVERED: "DELIVERED" };

async function advanceShipment(shipmentId: string, status: Prisma.ShipmentUpdateInput["status"] extends infer T ? Extract<T, string> : never, description?: string, location?: string, userId?: string) {
  const shipment = await prisma.shipment.update({ where: { id: shipmentId }, data: { status, deliveredAt: status === "DELIVERED" ? new Date() : undefined, events: { create: { status, description, location } } }, include: { ...shipmentInclude, order: true } });
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

router.patch(
  "/shipments/:id",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const shipment = await prisma.shipment.findUnique({ where: { id: req.params.id }, include: { order: true } });
    if (!shipment) throw notFound("Shipment not found");
    if (req.user!.role === "SUPPLIER" && shipment.order.companyId !== requireCompany(req)) throw forbidden();
    const body = shipmentSchema.partial().extend({ status: z.enum(["PENDING", "BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"]).optional(), description: z.string().max(300).optional(), location: z.string().max(120).optional() }).parse(req.body);
    const { status, description, location, ...fields } = body;
    if (Object.keys(fields).length) await prisma.shipment.update({ where: { id: shipment.id }, data: { ...fields, carrierName: fields.carrier ? carrierName(fields.carrier) : undefined } });
    if (status) return res.json(serialize(await advanceShipment(shipment.id, status, description, location, req.user!.id)));
    res.json(serialize(shape(await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: shipmentInclude }))));
  }),
);

/** Carrier tracking webhook: { trackingNumber, status, description?, location? } */
router.post(
  "/shipping/webhooks/:carrier",
  asyncHandler(async (req, res) => {
    const secret = process.env.CARRIER_WEBHOOK_SECRET;
    if (!secret || req.headers["x-webhook-secret"] !== secret) throw unauthorized("Bad webhook secret");
    const carrier = req.params.carrier.toUpperCase() as keyof typeof adapters;
    const adapter = adapters[carrier];
    if (!adapter) throw badRequest("Unknown carrier");
    const body = z.object({ trackingNumber: z.string().min(1), status: z.string().min(1), description: z.string().optional(), location: z.string().optional() }).parse(req.body);
    const shipment = await prisma.shipment.findFirst({ where: { trackingNumber: body.trackingNumber, carrier } });
    if (!shipment) return res.json({ ignored: true });
    await advanceShipment(shipment.id, adapter.mapStatus(body.status), body.description ?? `Carrier update: ${body.status}`, body.location);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- admin rate cards
const rateSchema = z.object({ carrier: z.enum(["SUPPLIER", "TRUKKER", "TRELLA", "SMSA", "ARAMEX", "SPL", "OTHER"]), zone: z.enum(["SAME_CITY", "SAME_REGION", "NATIONAL"]), service: z.string().min(2), baseFee: z.coerce.number().nonnegative(), perKg: z.coerce.number().nonnegative().default(0), includedKg: z.coerce.number().nonnegative().default(0), perM3: z.coerce.number().nonnegative().default(0), minFee: z.coerce.number().nonnegative().default(0), maxWeightKg: z.coerce.number().positive().nullable().optional(), etaDays: z.coerce.number().int().min(0).default(2), enabled: z.boolean().default(true) });

router.get("/admin/shipping/rates", requireAuth("ADMIN"), asyncHandler(async (_req, res) => res.json(serialize(await prisma.shippingRate.findMany({ orderBy: [{ carrier: "asc" }, { zone: "asc" }] })))));
router.post("/admin/shipping/rates", requireAuth("ADMIN"), asyncHandler(async (req, res) => res.status(201).json(serialize(await prisma.shippingRate.create({ data: rateSchema.parse(req.body) })))));
router.patch("/admin/shipping/rates/:id", requireAuth("ADMIN"), asyncHandler(async (req, res) => res.json(serialize(await prisma.shippingRate.update({ where: { id: req.params.id }, data: rateSchema.partial().parse(req.body) })))));
router.delete("/admin/shipping/rates/:id", requireAuth("ADMIN"), asyncHandler(async (req, res) => { await prisma.shippingRate.delete({ where: { id: req.params.id } }); res.json({ ok: true }); }));

export default router;
