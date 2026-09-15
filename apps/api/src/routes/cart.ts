import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { nextReference } from "../lib/reference";
import { companyUserIds, notify } from "../services/notifications";
import { DELIVERY_FEE_SAME_CITY, VAT_RATE, deliveryFee, isPurchasable, toOffer } from "../services/shop";
import { round2 } from "../services/pricing";
import { applyStockMovement, recordOrderEvent } from "../services/portal";
import { carrierName, quoteForSupplier } from "../services/shipping";
import type { CarrierCode } from "@prisma/client";

const router = Router();
router.use(["/cart", "/checkout"], requireAuth());

const cartInclude = {
  items: { include: { listing: { include: { company: true, material: { include: { category: true } } } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

async function getOrCreateCart(userId: string): Promise<CartRow> {
  const existing = await prisma.cart.findUnique({ where: { userId }, include: cartInclude });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId }, include: cartInclude });
}

/** Cheapest delivery quote per supplier for the cart contents (null when quoting is impossible). */
async function quotesFor(cart: CartRow, deliveryCity?: string, carrierBySupplier: Record<string, CarrierCode> = {}) {
  const out: Record<string, Awaited<ReturnType<typeof quoteForSupplier>>["quotes"][number] | null> = {};
  if (!deliveryCity) return out;
  const bySupplier = new Map<string, { materialId: string; quantity: number }[]>();
  for (const ci of cart.items) if (ci.listing.companyId) bySupplier.set(ci.listing.companyId, [...(bySupplier.get(ci.listing.companyId) ?? []), { materialId: ci.listing.materialId, quantity: ci.quantity }]);
  for (const [companyId, items] of bySupplier) {
    const { quotes } = await quoteForSupplier(companyId, items, deliveryCity);
    const wanted = carrierBySupplier[companyId];
    out[companyId] = (wanted ? quotes.find((q) => q.carrier === wanted) : undefined) ?? quotes[0] ?? null;
  }
  return out;
}

async function shapeCart(cart: CartRow, deliveryCity?: string, carrierBySupplier: Record<string, CarrierCode> = {}) {
  const items = cart.items.map((ci) => {
    const offer = toOffer(ci.listing);
    return { id: ci.id, listingId: ci.listingId, quantity: ci.quantity, offer, material: ci.listing.material, lineTotal: round2(offer.price * ci.quantity) };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const supplierCities = new Map<string, string>();
  for (const i of items) if (i.offer.companyId) supplierCities.set(i.offer.companyId, i.offer.city);
  const quotes = await quotesFor(cart, deliveryCity, carrierBySupplier);
  const fee = [...supplierCities.entries()].reduce((s, [companyId, c]) => s + (quotes[companyId]?.price ?? (deliveryCity ? deliveryFee(c, deliveryCity) : DELIVERY_FEE_SAME_CITY)), 0);
  const vat = round2(subtotal * VAT_RATE);
  return { id: cart.id, items, subtotal, vat, deliveryFee: round2(fee), total: round2(subtotal + vat + fee), supplierCount: supplierCities.size, currency: "SAR", quotes };
}

async function validatedListing(listingId: string, quantity: number) {
  const listing = await prisma.priceListing.findUnique({ where: { id: listingId }, include: { company: true } });
  if (!listing) throw notFound("Offer not found");
  const offer = toOffer(listing);
  if (!isPurchasable(offer)) throw badRequest("This offer is a reference price or out of stock and cannot be purchased. Request a quote instead.");
  if (quantity < offer.minQty) throw badRequest(`Minimum order quantity for this offer is ${offer.minQty}`);
  if (offer.stock !== null && quantity > offer.stock) throw badRequest(`Only ${offer.stock} available from this supplier`);
  return listing;
}

router.get("/cart", asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  res.json(serialize(await shapeCart(cart, typeof req.query.deliveryCity === "string" ? req.query.deliveryCity : undefined)));
}));

router.post("/cart/items", asyncHandler(async (req, res) => {
  const { listingId, quantity } = z.object({ listingId: z.string(), quantity: z.coerce.number().finite().positive().max(1e6).default(1) }).parse(req.body);
  const cart = await getOrCreateCart(req.user!.id);
  const existing = cart.items.find((i) => i.listingId === listingId);
  const newQty = (existing?.quantity ?? 0) + quantity;
  await validatedListing(listingId, newQty);
  if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
  else await prisma.cartItem.create({ data: { cartId: cart.id, listingId, quantity } });
  res.status(201).json(serialize(await shapeCart(await getOrCreateCart(req.user!.id))));
}));

router.patch("/cart/items/:id", asyncHandler(async (req, res) => {
  const { quantity } = z.object({ quantity: z.coerce.number().finite().positive().max(1e6) }).parse(req.body);
  const cart = await getOrCreateCart(req.user!.id);
  const item = cart.items.find((i) => i.id === req.params.id);
  if (!item) throw notFound("Cart item not found");
  await validatedListing(item.listingId, quantity);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  res.json(serialize(await shapeCart(await getOrCreateCart(req.user!.id))));
}));

router.delete("/cart/items/:id", asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  if (!cart.items.some((i) => i.id === req.params.id)) throw notFound("Cart item not found");
  await prisma.cartItem.delete({ where: { id: req.params.id } });
  res.json(serialize(await shapeCart(await getOrCreateCart(req.user!.id))));
}));

router.delete("/cart", asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  res.json(serialize(await shapeCart(await getOrCreateCart(req.user!.id))));
}));

const checkoutSchema = z.object({
  deliveryCity: z.string().min(2),
  deliveryAddress: z.string().min(5),
  contactPhone: z.string().min(7),
  paymentMethod: z.enum(["COD", "BANK_TRANSFER", "CARD"]),
  notes: z.string().optional(),
  carrierBySupplier: z.record(z.enum(["SUPPLIER", "TRUKKER", "TRELLA", "SMSA", "ARAMEX", "SPL", "OTHER"])).optional(),
});

const orderInclude = { company: true, items: { include: { material: true } } } satisfies Prisma.OrderInclude;

/** Creates one DIRECT order per supplier from the cart (marketplace-style split checkout). */
router.post("/checkout", asyncHandler(async (req, res) => {
  const body = checkoutSchema.parse(req.body);
  const userId = req.user!.id;
  const cart = await getOrCreateCart(userId);
  if (!cart.items.length) throw badRequest("Your cart is empty");

  // Re-validate every line against live offers.
  for (const item of cart.items) await validatedListing(item.listingId, item.quantity);

  const bySupplier = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    const key = item.listing.companyId!;
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), item]);
  }

  const quotes = await quotesFor(cart, body.deliveryCity, body.carrierBySupplier ?? {});
  const orders = [];
  for (const [companyId, items] of bySupplier) {
    const reference = await nextReference("ORD");
    const subtotal = round2(items.reduce((s, i) => s + Number(i.listing.price) * i.quantity, 0));
    const vat = round2(subtotal * VAT_RATE);
    const quote = quotes[companyId] ?? null;
    const fee = quote?.price ?? deliveryFee(items[0].listing.city, body.deliveryCity);
    const total = round2(subtotal + vat + fee);
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          reference, type: "DIRECT", buyerId: userId, companyId, subtotal, vat, deliveryFee: fee, total,
          paymentMethod: body.paymentMethod, deliveryCity: body.deliveryCity, deliveryAddress: body.deliveryAddress,
          contactPhone: body.contactPhone, notes: body.notes,
          items: {
            create: items.map((i) => ({
              materialId: i.listing.materialId, listingId: i.listingId, name: i.listing.material.name, unit: i.listing.material.unit,
              unitPrice: i.listing.price, quantity: i.quantity, lineTotal: round2(Number(i.listing.price) * i.quantity),
            })),
          },
        },
        include: orderInclude,
      });
      for (const i of items) {
        await applyStockMovement(i.listingId, "OUT", i.quantity, { reason: `Order ${reference}`, orderId: created.id, userId, tx });
        await tx.material.update({ where: { id: i.listing.materialId }, data: { popularity: { increment: 5 } } });
      }
      await tx.orderEvent.create({ data: { orderId: created.id, type: "CREATED", status: "PENDING", message: `Order placed · ${body.paymentMethod.replace("_", " ").toLowerCase()}`, userId } });
      await tx.shipment.create({ data: { orderId: created.id, carrier: quote?.carrier ?? "SUPPLIER", carrierName: carrierName(quote?.carrier ?? "SUPPLIER"), service: quote?.service, cost: fee, weightKg: quote?.weightKg, volumeM3: quote?.volumeM3, status: "PENDING", events: { create: { status: "PENDING", description: quote ? `${quote.carrierName} · ${quote.service} · ETA ${quote.etaDays} day(s)` : "Awaiting supplier booking" } } } });
      return created;
    });
    orders.push(order);
    await notify({
      userIds: await companyUserIds([companyId]),
      type: "ORDER_UPDATE",
      title: `New order ${reference}`,
      body: `${items.length} item(s), SAR ${total.toLocaleString("en-US")} incl. VAT, deliver to ${body.deliveryCity}. Please confirm.`,
      link: `/supplier/orders/${order.id}`,
    });
  }
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await notify({
    userIds: [userId], type: "ORDER_UPDATE", title: `Order${orders.length > 1 ? "s" : ""} placed`,
    body: `${orders.length} order(s) sent to ${orders.length} supplier(s).`, link: `/dashboard/orders`,
  });
  res.status(201).json(serialize({ orders, total: round2(orders.reduce((s, o) => s + Number(o.total), 0)) }));
}));

export default router;
