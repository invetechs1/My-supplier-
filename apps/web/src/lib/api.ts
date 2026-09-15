import type {
  AiConfig,
  ApiError,
  AuthResponse,
  Bid,
  BoqAnalysis,
  BoqLineInput,
  BoqToRfqPayload,
  Branch,
  Cart,
  Category,
  CheckoutPayload,
  CheckoutResult,
  Company,
  CompanyDocument,
  CompanyInvite,
  CompanyProfile,
  CompanyRole,
  CreateBidPayload,
  CreateRfqPayload,
  DocumentStatus,
  DocumentType,
  Feed,
  FinanceSummary,
  HealthStatus,
  ImportKind,
  ImportRowStatus,
  ImportStatus,
  InventoryItem,
  InvoiceData,
  LoginPayload,
  Material,
  Notification,
  Order,
  OrderEvent,
  OrderExtended,
  OrderMessage,
  OrderStatus,
  OutreachChannel,
  OutreachRequestResult,
  OutreachSupplier,
  Paginated,
  Payout,
  PayoutStatus,
  PaymentConfig,
  PaymentIntent,
  PaymentRecord,
  PaymentStatus,
  PlatformSettings,
  PlatformStats,
  PriceHistoryPoint,
  PriceImport,
  PriceImportRow,
  PriceIndexEntry,
  PriceListing,
  PriceSummary,
  PriceUpdateRequestInfo,
  PriceUpdateSubmission,
  Product,
  ProductDetail,
  PublishImportResult,
  RegisterPayload,
  Review,
  Rfq,
  Role,
  ShopHome,
  StatementLine,
  StockMovement,
  StockMovementType,
  SupplierCatalogItem,
  SupplierDashboard,
  SupplierPublicProfile,
  TeamMember,
  UpsertPricePayload,
  User,
  VerificationStatus,
} from "@mysupplier/shared";

/** Origin of the API (without the `/api/v1` prefix) – uploaded files are served from `<origin>/uploads/...`. */
export const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1").origin;
  } catch {
    return "http://localhost:4000";
  }
})();

/** Resolve a file URL returned by the API (absolute URLs pass through, `/uploads/...` is prefixed with the API origin). */
export function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const TOKEN_KEY = "ms_token";

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage failures */
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

export async function requestWithHeaders<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError("Cannot reach the MySupplier API. Please check your connection.", 0);
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const apiErr = (payload ?? {}) as Partial<ApiError>;
    const message = typeof apiErr.error === "string" ? apiErr.error : `Request failed (${res.status})`;
    throw new ApiRequestError(message, res.status, apiErr.details);
  }
  return { data: payload as T, headers: res.headers };
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await requestWithHeaders<T>(path, options);
  return data;
}

/**
 * Multipart upload. The Content-Type header is deliberately NOT set so the browser
 * adds the multipart boundary itself; the bearer token is still attached.
 */
export async function requestForm<T>(path: string, form: FormData, options: { method?: "POST" | "PATCH" | "PUT"; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "POST",
      headers,
      body: form,
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError("Cannot reach the MySupplier API. Please check your connection.", 0);
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    const apiErr = (payload ?? {}) as Partial<ApiError>;
    const message = typeof apiErr.error === "string" ? apiErr.error : `Request failed (${res.status})`;
    throw new ApiRequestError(message, res.status, apiErr.details);
  }
  return payload as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// ---------------------------------------------------------------------------
// Typed endpoints
// ---------------------------------------------------------------------------

export type MaterialDetail = Material & {
  summary: PriceSummary;
  listings: PriceListing[];
  history: PriceHistoryPoint[];
};

export type CompareEntry = { material: Material; summary: PriceSummary; listings: PriceListing[] };

export type SupplierDetail = Company & {
  listings: PriceListing[];
  stats: { listings: number; bids: number; wonBids: number };
};

export type AdminStats = PlatformStats & {
  rfqsByStatus: Record<string, number>;
  recentOrders: Order[];
  topCategories: PriceIndexEntry[];
};

export type MaterialSort = "price_asc" | "price_desc" | "name" | "updated";

export type MaterialsQuery = {
  q?: string;
  categoryId?: string;
  city?: string;
  page?: number;
  pageSize?: number;
  sort?: MaterialSort | string;
};

export type MarketplaceRfq = Rfq & { myBidId?: string | null };

export type ShopSort = "relevance" | "price_asc" | "price_desc" | "newest" | "popular";

export type ShopProductsQuery = {
  q?: string;
  categoryId?: string;
  city?: string;
  brand?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  inStock?: 1 | undefined;
  sort?: ShopSort | string;
  page?: number;
  pageSize?: number;
};

/** A supplier's own listing; the API also returns tracked stock for it. */
export type SupplierListing = PriceListing & { stock?: number | null };

export interface SupplierPricePatch {
  price?: number;
  stock?: number | null;
  minQty?: number;
  leadTimeDays?: number;
  validUntil?: string | null;
}

/** Row-level error returned by catalogue / feed imports (shape is loose on purpose). */
export type ImportRowError = string | { index?: number; row?: number; sku?: string; name?: string; error?: string; message?: string };

export interface CatalogImportResult {
  created: number;
  updated: number;
  listings: number;
  errors: ImportRowError[];
}

export interface FeedRow {
  sku: string;
  name: string;
  nameAr?: string;
  category: string;
  unit: string;
  brand?: string;
  price: number;
  city: string;
  imageUrl?: string;
  stock?: number;
}

export type FeedFormat = "json" | "csv" | "html";

export interface CreateFeedPayload {
  name: string;
  url: string;
  format: FeedFormat;
  enabled?: boolean;
  /** html feeds only */
  companyId?: string;
  city?: string;
  autoPublish?: boolean;
}

/** Result of POST /admin/feeds/:id/run — json/csv feeds return catalogue counts, html feeds an import reference. */
export type FeedRunResult = Partial<CatalogImportResult> & { importId?: string | null; extracted?: number; published?: number };

export type ImportsQuery = {
  status?: ImportStatus | "";
  kind?: ImportKind | "";
  page?: number;
  pageSize?: number;
};

export interface ImportRowPatch {
  materialId?: string | null;
  price?: number | null;
  unit?: string;
  city?: string | null;
  status?: ImportRowStatus;
  createMaterial?: boolean;
}

export interface PublishImportOptions {
  includeSuggested?: boolean;
  minConfidence?: number;
}

export interface OutreachPayload {
  companyIds: string[];
  channel: OutreachChannel;
  message?: string;
}

export interface PriceUpdateResult {
  updated: number;
  added: number;
  completedAt: string;
}


// Supplier portal (multi-tenant) ------------------------------------------------

/** `GET /auth/me` now returns the caller's company role; older API builds omit it (treated as OWNER). */
export type AppUser = User & { companyRole?: CompanyRole | null; company?: (Company & Partial<CompanyProfile>) | null };

export type CompanyProfilePatch = Partial<
  Pick<
    CompanyProfile,
    | "name"
    | "nameAr"
    | "slug"
    | "description"
    | "descriptionAr"
    | "citiesServed"
    | "minOrderValue"
    | "deliveryFee"
    | "deliveryDays"
    | "workingHours"
    | "phone"
    | "email"
    | "website"
    | "bankName"
    | "iban"
    | "beneficiary"
    | "lowStockThreshold"
  >
>;

export interface BranchPayload {
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  isDefault?: boolean;
}

export interface TeamResponse {
  members: TeamMember[];
  invites: CompanyInvite[];
}

export interface InviteInfo {
  company: { id: string; name: string };
  email: string;
  role: CompanyRole;
  expiresAt: string;
}

export interface AcceptInvitePayload {
  token: string;
  name: string;
  password: string;
  phone?: string;
}

export type InventoryQuery = {
  q?: string;
  branchId?: string;
  lowStock?: 1 | undefined;
  page?: number;
  pageSize?: number;
};

export interface StockMovementPayload {
  type: Extract<StockMovementType, "IN" | "OUT" | "ADJUST">;
  quantity: number;
  reason?: string;
}

export type FinanceStatementQuery = {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export interface GeneratePayoutsPayload {
  periodStart: string;
  periodEnd: string;
  companyId?: string;
}

export interface VerificationPatch {
  status: VerificationStatus;
  notes?: string;
  commissionPct?: number | null;
}

export type AdminCompanyDetail = CompanyProfile & { documents: CompanyDocument[]; members: TeamMember[]; branches: Branch[] };

export const api = {
  // Public
  health: () => request<HealthStatus>("/health"),
  stats: () => request<PlatformStats>("/stats"),
  priceIndex: () => request<PriceIndexEntry[]>("/price-index"),
  categories: () => request<Category[]>("/categories"),
  materials: (query: MaterialsQuery = {}) => request<Paginated<Material>>("/materials", { query }),
  material: (id: string) => request<MaterialDetail>(`/materials/${encodeURIComponent(id)}`),
  materialPrices: (id: string, city?: string) =>
    request<PriceListing[]>(`/materials/${encodeURIComponent(id)}/prices`, { query: { city } }),
  compare: (materialIds: string[], city?: string) =>
    request<CompareEntry[]>("/prices/compare", { query: { materialIds: materialIds.join(","), city } }),
  suppliers: (query: { city?: string; q?: string } = {}) => request<Company[]>("/suppliers", { query }),
  supplier: (id: string) => request<SupplierDetail>(`/suppliers/${encodeURIComponent(id)}`),

  // BOQ research (public)
  boqParse: (text: string) => request<{ lines: BoqLineInput[] }>("/boq/parse", { method: "POST", body: { text } }),
  boqAnalyze: (body: BoqAnalyzeBody) => request<BoqAnalysis>("/boq/analyze", { method: "POST", body }),
  boqToRfq: (payload: BoqToRfqPayload) => request<Rfq>("/boq/to-rfq", { method: "POST", body: payload }),

  // Auth
  register: (payload: RegisterPayload) => request<AuthResponse>("/auth/register", { method: "POST", body: payload }),
  login: (payload: LoginPayload) => request<AuthResponse>("/auth/login", { method: "POST", body: payload }),
  me: () => request<User>("/auth/me"),
  updateMe: (body: { name?: string; phone?: string; locale?: "en" | "ar" }) =>
    request<User>("/auth/me", { method: "PATCH", body }),
  forgotPassword: (email: string) => request<{ ok: boolean }>("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: { token, password } }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  deleteMe: () => request<{ ok: boolean }>("/auth/me", { method: "DELETE" }),

  // Buyer
  createRfq: (payload: CreateRfqPayload) => request<Rfq>("/rfqs", { method: "POST", body: payload }),
  rfqs: (query: { status?: string; page?: number } = {}) => request<Paginated<Rfq>>("/rfqs", { query }),
  rfq: (id: string) => request<Rfq & { bids?: Bid[] }>(`/rfqs/${encodeURIComponent(id)}`),
  closeRfq: (id: string) => request<Rfq>(`/rfqs/${encodeURIComponent(id)}/close`, { method: "POST" }),
  cancelRfq: (id: string) => request<Rfq>(`/rfqs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  acceptBid: (id: string) =>
    request<{ order: Order; rfq: Rfq }>(`/bids/${encodeURIComponent(id)}/accept`, { method: "POST" }),
  rejectBid: (id: string) => request<Bid>(`/bids/${encodeURIComponent(id)}/reject`, { method: "POST" }),

  // Supplier
  marketplaceRfqs: (query: { city?: string; q?: string; page?: number } = {}) =>
    request<Paginated<MarketplaceRfq>>("/marketplace/rfqs", { query }),
  submitBid: (rfqId: string, payload: CreateBidPayload) =>
    request<Bid>(`/rfqs/${encodeURIComponent(rfqId)}/bids`, { method: "POST", body: payload }),
  bids: (query: { status?: string; page?: number } = {}) => request<Paginated<Bid>>("/bids", { query }),
  withdrawBid: (id: string) => request<Bid>(`/bids/${encodeURIComponent(id)}/withdraw`, { method: "POST" }),
  supplierPrices: (page = 1) => request<Paginated<SupplierListing>>("/supplier/prices", { query: { page } }),
  upsertPrice: (payload: UpsertPricePayload) =>
    request<PriceListing>("/supplier/prices", { method: "POST", body: payload }),
  bulkPrices: (items: UpsertPricePayload[]) =>
    request<{ upserted: number }>("/supplier/prices/bulk", { method: "POST", body: { items } }),
  deletePrice: (id: string) => request<{ ok: boolean }>(`/supplier/prices/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Shop (public)
  shopHome: () => request<ShopHome>("/shop/home"),
  shopProducts: (query: ShopProductsQuery = {}) => request<Paginated<Product>>("/shop/products", { query }),
  shopProduct: (id: string) => request<ProductDetail>(`/shop/products/${encodeURIComponent(id)}`),
  shopBrands: () => request<string[]>("/shop/brands"),

  // Cart & checkout (auth)
  cart: () => request<Cart>("/cart"),
  addCartItem: (listingId: string, quantity: number) =>
    request<Cart>("/cart/items", { method: "POST", body: { listingId, quantity } }),
  updateCartItem: (id: string, quantity: number) =>
    request<Cart>(`/cart/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { quantity } }),
  removeCartItem: (id: string) => request<Cart>(`/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
  clearCart: () => request<Cart>("/cart", { method: "DELETE" }),
  checkout: (payload: CheckoutPayload) => request<CheckoutResult>("/checkout", { method: "POST", body: payload }),

  // Supplier catalogue
  supplierCatalogImport: (items: SupplierCatalogItem[]) =>
    request<CatalogImportResult>("/supplier/catalog/import", { method: "POST", body: { items } }),
  updateSupplierPrice: (id: string, body: SupplierPricePatch) =>
    request<SupplierListing>(`/supplier/prices/${encodeURIComponent(id)}`, { method: "PATCH", body }),

  // Orders
  orders: (page = 1) => request<Paginated<OrderExtended>>("/orders", { query: { page } }),
  order: (id: string) => request<OrderExtended>(`/orders/${encodeURIComponent(id)}`),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<OrderExtended>(`/orders/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),
  updateOrderPayment: (id: string, paymentStatus: PaymentStatus) =>
    request<OrderExtended>(`/orders/${encodeURIComponent(id)}/payment`, { method: "PATCH", body: { paymentStatus } }),
  invoice: (id: string) => request<InvoiceData>(`/orders/${encodeURIComponent(id)}/invoice`),

  // Payments (Moyasar)
  paymentsConfig: () => request<PaymentConfig>("/payments/config"),
  createPaymentIntent: (orderId: string) =>
    request<PaymentIntent>(`/payments/${encodeURIComponent(orderId)}/intent`, { method: "POST" }),
  verifyPayment: (orderId: string, paymentId: string) =>
    request<{ order: OrderExtended; payment: PaymentRecord }>(`/payments/${encodeURIComponent(orderId)}/verify`, {
      method: "POST",
      body: { paymentId },
    }),
  payments: (orderId: string) => request<PaymentRecord[]>(`/payments/${encodeURIComponent(orderId)}`),

  // Notifications
  notifications: async (unreadOnly = false) => {
    const res = await requestWithHeaders<Notification[]>("/notifications", {
      query: { unread: unreadOnly ? 1 : undefined },
    });
    const unread = Number(res.headers.get("X-Unread-Count") ?? "0");
    return { items: Array.isArray(res.data) ? res.data : [], unread: Number.isFinite(unread) ? unread : 0 };
  },
  markRead: (id: string) => request<Notification>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  markAllRead: () => request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),

  // Admin
  adminStats: () => request<AdminStats>("/admin/stats"),
  adminUsers: (query: { q?: string; role?: Role | ""; page?: number } = {}) =>
    request<Paginated<User>>("/admin/users", { query }),
  adminUpdateUser: (id: string, body: { role?: Role; active?: boolean }) =>
    request<User>(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  adminCompanies: (query: { verified?: string; page?: number } = {}) =>
    request<Paginated<Company>>("/admin/companies", { query }),
  adminVerifyCompany: (id: string, verified: boolean) =>
    request<Company>(`/admin/companies/${encodeURIComponent(id)}/verify`, { method: "PATCH", body: { verified } }),
  adminCreateCategory: (body: { slug: string; name: string; nameAr: string; parentId?: string; icon?: string }) =>
    request<Category>("/admin/categories", { method: "POST", body }),
  adminCreateMaterial: (body: AdminMaterialPayload) => request<Material>("/admin/materials", { method: "POST", body }),
  adminUpdateMaterial: (id: string, body: Partial<AdminMaterialPayload>) =>
    request<Material>(`/admin/materials/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  adminDeleteMaterial: (id: string) =>
    request<{ ok: boolean }>(`/admin/materials/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminImportPrices: (body: { sourceName: string; items: ImportPriceRow[] }) =>
    request<{ imported?: number; upserted?: number; skipped?: number }>("/admin/prices/import", {
      method: "POST",
      body,
    }),

  // Admin feeds
  adminFeeds: () => request<Feed[]>("/admin/feeds"),
  adminCreateFeed: (body: CreateFeedPayload) => request<Feed>("/admin/feeds", { method: "POST", body }),
  adminRunFeed: (id: string) => request<FeedRunResult>(`/admin/feeds/${encodeURIComponent(id)}/run`, { method: "POST" }),
  adminDeleteFeed: (id: string) => request<{ ok: boolean }>(`/admin/feeds/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminFeedImport: (body: { sourceName: string; items: FeedRow[] }) =>
    request<CatalogImportResult>("/admin/feeds/import", { method: "POST", body }),

  // AI price collection (imports in a review queue)
  aiConfig: () => request<AiConfig>("/ai/config"),
  /** multipart: `file` or `text`, plus kind, city?, sourceName?, supplierName?, quotationDate?. Synchronous (10–60 s). */
  createImport: (formData: FormData) => requestForm<PriceImport>("/imports", formData),
  imports: (query: ImportsQuery = {}) => request<Paginated<PriceImport>>("/imports", { query }),
  importDetail: (id: string) => request<PriceImport>(`/imports/${encodeURIComponent(id)}`),
  updateImportRow: (importId: string, rowId: string, patch: ImportRowPatch) =>
    request<PriceImportRow>(`/imports/${encodeURIComponent(importId)}/rows/${encodeURIComponent(rowId)}`, { method: "PATCH", body: patch }),
  approveAllRows: (id: string, minConfidence = 0.8) =>
    request<PriceImport>(`/imports/${encodeURIComponent(id)}/approve-all`, { method: "POST", body: { minConfidence } }),
  publishImport: (id: string, opts: PublishImportOptions = {}) =>
    request<PublishImportResult>(`/imports/${encodeURIComponent(id)}/publish`, { method: "POST", body: opts }),
  rejectImport: (id: string) => request<PriceImport>(`/imports/${encodeURIComponent(id)}/reject`, { method: "POST" }),

  // Supplier outreach (admin) & public magic-link price updates
  outreachSuppliers: (query: { staleDays?: number | string; q?: string } = {}) => request<OutreachSupplier[]>("/admin/outreach", { query }),
  sendOutreach: (payload: OutreachPayload) => request<OutreachRequestResult[]>("/admin/outreach/requests", { method: "POST", body: payload }),
  priceUpdateInfo: (token: string) => request<PriceUpdateRequestInfo>(`/price-update/${encodeURIComponent(token)}`),
  submitPriceUpdate: (token: string, payload: PriceUpdateSubmission) =>
    request<PriceUpdateResult>(`/price-update/${encodeURIComponent(token)}`, { method: "POST", body: payload }),

  // Supplier portal: dashboard
  supplierDashboard: (days = 30) => request<SupplierDashboard>("/supplier/dashboard", { query: { days } }),

  // Supplier portal: company profile, logo, documents, branches
  supplierCompany: () => request<CompanyProfile>("/supplier/company"),
  updateSupplierCompany: (body: CompanyProfilePatch) => request<CompanyProfile>("/supplier/company", { method: "PATCH", body }),
  uploadCompanyLogo: (file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    return requestForm<CompanyProfile>("/supplier/company/logo", fd);
  },
  companyDocuments: () => request<CompanyDocument[]>("/supplier/company/documents"),
  uploadCompanyDocument: (file: File, type: DocumentType) => {
    const fd = new FormData();
    fd.append("type", type);
    fd.append("file", file, file.name);
    return requestForm<CompanyDocument>("/supplier/company/documents", fd);
  },
  deleteCompanyDocument: (id: string) =>
    request<{ ok: boolean }>(`/supplier/company/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  branches: () => request<Branch[]>("/supplier/branches"),
  createBranch: (body: BranchPayload) => request<Branch>("/supplier/branches", { method: "POST", body }),
  updateBranch: (id: string, body: Partial<BranchPayload>) =>
    request<Branch>(`/supplier/branches/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteBranch: (id: string) => request<{ ok: boolean }>(`/supplier/branches/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Supplier portal: team & invites
  team: () => request<TeamResponse>("/supplier/team"),
  inviteMember: (body: { email: string; role: CompanyRole; name?: string }) =>
    request<CompanyInvite>("/supplier/team/invite", { method: "POST", body }),
  cancelInvite: (id: string) => request<{ ok: boolean }>(`/supplier/team/invite/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateMember: (userId: string, body: { role?: CompanyRole; active?: boolean }) =>
    request<TeamMember>(`/supplier/team/${encodeURIComponent(userId)}`, { method: "PATCH", body }),
  inviteInfo: (token: string) => request<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`),
  acceptInvite: (body: AcceptInvitePayload) => request<AuthResponse>("/auth/accept-invite", { method: "POST", body }),

  // Supplier portal: inventory
  inventory: (query: InventoryQuery = {}) => request<Paginated<InventoryItem>>("/supplier/inventory", { query }),
  setStock: (listingId: string, body: { stock: number | null; branchId?: string | null }) =>
    request<InventoryItem>(`/supplier/inventory/${encodeURIComponent(listingId)}`, { method: "PATCH", body }),
  addStockMovement: (listingId: string, body: StockMovementPayload) =>
    request<StockMovement>(`/supplier/inventory/${encodeURIComponent(listingId)}/movements`, { method: "POST", body }),
  stockMovements: (listingId: string) => request<StockMovement[]>(`/supplier/inventory/${encodeURIComponent(listingId)}/movements`),

  // Orders: timeline, messages, reviews
  orderEvents: (orderId: string) => request<OrderEvent[]>(`/orders/${encodeURIComponent(orderId)}/events`),
  orderMessages: (orderId: string, signal?: AbortSignal) =>
    request<OrderMessage[]>(`/orders/${encodeURIComponent(orderId)}/messages`, { signal }),
  sendOrderMessage: (orderId: string, body: string) =>
    request<OrderMessage>(`/orders/${encodeURIComponent(orderId)}/messages`, { method: "POST", body: { body } }),
  createReview: (orderId: string, body: { rating: number; comment?: string }) =>
    request<Review>(`/orders/${encodeURIComponent(orderId)}/review`, { method: "POST", body }),
  replyToReview: (reviewId: string, reply: string) =>
    request<Review>(`/reviews/${encodeURIComponent(reviewId)}/reply`, { method: "POST", body: { reply } }),
  supplierProfile: (idOrSlug: string) => request<SupplierPublicProfile>(`/suppliers/${encodeURIComponent(idOrSlug)}`),
  supplierReviews: (id: string, page = 1) =>
    request<Paginated<Review>>(`/suppliers/${encodeURIComponent(id)}/reviews`, { query: { page } }),

  // Supplier portal: finance & payouts
  financeSummary: () => request<FinanceSummary>("/supplier/finance/summary"),
  financeStatement: (query: FinanceStatementQuery = {}) => request<Paginated<StatementLine>>("/supplier/finance/statement", { query }),
  supplierPayouts: () => request<Payout[]>("/supplier/payouts"),

  // Admin: platform settings, payouts, company verification
  adminSettings: () => request<PlatformSettings>("/admin/settings"),
  adminUpdateSettings: (body: Partial<PlatformSettings>) => request<PlatformSettings>("/admin/settings", { method: "PATCH", body }),
  adminPayouts: (query: { status?: PayoutStatus | ""; page?: number } = {}) => request<Paginated<Payout>>("/admin/payouts", { query }),
  adminGeneratePayouts: (body: GeneratePayoutsPayload) =>
    request<{ created: Payout[] }>("/admin/payouts/generate", { method: "POST", body }),
  adminUpdatePayout: (id: string, body: { status: "PAID"; reference?: string }) =>
    request<Payout>(`/admin/payouts/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  adminCompany: (id: string) => request<AdminCompanyDetail>(`/admin/companies/${encodeURIComponent(id)}`),
  adminSetVerification: (id: string, body: VerificationPatch) =>
    request<CompanyProfile>(`/admin/companies/${encodeURIComponent(id)}/verification`, { method: "PATCH", body }),
  adminUpdateDocument: (companyId: string, docId: string, body: { status: DocumentStatus; notes?: string }) =>
    request<CompanyDocument>(`/admin/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(docId)}`, { method: "PATCH", body }),
};

/** Printable invoice URL; the JWT travels in the query because browsers can't send headers on navigation. */
export function invoiceHtmlUrl(orderId: string): string {
  const token = getToken();
  return `${API_URL}/orders/${encodeURIComponent(orderId)}/invoice.html${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/** Printable delivery note / packing slip (supplier); token in the query like the invoice. */
export function deliveryNoteHtmlUrl(orderId: string): string {
  const token = getToken();
  return `${API_URL}/orders/${encodeURIComponent(orderId)}/delivery-note.html${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/** CSV export of all listings with stock (opens as a download; token in the query). */
export function inventoryExportUrl(): string {
  const token = getToken();
  return `${API_URL}/supplier/inventory/export.csv${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/** CSV export of the finance statement for a date range (token in the query). */
export function financeStatementCsvUrl(query: { from?: string; to?: string } = {}): string {
  const token = getToken();
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (token) params.set("token", token);
  const qs = params.toString();
  return `${API_URL}/supplier/finance/statement.csv${qs ? `?${qs}` : ""}`;
}

/** Turn a loose import error row into a readable string. */
export function importErrorText(err: ImportRowError): string {
  if (typeof err === "string") return err;
  const where = err.row ?? err.index;
  const label = err.sku ?? err.name;
  const msg = err.error ?? err.message ?? "Invalid row";
  return `${where !== undefined ? `Row ${where}: ` : ""}${label ? `${label} — ` : ""}${msg}`;
}

export interface BoqAnalyzeBody {
  text?: string;
  lines?: BoqLineInput[];
  city?: string;
  verifiedOnly?: boolean;
}

export interface AdminMaterialPayload {
  sku: string;
  name: string;
  nameAr: string;
  unit: string;
  categoryId: string;
  brand?: string;
  specs?: Record<string, string | number>;
  description?: string;
}

export interface ImportPriceRow {
  sku: string;
  price: number;
  city: string;
  minQty?: number;
  leadTimeDays?: number;
}
