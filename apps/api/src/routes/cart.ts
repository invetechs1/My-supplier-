import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { notify } from "../services/notifications";
import { DELIVERY_FEE_SAME_CITY, VAT_RATE, deliveryFee, toOffer } from "../services/shop";
import { round2 } from "../services/pricing";
import { publicCoupon, validateCoupon } from "../services/coupons";
import { assertPurchasable, createDirectOrders, creditInfoFor, groupBySupplier, orderLineInclude, pricingFor, quotesForGroups } from "../services/commerce";
import type { CarrierCode } from "@prisma/client";

const router = Router();
router.use(["/cart", "/checkout"], requireAuth());

const cartInclude = {
  items: { include: { listing: { include: orderLineInclude } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CartInclude;

export type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export async function getOrCreateCart(userId: string): Promise<CartRow> {
  const existing = await prisma.cart.findUnique({ where: { userId }, include: cartInclude });
  if (existing) return existing;
  return prisma.cart.create({ data: { userId }, include: cartInclude });
}

async function creditFor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { company: { select: { creditApproved: true, creditLimit: true, creditTermsDays: true, creditUsed: true } } } });
  return user?.company ? creditInfoFor(user.company) : null;
}

/** Cart quote: tier/sale pricing per line, delivery per supplier, coupon, VAT and the buyer's credit terms. */
export async function shapeCart(cart: CartRow, deliveryCity?: string, carrierBySupplier: Record<string, CarrierCode> = {}, couponCode?: string) {
  const now = new Date();
  const items = cart.items.map((ci) => {
    const offer = toOffer(ci.listing);
    const pricing = pricingFor(ci.listing, ci.quantity, now);
    return {
      id: ci.id, listingId: ci.listingId, quantity: ci.quantity, offer, material: ci.listing.material,
      ...pricing,
      tiers: ci.listing.tiers.map((t) => ({ minQty: t.minQty, price: Number(t.price) })).sort((a, b) => a.minQty - b.minQty),
      lineTotal: round2(pricing.unitPrice * ci.quantity),
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const supplierCities = new Map<string, string>();
  for (const i of items) if (i.offer.companyId) supplierCities.set(i.offer.companyId, i.offer.city);
  const groups = groupBySupplier(cart.items);
  const quotes = await quotesForGroups(groups, deliveryCity, carrierBySupplier);
  const fee = [...supplierCities.entries()].reduce((s, [companyId, c]) => s + (quotes[companyId]?.price ?? (deliveryCity ? deliveryFee(c, deliveryCity) : DELIVERY_FEE_SAME_CITY)), 0);
  const check = await validateCoupon(couponCode, subtotal);
  const discount = check?.ok ? check.discount : 0;
  const vat = round2((subtotal - discount) * VAT_RATE);
  const credit = await creditFor(cart.userId);
  const total = round2(subtotal - discount + vat + fee);
  return {
    id: cart.id, items, subtotal, discount, vat, deliveryFee: round2(fee), total, supplierCount: supplierCities.size, currency: "SAR", quotes,
    coupon: check?.ok ? publicCoupon(check.coupon) : null,
    couponError: check && !check.ok ? check.reason : null,
    savings: round2(items.reduce((s, i) => s + (i.basePrice - i.unitPrice) * i.quantity, 0)),
    credit: credit ? { ...credit, canCoverCart: credit.approved && total <= credit.available } : null,
  };
}

export async function validatedListing(listingId: string, quantity: number) {
  const listing = await prisma.priceListing.findUnique({ where: { id: listingId }, include: orderLineInclude });
  if (!listing) throw notFound("Offer not found");
  assertPurchasable(listing, quantity);
  return listing;
}

router.get("/cart", asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  const q = z.object({ deliveryCity: z.string().optional(), coupon: z.string().max(32).optional() }).parse(req.query);
  res.json(serialize(await shapeCart(cart, q.deliveryCity || undefined, {}, q.coupon || undefined)));
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

const checkoutSchema = z
  .object({
    deliveryCity: z.string().min(2).optional(),
    deliveryAddress: z.string().min(5).optional(),
    contactPhone: z.string().min(7).optional(),
    /** Saved address (address book); fills the three delivery fields above when given. */
    addressId: z.string().optional(),
    poNumber: z.string().trim().max(64).optional(),
    paymentMethod: z.enum(["COD", "BANK_TRANSFER", "CARD", "CREDIT"]),
    notes: z.string().optional(),
    carrierBySupplier: z.record(z.enum(["SUPPLIER", "TRUKKER", "TRELLA", "SMSA", "ARAMEX", "SPL", "OTHER"])).optional(),
    couponCode: z.string().max(32).optional(),
  })
  .refine((b) => b.addressId || (b.deliveryCity && b.deliveryAddress && b.contactPhone), { message: "Provide addressId or deliveryCity, deliveryAddress and contactPhone" });

/** Formats a saved address as a single delivery line. */
export function formatAddress(a: { street: string; building?: string | null; district?: string | null; city: string; recipient?: string; notes?: string | null }) {
  return [a.recipient, [a.building, a.street].filter(Boolean).join(" "), a.district, a.city, a.notes].filter(Boolean).join(", ");
}

/** Creates one DIRECT order per supplier from the cart (marketplace-style split checkout). */
router.post("/checkout", asyncHandler(async (req, res) => {
  const body = checkoutSchema.parse(req.body);
  const userId = req.user!.id;
  const cart = await getOrCreateCart(userId);
  if (!cart.items.length) throw badRequest("Your cart is empty");

  // Re-validate every line against live offers.
  for (const item of cart.items) await validatedListing(item.listingId, item.quantity);

  let { deliveryCity, deliveryAddress, contactPhone } = body;
  if (body.addressId) {
    const address = await prisma.address.findFirst({ where: { id: body.addressId, userId } });
    if (!address) throw notFound("Address not found");
    deliveryCity = address.city;
    deliveryAddress = formatAddress(address);
    contactPhone = address.phone;
  }

  // Claim the cart lines first (only one concurrent submit can delete them), then create the orders from the
  // captured snapshot; if order creation fails the lines are put back so the buyer can retry.
  const claimed = await prisma.cartItem.deleteMany({ where: { cartId: cart.id, id: { in: cart.items.map((i) => i.id) } } });
  if (claimed.count !== cart.items.length) throw badRequest("Your cart changed while checking out. Please review it and try again.");
  let result;
  try {
    result = await createDirectOrders({
      userId, groups: groupBySupplier(cart.items),
      deliveryCity: deliveryCity!, deliveryAddress: deliveryAddress!, contactPhone: contactPhone!,
      paymentMethod: body.paymentMethod, notes: body.notes, addressId: body.addressId, poNumber: body.poNumber || undefined,
      couponCode: body.couponCode, carrierBySupplier: body.carrierBySupplier,
    });
  } catch (err) {
    await prisma.cartItem.createMany({ data: cart.items.map((i) => ({ cartId: cart.id, listingId: i.listingId, quantity: i.quantity })), skipDuplicates: true }).catch(() => undefined);
    throw err;
  }
  const { orders, total } = result;
  await notify({
    userIds: [userId], type: "ORDER_UPDATE", title: `Order${orders.length > 1 ? "s" : ""} placed`,
    body: `${orders.length} order(s) sent to ${orders.length} supplier(s).${body.paymentMethod === "CREDIT" ? " Payment is due on your credit terms." : ""}`, link: `/dashboard/orders`,
  });
  res.status(201).json(serialize({ orders, total }));
}));

export default router;
