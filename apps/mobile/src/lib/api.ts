import { storage } from "./storage";
import type {
  AiConfig,
  ApiError,
  AuthResponse,
  Bid,
  BoqAnalysis,
  BoqLineInput,
  BoqToRfqPayload,
  Cart,
  Category,
  CheckoutPayload,
  CheckoutResult,
  Company,
  CompanyInvite,
  CompanyProfile,
  CompanyRole,
  CreateBidPayload,
  CreateRfqPayload,
  DeviceRegistration,
  FinanceSummary,
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
  Paginated,
  PaymentConfig,
  PaymentIntent,
  PaymentRecord,
  PaymentStatus,
  Product,
  ProductDetail,
  ShopHome,
  ImportKind,
  ImportRowStatus,
  ImportStatus,
  PlatformStats,
  PriceHistoryPoint,
  PriceImport,
  PriceImportRow,
  PriceIndexEntry,
  PriceListing,
  PriceSummary,
  PublishImportResult,
  RegisterPayload,
  Review,
  Rfq,
  StatementLine,
  StockMovement,
  StockMovementType,
  SupplierDashboard,
  TeamMember,
  UpsertPricePayload,
  User,
} from "@mysupplier/shared";

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api/v1";

/** Public web app (terms, privacy, password reset pages). */
export const WEB_URL: string = process.env.EXPO_PUBLIC_WEB_URL || "https://mysupplier.sa";

export const TOKEN_KEY = "mysupplier.token";

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

export async function getStoredToken(): Promise<string | null> {
  return storage.getItem(TOKEN_KEY);
}

export async function setStoredToken(token: string | null): Promise<void> {
  if (token) await storage.setItem(TOKEN_KEY, token);
  else await storage.deleteItem(TOKEN_KEY);
}

/** Printable invoice URL (token in the query because browsers can't send headers on navigation). */
export function invoiceHtmlUrl(orderId: string, token: string): string {
  return `${API_URL}/orders/${encodeURIComponent(orderId)}/invoice.html?token=${encodeURIComponent(token)}`;
}

/** Printable delivery note / packing slip (token in the query, like the invoice). */
export function deliveryNoteUrl(orderId: string, token: string): string {
  return `${API_URL}/orders/${encodeURIComponent(orderId)}/delivery-note.html?token=${encodeURIComponent(token)}`;
}

/** Hosted card-payment page served by the API (Moyasar form); redirects back to `mysupplier://payment`. */
export function paymentPageUrl(orderId: string, token: string): string {
  return `${API_URL}/payments/${encodeURIComponent(orderId)}/page?token=${encodeURIComponent(token)}`;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  auth?: boolean;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

export async function requestRaw<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { method = "GET", body, query, auth = true, headers = {} } = options;
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}${buildQuery(query)}`;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  if (auth) {
    const token = await getStoredToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network request failed";
    throw new ApiRequestError(`Cannot reach the server (${message}). Check EXPO_PUBLIC_API_URL.`, 0);
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const errBody = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<ApiError>;
    const message =
      typeof errBody.error === "string"
        ? errBody.error
        : typeof parsed === "string" && parsed
          ? parsed
          : `Request failed with status ${response.status}`;
    throw new ApiRequestError(message, response.status, errBody.details);
  }

  return { data: parsed as T, headers: response.headers };
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await requestRaw<T>(path, options);
  return res.data;
}

/**
 * Multipart upload (files + fields). Unlike `request`, the Content-Type header
 * is left to fetch so the multipart boundary is set correctly; on native the
 * file part is appended as `{ uri, name, type }`.
 */
export async function requestMultipart<T>(
  path: string,
  form: FormData,
  options: { method?: "POST" | "PATCH" | "PUT"; timeoutMs?: number } = {},
): Promise<T> {
  const { method = "POST", timeoutMs = 180_000 } = options;
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = await getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: form, signal: controller?.signal });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = aborted ? "The upload timed out" : err instanceof Error ? err.message : "Network request failed";
    throw new ApiRequestError(aborted ? message : `Cannot reach the server (${message}). Check EXPO_PUBLIC_API_URL.`, 0);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const errBody = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<ApiError>;
    const message =
      typeof errBody.error === "string"
        ? errBody.error
        : typeof parsed === "string" && parsed
          ? parsed
          : `Request failed with status ${response.status}`;
    throw new ApiRequestError(message, response.status, errBody.details);
  }
  return parsed as T;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

// Typed endpoint helpers -----------------------------------------------------

export type MaterialDetail = Material & {
  summary: PriceSummary;
  listings: PriceListing[];
  history: PriceHistoryPoint[];
};

export type MaterialSort = "price_asc" | "price_desc" | "name" | "updated";

// Type alias (not interface) so it is assignable to the indexed Query type.
export type MaterialsQuery = {
  q?: string;
  categoryId?: string;
  city?: string;
  page?: number;
  pageSize?: number;
  sort?: MaterialSort;
};

export type ShopSort = "relevance" | "price_asc" | "price_desc" | "newest" | "popular";

// Type alias (not interface) so it is assignable to the indexed Query type.
export type ShopProductsQuery = {
  q?: string;
  categoryId?: string;
  city?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: 1 | undefined;
  sort?: ShopSort;
  page?: number;
  pageSize?: number;
};

/** URL of the generated SVG product image for a material without imageUrl. */
export function materialImageUrl(sku: string): string {
  return `${API_URL}/images/materials/${encodeURIComponent(sku)}.svg`;
}

export interface BoqAnalyzeBody {
  text?: string;
  lines?: BoqLineInput[];
  city?: string;
  verifiedOnly?: boolean;
}

// Type alias (not interface) so it is assignable to the indexed Query type.
export type ImportsQuery = {
  status?: ImportStatus;
  kind?: ImportKind;
  page?: number;
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

// Supplier portal (multi-tenant) -------------------------------------------

// Type aliases (not interfaces) so they are assignable to the indexed Query type.
export type InventoryQuery = {
  q?: string;
  branchId?: string;
  lowStock?: 1 | undefined;
  page?: number;
};

export type StatementQuery = {
  from?: string;
  to?: string;
  page?: number;
};

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

export interface StockMovementInput {
  type: Extract<StockMovementType, "IN" | "OUT" | "ADJUST">;
  quantity: number;
  reason?: string;
}

export const api = {
  // Supplier portal: dashboard & company
  supplierDashboard: (days = 30) => request<SupplierDashboard>("/supplier/dashboard", { query: { days } }),
  supplierCompany: () => request<CompanyProfile>("/supplier/company"),
  updateSupplierCompany: (patch: CompanyProfilePatch) =>
    request<CompanyProfile>("/supplier/company", { method: "PATCH", body: patch }),

  // Supplier portal: inventory
  inventory: (query: InventoryQuery = {}) => request<Paginated<InventoryItem>>("/supplier/inventory", { query }),
  setInventory: (listingId: string, body: { stock: number | null; branchId?: string }) =>
    request<InventoryItem>(`/supplier/inventory/${encodeURIComponent(listingId)}`, { method: "PATCH", body }),
  addStockMovement: (listingId: string, body: StockMovementInput) =>
    request<StockMovement>(`/supplier/inventory/${encodeURIComponent(listingId)}/movements`, { method: "POST", body }),
  stockMovements: (listingId: string) =>
    request<StockMovement[]>(`/supplier/inventory/${encodeURIComponent(listingId)}/movements`),

  // Orders: timeline, messages, reviews
  orderEvents: (id: string) => request<OrderEvent[]>(`/orders/${encodeURIComponent(id)}/events`),
  orderMessages: (id: string) => request<OrderMessage[]>(`/orders/${encodeURIComponent(id)}/messages`),
  sendOrderMessage: (id: string, body: string) =>
    request<OrderMessage>(`/orders/${encodeURIComponent(id)}/messages`, { method: "POST", body: { body } }),
  createReview: (orderId: string, body: { rating: number; comment?: string }) =>
    request<Review>(`/orders/${encodeURIComponent(orderId)}/review`, { method: "POST", body }),
  replyReview: (id: string, reply: string) =>
    request<Review>(`/reviews/${encodeURIComponent(id)}/reply`, { method: "POST", body: { reply } }),
  supplierReviews: (idOrSlug: string, page = 1) =>
    request<Paginated<Review>>(`/suppliers/${encodeURIComponent(idOrSlug)}/reviews`, { query: { page }, auth: false }),

  // Supplier portal: finance
  financeSummary: () => request<FinanceSummary>("/supplier/finance/summary"),
  financeStatement: (query: StatementQuery = {}) =>
    request<Paginated<StatementLine>>("/supplier/finance/statement", { query }),

  // Supplier portal: team
  team: () => request<{ members: TeamMember[]; invites: CompanyInvite[] }>("/supplier/team"),
  inviteMember: (body: { email: string; role: CompanyRole; name?: string }) =>
    request<CompanyInvite>("/supplier/team/invite", { method: "POST", body }),
  cancelInvite: (id: string) => request<{ ok: true }>(`/supplier/team/invite/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateMember: (userId: string, body: { role?: CompanyRole; active?: boolean }) =>
    request<TeamMember>(`/supplier/team/${encodeURIComponent(userId)}`, { method: "PATCH", body }),

  // AI price collection (imports land in a review queue before publishing)
  aiConfig: () => request<AiConfig>("/ai/config", { auth: false }),
  /** multipart/form-data: `file` or `text`, plus kind, city?, sourceName?, supplierName?, quotationDate? */
  createImport: (form: FormData) => requestMultipart<PriceImport>("/imports", form),
  imports: (query: ImportsQuery = {}) => request<Paginated<PriceImport>>("/imports", { query }),
  importDetail: (id: string) => request<PriceImport>(`/imports/${encodeURIComponent(id)}`),
  updateImportRow: (importId: string, rowId: string, patch: ImportRowPatch) =>
    request<PriceImportRow>(`/imports/${encodeURIComponent(importId)}/rows/${encodeURIComponent(rowId)}`, {
      method: "PATCH",
      body: patch,
    }),
  approveAllRows: (id: string, minConfidence = 0.8) =>
    request<PriceImport>(`/imports/${encodeURIComponent(id)}/approve-all`, { method: "POST", body: { minConfidence } }),
  publishImport: (id: string, opts: PublishImportOptions = {}) =>
    request<PublishImportResult>(`/imports/${encodeURIComponent(id)}/publish`, { method: "POST", body: opts }),
  rejectImport: (id: string) => request<PriceImport>(`/imports/${encodeURIComponent(id)}/reject`, { method: "POST" }),

  // BOQ research (public analyze; RFQ conversion needs a BUYER)
  boqParse: (text: string) =>
    request<{ lines: BoqLineInput[] }>("/boq/parse", { method: "POST", body: { text }, auth: false }),
  boqAnalyze: (body: BoqAnalyzeBody) =>
    request<BoqAnalysis>("/boq/analyze", { method: "POST", body, auth: false }),
  boqToRfq: (payload: BoqToRfqPayload) => request<Rfq>("/boq/to-rfq", { method: "POST", body: payload }),

  // Public
  stats: () => request<PlatformStats>("/stats", { auth: false }),
  priceIndex: () => request<PriceIndexEntry[]>("/price-index", { auth: false }),
  categories: () => request<Category[]>("/categories", { auth: false }),
  materials: (query: MaterialsQuery = {}) =>
    request<Paginated<Material>>("/materials", { query, auth: false }),
  material: (id: string) => request<MaterialDetail>(`/materials/${id}`, { auth: false }),
  materialPrices: (id: string, city?: string) =>
    request<PriceListing[]>(`/materials/${id}/prices`, { query: { city }, auth: false }),
  suppliers: (query: { city?: string; q?: string } = {}) =>
    request<Company[]>("/suppliers", { query, auth: false }),

  // Auth
  login: (payload: LoginPayload) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: payload, auth: false }),
  register: (payload: RegisterPayload) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: payload, auth: false }),
  me: () => request<User>("/auth/me"),
  updateMe: (body: { name?: string; phone?: string; locale?: "en" | "ar" }) =>
    request<User>("/auth/me", { method: "PATCH", body }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>("/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("/auth/reset-password", { method: "POST", body: { token, password }, auth: false }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  deleteAccount: () => request<{ ok: true }>("/auth/me", { method: "DELETE" }),

  // Devices (Expo push tokens)
  registerDevice: (body: DeviceRegistration) => request<{ ok: true }>("/devices", { method: "POST", body }),
  unregisterDevice: (token: string) =>
    request<{ ok: true }>(`/devices/${encodeURIComponent(token)}`, { method: "DELETE" }),

  // Payments (Moyasar-ready)
  paymentConfig: () => request<PaymentConfig>("/payments/config", { auth: false }),
  createPaymentIntent: (orderId: string) =>
    request<PaymentIntent>(`/payments/${orderId}/intent`, { method: "POST" }),
  verifyPayment: (orderId: string, paymentId: string) =>
    request<{ order: OrderExtended; payment: PaymentRecord }>(`/payments/${orderId}/verify`, {
      method: "POST",
      body: { paymentId },
    }),
  orderPayments: (orderId: string) => request<PaymentRecord[]>(`/payments/${orderId}`),

  // Invoices (ZATCA simplified tax invoice)
  invoice: (orderId: string) => request<InvoiceData>(`/orders/${orderId}/invoice`),

  // Buyer
  createRfq: (payload: CreateRfqPayload) => request<Rfq>("/rfqs", { method: "POST", body: payload }),
  myRfqs: (query: { status?: string; page?: number } = {}) =>
    request<Paginated<Rfq>>("/rfqs", { query }),
  rfq: (id: string) => request<Rfq & { bids?: Bid[]; myBid?: Bid | null; myBidId?: string | null }>(`/rfqs/${id}`),
  closeRfq: (id: string) => request<Rfq>(`/rfqs/${id}/close`, { method: "POST" }),
  cancelRfq: (id: string) => request<Rfq>(`/rfqs/${id}/cancel`, { method: "POST" }),
  acceptBid: (id: string) => request<{ order: Order; rfq: Rfq }>(`/bids/${id}/accept`, { method: "POST" }),
  rejectBid: (id: string) => request<Bid>(`/bids/${id}/reject`, { method: "POST" }),

  // Supplier
  marketplaceRfqs: (query: { city?: string; q?: string; page?: number } = {}) =>
    request<Paginated<Rfq & { myBidId?: string | null }>>("/marketplace/rfqs", { query }),
  submitBid: (rfqId: string, payload: CreateBidPayload) =>
    request<Bid>(`/rfqs/${rfqId}/bids`, { method: "POST", body: payload }),
  myBids: (query: { status?: string; page?: number } = {}) =>
    request<Paginated<Bid>>("/bids", { query }),
  withdrawBid: (id: string) => request<Bid>(`/bids/${id}/withdraw`, { method: "POST" }),
  supplierPrices: (page = 1) =>
    request<Paginated<PriceListing>>("/supplier/prices", { query: { page } }),
  upsertPrice: (payload: UpsertPricePayload) =>
    request<PriceListing>("/supplier/prices", { method: "POST", body: payload }),
  deletePrice: (id: string) => request<{ ok: true }>(`/supplier/prices/${id}`, { method: "DELETE" }),

  // Shop (public)
  shopHome: () => request<ShopHome>("/shop/home", { auth: false }),
  shopProducts: (query: ShopProductsQuery = {}) =>
    request<Paginated<Product>>("/shop/products", { query, auth: false }),
  shopProduct: (id: string) => request<ProductDetail>(`/shop/products/${id}`, { auth: false }),
  shopBrands: () => request<string[]>("/shop/brands", { auth: false }),

  // Cart & checkout (auth)
  cart: () => request<Cart>("/cart"),
  addCartItem: (listingId: string, quantity: number) =>
    request<Cart>("/cart/items", { method: "POST", body: { listingId, quantity } }),
  updateCartItem: (id: string, quantity: number) =>
    request<Cart>(`/cart/items/${id}`, { method: "PATCH", body: { quantity } }),
  removeCartItem: (id: string) => request<Cart>(`/cart/items/${id}`, { method: "DELETE" }),
  clearCart: () => request<Cart>("/cart", { method: "DELETE" }),
  checkout: (payload: CheckoutPayload) => request<CheckoutResult>("/checkout", { method: "POST", body: payload }),

  // Orders (OrderExtended: RFQ-awarded and direct shop orders)
  orders: (page = 1) => request<Paginated<OrderExtended>>("/orders", { query: { page } }),
  order: (id: string) => request<OrderExtended>(`/orders/${id}`),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<OrderExtended>(`/orders/${id}/status`, { method: "PATCH", body: { status } }),
  updateOrderPayment: (id: string, paymentStatus: PaymentStatus) =>
    request<OrderExtended>(`/orders/${id}/payment`, { method: "PATCH", body: { paymentStatus } }),

  // Notifications
  notifications: async (unreadOnly = false) => {
    const res = await requestRaw<Notification[]>("/notifications", {
      query: { unread: unreadOnly ? 1 : undefined },
    });
    const unread = Number(res.headers.get("X-Unread-Count") ?? "0");
    return { data: res.data, unread: Number.isNaN(unread) ? 0 : unread };
  },
  markNotificationRead: (id: string) =>
    request<Notification>(`/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () => request<{ ok: true }>("/notifications/read-all", { method: "POST" }),
};
