import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { companyUserIds, notify } from "../services/notifications";
import { applyStockMovement, recordOrderEvent, requireCompanyRole } from "../services/portal";

const router = Router();

const orderInclude = {
  company: true,
  items: { include: { material: true } },
  review: { include: { buyer: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } } },
  rfq: { include: { items: { include: { material: true } } } },
  bid: { include: { items: true } },
  buyer: { select: { id: true, name: true, email: true, phone: true, company: true } },
} satisfies Prisma.OrderInclude;

function scope(req: Request): Prisma.OrderWhereInput {
  const user = req.user!;
  if (user.role === "ADMIN") return {};
  if (user.role === "SUPPLIER") return { companyId: user.companyId ?? "__none__" };
  return { buyerId: user.id };
}

router.get(
  "/orders",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const f = z.object({ status: z.enum(["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"]).optional(), paymentStatus: z.enum(["UNPAID", "PAID", "REFUNDED"]).optional(), type: z.enum(["RFQ", "DIRECT"]).optional() }).parse(req.query);
    const where: Prisma.OrderWhereInput = { ...scope(req), ...(f.status ? { status: f.status } : {}), ...(f.paymentStatus ? { paymentStatus: f.paymentStatus } : {}), ...(f.type ? { type: f.type } : {}) };
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    res.json(paged(serialize(orders), page, pageSize, total));
  }),
);

router.get(
  "/orders/:id",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, ...scope(req) }, include: orderInclude });
    if (!order) throw notFound("Order not found");
    res.json(serialize(order));
  }),
);

const transitions: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

router.patch(
  "/orders/:id/status",
  requireAuth(),
  requireCompanyRole("OWNER", "MANAGER", "SALES", "WAREHOUSE"),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"]) }).parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: req.params.id, ...scope(req) } });
    if (!order) throw notFound("Order not found");
    const user = req.user!;
    if (user.role === "BUYER" && !(status === "CANCELLED" && order.status === "PENDING")) {
      throw forbidden("Buyers can only cancel pending orders");
    }
    if (!transitions[order.status].includes(status)) throw badRequest(`Cannot move order from ${order.status} to ${status}`);
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status }, include: orderInclude });
    await recordOrderEvent(order.id, "STATUS", { status, userId: user.id });
    if (status === "CANCELLED") {
      // Return reserved stock to the shelf.
      for (const item of updated.items) if (item.listingId) await applyStockMovement(item.listingId, "RELEASE", item.quantity, { reason: `Order ${order.reference} cancelled`, orderId: order.id, userId: user.id }).catch(() => undefined);
    }
    const recipients = user.role === "BUYER" ? await companyUserIds([order.companyId]) : [order.buyerId];
    await notify({
      userIds: recipients,
      type: "ORDER_UPDATE",
      title: `Order ${order.reference} is now ${status.replace("_", " ").toLowerCase()}`,
      body: `Updated by ${user.name}.`,
      link: user.role === "BUYER" ? `/supplier/orders/${order.id}` : `/dashboard/orders/${order.id}`,
    });
    res.json(serialize(updated));
  }),
);

/**
 * Payment confirmation rules: card payments are confirmed by the gateway only; bank transfers land in
 * the platform account and are confirmed by the admin; suppliers may only confirm cash collected on
 * delivery (COD) for delivered orders. Refunds go through /payments/:orderId/refund.
 */
router.patch(
  "/orders/:id/payment",
  requireAuth("SUPPLIER", "ADMIN"),
  requireCompanyRole("OWNER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const { paymentStatus } = z.object({ paymentStatus: z.enum(["UNPAID", "PAID"]) }).parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: req.params.id, ...scope(req) } });
    if (!order) throw notFound("Order not found");
    if (order.paymentStatus === "REFUNDED") throw badRequest("Refunded orders cannot be changed");
    if (req.user!.role !== "ADMIN") {
      if (order.paymentMethod !== "COD") throw forbidden("Only cash-on-delivery payments can be confirmed by the supplier; bank transfers are confirmed by MySupplier");
      if (paymentStatus === "PAID" && order.status !== "DELIVERED") throw badRequest("Confirm cash collection after the order is delivered");
    }
    const updated = await prisma.order.update({ where: { id: order.id }, data: { paymentStatus }, include: orderInclude });
    await recordOrderEvent(order.id, "PAYMENT", { message: `Payment ${paymentStatus.toLowerCase()}`, userId: req.user!.id });
    await notify({ userIds: [order.buyerId], type: "ORDER_UPDATE", title: `Order ${order.reference} marked ${paymentStatus.toLowerCase()}`, body: `Updated by ${req.user!.name}.`, link: `/dashboard/orders/${order.id}` });
    res.json(serialize(updated));
  }),
);

export default router;
