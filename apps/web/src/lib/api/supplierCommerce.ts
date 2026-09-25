import type {
  AttributeType,
  CategoryAttribute,
  CategoryAttributePayload,
  Company,
  CompanyType,
  CreditInfo,
  ListingTier,
  Paginated,
  PriceListing,
  ProductQuestion,
  ProductReview,
  ProductReviewsResponse,
  ReturnRequest,
  ReturnStatus,
  SupplierProduct,
  SupplierProductsResponse,
} from "@mysupplier/shared";
import { request } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types for the supplier / admin commerce screens (tiers & sales, returns,
// product reviews & Q&A, credit terms, category attributes)
// ---------------------------------------------------------------------------

/** Sale + volume-tier fields carried by a supplier listing (GET /supplier/prices, PATCH /supplier/prices/:id, PUT …/tiers). */
export interface ListingPricingExtras {
  salePrice?: number | null;
  saleEndsAt?: string | null;
  tiers?: ListingTier[];
}

export type SupplierListingWithPricing = PriceListing & ListingPricingExtras & { stock?: number | null };

/** Supplier product row, optionally enriched with the pricing extras (the list endpoint may or may not include them). */
export type SupplierProductWithPricing = SupplierProduct & ListingPricingExtras & { material: SupplierProduct["material"] & { ratingAvg?: number; ratingCount?: number } };

export interface SupplierPricingPatch {
  price?: number;
  stock?: number | null;
  minQty?: number;
  leadTimeDays?: number;
  active?: boolean;
  salePrice?: number | null;
  saleEndsAt?: string | null;
}

export type ReturnDetail = ReturnRequest & { estimatedRefund?: number | null };
export type ReturnActionStatus = "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED";
export interface ReturnActionPayload {
  status: ReturnActionStatus;
  resolution?: string;
  refundAmount?: number;
}

/** Transitions a supplier / admin may trigger from each state (buyers only cancel). */
export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnActionStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED"],
  APPROVED: ["RECEIVED", "REJECTED"],
  RECEIVED: ["REFUNDED"],
  REJECTED: [],
  REFUNDED: [],
  CANCELLED: [],
};

export type AdminProductReview = ProductReview & { material?: { id: string; name: string; sku: string } | null };
export interface AdminProductReviewsResponse extends Paginated<AdminProductReview> {
  summary: { average: number; total: number; hidden: number };
}
export type AdminProductQuestion = ProductQuestion & { material?: { id: string; name: string; sku: string } | null };

export interface AdminCreditCompany {
  id: string;
  name: string;
  type: CompanyType;
  verified: boolean;
}
export interface AdminCreditOpenOrder {
  id: string;
  reference: string;
  total: number;
  dueDate?: string | null;
  createdAt: string;
  buyer?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
}
export interface AdminCompanyCredit {
  company: AdminCreditCompany;
  credit: CreditInfo;
  openOrders: AdminCreditOpenOrder[];
  overdue: number;
  settled: { orders: number; amount: number };
}
export interface AdminCreditPatch {
  creditApproved?: boolean;
  creditLimit?: number | null;
  creditTermsDays?: number | null;
}

/** Company row from GET /admin/companies – the API serialises the whole record, so credit columns ride along. */
export type AdminCompanyRow = Company & {
  creditApproved?: boolean;
  creditLimit?: number | null;
  creditTermsDays?: number | null;
  creditUsed?: number | null;
  counts?: { users: number; listings: number; bids: number };
};

export const ATTRIBUTE_TYPES: AttributeType[] = ["TEXT", "NUMBER", "SELECT", "BOOLEAN"];

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
const enc = encodeURIComponent;

export const supplierCommerceApi = {
  // Tiers & sales -----------------------------------------------------------
  updatePricing: (listingId: string, body: SupplierPricingPatch) =>
    request<SupplierListingWithPricing>(`/supplier/prices/${enc(listingId)}`, { method: "PATCH", body }),
  replaceTiers: (listingId: string, tiers: ListingTier[]) =>
    request<SupplierListingWithPricing>(`/supplier/prices/${enc(listingId)}/tiers`, { method: "PUT", body: { tiers } }),
  /** Raw supplier listings (carry salePrice / saleEndsAt / tiers, which the "My products" rows may not). */
  supplierListings: (page = 1, pageSize = 100) => request<Paginated<SupplierListingWithPricing>>("/supplier/prices", { query: { page, pageSize } }),
  /** Loads every supplier listing (up to `maxPages` × 100) and indexes the pricing extras by listing id. */
  async listingPricingMap(maxPages = 10): Promise<Map<string, ListingPricingExtras>> {
    const map = new Map<string, ListingPricingExtras>();
    for (let page = 1; page <= maxPages; page += 1) {
      const res = await supplierCommerceApi.supplierListings(page, 100);
      res.data.forEach((l) => map.set(l.id, { salePrice: l.salePrice ?? null, saleEndsAt: l.saleEndsAt ?? null, tiers: l.tiers ?? [] }));
      if (res.page * res.pageSize >= res.total) break;
    }
    return map;
  },
  /** All of the supplier's products (used by the reviews workspace, which has no supplier-wide review endpoint). */
  async allSupplierProducts(maxPages = 10): Promise<SupplierProductWithPricing[]> {
    const rows: SupplierProductWithPricing[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const res = await request<SupplierProductsResponse>("/supplier/products", { query: { page, pageSize: 100, sort: "name" } });
      rows.push(...(res.data as SupplierProductWithPricing[]));
      if (res.page * res.pageSize >= res.total) break;
    }
    return rows;
  },

  // Returns / RMA -------------------------------------------------------------
  returns: (query: { status?: ReturnStatus | ""; orderId?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<ReturnRequest>>("/returns", { query: { status: query.status || undefined, orderId: query.orderId, page: query.page, pageSize: query.pageSize } }),
  returnDetail: (id: string) => request<ReturnDetail>(`/returns/${enc(id)}`),
  updateReturn: (id: string, body: ReturnActionPayload) => request<ReturnDetail>(`/returns/${enc(id)}`, { method: "PATCH", body }),

  // Product reviews & Q&A (supplier side) -----------------------------------
  productReviews: (materialId: string, query: { sort?: "recent" | "helpful" | "rating"; page?: number; pageSize?: number } = {}) =>
    request<ProductReviewsResponse>(`/shop/products/${enc(materialId)}/reviews`, { query }),
  replyToReview: (reviewId: string, reply: string) => request<ProductReview>(`/supplier/reviews/${enc(reviewId)}/reply`, { method: "POST", body: { reply } }),
  productQuestions: (materialId: string, query: { page?: number; pageSize?: number } = {}) =>
    request<Paginated<ProductQuestion>>(`/shop/products/${enc(materialId)}/questions`, { query }),
  answerQuestion: (questionId: string, answer: string) => request<ProductQuestion>(`/shop/questions/${enc(questionId)}/answer`, { method: "POST", body: { answer } }),

  // Admin: product reviews & questions ----------------------------------------
  adminProductReviews: (query: { hidden?: "true" | "false" | ""; q?: string; rating?: number; page?: number; pageSize?: number } = {}) =>
    request<AdminProductReviewsResponse>("/admin/product-reviews", { query: { ...query, hidden: query.hidden || undefined } }),
  adminSetProductReviewHidden: (id: string, hidden: boolean) => request<AdminProductReview>(`/admin/product-reviews/${enc(id)}`, { method: "PATCH", body: { hidden } }),
  adminDeleteProductReview: (id: string) => request<{ ok: boolean }>(`/admin/product-reviews/${enc(id)}`, { method: "DELETE" }),
  adminProductQuestions: (query: { hidden?: "true" | "false" | ""; answered?: "true" | "false" | ""; q?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<AdminProductQuestion>>("/admin/product-questions", { query: { ...query, hidden: query.hidden || undefined, answered: query.answered || undefined } }),
  adminSetProductQuestionHidden: (id: string, hidden: boolean) => request<AdminProductQuestion>(`/admin/product-questions/${enc(id)}`, { method: "PATCH", body: { hidden } }),
  adminDeleteProductQuestion: (id: string) => request<{ ok: boolean }>(`/admin/product-questions/${enc(id)}`, { method: "DELETE" }),

  // Admin: category attributes ------------------------------------------------
  categoryAttributes: (categoryId: string) => request<CategoryAttribute[]>(`/admin/categories/${enc(categoryId)}/attributes`),
  /** Public view: the category's own definitions plus inherited parent ones (what the facet sidebar sees). */
  publicCategoryAttributes: (slugOrId: string) => request<CategoryAttribute[]>(`/categories/${enc(slugOrId)}/attributes`),
  createAttribute: (categoryId: string, body: CategoryAttributePayload) =>
    request<CategoryAttribute>(`/admin/categories/${enc(categoryId)}/attributes`, { method: "POST", body }),
  updateAttribute: (id: string, body: Partial<CategoryAttributePayload>) => request<CategoryAttribute>(`/admin/attributes/${enc(id)}`, { method: "PATCH", body }),
  deleteAttribute: (id: string) => request<{ ok: boolean }>(`/admin/attributes/${enc(id)}`, { method: "DELETE" }),

  // Admin: credit terms ---------------------------------------------------------
  adminCompanies: (query: { q?: string; verified?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<AdminCompanyRow>>("/admin/companies", { query }),
  adminCompanyCredit: (companyId: string) => request<AdminCompanyCredit>(`/admin/companies/${enc(companyId)}/credit`),
  adminUpdateCompanyCredit: (companyId: string, body: AdminCreditPatch) =>
    request<{ company: { id: string; name: string }; credit: CreditInfo }>(`/admin/companies/${enc(companyId)}/credit`, { method: "PATCH", body }),
};

// ---------------------------------------------------------------------------
// Pure helpers shared by the screens
// ---------------------------------------------------------------------------

/** True when a sale price is set and its end date (if any) is still ahead. */
export function isSaleLive(extras: ListingPricingExtras | null | undefined, now = Date.now()): boolean {
  if (!extras || extras.salePrice === null || extras.salePrice === undefined) return false;
  if (!extras.saleEndsAt) return true;
  const ends = new Date(extras.saleEndsAt).getTime();
  return Number.isNaN(ends) || ends > now;
}

/** Mirrors the API's tier validation so the form can complain before the round trip. */
export function validateTiers(tiers: Array<{ minQty: number; price: number }>, basePrice: number): string | null {
  if (tiers.length > 10) return "At most 10 tiers are allowed.";
  let prevQty = 1;
  let prevPrice = basePrice;
  for (const [i, t] of tiers.entries()) {
    if (!Number.isFinite(t.minQty) || !(t.minQty > prevQty)) return `Tier ${i + 1}: minimum quantity must be greater than ${prevQty}.`;
    if (!Number.isFinite(t.price) || !(t.price > 0)) return `Tier ${i + 1}: price must be positive.`;
    if (!(t.price < prevPrice)) return `Tier ${i + 1}: price must be lower than ${i === 0 ? "the base price" : "the previous tier"} (${prevPrice}).`;
    prevQty = t.minQty;
    prevPrice = t.price;
  }
  return null;
}

export const slugifyKey = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
