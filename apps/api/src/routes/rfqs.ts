import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { nextReference } from "../lib/reference";
import { companyUserIds, notify } from "../services/notifications";
import { bidTotal, rankBids } from "../services/pricing";
import { recordOrderEvent } from "../services/portal";

const router = Router();

const rfqInclude = {
  items: { include: { material: { include: { category: true } } } },
  buyer: { select: { id: true, name: true, company: true } },
  _count: { select: { bids: { where: { status: { in: ["SUBMITTED", "ACCEPTED"] } } } } },
} satisfies Prisma.RfqInclude;

const bidInclude = {
  company: true,
  items: true,
} satisfies Prisma.BidInclude;

type RfqRow = Prisma.RfqGetPayload<{ include: typeof rfqInclude }> & { bids?: unknown[]; lowestBid?: number | null; myBidId?: string | null };

function shapeRfq(r: RfqRow) {
  const { _count, ...rest } = r;
  return { ...rest, bidCount: _count.bids };
}

async function lowestBids(rfqIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!rfqIds.length) return map;
  const rows = await prisma.bid.groupBy({
    by: ["rfqId"],
    where: { rfqId: { in: rfqIds }, status: { in: ["SUBMITTED", "ACCEPTED"] } },
    _min: { totalPrice: true },
  });
  for (const row of rows) if (row._min.totalPrice) map.set(row.rfqId, Number(row._min.totalPrice));
  return map;
}

// ---------------------------------------------------------------- Buyer: RFQs
const createRfqSchema = z.object({
  title: z.string().min(3),
  deliveryCity: z.string().min(2),
  deliveryAddress: z.string().optional(),
  deliveryDate: z.coerce.date().optional(),
  closesAt: z.coerce.date(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        materialId: z.string().optional(),
        description: z.string().min(1),
        quantity: z.coerce.number().positive(),
        unit: z.string().min(1),
        notes: z.string().optional(),
      }),
    )
    .min(1, "Add at least one item"),
});

router.post(
  "/rfqs",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createRfqSchema.parse(req.body);
    if (body.closesAt.getTime() <= Date.now()) throw badRequest("closesAt must be in the future");
    const reference = await nextReference("RFQ");
    const rfq = await prisma.rfq.create({
      data: {
        reference,
        buyerId: req.user!.id,
        title: body.title,
        deliveryCity: body.deliveryCity,
        deliveryAddress: body.deliveryAddress,
        deliveryDate: body.deliveryDate,
        closesAt: body.closesAt,
        notes: body.notes,
        items: { create: body.items },
      },
      include: rfqInclude,
    });

    // Notify suppliers in the delivery city (and those who list any requested material).
    const materialIds = body.items.map((i) => i.materialId).filter((x): x is string => Boolean(x));
    const suppliers = await prisma.company.findMany({
      where: {
        type: "SUPPLIER",
        OR: [{ city: body.deliveryCity }, ...(materialIds.length ? [{ listings: { some: { materialId: { in: materialIds } } } }] : [])],
      },
      select: { id: true },
    });
    const userIds = await companyUserIds(suppliers.map((s) => s.id));
    await notify({
      userIds,
      type: "NEW_RFQ",
      title: `New RFQ in ${body.deliveryCity}: ${body.title}`,
      body: `${body.items.length} item(s). Bidding closes ${body.closesAt.toISOString().slice(0, 10)}.`,
      link: `/supplier/marketplace/${rfq.id}`,
    });
    res.status(201).json(serialize({ ...shapeRfq(rfq), bidCount: 0, lowestBid: null }));
  }),
);

router.get(
  "/rfqs",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["OPEN", "CLOSED", "AWARDED", "CANCELLED"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.RfqWhereInput = {
      ...(req.user!.role === "ADMIN" ? {} : { buyerId: req.user!.id }),
      ...(status ? { status } : {}),
    };
    const [total, rfqs] = await Promise.all([
      prisma.rfq.count({ where }),
      prisma.rfq.findMany({ where, include: rfqInclude, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    const lows = await lowestBids(rfqs.map((r) => r.id));
    res.json(paged(serialize(rfqs.map((r) => ({ ...shapeRfq(r), lowestBid: lows.get(r.id) ?? null }))), page, pageSize, total));
  }),
);

router.get(
  "/rfqs/:id",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const rfq = await prisma.rfq.findUnique({ where: { id: req.params.id }, include: rfqInclude });
    if (!rfq) throw notFound("RFQ not found");
    const user = req.user!;
    const isOwner = rfq.buyerId === user.id || user.role === "ADMIN";
    let bids: unknown[] = [];
    let myBidId: string | null = null;
    if (isOwner) {
      const rows = await prisma.bid.findMany({ where: { rfqId: rfq.id }, include: bidInclude });
      bids = rankBids(rows.map((b) => ({ ...b, totalPrice: Number(b.totalPrice) })));
    } else if (user.role === "SUPPLIER" && user.companyId) {
      const mine = await prisma.bid.findUnique({
        where: { rfqId_companyId: { rfqId: rfq.id, companyId: user.companyId } },
        include: bidInclude,
      });
      if (mine) {
        bids = [mine];
        myBidId = mine.id;
      }
    } else {
      throw forbidden();
    }
    const lows = await lowestBids([rfq.id]);
    res.json(serialize({ ...shapeRfq(rfq), bids, myBidId, lowestBid: lows.get(rfq.id) ?? null }));
  }),
);

async function ownedRfq(id: string, userId: string, role: string) {
  const rfq = await prisma.rfq.findUnique({ where: { id } });
  if (!rfq) throw notFound("RFQ not found");
  if (rfq.buyerId !== userId && role !== "ADMIN") throw forbidden();
  return rfq;
}

router.post(
  "/rfqs/:id/close",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const rfq = await ownedRfq(req.params.id, req.user!.id, req.user!.role);
    if (rfq.status !== "OPEN") throw badRequest("Only open RFQs can be closed");
    const updated = await prisma.rfq.update({ where: { id: rfq.id }, data: { status: "CLOSED" }, include: rfqInclude });
    res.json(serialize(shapeRfq(updated)));
  }),
);

router.post(
  "/rfqs/:id/cancel",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const rfq = await ownedRfq(req.params.id, req.user!.id, req.user!.role);
    if (rfq.status === "AWARDED") throw badRequest("Awarded RFQs cannot be cancelled");
    const updated = await prisma.rfq.update({ where: { id: rfq.id }, data: { status: "CANCELLED" }, include: rfqInclude });
    await prisma.bid.updateMany({ where: { rfqId: rfq.id, status: "SUBMITTED" }, data: { status: "REJECTED" } });
    res.json(serialize(shapeRfq(updated)));
  }),
);

// ------------------------------------------------------- Supplier: marketplace
router.get(
  "/marketplace/rfqs",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { city, q } = z.object({ city: z.string().optional(), q: z.string().optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.RfqWhereInput = {
      status: "OPEN",
      closesAt: { gt: new Date() },
      ...(city ? { deliveryCity: city } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
              { items: { some: { description: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [total, rfqs] = await Promise.all([
      prisma.rfq.count({ where }),
      prisma.rfq.findMany({ where, include: rfqInclude, orderBy: { closesAt: "asc" }, skip, take }),
    ]);
    const companyId = req.user!.companyId;
    const myBids = companyId
      ? await prisma.bid.findMany({ where: { companyId, rfqId: { in: rfqs.map((r) => r.id) } }, select: { id: true, rfqId: true } })
      : [];
    const lows = await lowestBids(rfqs.map((r) => r.id));
    const data = rfqs.map((r) => ({
      ...shapeRfq(r),
      lowestBid: lows.get(r.id) ?? null,
      myBidId: myBids.find((b) => b.rfqId === r.id)?.id ?? null,
    }));
    res.json(paged(serialize(data), page, pageSize, total));
  }),
);

const createBidSchema = z.object({
  validUntil: z.coerce.date(),
  deliveryDays: z.coerce.number().int().min(0).default(7),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        rfqItemId: z.string(),
        unitPrice: z.coerce.number().nonnegative(),
        quantity: z.coerce.number().positive().optional(),
        leadTimeDays: z.coerce.number().int().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

router.post(
  "/rfqs/:id/bids",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const body = createBidSchema.parse(req.body);
    const rfq = await prisma.rfq.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!rfq) throw notFound("RFQ not found");
    if (rfq.status !== "OPEN" || rfq.closesAt.getTime() < Date.now()) throw badRequest("This RFQ is no longer accepting bids");

    const itemsById = new Map(rfq.items.map((i) => [i.id, i]));
    const items = body.items.map((i) => {
      const rfqItem = itemsById.get(i.rfqItemId);
      if (!rfqItem) throw badRequest(`Unknown RFQ item ${i.rfqItemId}`);
      return {
        rfqItemId: i.rfqItemId,
        unitPrice: i.unitPrice,
        quantity: i.quantity ?? rfqItem.quantity,
        leadTimeDays: i.leadTimeDays ?? body.deliveryDays,
        notes: i.notes,
      };
    });
    const totalPrice = bidTotal(items);

    const existing = await prisma.bid.findUnique({ where: { rfqId_companyId: { rfqId: rfq.id, companyId } } });
    const bid = existing
      ? await prisma.bid.update({
          where: { id: existing.id },
          data: {
            totalPrice, validUntil: body.validUntil, deliveryDays: body.deliveryDays, notes: body.notes, status: "SUBMITTED",
            items: { deleteMany: {}, create: items },
          },
          include: bidInclude,
        })
      : await prisma.bid.create({
          data: {
            rfqId: rfq.id, companyId, totalPrice, validUntil: body.validUntil, deliveryDays: body.deliveryDays, notes: body.notes,
            items: { create: items },
          },
          include: bidInclude,
        });

    await notify({
      userIds: [rfq.buyerId],
      type: "NEW_BID",
      title: `${existing ? "Updated" : "New"} bid on ${rfq.reference}`,
      body: `${bid.company.name} quoted SAR ${totalPrice.toLocaleString("en-US")} (delivery in ${body.deliveryDays} days).`,
      link: `/dashboard/rfqs/${rfq.id}`,
    });
    res.status(existing ? 200 : 201).json(serialize(bid));
  }),
);

router.get(
  "/bids",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(["SUBMITTED", "WITHDRAWN", "ACCEPTED", "REJECTED"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.BidWhereInput = {
      ...(req.user!.role === "ADMIN" ? {} : { companyId: requireCompany(req) }),
      ...(status ? { status } : {}),
    };
    const [total, bids] = await Promise.all([
      prisma.bid.count({ where }),
      prisma.bid.findMany({
        where,
        include: { ...bidInclude, rfq: { include: rfqInclude } },
        orderBy: { createdAt: "desc" },
        skip, take,
      }),
    ]);
    res.json(paged(serialize(bids.map((b) => ({ ...b, rfq: shapeRfq(b.rfq) }))), page, pageSize, total));
  }),
);

router.post(
  "/bids/:id/withdraw",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const companyId = requireCompany(req);
    const bid = await prisma.bid.findUnique({ where: { id: req.params.id } });
    if (!bid || bid.companyId !== companyId) throw notFound("Bid not found");
    if (bid.status !== "SUBMITTED") throw badRequest("Only submitted bids can be withdrawn");
    const updated = await prisma.bid.update({ where: { id: bid.id }, data: { status: "WITHDRAWN" }, include: bidInclude });
    res.json(serialize(updated));
  }),
);

router.post(
  "/bids/:id/accept",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const bid = await prisma.bid.findUnique({ where: { id: req.params.id }, include: { rfq: true, company: true } });
    if (!bid) throw notFound("Bid not found");
    if (bid.rfq.buyerId !== req.user!.id && req.user!.role !== "ADMIN") throw forbidden();
    if (bid.status !== "SUBMITTED") throw badRequest("Bid is not active");
    if (bid.rfq.status === "AWARDED" || bid.rfq.status === "CANCELLED") throw badRequest("RFQ already finalised");
    if (bid.validUntil.getTime() < Date.now()) throw badRequest("Bid has expired; ask the supplier to re-submit");

    const reference = await nextReference("ORD");
    const [order, rfq] = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          reference, rfqId: bid.rfqId, bidId: bid.id, buyerId: bid.rfq.buyerId, companyId: bid.companyId,
          total: bid.totalPrice, currency: bid.currency,
        },
        include: { company: true },
      });
      await tx.bid.update({ where: { id: bid.id }, data: { status: "ACCEPTED" } });
      await tx.bid.updateMany({ where: { rfqId: bid.rfqId, id: { not: bid.id }, status: "SUBMITTED" }, data: { status: "REJECTED" } });
      const rfq = await tx.rfq.update({
        where: { id: bid.rfqId },
        data: { status: "AWARDED", awardedBidId: bid.id },
        include: rfqInclude,
      });
      return [order, rfq];
    });

    await recordOrderEvent(order.id, "CREATED", { status: "PENDING", message: `Created from ${bid.rfq.reference} (bid accepted)`, userId: req.user!.id });
    const winnerUsers = await companyUserIds([bid.companyId]);
    await notify({
      userIds: winnerUsers,
      type: "BID_ACCEPTED",
      title: `You won ${bid.rfq.reference}`,
      body: `Order ${reference} created for SAR ${Number(bid.totalPrice).toLocaleString("en-US")}. Please confirm it.`,
      link: `/supplier/orders/${order.id}`,
    });
    const losers = await prisma.bid.findMany({ where: { rfqId: bid.rfqId, status: "REJECTED" }, select: { companyId: true } });
    const loserUsers = await companyUserIds(losers.map((l) => l.companyId));
    await notify({
      userIds: loserUsers,
      type: "BID_REJECTED",
      title: `${bid.rfq.reference} was awarded to another supplier`,
      body: "Thank you for bidding. Keep your price list updated to win more RFQs.",
      link: `/supplier/bids`,
    });
    res.json(serialize({ order, rfq: shapeRfq(rfq) }));
  }),
);

router.post(
  "/bids/:id/reject",
  requireAuth("BUYER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const bid = await prisma.bid.findUnique({ where: { id: req.params.id }, include: { rfq: true } });
    if (!bid) throw notFound("Bid not found");
    if (bid.rfq.buyerId !== req.user!.id && req.user!.role !== "ADMIN") throw forbidden();
    if (bid.status !== "SUBMITTED") throw badRequest("Bid is not active");
    const updated = await prisma.bid.update({ where: { id: bid.id }, data: { status: "REJECTED" }, include: bidInclude });
    const users = await companyUserIds([bid.companyId]);
    await notify({ userIds: users, type: "BID_REJECTED", title: `Bid on ${bid.rfq.reference} declined`, body: "The buyer declined your bid.", link: "/supplier/bids" });
    res.json(serialize(updated));
  }),
);

export default router;
