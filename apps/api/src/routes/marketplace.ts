/**
 * Marketplace discovery & engagement routes: category attributes (spec definitions), product reviews,
 * product Q&A, wishlists / project lists, price alerts, recently viewed and recommendations.
 * Search, suggestions, brands and the product page itself live in routes/shop.ts.
 */
import { Router } from "express";
import { UPLOAD_BASE_URL } from "../lib/uploads";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { audit } from "../lib/audit";
import { notify } from "../services/notifications";
import { activeListingWhere } from "../services/catalog";
import { emptyEnrichment, enrichMaterials, isPurchasable, offerInclude, productInclude, toOffer, withEnrichment } from "../services/shop";
import { productReviewSummary, recentlyViewedProducts, recommendations, recomputeMaterialRating } from "../services/marketplace";

const router = Router();
/** Per-user (falls back to IP) hourly limit for user-generated content, against spam and scripted abuse. */
const perUserLimiter = (limit: number) => rateLimit({ windowMs: 60 * 60_000, limit, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `ugc:${req.user?.id ?? req.ip}`, message: { error: "Too many requests, please slow down and try again later" } });
const admin = requireAuth("ADMIN");
const authed = requireAuth();
const cityOf = (req: { query: Record<string, unknown> }) => (typeof req.query.city === "string" ? req.query.city : undefined);

// ------------------------------------------------------------------ category attributes
const attributeSchema = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_\-.]+$/, "key may contain letters, digits, _ - ."),
  label: z.string().trim().min(1).max(80),
  labelAr: z.string().trim().min(1).max(80),
  type: z.enum(["TEXT", "NUMBER", "SELECT", "BOOLEAN"]).default("TEXT"),
  unit: z.string().trim().max(20).optional().nullable(),
  options: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  filterable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

router.get(
  "/categories/:slug/attributes",
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({ where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }] }, select: { id: true, parentId: true } });
    if (!category) throw notFound("Category not found");
    const rows = await prisma.categoryAttribute.findMany({ where: { categoryId: { in: category.parentId ? [category.id, category.parentId] : [category.id] } }, orderBy: [{ sortOrder: "asc" }, { key: "asc" }] });
    const seen = new Set<string>();
    res.json(rows.filter((r) => (r.categoryId !== category.id && seen.has(r.key) ? false : (seen.add(r.key), true))));
  }),
);

router.get("/admin/categories/:id/attributes", admin, asyncHandler(async (req, res) => {
  res.json(await prisma.categoryAttribute.findMany({ where: { categoryId: req.params.id }, orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }));
}));

router.post("/admin/categories/:id/attributes", admin, asyncHandler(async (req, res) => {
  const body = attributeSchema.parse(req.body);
  const category = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!category) throw notFound("Category not found");
  if (body.type === "SELECT" && !body.options.length) throw badRequest("SELECT attributes need at least one option");
  const existing = await prisma.categoryAttribute.findUnique({ where: { categoryId_key: { categoryId: category.id, key: body.key } } });
  if (existing) throw conflict(`Attribute "${body.key}" already exists for this category`);
  const attr = await prisma.categoryAttribute.create({ data: { ...body, categoryId: category.id } });
  await audit(req, "category_attribute.create", "CategoryAttribute", attr.id, { categoryId: category.id, key: attr.key, type: attr.type });
  res.status(201).json(attr);
}));

router.patch("/admin/attributes/:id", admin, asyncHandler(async (req, res) => {
  const body = attributeSchema.partial().parse(req.body);
  const current = await prisma.categoryAttribute.findUnique({ where: { id: req.params.id } });
  if (!current) throw notFound("Attribute not found");
  if ((body.type ?? current.type) === "SELECT" && !(body.options ?? current.options).length) throw badRequest("SELECT attributes need at least one option");
  const attr = await prisma.categoryAttribute.update({ where: { id: current.id }, data: body });
  await audit(req, "category_attribute.update", "CategoryAttribute", attr.id, body as Record<string, unknown>);
  res.json(attr);
}));

router.delete("/admin/attributes/:id", admin, asyncHandler(async (req, res) => {
  const current = await prisma.categoryAttribute.findUnique({ where: { id: req.params.id } });
  if (!current) throw notFound("Attribute not found");
  await prisma.categoryAttribute.delete({ where: { id: current.id } });
  await audit(req, "category_attribute.delete", "CategoryAttribute", current.id, { categoryId: current.categoryId, key: current.key });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ product reviews
const reviewAuthor = { user: { select: { id: true, name: true, company: { select: { name: true } } } } } satisfies Prisma.ProductReviewInclude;
const shapeReview = <T extends { user: { id: string; name: string; company: { name: string } | null } }>(r: T) => ({ ...r, user: { id: r.user.id, name: r.user.name, companyName: r.user.company?.name ?? null } });

const reviewBody = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().nullable(),
  body: z.string().trim().max(4000).optional().nullable(),
  images: z.array(z.string().url().max(500).refine((u) => u.startsWith(`${UPLOAD_BASE_URL}/`), "Review images must be uploaded to MySupplier")).max(6).optional(),
});

async function activeMaterial(id: string) {
  const material = await prisma.material.findFirst({ where: { id, active: true }, select: { id: true, name: true, categoryId: true } });
  if (!material) throw notFound("Product not found");
  return material;
}

/** Supplier staff may reply/answer only for materials their company actually lists. */
async function assertSellsMaterial(companyId: string | null, materialId: string) {
  if (!companyId) throw forbidden("This action requires a supplier company profile");
  const listing = await prisma.priceListing.findFirst({ where: { companyId, materialId }, select: { id: true } });
  if (!listing) throw forbidden("Your company does not sell this product");
}

router.get(
  "/shop/products/:id/reviews",
  asyncHandler(async (req, res) => {
    const { sort } = z.object({ sort: z.enum(["recent", "helpful", "rating"]).default("recent") }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.ProductReviewWhereInput = { materialId: req.params.id, hidden: false };
    const orderBy: Prisma.ProductReviewOrderByWithRelationInput[] =
      sort === "helpful" ? [{ helpful: "desc" }, { createdAt: "desc" }] : sort === "rating" ? [{ rating: "desc" }, { helpful: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }];
    const [total, rows, summary, mine] = await Promise.all([
      prisma.productReview.count({ where }),
      prisma.productReview.findMany({ where, include: reviewAuthor, orderBy, skip, take }),
      productReviewSummary(req.params.id),
      req.user ? prisma.productReview.findFirst({ where: { materialId: req.params.id, userId: req.user.id }, include: reviewAuthor }) : Promise.resolve(null),
    ]);
    // `mine` lets the UI offer "edit your review" instead of a dead-end 409 on a second post.
    res.json({ ...paged(serialize(rows.map(shapeReview)), page, pageSize, total), summary, mine: mine ? serialize(shapeReview(mine)) : null });
  }),
);

router.post(
  "/shop/products/:id/reviews",
  perUserLimiter(10),
  requireAuth("BUYER"),
  asyncHandler(async (req, res) => {
    const body = reviewBody.parse(req.body);
    const material = await activeMaterial(req.params.id);
    const userId = req.user!.id;
    const existing = await prisma.productReview.findUnique({ where: { materialId_userId: { materialId: material.id, userId } } });
    if (existing) throw conflict("You have already reviewed this product; edit your review instead");
    // Verified purchase = a non-cancelled order by this user that contains the material.
    const order = await prisma.order.findFirst({ where: { buyerId: userId, status: { not: "CANCELLED" }, items: { some: { materialId: material.id } } }, select: { id: true }, orderBy: { createdAt: "desc" } });
    const review = await prisma.productReview.create({
      data: { materialId: material.id, userId, orderId: order?.id ?? null, rating: body.rating, title: body.title ?? null, body: body.body ?? null, images: body.images ?? [], verified: Boolean(order) },
      include: reviewAuthor,
    });
    await recomputeMaterialRating(material.id);
    res.status(201).json(serialize(shapeReview(review)));
  }),
);

router.patch(
  "/shop/reviews/:id",
  authed,
  asyncHandler(async (req, res) => {
    const body = reviewBody.partial().parse(req.body);
    const review = await prisma.productReview.findUnique({ where: { id: req.params.id } });
    if (!review || review.userId !== req.user!.id) throw notFound("Review not found");
    const updated = await prisma.productReview.update({ where: { id: review.id }, data: { ...body, images: body.images ?? undefined }, include: reviewAuthor });
    if (body.rating !== undefined) await recomputeMaterialRating(review.materialId);
    res.json(serialize(shapeReview(updated)));
  }),
);

router.post(
  "/shop/reviews/:id/helpful",
  requireAuth(),
  asyncHandler(async (req, res) => {
    const review = await prisma.productReview.findFirst({ where: { id: req.params.id, hidden: false }, select: { id: true, helpful: true } });
    if (!review) throw notFound("Review not found");
    const userId = req.user!.id;
    const existing = await prisma.reviewVote.findUnique({ where: { reviewId_userId: { reviewId: review.id, userId } } });
    if (existing) return res.json({ id: review.id, helpful: review.helpful, voted: true });
    const [, updated] = await prisma.$transaction([
      prisma.reviewVote.create({ data: { reviewId: review.id, userId } }),
      prisma.productReview.update({ where: { id: review.id }, data: { helpful: { increment: 1 } }, select: { id: true, helpful: true } }),
    ]);
    res.json({ ...updated, voted: true });
  }),
);

router.post(
  "/supplier/reviews/:id/reply",
  requireAuth("SUPPLIER"),
  asyncHandler(async (req, res) => {
    const { reply } = z.object({ reply: z.string().trim().min(1).max(2000) }).parse(req.body);
    const review = await prisma.productReview.findUnique({ where: { id: req.params.id } });
    if (!review) throw notFound("Review not found");
    await assertSellsMaterial(req.user!.companyId, review.materialId);
    const updated = await prisma.productReview.update({ where: { id: review.id }, data: { supplierReply: reply }, include: reviewAuthor });
    await notify({ userIds: [review.userId], type: "SYSTEM", title: "A supplier replied to your review", body: reply.slice(0, 200), link: `/shop/products/${review.materialId}` });
    res.json(serialize(shapeReview(updated)));
  }),
);

const adminReviewInclude = { ...reviewAuthor, material: { select: { id: true, name: true, sku: true } } } satisfies Prisma.ProductReviewInclude;

router.get("/admin/product-reviews", admin, asyncHandler(async (req, res) => {
  const { hidden, q, rating } = z.object({ hidden: z.enum(["true", "false", "1", "0"]).optional(), q: z.string().trim().optional(), rating: z.coerce.number().int().min(1).max(5).optional() }).parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const where: Prisma.ProductReviewWhereInput = {
    ...(hidden ? { hidden: hidden === "true" || hidden === "1" } : {}),
    ...(rating ? { rating } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }, { material: { name: { contains: q, mode: "insensitive" } } }, { user: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, rows, avg, hiddenCount] = await Promise.all([
    prisma.productReview.count({ where }),
    prisma.productReview.findMany({ where, include: adminReviewInclude, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.productReview.aggregate({ where: { hidden: false }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.productReview.count({ where: { hidden: true } }),
  ]);
  res.json({ ...paged(serialize(rows.map(shapeReview)), page, pageSize, total), summary: { average: avg._avg.rating ? Math.round(avg._avg.rating * 10) / 10 : 0, total: avg._count._all, hidden: hiddenCount } });
}));

router.patch("/admin/product-reviews/:id", admin, asyncHandler(async (req, res) => {
  const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
  const review = await prisma.productReview.findUnique({ where: { id: req.params.id } });
  if (!review) throw notFound("Review not found");
  const updated = await prisma.productReview.update({ where: { id: review.id }, data: { hidden }, include: adminReviewInclude });
  await recomputeMaterialRating(review.materialId);
  await audit(req, hidden ? "product_review.hide" : "product_review.unhide", "ProductReview", review.id, { materialId: review.materialId });
  res.json(serialize(shapeReview(updated)));
}));

router.delete("/admin/product-reviews/:id", admin, asyncHandler(async (req, res) => {
  const review = await prisma.productReview.findUnique({ where: { id: req.params.id } });
  if (!review) throw notFound("Review not found");
  await prisma.productReview.delete({ where: { id: review.id } });
  await recomputeMaterialRating(review.materialId);
  await audit(req, "product_review.delete", "ProductReview", review.id, { materialId: review.materialId, userId: review.userId });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ product Q&A
async function shapeQuestions<T extends { answeredById: string | null; user: { id: string; name: string; company: { name: string } | null } }>(rows: T[]) {
  const answererIds = [...new Set(rows.map((r) => r.answeredById).filter((id): id is string => Boolean(id)))];
  const answerers = answererIds.length ? await prisma.user.findMany({ where: { id: { in: answererIds } }, select: { id: true, name: true, role: true, company: { select: { name: true } } } }) : [];
  const byId = new Map(answerers.map((a) => [a.id, { id: a.id, name: a.role === "ADMIN" ? "MySupplier team" : a.name, companyName: a.company?.name ?? null }]));
  return rows.map((r) => ({ ...r, user: { id: r.user.id, name: r.user.name, companyName: r.user.company?.name ?? null }, answeredBy: r.answeredById ? byId.get(r.answeredById) ?? null : null }));
}

router.get(
  "/shop/products/:id/questions",
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.ProductQuestionWhereInput = { materialId: req.params.id, hidden: false };
    const [total, rows] = await Promise.all([
      prisma.productQuestion.count({ where }),
      prisma.productQuestion.findMany({ where, include: reviewAuthor, orderBy: [{ answeredAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], skip, take }),
    ]);
    res.json(paged(serialize(await shapeQuestions(rows)), page, pageSize, total));
  }),
);

router.post(
  "/shop/products/:id/questions",
  perUserLimiter(20),
  authed,
  asyncHandler(async (req, res) => {
    const { question } = z.object({ question: z.string().trim().min(5).max(1000) }).parse(req.body);
    const material = await activeMaterial(req.params.id);
    const created = await prisma.productQuestion.create({ data: { materialId: material.id, userId: req.user!.id, question }, include: reviewAuthor });
    // Let the suppliers who sell it know there is a question waiting.
    const sellers = await prisma.priceListing.findMany({ where: { materialId: material.id, companyId: { not: null }, ...activeListingWhere() }, select: { companyId: true }, distinct: ["companyId"] });
    const staff = sellers.length ? await prisma.user.findMany({ where: { companyId: { in: sellers.map((s) => s.companyId!) }, active: true }, select: { id: true } }) : [];
    if (staff.length) await notify({ userIds: staff.map((s) => s.id), type: "SYSTEM", title: `New question about ${material.name}`, body: question.slice(0, 200), link: `/shop/products/${material.id}#questions` });
    res.status(201).json(serialize((await shapeQuestions([created]))[0]));
  }),
);

router.post(
  "/shop/questions/:id/answer",
  requireAuth("SUPPLIER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const { answer } = z.object({ answer: z.string().trim().min(1).max(2000) }).parse(req.body);
    const question = await prisma.productQuestion.findUnique({ where: { id: req.params.id }, include: { material: { select: { name: true } } } });
    if (!question) throw notFound("Question not found");
    if (req.user!.role !== "ADMIN") await assertSellsMaterial(req.user!.companyId, question.materialId);
    const updated = await prisma.productQuestion.update({ where: { id: question.id }, data: { answer, answeredById: req.user!.id, answeredAt: new Date() }, include: reviewAuthor });
    await notify({ userIds: [question.userId], type: "SYSTEM", title: `Your question about ${question.material.name} was answered`, body: answer.slice(0, 200), link: `/shop/products/${question.materialId}#questions`, email: true });
    res.json(serialize((await shapeQuestions([updated]))[0]));
  }),
);

router.get("/admin/product-questions", admin, asyncHandler(async (req, res) => {
  const { hidden, answered, q } = z.object({ hidden: z.enum(["true", "false"]).optional(), answered: z.enum(["true", "false"]).optional(), q: z.string().trim().optional() }).parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const where: Prisma.ProductQuestionWhereInput = {
    ...(hidden ? { hidden: hidden === "true" } : {}),
    ...(answered ? { answer: answered === "true" ? { not: null } : null } : {}),
    ...(q ? { OR: [{ question: { contains: q, mode: "insensitive" } }, { answer: { contains: q, mode: "insensitive" } }, { material: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.productQuestion.count({ where }),
    prisma.productQuestion.findMany({ where, include: { ...reviewAuthor, material: { select: { id: true, name: true, sku: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  res.json(paged(serialize(await shapeQuestions(rows)), page, pageSize, total));
}));

router.patch("/admin/product-questions/:id", admin, asyncHandler(async (req, res) => {
  const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
  const question = await prisma.productQuestion.findUnique({ where: { id: req.params.id } });
  if (!question) throw notFound("Question not found");
  const updated = await prisma.productQuestion.update({ where: { id: question.id }, data: { hidden }, include: reviewAuthor });
  await audit(req, hidden ? "product_question.hide" : "product_question.unhide", "ProductQuestion", question.id, { materialId: question.materialId });
  res.json(serialize((await shapeQuestions([updated]))[0]));
}));

router.delete("/admin/product-questions/:id", admin, asyncHandler(async (req, res) => {
  const question = await prisma.productQuestion.findUnique({ where: { id: req.params.id } });
  if (!question) throw notFound("Question not found");
  await prisma.productQuestion.delete({ where: { id: question.id } });
  await audit(req, "product_question.delete", "ProductQuestion", question.id, { materialId: question.materialId });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ recently viewed & recommendations
router.get("/shop/recently-viewed", authed, asyncHandler(async (req, res) => {
  res.json(serialize(await recentlyViewedProducts(req.user!.id, cityOf(req))));
}));

router.get("/shop/recommendations", asyncHandler(async (req, res) => {
  res.json(serialize(await recommendations(req.user?.id, cityOf(req))));
}));

// ------------------------------------------------------------------ wishlists / project lists
const DEFAULT_WISHLIST = "Saved items";
const wishlistInclude = { _count: { select: { items: true } } } satisfies Prisma.WishlistInclude;
const shapeWishlist = <T extends { _count: { items: number } }>({ _count, ...w }: T) => ({ ...w, itemCount: _count.items });

async function ensureDefaultWishlist(userId: string) {
  const existing = await prisma.wishlist.findFirst({ where: { userId, isDefault: true } });
  if (existing) return existing;
  return prisma.wishlist.create({ data: { userId, name: DEFAULT_WISHLIST, isDefault: true } });
}

async function ownedWishlist(userId: string, id: string) {
  const list = await prisma.wishlist.findFirst({ where: { id, userId } });
  if (!list) throw notFound("List not found");
  return list;
}

async function wishlistWithItems(id: string, city?: string) {
  const list = await prisma.wishlist.findUnique({ where: { id }, include: { items: { include: { material: { include: productInclude } }, orderBy: { createdAt: "desc" } } } });
  if (!list) throw notFound("List not found");
  const materials = await withEnrichment(list.items.map((i) => i.material), city);
  return { ...list, itemCount: list.items.length, items: list.items.map((it, idx) => ({ ...it, material: materials[idx] })) };
}

router.use("/wishlists", authed);

router.get("/wishlists", asyncHandler(async (req, res) => {
  await ensureDefaultWishlist(req.user!.id);
  const lists = await prisma.wishlist.findMany({ where: { userId: req.user!.id }, include: wishlistInclude, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  res.json(serialize(lists.map(shapeWishlist)));
}));

/** Heart-icon state: which of the user's lists contain the material. Declared before /wishlists/:id. */
router.get("/wishlists/contains", asyncHandler(async (req, res) => {
  const { materialId } = z.object({ materialId: z.string().min(1) }).parse(req.query);
  const items = await prisma.wishlistItem.findMany({ where: { materialId, wishlist: { userId: req.user!.id } }, select: { wishlistId: true } });
  res.json({ materialId, wishlistIds: items.map((i) => i.wishlistId), saved: items.length > 0 });
}));

router.post("/wishlists", perUserLimiter(60), asyncHandler(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
  const count = await prisma.wishlist.count({ where: { userId: req.user!.id } });
  if (count >= 50) throw badRequest("You can have at most 50 lists");
  const list = await prisma.wishlist.create({ data: { userId: req.user!.id, name }, include: wishlistInclude });
  res.status(201).json(serialize(shapeWishlist(list)));
}));

router.get("/wishlists/:id", asyncHandler(async (req, res) => {
  await ownedWishlist(req.user!.id, req.params.id);
  res.json(serialize(await wishlistWithItems(req.params.id, cityOf(req))));
}));

router.patch("/wishlists/:id", asyncHandler(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
  const list = await ownedWishlist(req.user!.id, req.params.id);
  if (list.isDefault) throw badRequest("The default list cannot be renamed");
  const updated = await prisma.wishlist.update({ where: { id: list.id }, data: { name }, include: wishlistInclude });
  res.json(serialize(shapeWishlist(updated)));
}));

router.delete("/wishlists/:id", asyncHandler(async (req, res) => {
  const list = await ownedWishlist(req.user!.id, req.params.id);
  if (list.isDefault) throw badRequest("The default list cannot be deleted");
  await prisma.wishlist.delete({ where: { id: list.id } });
  res.json({ ok: true });
}));

const wishlistItemBody = z.object({
  materialId: z.string().min(1),
  listingId: z.string().optional().nullable(),
  quantity: z.coerce.number().finite().positive().max(1e6).default(1),
  note: z.string().trim().max(500).optional().nullable(),
});

router.post("/wishlists/:id/items", asyncHandler(async (req, res) => {
  const body = wishlistItemBody.parse(req.body);
  const list = req.params.id === "default" ? await ensureDefaultWishlist(req.user!.id) : await ownedWishlist(req.user!.id, req.params.id);
  const material = await activeMaterial(body.materialId);
  if (body.listingId) {
    const listing = await prisma.priceListing.findFirst({ where: { id: body.listingId, materialId: material.id }, select: { id: true } });
    if (!listing) throw badRequest("Offer does not belong to this product");
  }
  const count = await prisma.wishlistItem.count({ where: { wishlistId: list.id } });
  const existing = await prisma.wishlistItem.findUnique({ where: { wishlistId_materialId: { wishlistId: list.id, materialId: material.id } } });
  if (!existing && count >= 500) throw badRequest("This list is full (500 items)");
  const item = existing
    ? await prisma.wishlistItem.update({ where: { id: existing.id }, data: { listingId: body.listingId ?? existing.listingId, quantity: body.quantity, note: body.note ?? existing.note } })
    : await prisma.wishlistItem.create({ data: { wishlistId: list.id, materialId: material.id, listingId: body.listingId ?? null, quantity: body.quantity, note: body.note ?? null } });
  await prisma.wishlist.update({ where: { id: list.id }, data: { updatedAt: new Date() } });
  const enriched = (await withEnrichment([await prisma.material.findUniqueOrThrow({ where: { id: material.id }, include: productInclude })], cityOf(req)))[0];
  res.status(existing ? 200 : 201).json(serialize({ ...item, material: enriched }));
}));

router.patch("/wishlists/:id/items/:itemId", asyncHandler(async (req, res) => {
  const body = wishlistItemBody.omit({ materialId: true }).partial().parse(req.body);
  const list = await ownedWishlist(req.user!.id, req.params.id);
  const item = await prisma.wishlistItem.findFirst({ where: { id: req.params.itemId, wishlistId: list.id } });
  if (!item) throw notFound("Item not found");
  if (body.listingId) {
    const listing = await prisma.priceListing.findFirst({ where: { id: body.listingId, materialId: item.materialId }, select: { id: true } });
    if (!listing) throw badRequest("Offer does not belong to this product");
  }
  const updated = await prisma.wishlistItem.update({ where: { id: item.id }, data: body });
  res.json(serialize(updated));
}));

router.delete("/wishlists/:id/items/:itemId", asyncHandler(async (req, res) => {
  const list = await ownedWishlist(req.user!.id, req.params.id);
  const item = await prisma.wishlistItem.findFirst({ where: { id: req.params.itemId, wishlistId: list.id } });
  if (!item) throw notFound("Item not found");
  await prisma.wishlistItem.delete({ where: { id: item.id } });
  res.json({ ok: true });
}));

/**
 * Adds every list item that has a purchasable offer to the user's cart (mirrors cart.ts validation:
 * purchasable supplier offer, quantity >= minQty, within stock). Items that cannot be added are reported.
 */
router.post("/wishlists/:id/add-to-cart", asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const list = await ownedWishlist(userId, req.params.id);
  const items = await prisma.wishlistItem.findMany({ where: { wishlistId: list.id }, include: { material: { select: { id: true, active: true } } } });
  const city = typeof req.body?.city === "string" ? req.body.city : undefined;
  const enrich = await enrichMaterials(items.map((i) => i.materialId), city);
  const cart = (await prisma.cart.findUnique({ where: { userId } })) ?? (await prisma.cart.create({ data: { userId } }));
  const cartItems = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
  const skipped: { materialId: string; reason: string }[] = [];
  let added = 0;
  for (const it of items) {
    if (!it.material.active) { skipped.push({ materialId: it.materialId, reason: "Product is no longer available" }); continue; }
    let offer = (enrich.get(it.materialId) ?? emptyEnrichment).bestOffer;
    if (it.listingId) {
      const chosen = await prisma.priceListing.findFirst({ where: { id: it.listingId, ...activeListingWhere() }, include: offerInclude });
      const chosenOffer = chosen ? toOffer(chosen) : null;
      if (chosenOffer && isPurchasable(chosenOffer)) offer = chosenOffer;
    }
    if (!offer || !isPurchasable(offer)) { skipped.push({ materialId: it.materialId, reason: "No purchasable offer right now (reference price or out of stock)" }); continue; }
    const existing = cartItems.find((c) => c.listingId === offer!.listingId);
    const quantity = Math.max(it.quantity, offer.minQty) + (existing?.quantity ?? 0);
    if (offer.stock !== null && quantity > offer.stock) { skipped.push({ materialId: it.materialId, reason: `Only ${offer.stock} available from this supplier` }); continue; }
    if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
    else await prisma.cartItem.create({ data: { cartId: cart.id, listingId: offer.listingId, quantity } });
    added += 1;
  }
  res.json({ added, skipped });
}));

// ------------------------------------------------------------------ price alerts
router.use("/alerts", authed);

const alertInclude = { material: { include: productInclude } } satisfies Prisma.PriceAlertInclude;

router.get("/alerts", asyncHandler(async (req, res) => {
  const alerts = await prisma.priceAlert.findMany({ where: { userId: req.user!.id }, include: alertInclude, orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  const materials = await withEnrichment(alerts.map((a) => a.material), cityOf(req));
  res.json(serialize(alerts.map((a, i) => ({ ...a, material: materials[i] }))));
}));

router.post("/alerts", perUserLimiter(60), asyncHandler(async (req, res) => {
  const body = z.object({
    materialId: z.string().min(1),
    targetPrice: z.coerce.number().positive().optional().nullable(),
    notifyBackInStock: z.boolean().default(false),
    city: z.string().trim().max(60).optional().nullable(),
  }).parse(req.body);
  if (body.targetPrice == null && !body.notifyBackInStock) throw badRequest("Set a target price and/or enable back-in-stock notifications");
  const material = await activeMaterial(body.materialId);
  const data = { targetPrice: body.targetPrice ?? null, notifyBackInStock: body.notifyBackInStock, city: body.city || null, active: true, triggeredAt: null };
  const alert = await prisma.priceAlert.upsert({
    where: { userId_materialId: { userId: req.user!.id, materialId: material.id } },
    create: { userId: req.user!.id, materialId: material.id, ...data },
    update: data,
    include: alertInclude,
  });
  const [enriched] = await withEnrichment([alert.material], body.city || undefined);
  res.status(201).json(serialize({ ...alert, material: enriched }));
}));

router.delete("/alerts/:id", asyncHandler(async (req, res) => {
  const alert = await prisma.priceAlert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!alert) throw notFound("Alert not found");
  await prisma.priceAlert.delete({ where: { id: alert.id } });
  res.json({ ok: true });
}));

export default router;
