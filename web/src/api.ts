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
export interface User { id: number; email: string; phone: string; full_name: string; role: 'buyer' | 'supplier' | 'admin'; company_name: string; city: string; locale: string; is_active: boolean; created_at: string; supplier_id: number | null; phone_verified: boolean; email_verified: boolean; notify_email: boolean; notify_sms: boolean; notify_whatsapp: boolean; notify_push: boolean }
export interface Category { id: number; slug: string; name_ar: string; name_en: string; parent_id: number | null; icon: string; sort_order: number; product_count: number }
export interface PriceSummary { min_price?: number | null; max_price?: number | null; avg_price?: number | null; median_price?: number | null; offer_count: number; supplier_count: number; registered_supplier_count: number; last_updated?: string | null; change_30d_pct?: number | null; cities: string[]; basis: string; rental_min_price?: number | null; rental_basis?: string; best_offer_id?: number | null; best_offer_price?: number | null; best_offer_supplier?: string; best_offer_stock?: string; best_offer_min_qty?: number }
export interface Product { id: number; category_id: number; sku: string; name_ar: string; name_en: string; brand: string; unit: string; spec: Record<string, any>; description: string; image_url: string; is_active: boolean; category_name_ar: string; category_name_en: string; summary?: PriceSummary | null; views: number; sold_qty: number; rating: number; rating_count: number; is_favorite: boolean }
export interface SupplierBrief { id: number; name: string; city: string; verified: boolean; is_external: boolean; rating: number; rating_count: number; delivery_available: boolean; lead_time_days: number; logo_url: string; website: string }
export interface Supplier extends SupplierBrief { user_id: number | null; cr_number: string; vat_number: string; regions: string[]; category_ids: number[]; description: string; phone: string; plan: string; created_at: string; offer_count: number; iban_masked: string; bank_name: string; delivery_fee: number; free_delivery_over: number | null; min_order_amount: number }
export interface Offer { id: number; supplier_id: number; product_id: number; price: number; currency: string; unit: string; min_qty: number; city: string; includes_vat: boolean; delivery_included: boolean; stock_status: string; rental_period: string; valid_until: string | null; source: string; source_name: string; source_url: string; notes: string; updated_at: string; supplier?: SupplierBrief | null; product?: Product | null; price_ex_vat: number; price_inc_vat: number; available_qty: number | null; low_stock_threshold: number; image_url: string }
export interface HistoryPoint { date: string; min_price: number; avg_price: number; max_price: number }
export interface ProductDetail extends Product { offers: Offer[]; history: HistoryPoint[]; related: Product[] }
export interface Paged<T> { items: T[]; total: number; page: number; size: number }
export interface RFQItem { id: number; product_id: number | null; description: string; quantity: number; unit: string; target_price: number | null; notes: string; product?: Product | null; market_min?: number | null; market_avg?: number | null }
export interface BidItem { id: number; rfq_item_id: number; unit_price: number; quantity: number; brand: string; notes: string; line_total: number }
export interface Bid { id: number; rfq_id: number; supplier_id: number; subtotal: number; vat: number; total: number; delivery_days: number; delivery_fee: number; valid_until: string | null; payment_terms: string; notes: string; status: string; created_at: string; updated_at: string; supplier?: SupplierBrief | null; items: BidItem[]; rank?: number | null; rfq_title: string }
export interface RFQ { id: number; buyer_id: number; title: string; description: string; project_name: string; city: string; delivery_address: string; needed_by: string | null; closes_at: string | null; status: string; visibility: string; category_ids: number[]; created_at: string; items: RFQItem[]; bid_count: number; best_total: number | null; buyer_name: string; my_bid?: Bid | null; bids?: Bid[] }
export interface OrderEvent { id: number; status: string; note: string; created_at: string }
export interface OrderItem { id: number; product_id: number | null; description: string; quantity: number; unit: string; unit_price: number; line_total: number }
export interface Order { id: number; buyer_id: number; supplier_id: number; rfq_id: number | null; bid_id: number | null; subtotal: number; vat: number; delivery_fee: number; discount: number; coupon_code: string; total: number; currency: string; status: string; payment_status: string; delivery_address: string; city: string; notes: string; created_at: string; updated_at: string; items: OrderItem[]; supplier?: SupplierBrief | null; buyer_name: string; has_review: boolean; events: OrderEvent[]; group_ref: string }
export interface Notification { id: number; kind: string; title: string; body: string; ref_type: string; ref_id: number | null; is_read: boolean; created_at: string }
export interface PriceAlert { id: number; product_id: number; city: string; target_price: number | null; is_active: boolean; created_at: string; product?: Product | null; current_min?: number | null }
export interface PriceSource { id: number; name: string; kind: string; url: string; city: string; supplier_id: number | null; is_active: boolean; last_fetched_at: string | null; last_status: string; imported_rows: number; created_at: string }
export interface ImportResult { created_products: number; created_offers: number; updated_offers: number; skipped: number; errors: string[] }
export interface Payment { id: number; order_id: number; buyer_id: number; supplier_id: number; provider: string; provider_ref: string; method: string; amount: number; currency: string; platform_fee: number; supplier_net: number; status: string; checkout_url: string; failure_reason: string; transfer_reference: string; paid_at: string | null; released_at: string | null; refunded_at: string | null; created_at: string; bank_instructions: string; publishable_key: string; supplier_name: string; buyer_name: string; group_ref: string }
export interface Payout { id: number; supplier_id: number; payment_id: number; order_id: number; amount: number; status: string; reference: string; iban_masked: string; paid_at: string | null; created_at: string; supplier_name: string }
export interface Invoice { id: number; number: string; kind: string; order_id: number; payment_id: number | null; seller_name: string; seller_vat: string; buyer_name: string; buyer_vat: string; subtotal: number; vat: number; total: number; lines: any[]; qr_tlv_base64: string; issued_at: string }
export interface Delivery { id: number; notification_id: number; user_id: number; channel: string; destination: string; status: string; provider: string; provider_ref: string; error: string; attempts: number; sent_at: string | null; created_at: string }
export const PAY_METHODS = ['mada', 'card', 'applepay', 'stcpay', 'bank_transfer'] as const
export interface SupplierDocument { id: number; supplier_id: number; kind: string; file_url: string; filename: string; status: string; note: string; expires_at: string | null; uploaded_at: string; reviewed_at: string | null; supplier_name: string }
export interface BOQItem { description: string; quantity: number; unit: string; target_price: number | null; product_id: number | null; match_name_ar: string; match_name_en: string; confidence: number }
export interface Dispute { id: number; order_id: number; opened_by: number; role: string; reason: string; status: string; resolution: string; refunded: boolean; created_at: string; resolved_at: string | null; order_total: number; buyer_name: string; supplier_name: string }
export interface Coupon { id: number; code: string; kind: string; value: number; min_order: number; max_discount: number | null; max_uses: number | null; used: number; audience: string; is_active: boolean; expires_at: string | null; created_at: string }
export interface Review { id: number; order_id: number; supplier_id: number; buyer_id: number; rating: number; comment: string; created_at: string; supplier_name: string; buyer_name: string }
export interface PublicSettings { platform_name: string; platform_name_ar: string; tagline: string; support_email: string; support_phone: string; home_banner_text: string; home_banner_link: string; maintenance_message: string; supplier_registration_open: string; buyer_registration_open: string; platform_fee_pct: string; min_order_amount: string }

// ---- v1.5 storefront ----
export interface Address { id: number; label: string; recipient: string; phone: string; city: string; district: string; street: string; building: string; notes: string; lat: number | null; lng: number | null; is_default: boolean; formatted: string }
export interface CartItem { id: number; offer_id: number; quantity: number; offer: Offer; line_total: number }
export interface CartGroup { supplier: SupplierBrief; items: CartItem[]; subtotal: number; delivery_fee: number; free_delivery_over: number | null; min_order_amount: number; below_minimum: boolean }
export interface Cart { groups: CartGroup[]; item_count: number; subtotal: number; delivery_total: number; discount: number; coupon_code: string; coupon_error: string; vat: number; total: number }
export interface GroupCheckout { group_ref: string; checkout_url: string; total: number; method: string; status: string; bank_instructions: string; payments: Payment[] }
export interface ProductReview { id: number; product_id: number; user_id: number; rating: number; title: string; comment: string; verified: boolean; created_at: string; author: string; product_name_ar: string; product_name_en: string }
export interface Suggest { products: { id: number; name_ar: string; name_en: string; brand: string; image_url: string }[]; categories: { id: number; name_ar: string; name_en: string; icon: string }[]; brands: string[] }
export interface HomeSections { best_sellers: Product[]; popular: Product[]; new_arrivals: Product[]; top_rated: Product[]; top_suppliers: { id: number; name: string; city: string; rating: number; rating_count: number; logo_url: string; category_ids: number[] }[]; deals: { code: string; kind: string; value: number; min_order: number; audience: string; expires_at: string | null }[] }
