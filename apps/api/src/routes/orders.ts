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

const router = Router();

const orderInclude = {
  company: true,
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
    const where = scope(req);
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

export default router;
