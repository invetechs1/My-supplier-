import * as SecureStore from "expo-secure-store";
import type {
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
  CreateBidPayload,
  CreateRfqPayload,
  LoginPayload,
  Material,
  Notification,
  Order,
  OrderExtended,
  OrderStatus,
  Paginated,
  PaymentStatus,
  Product,
  ProductDetail,
  ShopHome,
  PlatformStats,
  PriceHistoryPoint,
  PriceIndexEntry,
  PriceListing,
  PriceSummary,
  RegisterPayload,
  Rfq,
  UpsertPricePayload,
  User,
} from "@mysupplier/shared";

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000/api/v1";

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
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // SecureStore can be unavailable on web; fail silently.
  }
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

export const api = {
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
