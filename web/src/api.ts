/** Typed API client. Token is kept in localStorage and sent as a Bearer header. */
export const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/api/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try { return localStorage.getItem('ms_token') } catch { return null }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem('ms_token', t) : localStorage.removeItem('ms_token') } catch { /* ignore */ }
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body && !isForm) headers['Content-Type'] = 'application/json'
  const res = await fetch(API_BASE + path, { method, headers, body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const detail = data?.detail
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : res.statusText
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  get: <T,>(path: string, params?: Record<string, any>) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)])).toString() : ''
    return request<T>('GET', path + qs)
  },
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T,>(path: string) => request<T>('DELETE', path),
  upload: <T,>(path: string, file: File) => { const fd = new FormData(); fd.append('file', file); return request<T>('POST', path, fd, true) },
}

// ---- types (mirror backend schemas) ----
export interface User { id: number; email: string; phone: string; full_name: string; role: 'buyer' | 'supplier' | 'admin'; company_name: string; city: string; locale: string; is_active: boolean; created_at: string; supplier_id: number | null }
export interface Category { id: number; slug: string; name_ar: string; name_en: string; parent_id: number | null; icon: string; sort_order: number; product_count: number }
export interface PriceSummary { min_price?: number | null; max_price?: number | null; avg_price?: number | null; median_price?: number | null; offer_count: number; supplier_count: number; registered_supplier_count: number; last_updated?: string | null; change_30d_pct?: number | null; cities: string[] }
export interface Product { id: number; category_id: number; sku: string; name_ar: string; name_en: string; brand: string; unit: string; spec: Record<string, any>; description: string; image_url: string; is_active: boolean; category_name_ar: string; category_name_en: string; summary?: PriceSummary | null }
export interface SupplierBrief { id: number; name: string; city: string; verified: boolean; is_external: boolean; rating: number; rating_count: number; delivery_available: boolean; lead_time_days: number; logo_url: string; website: string }
export interface Supplier extends SupplierBrief { user_id: number | null; cr_number: string; vat_number: string; regions: string[]; category_ids: number[]; description: string; phone: string; plan: string; created_at: string; offer_count: number }
export interface Offer { id: number; supplier_id: number; product_id: number; price: number; currency: string; unit: string; min_qty: number; city: string; includes_vat: boolean; delivery_included: boolean; stock_status: string; valid_until: string | null; source: string; source_name: string; source_url: string; notes: string; updated_at: string; supplier?: SupplierBrief | null; product?: Product | null; price_ex_vat: number; price_inc_vat: number }
export interface HistoryPoint { date: string; min_price: number; avg_price: number; max_price: number }
export interface ProductDetail extends Product { offers: Offer[]; history: HistoryPoint[]; related: Product[] }
export interface Paged<T> { items: T[]; total: number; page: number; size: number }
export interface RFQItem { id: number; product_id: number | null; description: string; quantity: number; unit: string; target_price: number | null; notes: string; product?: Product | null; market_min?: number | null; market_avg?: number | null }
export interface BidItem { id: number; rfq_item_id: number; unit_price: number; quantity: number; brand: string; notes: string; line_total: number }
export interface Bid { id: number; rfq_id: number; supplier_id: number; subtotal: number; vat: number; total: number; delivery_days: number; delivery_fee: number; valid_until: string | null; payment_terms: string; notes: string; status: string; created_at: string; updated_at: string; supplier?: SupplierBrief | null; items: BidItem[]; rank?: number | null; rfq_title: string }
export interface RFQ { id: number; buyer_id: number; title: string; description: string; project_name: string; city: string; delivery_address: string; needed_by: string | null; closes_at: string | null; status: string; visibility: string; category_ids: number[]; created_at: string; items: RFQItem[]; bid_count: number; best_total: number | null; buyer_name: string; my_bid?: Bid | null; bids?: Bid[] }
export interface OrderItem { id: number; product_id: number | null; description: string; quantity: number; unit: string; unit_price: number; line_total: number }
export interface Order { id: number; buyer_id: number; supplier_id: number; rfq_id: number | null; bid_id: number | null; subtotal: number; vat: number; delivery_fee: number; total: number; currency: string; status: string; delivery_address: string; city: string; notes: string; created_at: string; updated_at: string; items: OrderItem[]; supplier?: SupplierBrief | null; buyer_name: string; has_review: boolean }
export interface Notification { id: number; kind: string; title: string; body: string; ref_type: string; ref_id: number | null; is_read: boolean; created_at: string }
export interface PriceAlert { id: number; product_id: number; city: string; target_price: number | null; is_active: boolean; created_at: string; product?: Product | null; current_min?: number | null }
export interface PriceSource { id: number; name: string; kind: string; url: string; city: string; supplier_id: number | null; is_active: boolean; last_fetched_at: string | null; last_status: string; imported_rows: number; created_at: string }
export interface ImportResult { created_products: number; created_offers: number; updated_offers: number; skipped: number; errors: string[] }
