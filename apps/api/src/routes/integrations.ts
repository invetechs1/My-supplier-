/**
 * ERP integration surface.
 *
 *  - /integrations/keys, /integrations/webhooks, /integrations/deliveries – management (JWT: company OWNER/MANAGER or ADMIN;
 *    webhook management also accepts an API key with the webhooks:manage scope).
 *  - /integrations/v1/…  – the machine API. Every route requires an API key (X-API-Key) with the right scope.
 *    Supplier ERPs push prices / stock, pull orders and push status; buyer ERPs pull purchases, create RFQs and
 *    read best offers. The key's company decides which side of the marketplace the key sees.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireCompany } from "../middleware/auth";
import { requireApiKey, requireScope } from "../middleware/apiKey";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { serialize } from "../lib/serialize";
import { paged, paginate } from "../lib/pagination";
import { audit } from "../lib/audit";
import { assertPublicUrl } from "../lib/security";
import { nextReference } from "../lib/reference";
import { companyUserIds, notify } from "../services/notifications";
import { applyStockMovement, recordOrderEvent, requireCompanyRole } from "../services/portal";
import { snapshotHistory } from "../services/catalog";
import { bidTotal } from "../services/pricing";
import {
  API_SCOPES, INTEGRATION_ORDER_STATUSES, RowsError, SCOPE_DESCRIPTIONS, canTransition, erpOrderInclude, generateApiKey, mapIntegrationStatus,
  priceRowSchema, scopeSchema, shapeOrderForErp, stockRowSchema, validateRows, type ApiScope, type PriceRow, type StockRow,
} from "../services/integrations";
import { WEBHOOK_EVENTS, companyIdsOfUsers, emitWebhook, generateWebhookSecret, retryDelivery, sendTestPing } from "../services/webhooks";

const router = Router();

// ================================================================== management helpers
/** Company the management call acts on: the caller's company, or ?companyId= / body.companyId for admins. */
function managedCompanyId(req: Request): string {
  if (req.user!.role === "ADMIN") {
    const explicit = (typeof req.query.companyId === "string" && req.query.companyId) || (req.body && typeof req.body.companyId === "string" && req.body.companyId);
    if (explicit) return explicit;
  }
  return requireCompany(req);
}

/** JWT company managers / admins only – API keys cannot mint or revoke API keys. */
function requireKeyManager() {
  const roleCheck = requireCompanyRole("OWNER", "MANAGER");
  return [
    requireAuth(),
    (req: Request, _res: Response, next: NextFunction) => (req.apiKey ? next(forbidden("API keys are managed from the dashboard with a user login, not with another API key")) : next()),
    roleCheck,
  ];
}

/** Company managers / admins (JWT) or an API key with webhooks:manage. */
function requireWebhookManager() {
  const roleCheck = requireCompanyRole("OWNER", "MANAGER");
  const scopeCheck = requireScope("webhooks:manage");
  return [requireAuth(), (req: Request, res: Response, next: NextFunction) => (req.apiKey ? scopeCheck(req, res, next) : roleCheck(req, res, next))];
}

const scopesInfo = API_SCOPES.map((scope) => ({ scope, description: SCOPE_DESCRIPTIONS[scope] }));

router.get("/integrations/scopes", requireAuth(), (_req, res) => res.json({ scopes: scopesInfo, events: WEBHOOK_EVENTS }));

// ================================================================== API keys
const keySelect = { id: true, companyId: true, createdById: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true } satisfies Prisma.ApiKeySelect;

router.get(
  "/integrations/keys",
  ...requireKeyManager(),
  asyncHandler(async (req, res) => {
    const companyId = managedCompanyId(req);
    const keys = await prisma.apiKey.findMany({ where: { companyId }, select: { ...keySelect, createdBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" } });
    res.json(serialize(keys));
  }),
);

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(scopeSchema).min(1).transform((s) => [...new Set(s)]),
  expiresAt: z.coerce.date().optional().nullable(),
});

router.post(
  "/integrations/keys",
  ...requireKeyManager(),
  asyncHandler(async (req, res) => {
    const companyId = managedCompanyId(req);
    const body = createKeySchema.parse(req.body);
    if (body.expiresAt && body.expiresAt.getTime() <= Date.now()) throw badRequest("expiresAt must be in the future");
    const active = await prisma.apiKey.count({ where: { companyId, revokedAt: null } });
    if (active >= 20) throw badRequest("A company can have at most 20 active API keys – revoke unused ones first");
    const { key, prefix, hash } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: { companyId, createdById: req.user!.id, name: body.name, prefix, keyHash: hash, scopes: body.scopes, expiresAt: body.expiresAt ?? null },
      select: keySelect,
    });
    await audit(req, "apikey.create", "ApiKey", apiKey.id, { companyId, name: body.name, scopes: body.scopes, prefix });
    res.status(201).json({ apiKey: serialize(apiKey), key, warning: "Store this key now – it cannot be shown again." });
  }),
);

router.post(
  "/integrations/keys/:id/revoke",
  ...requireKeyManager(),
  asyncHandler(async (req, res) => {
    const companyId = managedCompanyId(req);
    const key = await prisma.apiKey.findFirst({ where: { id: req.params.id, companyId }, select: keySelect });
    if (!key) throw notFound("API key not found");
    if (key.revokedAt) return res.json(serialize(key));
    const updated = await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() }, select: keySelect });
    await audit(req, "apikey.revoke", "ApiKey", key.id, { companyId, name: key.name, prefix: key.prefix });
    res.json(serialize(updated));
  }),
);

// ================================================================== webhook endpoints
const eventSchema = z.union([z.enum(WEBHOOK_EVENTS), z.literal("*")]);
const webhookCreateSchema = z.object({
  url: z.string().url().max(2000).refine((u) => u.startsWith("https://") || (process.env.ALLOW_PRIVATE_FEED_URLS === "true" && u.startsWith("http://")), "Webhook URLs must use https"),
  events: z.array(eventSchema).min(1).transform((e) => [...new Set(e)]),
  description: z.string().trim().max(200).optional().nullable(),
});
const webhookPatchSchema = z.object({
  url: webhookCreateSchema.shape.url.optional(),
  events: webhookCreateSchema.shape.events.optional(),
  description: webhookCreateSchema.shape.description,
  active: z.boolean().optional(),
});

async function checkedUrl(url: string) {
  try {
    await assertPublicUrl(url);
  } catch (e) {
    throw badRequest(`Webhook URL rejected: ${(e as Error).message}`);
  }
}

async function ownedEndpoint(req: Request) {
  const companyId = managedCompanyId(req);
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: req.params.id, companyId } });
  if (!endpoint) throw notFound("Webhook endpoint not found");
  return endpoint;
}

router.get(
  "/integrations/webhooks",
  ...requireWebhookManager(),
  asyncHandler(async (req, res) => {
    const companyId = managedCompanyId(req);
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
    const stats = await prisma.webhookDelivery.groupBy({ by: ["endpointId", "status"], where: { endpointId: { in: endpoints.map((e) => e.id) } }, _count: { _all: true } });
    const byEndpoint = new Map<string, Record<string, number>>();
    for (const s of stats) byEndpoint.set(s.endpointId, { ...(byEndpoint.get(s.endpointId) ?? {}), [s.status]: s._count._all });
    res.json(serialize(endpoints.map((e) => ({ ...e, deliveries: { PENDING: 0, SUCCESS: 0, FAILED: 0, ...(byEndpoint.get(e.id) ?? {}) } }))));
  }),
);

router.post(
  "/integrations/webhooks",
  ...requireWebhookManager(),
  asyncHandler(async (req, res) => {
    const companyId = managedCompanyId(req);
    const body = webhookCreateSchema.parse(req.body);
    await checkedUrl(body.url);
    const count = await prisma.webhookEndpoint.count({ where: { companyId } });
    if (count >= 10) throw badRequest("A company can register at most 10 webhook endpoints");
    const secret = generateWebhookSecret();
    const endpoint = await prisma.webhookEndpoint.create({ data: { companyId, url: body.url, events: body.events, description: body.description ?? null, secret } });
    await audit(req, "webhook.create", "WebhookEndpoint", endpoint.id, { companyId, url: body.url, events: body.events });
    res.status(201).json({ endpoint: serialize(endpoint), secret, warning: "Store this secret now – it cannot be shown again. Use it to verify X-MySupplier-Signature." });
  }),
);

router.patch(
  "/integrations/webhooks/:id",
  ...requireWebhookManager(),
  asyncHandler(async (req, res) => {
    const endpoint = await ownedEndpoint(req);
    const body = webhookPatchSchema.parse(req.body);
    if (body.url && body.url !== endpoint.url) await checkedUrl(body.url);
    const updated = await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { url: body.url, events: body.events, description: body.description, active: body.active } });
    await audit(req, "webhook.update", "WebhookEndpoint", endpoint.id, body as Record<string, unknown>);
    res.json(serialize(updated));
  }),
);

router.delete(
  "/integrations/webhooks/:id",
  ...requireWebhookManager(),
  asyncHandler(async (req, res) => {
    const endpoint = await ownedEndpoint(req);
    await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });
    await audit(req, "webhook.delete", "WebhookEndpoint", endpoint.id, { url: endpoint.url });
    res.json({ ok: true });
  }),
);

router.post(
  "/integrations/webhooks/:id/test",
  ...requireWebhookManager(),
  asyncHandler(async (req, res) => {
    const endpoint = await ownedEndpoint(req);
    const { outcome, delivery } = await sendTestPing(endpoint.id, { companyId: endpoint.companyId, sentBy: req.user!.id });
    res.json({ ok: outcome === "delivered", outcome, delivery: serialize(delivery) });
  }),
);

router.get(
  "/integrations/webhooks/:id/deliveries",
  ...requireWebhookManager(),
  asyncHandler(async (req, res) => {
    const endpoint = await ownedEndpoint(req);
    const { status, event } = z.object({ status: z.enum(["PENDING", "SUCCESS", "FAILED"]).optional(), event: z.string().optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: Prisma.WebhookDeliveryWhereInput = { endpointId: endpoint.id, ...(status ? { status } : {}), ...(event ? { event } : {}) };
    const [total, rows] = await Promise.all([prisma.webhookDelivery.count({ where }), prisma.webhookDelivery.findMany({ where, orderBy: { createdAt: "desc" }, skip, take })]);
    res.json(paged(serialize(rows), page, pageSize, total));
  }),
);

router.post(
  "/integrations/deliveries/:id/retry",
  ...requireWebhookManager(),
  asyncHandler(async (req, res) => {
    const companyId = managedCompanyId(req);
    const delivery = await prisma.webhookDelivery.findFirst({ where: { id: req.params.id, endpoint: { companyId } } });
    if (!delivery) throw notFound("Delivery not found");
    const result = await retryDelivery(delivery.id);
    res.json({ ok: result.outcome === "delivered", outcome: result.outcome, delivery: serialize(result.delivery) });
  }),
);

// ================================================================== /integrations/v1 – the machine API
const v1 = Router();
v1.use(requireApiKey());

/** Loads the key's company once per request. */
async function keyCompany(req: Request) {
  const company = await prisma.company.findUnique({ where: { id: req.apiKey!.companyId }, select: { id: true, name: true, type: true, city: true, lowStockThreshold: true } });
  if (!company) throw forbidden("The company behind this API key no longer exists");
  return company;
}
const isoDate = z.coerce.date().optional();
const listQuery = z.object({ since: isoDate, updatedSince: isoDate });

v1.get(
  "/ping",
  asyncHandler(async (req, res) => {
    const company = await keyCompany(req);
    res.json({ ok: true, company: { id: company.id, name: company.name, type: company.type, city: company.city }, keyName: req.apiKey!.name, scopes: req.apiKey!.scopes, serverTime: new Date().toISOString() });
  }),
);

// ------------------------------------------------------------------ catalog
v1.get(
  "/catalog/categories",
  requireScope("catalog:read"),
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { name: "asc" }], include: { _count: { select: { materials: true } }, parent: { select: { id: true, slug: true } } } });
    res.json(serialize(categories.map(({ _count, parent, ...c }) => ({ ...c, parentSlug: parent?.slug ?? null, materialCount: _count.materials }))));
  }),
);

v1.get(
  "/catalog/materials",
  requireScope("catalog:read"),
  asyncHandler(async (req, res) => {
    const q = listQuery.extend({ categorySlug: z.string().optional(), sku: z.string().optional(), q: z.string().optional(), includeInactive: z.enum(["true", "false"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const since = q.updatedSince ?? q.since;
    const where: Prisma.MaterialWhereInput = {
      ...(q.includeInactive === "true" ? {} : { active: true }),
      ...(since ? { updatedAt: { gte: since } } : {}),
      ...(q.categorySlug ? { category: { OR: [{ slug: q.categorySlug }, { parent: { slug: q.categorySlug } }] } } : {}),
      ...(q.sku ? { sku: { in: q.sku.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100) } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { nameAr: { contains: q.q } }, { sku: { contains: q.q, mode: "insensitive" } }, { brand: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
    const [total, materials] = await Promise.all([
      prisma.material.count({ where }),
      prisma.material.findMany({
        where,
        select: { id: true, sku: true, name: true, nameAr: true, unit: true, brand: true, specs: true, description: true, imageUrl: true, images: true, datasheetUrl: true, tags: true, active: true, weightKg: true, volumeM3: true, hazardous: true, category: { select: { id: true, slug: true, name: true, nameAr: true, parentId: true } }, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json(paged(serialize(materials), page, pageSize, total));
  }),
);

/** Best current offers for one or more SKUs (buyer ERPs price their purchase requisitions with this). */
v1.get(
  "/catalog/prices",
  requireScope("catalog:read"),
  asyncHandler(async (req, res) => {
    const q = z.object({ sku: z.string().optional(), materialId: z.string().optional(), city: z.string().optional(), limit: z.coerce.number().int().min(1).max(20).default(5) }).parse(req.query);
    const skus = (q.sku ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
    const materialIds = (q.materialId ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (!skus.length && !materialIds.length) throw badRequest("Provide sku (comma separated, max 50) or materialId");
    const materials = await prisma.material.findMany({
      where: { OR: [...(skus.length ? [{ sku: { in: skus } }] : []), ...(materialIds.length ? [{ id: { in: materialIds } }] : [])] },
      select: { id: true, sku: true, name: true, nameAr: true, unit: true },
    });
    const now = new Date();
    const listings = await prisma.priceListing.findMany({
      where: { materialId: { in: materials.map((m) => m.id) }, active: true, OR: [{ validUntil: null }, { validUntil: { gte: now } }], ...(q.city ? { city: q.city } : {}), NOT: { stock: 0 } },
      select: { id: true, materialId: true, companyId: true, price: true, salePrice: true, saleEndsAt: true, currency: true, minQty: true, leadTimeDays: true, city: true, stock: true, source: true, validUntil: true, updatedAt: true, company: { select: { id: true, name: true, verified: true, rating: true } } },
      orderBy: { price: "asc" },
    });
    const effective = (l: (typeof listings)[number]) => (l.salePrice && (!l.saleEndsAt || l.saleEndsAt > now) ? Number(l.salePrice) : Number(l.price));
    const data = materials.map((m) => {
      const offers = listings.filter((l) => l.materialId === m.id).sort((a, b) => effective(a) - effective(b)).slice(0, q.limit);
      return { ...m, bestPrice: offers.length ? effective(offers[0]) : null, offers: offers.map((o) => ({ ...o, effectivePrice: effective(o) })) };
    });
    const found = new Set(materials.map((m) => m.sku));
    res.json({ data: serialize(data), notFound: skus.filter((s) => !found.has(s)) });
  }),
);

// ------------------------------------------------------------------ supplier: prices & stock
async function upsertListing(companyId: string, materialId: string, row: PriceRow) {
  const existing = await prisma.priceListing.findFirst({ where: { companyId, materialId, city: row.city, source: "SUPPLIER" }, select: { id: true } });
  const data: Prisma.PriceListingUncheckedUpdateInput = {
    price: row.price,
    ...(row.minQty !== undefined ? { minQty: row.minQty } : {}),
    ...(row.leadTimeDays !== undefined ? { leadTimeDays: row.leadTimeDays } : {}),
    ...(row.validUntil !== undefined ? { validUntil: row.validUntil } : {}),
    ...(row.salePrice !== undefined ? { salePrice: row.salePrice } : {}),
    ...(row.stock !== undefined ? { stock: row.stock } : {}),
    ...(row.active !== undefined ? { active: row.active } : {}),
  };
  if (existing) return { listing: await prisma.priceListing.update({ where: { id: existing.id }, data, select: { id: true } }), created: false };
  const listing = await prisma.priceListing.create({
    data: {
      companyId, materialId, city: row.city, source: "SUPPLIER", price: row.price, minQty: row.minQty ?? 1, leadTimeDays: row.leadTimeDays ?? 1,
      validUntil: row.validUntil ?? null, salePrice: row.salePrice ?? null, stock: row.stock ?? null, active: row.active ?? true,
    },
    select: { id: true },
  });
  return { listing, created: true };
}

function rowsOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown) {
  try {
    return validateRows(schema, body);
  } catch (e) {
    if (e instanceof RowsError) throw badRequest(e.message);
    throw e;
  }
}

v1.put(
  "/prices",
  requireScope("prices:write"),
  asyncHandler(async (req, res) => {
    const company = await keyCompany(req);
    if (company.type !== "SUPPLIER") throw forbidden("Only supplier companies can publish prices");
    const { rows, total } = rowsOrThrow(priceRowSchema, req.body);
    const valid = rows.filter((r): r is { index: number; data: PriceRow } => "data" in r);
    const skus = [...new Set(valid.map((r) => r.data.sku).filter((s): s is string => Boolean(s)))];
    const ids = [...new Set(valid.map((r) => r.data.materialId).filter((s): s is string => Boolean(s)))];
    const materials = await prisma.material.findMany({ where: { OR: [...(skus.length ? [{ sku: { in: skus } }] : []), ...(ids.length ? [{ id: { in: ids } }] : [])] }, select: { id: true, sku: true } });
    const bySku = new Map(materials.map((m) => [m.sku, m.id]));
    const byId = new Set(materials.map((m) => m.id));

    const results: Array<{ index: number; status: "created" | "updated" | "error"; sku?: string | null; city?: string | null; listingId?: string | null; materialId?: string | null; error?: string }> = [];
    const touched = new Set<string>();
    let created = 0, updated = 0, failed = 0;
    for (const r of rows) {
      if ("error" in r) {
        failed++;
        const raw = (r.raw ?? {}) as Record<string, unknown>;
        results.push({ index: r.index, status: "error", sku: typeof raw.sku === "string" ? raw.sku : null, city: typeof raw.city === "string" ? raw.city : null, error: r.error });
        continue;
      }
      const row = r.data;
      const materialId = row.materialId && byId.has(row.materialId) ? row.materialId : row.sku ? bySku.get(row.sku) : undefined;
      if (!materialId) {
        failed++;
        results.push({ index: r.index, status: "error", sku: row.sku ?? null, city: row.city, error: row.sku ? `Unknown SKU ${row.sku}` : `Unknown materialId ${row.materialId}` });
        continue;
      }
      try {
        const out = await upsertListing(company.id, materialId, row);
        touched.add(materialId);
        if (out.created) created++;
        else updated++;
        results.push({ index: r.index, status: out.created ? "created" : "updated", sku: row.sku ?? null, city: row.city, listingId: out.listing.id, materialId });
      } catch (e) {
        failed++;
        results.push({ index: r.index, status: "error", sku: row.sku ?? null, city: row.city, materialId, error: e instanceof Error ? e.message : "Failed to save" });
      }
    }
    await snapshotHistory([...touched]).catch(() => undefined);
    res.status(failed && !created && !updated ? 400 : 200).json({ total, created, updated, failed, results });
  }),
);

v1.put(
  "/stock",
  requireScope("stock:write"),
  asyncHandler(async (req, res) => {
    const company = await keyCompany(req);
    if (company.type !== "SUPPLIER") throw forbidden("Only supplier companies carry stock");
    const { rows, total } = rowsOrThrow(stockRowSchema, req.body);
    const valid = rows.filter((r): r is { index: number; data: StockRow } => "data" in r);
    const listingIds = valid.map((r) => r.data.listingId).filter((s): s is string => Boolean(s));
    const skus = valid.map((r) => r.data.sku).filter((s): s is string => Boolean(s));
    const listings = await prisma.priceListing.findMany({
      where: { companyId: company.id, OR: [...(listingIds.length ? [{ id: { in: listingIds } }] : []), ...(skus.length ? [{ material: { sku: { in: skus } } }] : [])] },
      select: { id: true, city: true, stock: true, material: { select: { sku: true, name: true } } },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));
    const bySkuCity = new Map(listings.map((l) => [`${l.material.sku}::${l.city.toLowerCase()}`, l]));

    const results: Array<{ index: number; status: "updated" | "error"; sku?: string | null; city?: string | null; listingId?: string | null; stock?: number; previousStock?: number | null; error?: string }> = [];
    const low: Array<{ listingId: string; sku: string; name: string; city: string; stock: number }> = [];
    let updated = 0, failed = 0;
    for (const r of rows) {
      if ("error" in r) {
        failed++;
        results.push({ index: r.index, status: "error", error: r.error });
        continue;
      }
      const row = r.data;
      const listing = row.listingId ? byId.get(row.listingId) : bySkuCity.get(`${row.sku}::${row.city!.toLowerCase()}`);
      if (!listing) {
        failed++;
        results.push({ index: r.index, status: "error", sku: row.sku ?? null, city: row.city ?? null, listingId: row.listingId ?? null, error: "No listing of yours matches this row (publish a price first)" });
        continue;
      }
      try {
        await applyStockMovement(listing.id, "ADJUST", row.stock, { reason: `ERP sync (${req.apiKey!.name})`, userId: req.user!.id });
        updated++;
        results.push({ index: r.index, status: "updated", sku: listing.material.sku, city: listing.city, listingId: listing.id, stock: row.stock, previousStock: listing.stock });
        if (row.stock <= company.lowStockThreshold) low.push({ listingId: listing.id, sku: listing.material.sku, name: listing.material.name, city: listing.city, stock: row.stock });
      } catch (e) {
        failed++;
        results.push({ index: r.index, status: "error", sku: listing.material.sku, city: listing.city, listingId: listing.id, error: e instanceof Error ? e.message : "Failed to save" });
      }
    }
    if (low.length) await emitWebhook("stock.low", [company.id], { threshold: company.lowStockThreshold, listings: low });
    res.status(failed && !updated ? 400 : 200).json({ total, created: 0, updated, failed, results });
  }),
);

// ------------------------------------------------------------------ orders (supplier side) & purchases (buyer side)
const orderListQuery = listQuery.extend({
  status: z.enum(["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["UNPAID", "PAID", "REFUNDED"]).optional(),
  reference: z.string().optional(),
  poNumber: z.string().optional(),
});

async function listOrders(req: Request, res: Response, scope: Prisma.OrderWhereInput) {
  const q = orderListQuery.parse(req.query);
  const { page, pageSize, skip, take } = paginate(req.query);
  const since = q.since ?? q.updatedSince;
  const where: Prisma.OrderWhereInput = {
    ...scope,
    ...(since ? { updatedAt: { gte: since } } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
    ...(q.reference ? { reference: q.reference } : {}),
    ...(q.poNumber ? { poNumber: q.poNumber } : {}),
  };
  const [total, orders] = await Promise.all([prisma.order.count({ where }), prisma.order.findMany({ where, include: erpOrderInclude, orderBy: { updatedAt: "asc" }, skip, take })]);
  res.json(paged(serialize(orders.map(shapeOrderForErp)), page, pageSize, total));
}

async function findOrder(refOrId: string, scope: Prisma.OrderWhereInput) {
  const order = await prisma.order.findFirst({ where: { OR: [{ reference: refOrId }, { id: refOrId }], ...scope }, include: erpOrderInclude });
  if (!order) throw notFound("Order not found");
  return order;
}

const supplierScope = (req: Request): Prisma.OrderWhereInput => ({ companyId: req.apiKey!.companyId });
const buyerScope = (req: Request): Prisma.OrderWhereInput => ({ buyer: { companyId: req.apiKey!.companyId } });

v1.get("/orders", requireScope("orders:read"), asyncHandler((req, res) => listOrders(req, res, supplierScope(req))));
v1.get("/orders/:reference", requireScope("orders:read"), asyncHandler(async (req, res) => res.json(serialize(shapeOrderForErp(await findOrder(req.params.reference, supplierScope(req)))))));
v1.get("/purchases", requireScope("orders:read"), asyncHandler((req, res) => listOrders(req, res, buyerScope(req))));
v1.get("/purchases/:reference", requireScope("orders:read"), asyncHandler(async (req, res) => res.json(serialize(shapeOrderForErp(await findOrder(req.params.reference, buyerScope(req)))))));

const statusSchema = z.object({
  status: z.enum(INTEGRATION_ORDER_STATUSES),
  trackingNumber: z.string().trim().min(1).max(80).optional(),
  trackingUrl: z.string().url().optional(),
  carrierName: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Same transition rules as PATCH /orders/:id/status, with ERP aliases (PROCESSING → CONFIRMED, SHIPPED → IN_TRANSIT). */
v1.patch(
  "/orders/:reference/status",
  requireScope("orders:write"),
  asyncHandler(async (req, res) => {
    const body = statusSchema.parse(req.body);
    const target = mapIntegrationStatus(body.status);
    const order = await findOrder(req.params.reference, supplierScope(req));
    const user = req.user!;

    if (order.status === target) {
      // Idempotent: replaying the same status (or PROCESSING after CONFIRMED) is not an error.
      if (body.trackingNumber) await upsertTracking(order.id, body, target);
      return res.json({ changed: false, order: serialize(shapeOrderForErp(await findOrder(order.id, supplierScope(req)))) });
    }
    if (!canTransition(order.status, target)) throw badRequest(`Cannot move order from ${order.status} to ${target}`);

    await prisma.order.update({ where: { id: order.id }, data: { status: target } });
    const message = [body.note, body.trackingNumber ? `Tracking ${body.trackingNumber}` : null, `via ${req.apiKey!.name}`].filter(Boolean).join(" · ");
    await recordOrderEvent(order.id, "STATUS", { status: target, message, userId: user.id });
    if (body.trackingNumber) await upsertTracking(order.id, body, target);
    if (target === "CANCELLED") {
      for (const item of order.items) if (item.listingId) await applyStockMovement(item.listingId, "RELEASE", item.quantity, { reason: `Order ${order.reference} cancelled`, orderId: order.id, userId: user.id }).catch(() => undefined);
    }
    await notify({
      userIds: [order.buyerId],
      type: "ORDER_UPDATE",
      title: `Order ${order.reference} is now ${target.replace("_", " ").toLowerCase()}`,
      body: `${order.company.name}${body.trackingNumber ? ` · tracking ${body.trackingNumber}` : ""}${body.note ? ` · ${body.note}` : ""}`,
      link: `/dashboard/orders/${order.id}`,
    });
    const fresh = await findOrder(order.id, supplierScope(req));
    const payload = { order: shapeOrderForErp(fresh), previousStatus: order.status, note: body.note ?? null, trackingNumber: body.trackingNumber ?? null };
    const parties = [order.companyId, fresh.buyer.company?.id];
    await emitWebhook("order.status_changed", parties, payload);
    if (target === "CANCELLED") await emitWebhook("order.cancelled", parties, payload);
    await audit(req, "order.status", "Order", order.id, { reference: order.reference, from: order.status, to: target, apiKeyId: req.apiKey!.id });
    res.json({ changed: true, order: serialize(payload.order) });
  }),
);

async function upsertTracking(orderId: string, body: z.infer<typeof statusSchema>, target: string) {
  const shipmentStatus = target === "DELIVERED" ? "DELIVERED" : target === "IN_TRANSIT" ? "IN_TRANSIT" : "BOOKED";
  const existing = await prisma.shipment.findFirst({ where: { orderId, trackingNumber: body.trackingNumber } });
  if (existing) {
    await prisma.shipment.update({ where: { id: existing.id }, data: { status: shipmentStatus, trackingUrl: body.trackingUrl, deliveredAt: shipmentStatus === "DELIVERED" ? new Date() : undefined } });
    return;
  }
  await prisma.shipment.create({
    data: { orderId, carrier: "OTHER", carrierName: body.carrierName ?? "Supplier (ERP)", trackingNumber: body.trackingNumber, trackingUrl: body.trackingUrl, status: shipmentStatus, deliveredAt: shipmentStatus === "DELIVERED" ? new Date() : undefined, events: { create: { status: shipmentStatus, description: "Updated by ERP" } } },
  });
}

// ------------------------------------------------------------------ invoices
v1.get(
  "/invoices",
  requireScope("invoices:read"),
  asyncHandler(async (req, res) => {
    const q = listQuery.extend({ includeXml: z.enum(["true", "false"]).optional(), side: z.enum(["sales", "purchases"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const companyId = req.apiKey!.companyId;
    const since = q.since ?? q.updatedSince;
    const orderScope: Prisma.OrderWhereInput = q.side === "sales" ? { companyId } : q.side === "purchases" ? { buyer: { companyId } } : { OR: [{ companyId }, { buyer: { companyId } }] };
    const where: Prisma.EInvoiceRecordWhereInput = { order: orderScope, ...(since ? { updatedAt: { gte: since } } : {}) };
    const [total, rows] = await Promise.all([
      prisma.eInvoiceRecord.count({ where }),
      prisma.eInvoiceRecord.findMany({
        where,
        select: { id: true, orderId: true, invoiceNumber: true, uuid: true, invoiceHash: true, previousInvoiceHash: true, counter: true, status: true, createdAt: true, updatedAt: true, xml: q.includeXml === "true", order: { include: erpOrderInclude } },
        orderBy: { counter: "asc" },
        skip,
        take,
      }),
    ]);
    const data = rows.map(({ order, ...inv }) => {
      const o = shapeOrderForErp(order);
      return { ...inv, side: order.companyId === companyId ? "sales" : "purchases", order: { id: o.id, reference: o.reference, poNumber: o.poNumber, status: o.status, paymentStatus: o.paymentStatus, subtotal: o.subtotal, vat: o.vat, deliveryFee: o.deliveryFee, discount: o.discount, total: o.total, currency: o.currency, supplier: o.supplier, buyer: o.buyer, items: o.items, createdAt: o.createdAt } };
    });
    res.json(paged(serialize(data), page, pageSize, total));
  }),
);

// ------------------------------------------------------------------ RFQs & bids
const rfqInclude = {
  items: { include: { material: { select: { id: true, sku: true, name: true, nameAr: true, unit: true } } } },
  buyer: { select: { id: true, name: true, company: { select: { id: true, name: true, city: true } } } },
  _count: { select: { bids: { where: { status: { in: ["SUBMITTED", "ACCEPTED"] } } } } },
} satisfies Prisma.RfqInclude;
const shapeRfq = <T extends { _count: { bids: number } }>({ _count, ...r }: T) => ({ ...r, bidCount: _count.bids });

v1.get(
  "/rfqs",
  requireScope("rfqs:read"),
  asyncHandler(async (req, res) => {
    const company = await keyCompany(req);
    const q = listQuery.extend({ status: z.enum(["OPEN", "CLOSED", "AWARDED", "CANCELLED"]).optional(), city: z.string().optional(), mine: z.enum(["true", "false"]).optional() }).parse(req.query);
    const { page, pageSize, skip, take } = paginate(req.query);
    const mine = q.mine === "true" || company.type !== "SUPPLIER";
    const since = q.since ?? q.updatedSince;
    const where: Prisma.RfqWhereInput = mine
      ? { buyer: { companyId: company.id }, ...(q.status ? { status: q.status } : {}), ...(since ? { updatedAt: { gte: since } } : {}) }
      : { status: q.status ?? "OPEN", ...(q.status && q.status !== "OPEN" ? {} : { closesAt: { gt: new Date() } }), ...(q.city ? { deliveryCity: q.city } : {}), ...(since ? { createdAt: { gte: since } } : {}) };
    const [total, rfqs] = await Promise.all([prisma.rfq.count({ where }), prisma.rfq.findMany({ where, include: rfqInclude, orderBy: mine ? { createdAt: "desc" } : { closesAt: "asc" }, skip, take })]);
    const myBids = mine ? [] : await prisma.bid.findMany({ where: { companyId: company.id, rfqId: { in: rfqs.map((r) => r.id) } }, select: { id: true, rfqId: true, status: true, totalPrice: true } });
    const data = rfqs.map((r) => {
      const b = myBids.find((x) => x.rfqId === r.id);
      return { ...shapeRfq(r), myBid: b ? { id: b.id, status: b.status, totalPrice: Number(b.totalPrice) } : null };
    });
    res.json(paged(serialize(data), page, pageSize, total));
  }),
);

v1.get(
  "/rfqs/:id",
  requireScope("rfqs:read"),
  asyncHandler(async (req, res) => {
    const companyId = req.apiKey!.companyId;
    const rfq = await prisma.rfq.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }] }, include: { ...rfqInclude, buyer: { select: { id: true, name: true, companyId: true, company: { select: { id: true, name: true, city: true } } } } } });
    if (!rfq) throw notFound("RFQ not found");
    const owner = rfq.buyer.companyId === companyId;
    const bids = await prisma.bid.findMany({ where: { rfqId: rfq.id, ...(owner ? {} : { companyId }) }, include: { company: { select: { id: true, name: true, rating: true, verified: true } }, items: true }, orderBy: { totalPrice: "asc" } });
    if (!owner && rfq.status !== "OPEN" && !bids.length) throw forbidden("This RFQ is not open");
    res.json(serialize({ ...shapeRfq(rfq), bids }));
  }),
);

const createRfqSchema = z.object({
  title: z.string().min(3),
  deliveryCity: z.string().min(2),
  deliveryAddress: z.string().optional(),
  deliveryDate: z.coerce.date().optional(),
  closesAt: z.coerce.date(),
  notes: z.string().optional(),
  items: z.array(z.object({ sku: z.string().optional(), materialId: z.string().optional(), description: z.string().min(1).optional(), quantity: z.coerce.number().positive(), unit: z.string().min(1).optional(), notes: z.string().optional() })).min(1).max(200),
});

/** Buyer ERP → RFQ. Items may reference our SKU; description/unit are then filled from the catalogue. */
v1.post(
  "/rfqs",
  requireScope("rfqs:write"),
  asyncHandler(async (req, res) => {
    const body = createRfqSchema.parse(req.body);
    if (body.closesAt.getTime() <= Date.now()) throw badRequest("closesAt must be in the future");
    const skus = body.items.map((i) => i.sku).filter((s): s is string => Boolean(s));
    const ids = body.items.map((i) => i.materialId).filter((s): s is string => Boolean(s));
    const materials = await prisma.material.findMany({ where: { OR: [...(skus.length ? [{ sku: { in: skus } }] : []), ...(ids.length ? [{ id: { in: ids } }] : [])] }, select: { id: true, sku: true, name: true, unit: true } });
    const items = body.items.map((i, idx) => {
      const m = materials.find((x) => (i.materialId && x.id === i.materialId) || (i.sku && x.sku === i.sku));
      if ((i.sku || i.materialId) && !m) throw badRequest(`items[${idx}]: unknown ${i.sku ? `sku ${i.sku}` : `materialId ${i.materialId}`}`);
      const description = i.description ?? m?.name;
      const unit = i.unit ?? m?.unit;
      if (!description || !unit) throw badRequest(`items[${idx}]: description and unit are required when no sku is given`);
      return { materialId: m?.id, description, quantity: i.quantity, unit, notes: i.notes };
    });
    const reference = await nextReference("RFQ");
    const rfq = await prisma.rfq.create({
      data: { reference, buyerId: req.user!.id, title: body.title, deliveryCity: body.deliveryCity, deliveryAddress: body.deliveryAddress, deliveryDate: body.deliveryDate, closesAt: body.closesAt, notes: body.notes, items: { create: items } },
      include: rfqInclude,
    });
    const materialIds = items.map((i) => i.materialId).filter((x): x is string => Boolean(x));
    const suppliers = await prisma.company.findMany({ where: { type: "SUPPLIER", OR: [{ city: body.deliveryCity }, ...(materialIds.length ? [{ listings: { some: { materialId: { in: materialIds } } } }] : [])] }, select: { id: true } });
    await notify({ userIds: await companyUserIds(suppliers.map((s) => s.id)), type: "NEW_RFQ", title: `New RFQ in ${body.deliveryCity}: ${body.title}`, body: `${items.length} item(s). Bidding closes ${body.closesAt.toISOString().slice(0, 10)}.`, link: `/supplier/marketplace/${rfq.id}` });
    await emitWebhook("rfq.created", suppliers.map((s) => s.id), { rfq: shapeRfq(rfq) });
    await audit(req, "rfq.create", "Rfq", rfq.id, { reference, apiKeyId: req.apiKey!.id });
    res.status(201).json(serialize(shapeRfq(rfq)));
  }),
);

const createBidSchema = z.object({
  validUntil: z.coerce.date(),
  deliveryDays: z.coerce.number().int().min(0).default(7),
  notes: z.string().optional(),
  items: z.array(z.object({ rfqItemId: z.string(), unitPrice: z.coerce.number().nonnegative(), leadTimeDays: z.coerce.number().int().min(0).optional(), notes: z.string().optional() })).min(1),
});

/** Same payload and rules as POST /rfqs/:id/bids (JWT). */
v1.post(
  "/rfqs/:id/bids",
  requireScope("rfqs:write"),
  asyncHandler(async (req, res) => {
    const company = await keyCompany(req);
    if (company.type !== "SUPPLIER") throw forbidden("Only supplier companies can bid");
    const body = createBidSchema.parse(req.body);
    const rfq = await prisma.rfq.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }] }, include: { items: true } });
    if (!rfq) throw notFound("RFQ not found");
    if (rfq.status !== "OPEN" || rfq.closesAt.getTime() < Date.now()) throw badRequest("This RFQ is no longer accepting bids");
    const itemsById = new Map(rfq.items.map((i) => [i.id, i]));
    const items = body.items.map((i) => {
      const rfqItem = itemsById.get(i.rfqItemId);
      if (!rfqItem) throw badRequest(`Unknown RFQ item ${i.rfqItemId}`);
      return { rfqItemId: i.rfqItemId, unitPrice: i.unitPrice, quantity: rfqItem.quantity, leadTimeDays: i.leadTimeDays ?? body.deliveryDays, notes: i.notes };
    });
    const totalPrice = bidTotal(items);
    const existing = await prisma.bid.findUnique({ where: { rfqId_companyId: { rfqId: rfq.id, companyId: company.id } } });
    const bidData = { totalPrice, validUntil: body.validUntil, deliveryDays: body.deliveryDays, notes: body.notes };
    const bid = existing
      ? await prisma.bid.update({ where: { id: existing.id }, data: { ...bidData, status: "SUBMITTED", items: { deleteMany: {}, create: items } }, include: { company: true, items: true } })
      : await prisma.bid.create({ data: { rfqId: rfq.id, companyId: company.id, ...bidData, items: { create: items } }, include: { company: true, items: true } });
    await notify({ userIds: [rfq.buyerId], type: "NEW_BID", title: `${existing ? "Updated" : "New"} bid on ${rfq.reference}`, body: `${company.name} quoted SAR ${totalPrice.toLocaleString("en-US")} (delivery in ${body.deliveryDays} days).`, link: `/dashboard/rfqs/${rfq.id}` });
    await emitWebhook("bid.received", await companyIdsOfUsers([rfq.buyerId]), { bid, rfq: { id: rfq.id, reference: rfq.reference, title: rfq.title } });
    res.status(existing ? 200 : 201).json(serialize(bid));
  }),
);

router.use("/integrations/v1", v1);

export default router;
