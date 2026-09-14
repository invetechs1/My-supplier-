import type {
  ApiError,
  AuthResponse,
  Bid,
  BoqAnalysis,
  BoqLineInput,
  BoqToRfqPayload,
  Category,
  Company,
  CreateBidPayload,
  CreateRfqPayload,
  LoginPayload,
  Material,
  Notification,
  Order,
  OrderStatus,
  Paginated,
  PlatformStats,
  PriceHistoryPoint,
  PriceIndexEntry,
  PriceListing,
  PriceSummary,
  RegisterPayload,
  Rfq,
  Role,
  UpsertPricePayload,
  User,
} from "@mysupplier/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
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

export const api = {
  // Public
  health: () => request<{ ok: boolean }>("/health"),
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
  supplierPrices: (page = 1) => request<Paginated<PriceListing>>("/supplier/prices", { query: { page } }),
  upsertPrice: (payload: UpsertPricePayload) =>
    request<PriceListing>("/supplier/prices", { method: "POST", body: payload }),
  bulkPrices: (items: UpsertPricePayload[]) =>
    request<{ upserted: number }>("/supplier/prices/bulk", { method: "POST", body: { items } }),
  deletePrice: (id: string) => request<{ ok: boolean }>(`/supplier/prices/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Orders
  orders: (page = 1) => request<Paginated<Order>>("/orders", { query: { page } }),
  order: (id: string) => request<Order>(`/orders/${encodeURIComponent(id)}`),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<Order>(`/orders/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),

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
};

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
