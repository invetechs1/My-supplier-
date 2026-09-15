import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { forbidden, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { ensureEInvoice, reportToZatca } from "../services/einvoice";

const router = Router();

async function guard(orderId: string, user: NonNullable<import("express").Request["user"]>) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order not found");
  if (!(user.role === "ADMIN" || order.buyerId === user.id || (user.companyId && order.companyId === user.companyId))) throw forbidden();
  return order;
}

router.get(
  "/orders/:id/einvoice",
  requireAuth(),
  asyncHandler(async (req, res) => {
    await guard(req.params.id, req.user!);
    const { xml: _xml, ...rec } = await ensureEInvoice(req.params.id);
    res.json(serialize(rec));
  }),
);

router.get(
  "/orders/:id/einvoice.xml",
  requireAuth(),
  asyncHandler(async (req, res) => {
    await guard(req.params.id, req.user!);
    const rec = await ensureEInvoice(req.params.id);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${rec.invoiceNumber}.xml"`);
    res.send(rec.xml);
  }),
);

router.post(
  "/admin/einvoices/:id/report",
  requireAuth("ADMIN"),
  asyncHandler(async (req, res) => {
    const { xml: _xml, ...rec } = await reportToZatca(req.params.id);
    res.json(serialize(rec));
  }),
);

export default router;
