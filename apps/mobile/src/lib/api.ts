import { storage } from "./storage";
import type {
  SupplierProduct,
  SupplierProductsResponse,
  AiConfig,
  ApiError,
  AuthResponse,
  Bid,
  BoqAnalysis,
  BoqLineInput,
  BoqToRfqPayload,
  Branch,
  Carrier,
  CarrierCode,
  Cart,
  CartItem,
  Category,
  CheckoutPayload,
  CheckoutResult,
  ClientErrorReport,
  Company,
  CompanyInvite,
  CompanyProfile,
  CompanyRole,
  CreateBidPayload,
  CreateRfqPayload,
  CreateShipmentPayload,
  DeliveryQuote,
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
  OtpRequestPayload,
  OtpRequestResult,
  OtpVerifyPayload,
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
  RefundPayload,
  RefundResult,
  RegisterPayload,
  Review,
  Rfq,
  Shipment,
  ShipmentStatus,
  StatementLine,
  StockMovement,
  StockMovementType,
  SupplierDashboard,
  TeamMember,
  UpsertPricePayload,
  User,
  // marketplace (product discovery)
  ProductSearchResponse,
  ProductSort,
  ShopSuggestions,
  ShopOfferWithPricing,
  ProductDiscoveryDetail,
  ProductReviewsResponse,
  ProductReviewPayload,
  ProductReview,
  ProductQuestion,
  Wishlist,
  WishlistContains,
  WishlistItem,
  WishlistItemPayload,
  WishlistAddToCartResult,
  PriceAlert,
  PriceAlertPayload,
  // commerce (B2B)
  Address,
  AddressPayload,
  CartItemPricing,
  CheckoutExtras,
  CreditInfo,
  FrequentlyOrderedItem,
  ListingTier,
  RecurringOrder,
  RecurringOrderPayload,
  RecurringOrderUpdatePayload,
  RecurringRunResult,
  ReorderResult,
  ReturnPayload,
  ReturnRequest,
  ReturnStatus,
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

/**
 * Short-lived, single-purpose download token for one API path (the browser can't send headers on
 * navigation and the session JWT must never travel in a URL). `path` has no `/api/v1` prefix or query.
 */
export async function downloadUrl(path: string): Promise<string> {
  const { token } = await request<{ token: string; expiresIn: number }>("/auth/download-token", { method: "POST", body: { path } });
  return `${API_URL}${path}?token=${encodeURIComponent(token)}`;
}

/** Printable invoice URL carrying a short-lived download token. */
export function invoiceHtmlUrl(orderId: string): Promise<string> {
  return downloadUrl(`/orders/${encodeURIComponent(orderId)}/invoice.html`);
}

/** Printable delivery note / packing slip URL carrying a short-lived download token. */
export function deliveryNoteUrl(orderId: string): Promise<string> {
  return downloadUrl(`/orders/${encodeURIComponent(orderId)}/delivery-note.html`);
}

/** Hosted card-payment page served by the API (Moyasar form); redirects back to `mysupplier://payment`. Uses a 60 s single-path token, never the session. */
export function paymentPageUrl(orderId: string): Promise<string> {
  return downloadUrl(`/payments/${encodeURIComponent(orderId)}/page`);
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

export type ShopSort = ProductSort;

// Type alias (not interface) so it is assignable to the indexed Query type.
export type ShopProductsQuery = {
  q?: string;
  categoryId?: string;
  city?: string;
  /** Comma separated for OR. */
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: 1 | undefined;
  minRating?: number;
  sort?: ShopSort;
  page?: number;
  pageSize?: number;
  /** `spec.<key>` = "value,value" (OR) or "min..max" for NUMBER attributes. */
  [spec: `spec.${string}`]: string | undefined;
};

/** Selected value(s) of one spec facet: a value list (SELECT/TEXT/BOOLEAN) or a numeric range (NUMBER). */
export type SpecFilterValue = { values: string[] } | { min?: number; max?: number };

/** Serialises spec selections to `spec.<key>` query params (empty selections are dropped). */
export function specQuery(specs: Record<string, SpecFilterValue>): Record<`spec.${string}`, string | undefined> {
  const out: Record<`spec.${string}`, string | undefined> = {};
  Object.entries(specs).forEach(([key, v]) => {
    if ("values" in v) {
      if (v.values.length) out[`spec.${key}`] = v.values.join(",");
    } else if (v.min !== undefined || v.max !== undefined) {
      out[`spec.${key}`] = `${v.min ?? ""}..${v.max ?? ""}`;
    }
  });
  return out;
}

/** `GET /shop/products/:id`: ProductDetail + discovery extras; offers carry sale / tier pricing. */
export type ProductPage = Omit<ProductDetail, "offers" | "bestOffer" | "related"> &
  ProductDiscoveryDetail & {
    offers: ShopOfferWithPricing[];
    bestOffer?: ShopOfferWithPricing | null;
    related: Product[];
    /** Gallery pictures (may be empty; `imageUrl` is the primary one). */
    images?: string[];
    datasheetUrl?: string | null;
    videoUrl?: string | null;
    ratingAvg?: number;
    ratingCount?: number;
  };

export type RecommendationsResponse = { basis: "recently_viewed" | "popular"; items: Product[] };
export type RecentlyViewedProduct = Product & { viewedAt: string };

export type ReviewSort = "recent" | "helpful" | "rating";

/** `GET /wishlists/:id` – items with the enriched material. */
export type WishlistDetail = Wishlist & { items: WishlistItem[] };

/** Credit terms as returned inside the cart (`canCoverCart`) and by `GET /me/credit`. */
export type CartCredit = CreditInfo & { canCoverCart: boolean };

/** Cart line with the effective pricing computed by the API (tier / sale). */
export type CartLine = CartItem & Partial<CartItemPricing> & { tiers?: ListingTier[] };

export type ReturnDetail = ReturnRequest & { estimatedRefund?: number | null };

export type ReturnsQuery = {
  status?: ReturnStatus;
  orderId?: string;
  page?: number;
};

export type RecurringOrderRow = RecurringOrder & {
  lastOrder?: { id: string; reference: string; total: number; status: string; createdAt: string } | null;
};

export type RecurringRunResponse = RecurringRunResult & { total: number; recurringOrder: RecurringOrderRow };

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

// Go-live: OTP, refunds, shipments & carriers, client errors -----------------

/**
 * `GET /cart?deliveryCity=&coupon=`: cheapest quote per supplier (null = no carrier rate, flat fee applies),
 * per-line tier / sale pricing, total `savings`, and the buyer's `credit` terms (null without a company).
 */
export type CartWithQuotes = Omit<Cart, "items"> & {
  items: CartLine[];
  quotes?: Record<string, DeliveryQuote | null>;
  savings?: number;
  credit?: CartCredit | null;
};

/** `POST /checkout` accepts the carrier chosen per supplier group plus a saved address / PO number. */
export type CheckoutPayloadWithCarriers = CheckoutPayload & CheckoutExtras & { carrierBySupplier?: Record<string, CarrierCode> };

export interface ShippingQuoteBody {
  supplierCompanyId?: string;
  items: Array<{ materialId: string; quantity: number }>;
  deliveryCity: string;
  pickupCity?: string;
}

export type ShipmentPatch = Partial<CreateShipmentPayload> & {
  status?: ShipmentStatus;
  description?: string;
  location?: string;
};

export const api = {
  // Auth: phone OTP
  otpRequest: (payload: OtpRequestPayload) =>
    request<OtpRequestResult>("/auth/otp/request", { method: "POST", body: payload }),
  otpVerify: (payload: OtpVerifyPayload) =>
    request<AuthResponse>("/auth/otp/verify", { method: "POST", body: payload, auth: false }),
  /** After `otpRequest({ purpose: "VERIFY_PHONE" })` for the logged-in user's phone. */
  verifyPhone: (code: string) => request<User>("/auth/phone/verify", { method: "POST", body: { code } }),

  // Refunds (supplier owner/manager, admin) on PAID orders
  refundOrder: (orderId: string, payload: RefundPayload) =>
    request<RefundResult>(`/payments/${encodeURIComponent(orderId)}/refund`, { method: "POST", body: payload }),

  // Shipping & shipments
  carriers: () => request<Carrier[]>("/shipping/carriers", { auth: false }),
  shippingQuote: (body: ShippingQuoteBody) =>
    request<DeliveryQuote[]>("/shipping/quote", { method: "POST", body, auth: false }),
  orderShipments: (orderId: string) => request<Shipment[]>(`/orders/${encodeURIComponent(orderId)}/shipments`),
  createShipment: (orderId: string, payload: CreateShipmentPayload) =>
    request<Shipment>(`/orders/${encodeURIComponent(orderId)}/shipments`, { method: "POST", body: payload }),
  updateShipment: (id: string, patch: ShipmentPatch) =>
    request<Shipment>(`/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  supplierBranches: () => request<Branch[]>("/supplier/branches"),

  // Ops: client error reports (never awaited by UI code; see lib/errorReporting)
  reportClientError: (report: ClientErrorReport) =>
    request<{ ok: true }>("/client-errors", { method: "POST", body: report }),

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
  supplierProducts: (query: { q?: string; status?: string; city?: string; sort?: string; page?: number } = {}) => request<SupplierProductsResponse>("/supplier/products", { query }),
  uploadListingImage: (listingId: string, form: FormData) => requestMultipart<SupplierProduct>(`/supplier/prices/${encodeURIComponent(listingId)}/image`, form),
  deleteListingImage: (listingId: string) => request<SupplierProduct>(`/supplier/prices/${encodeURIComponent(listingId)}/image`, { method: "DELETE" }),
  supplierPrices: (page = 1) =>
    request<Paginated<PriceListing>>("/supplier/prices", { query: { page } }),
  upsertPrice: (payload: UpsertPricePayload) =>
    request<PriceListing>("/supplier/prices", { method: "POST", body: payload }),
  deletePrice: (id: string) => request<{ ok: true }>(`/supplier/prices/${id}`, { method: "DELETE" }),

  // Shop (public)
  shopHome: () => request<ShopHome>("/shop/home", { auth: false }),
  shopProducts: (query: ShopProductsQuery = {}) =>
    request<ProductSearchResponse>("/shop/products", { query, auth: false }),
  /** Product page; sent with the token when logged in so the API records "recently viewed". */
  shopProduct: (id: string, city?: string | null) => request<ProductPage>(`/shop/products/${encodeURIComponent(id)}`, { query: { city } }),
  shopBrands: () => request<Array<{ brand: string; productCount: number; imageUrl: string | null }>>("/shop/brands", { auth: false }),
  shopSuggest: (q: string) => request<ShopSuggestions>("/shop/suggest", { query: { q }, auth: false }),
  recommendations: (city?: string | null) => request<RecommendationsResponse>("/shop/recommendations", { query: { city } }),
  recentlyViewed: (city?: string | null) => request<RecentlyViewedProduct[]>("/shop/recently-viewed", { query: { city } }),

  // Product reviews & Q&A
  productReviews: (id: string, query: { sort?: ReviewSort; page?: number } = {}) =>
    request<ProductReviewsResponse>(`/shop/products/${encodeURIComponent(id)}/reviews`, { query }), // token optional; when present the response carries `mine`
  createProductReview: (id: string, payload: ProductReviewPayload) =>
    request<ProductReview>(`/shop/products/${encodeURIComponent(id)}/reviews`, { method: "POST", body: payload }),
  updateProductReview: (reviewId: string, payload: Partial<ProductReviewPayload>) =>
    request<ProductReview>(`/shop/reviews/${encodeURIComponent(reviewId)}`, { method: "PATCH", body: payload }),
  markReviewHelpful: (reviewId: string) =>
    request<{ id: string; helpful: number }>(`/shop/reviews/${encodeURIComponent(reviewId)}/helpful`, { method: "POST" }),
  productQuestions: (id: string, page = 1) =>
    request<Paginated<ProductQuestion>>(`/shop/products/${encodeURIComponent(id)}/questions`, { query: { page }, auth: false }),
  askProductQuestion: (id: string, question: string) =>
    request<ProductQuestion>(`/shop/products/${encodeURIComponent(id)}/questions`, { method: "POST", body: { question } }),

  // Wishlists / project lists
  wishlists: () => request<Wishlist[]>("/wishlists"),
  createWishlist: (name: string) => request<Wishlist>("/wishlists", { method: "POST", body: { name } }),
  wishlist: (id: string, city?: string | null) => request<WishlistDetail>(`/wishlists/${encodeURIComponent(id)}`, { query: { city } }),
  renameWishlist: (id: string, name: string) => request<Wishlist>(`/wishlists/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } }),
  deleteWishlist: (id: string) => request<{ ok: true }>(`/wishlists/${encodeURIComponent(id)}`, { method: "DELETE" }),
  wishlistContains: (materialId: string) => request<WishlistContains>("/wishlists/contains", { query: { materialId } }),
  /** `wishlistId` may be "default". */
  addWishlistItem: (wishlistId: string, payload: WishlistItemPayload) =>
    request<WishlistItem>(`/wishlists/${encodeURIComponent(wishlistId)}/items`, { method: "POST", body: payload }),
  updateWishlistItem: (wishlistId: string, itemId: string, patch: Partial<Omit<WishlistItemPayload, "materialId">>) =>
    request<WishlistItem>(`/wishlists/${encodeURIComponent(wishlistId)}/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: patch }),
  removeWishlistItem: (wishlistId: string, itemId: string) =>
    request<{ ok: true }>(`/wishlists/${encodeURIComponent(wishlistId)}/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }),
  wishlistAddToCart: (wishlistId: string, city?: string | null) =>
    request<WishlistAddToCartResult>(`/wishlists/${encodeURIComponent(wishlistId)}/add-to-cart`, { method: "POST", body: { city: city ?? undefined } }),

  // Price alerts
  alerts: () => request<PriceAlert[]>("/alerts"),
  createAlert: (payload: PriceAlertPayload) => request<PriceAlert>("/alerts", { method: "POST", body: payload }),
  deleteAlert: (id: string) => request<{ ok: true }>(`/alerts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Address book
  addresses: () => request<Address[]>("/addresses"),
  createAddress: (payload: AddressPayload) => request<Address>("/addresses", { method: "POST", body: payload }),
  updateAddress: (id: string, patch: Partial<AddressPayload>) =>
    request<Address>(`/addresses/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  deleteAddress: (id: string) => request<{ ok: true }>(`/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setDefaultAddress: (id: string) => request<Address>(`/addresses/${encodeURIComponent(id)}/default`, { method: "POST" }),

  // Credit terms
  myCredit: () => request<CreditInfo & { openOrders: number; overdue: number }>("/me/credit"),

  // Reorder / buy again
  reorder: (orderId: string) => request<ReorderResult>(`/orders/${encodeURIComponent(orderId)}/reorder`, { method: "POST" }),
  frequentlyOrdered: (limit = 20) => request<FrequentlyOrderedItem[]>("/orders/frequently-ordered", { query: { limit } }),

  // Returns / RMA
  createReturn: (orderId: string, payload: ReturnPayload) =>
    request<ReturnRequest>(`/orders/${encodeURIComponent(orderId)}/returns`, { method: "POST", body: payload }),
  returns: (query: ReturnsQuery = {}) => request<Paginated<ReturnRequest>>("/returns", { query }),
  returnDetail: (id: string) => request<ReturnDetail>(`/returns/${encodeURIComponent(id)}`),
  cancelReturn: (id: string) => request<ReturnRequest>(`/returns/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: "CANCELLED" } }),

  // Recurring orders
  recurringOrders: () => request<RecurringOrderRow[]>("/recurring"),
  createRecurring: (payload: RecurringOrderPayload) => request<RecurringOrderRow>("/recurring", { method: "POST", body: payload }),
  updateRecurring: (id: string, patch: RecurringOrderUpdatePayload) =>
    request<RecurringOrderRow>(`/recurring/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  deleteRecurring: (id: string) => request<{ ok: true }>(`/recurring/${encodeURIComponent(id)}`, { method: "DELETE" }),
  runRecurringNow: (id: string) => request<RecurringRunResponse>(`/recurring/${encodeURIComponent(id)}/run-now`, { method: "POST" }),

  // Cart & checkout (auth)
  /** `coupon` validates a promotion code (result in `coupon` / `couponError`); pass it again as `couponCode` at checkout. */
  cart: (deliveryCity?: string | null, coupon?: string | null) => request<CartWithQuotes>("/cart", { query: { deliveryCity, coupon } }),
  addCartItem: (listingId: string, quantity: number) =>
    request<CartWithQuotes>("/cart/items", { method: "POST", body: { listingId, quantity } }),
  updateCartItem: (id: string, quantity: number) =>
    request<CartWithQuotes>(`/cart/items/${id}`, { method: "PATCH", body: { quantity } }),
  removeCartItem: (id: string) => request<CartWithQuotes>(`/cart/items/${id}`, { method: "DELETE" }),
  clearCart: () => request<CartWithQuotes>("/cart", { method: "DELETE" }),
  checkout: (payload: CheckoutPayloadWithCarriers) => request<CheckoutResult>("/checkout", { method: "POST", body: payload }),

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
