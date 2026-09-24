/** API client for the mobile app — same endpoints as the web app. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const DEV_HOST = (Constants.expoConfig?.hostUri || '').split(':')[0];
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  (__DEV__ && DEV_HOST ? `http://${DEV_HOST}:8000` : Constants.expoConfig?.extra?.apiBase || 'http://localhost:8000');
const PREFIX = '/api/v1';

let token: string | null = null;
export async function loadToken() { token = await AsyncStorage.getItem('ms_token'); return token; }
export async function setToken(t: string | null) { token = t; t ? await AsyncStorage.setItem('ms_token', t) : await AsyncStorage.removeItem('ms_token'); }
export const getToken = () => token;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API_BASE + PREFIX + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join(', ') : res.statusText);
  }
  return data as T;
}
const qs = (p?: Record<string, any>) => p ? '?' + Object.entries(p).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
export const api = {
  get: <T,>(path: string, params?: Record<string, any>) => request<T>('GET', path + qs(params)),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T,>(path: string) => request<T>('DELETE', path),
};

export interface User { id: number; email: string; full_name: string; role: 'buyer' | 'supplier' | 'admin'; company_name: string; city: string; supplier_id: number | null }
export interface Category { id: number; slug: string; name_ar: string; name_en: string; parent_id: number | null; icon: string; product_count: number }
export interface Summary { min_price?: number | null; avg_price?: number | null; max_price?: number | null; offer_count: number; supplier_count: number; change_30d_pct?: number | null; basis?: string; rental_min_price?: number | null; rental_basis?: string; best_offer_id?: number | null; best_offer_price?: number | null; best_offer_supplier?: string }
export interface Product { id: number; sku: string; name_ar: string; name_en: string; brand: string; unit: string; category_name_ar: string; category_name_en: string; summary?: Summary | null; image_url: string; rating: number; rating_count: number; views: number; sold_qty: number; is_favorite?: boolean }
export interface Offer { id: number; supplier_id: number; price_ex_vat: number; price_inc_vat: number; unit: string; min_qty: number; city: string; stock_status: string; rental_period: string; delivery_included: boolean; updated_at: string; source: string; source_name: string; supplier?: { id: number; name: string; verified: boolean; is_external: boolean; rating: number; city?: string } | null; product?: Product | null; available_qty: number | null; low_stock_threshold: number; image_url: string; product_id: number }
export interface ProductDetail extends Product { offers: Offer[]; history: { date: string; avg_price: number; min_price: number; max_price: number }[] }
export interface RFQItem { id: number; product_id: number | null; description: string; quantity: number; unit: string; market_min?: number | null; market_avg?: number | null }
export interface Bid { id: number; rfq_id: number; supplier_id: number; subtotal: number; vat: number; total: number; delivery_days: number; delivery_fee: number; status: string; rank?: number | null; supplier?: { name: string; verified: boolean; rating: number } | null; items: { rfq_item_id: number; unit_price: number; quantity: number; line_total: number }[]; rfq_title: string }
export interface RFQ { id: number; title: string; city: string; status: string; closes_at: string | null; created_at: string; items: RFQItem[]; bid_count: number; best_total: number | null; buyer_name: string; my_bid?: Bid | null; bids?: Bid[] }
export interface Order { id: number; total: number; status: string; payment_status: string; created_at: string; supplier?: { name: string } | null; buyer_name: string; items: { description: string; quantity: number; unit: string; unit_price: number }[]; events?: { id: number; status: string; note: string; created_at: string }[]; group_ref?: string; delivery_address?: string }
export interface Notification { id: number; title: string; body: string; is_read: boolean; ref_type: string; ref_id: number | null; created_at: string }
export interface Payment { id: number; order_id: number; method: string; amount: number; status: string; checkout_url: string; bank_instructions: string; platform_fee: number; supplier_net: number }
export interface Payout { id: number; order_id: number; amount: number; status: string; reference: string; iban_masked: string; created_at: string }

// v1.5 storefront
export interface CartItem { id: number; offer_id: number; quantity: number; offer: Offer; line_total: number }
export interface CartGroup { supplier: { id: number; name: string; verified: boolean; city: string }; items: CartItem[]; subtotal: number; delivery_fee: number; free_delivery_over: number | null; min_order_amount: number; below_minimum: boolean }
export interface Cart { groups: CartGroup[]; item_count: number; subtotal: number; delivery_total: number; discount: number; coupon_code: string; coupon_error: string; vat: number; total: number }
export interface Address { id: number; label: string; city: string; district: string; street: string; building: string; is_default: boolean; formatted: string }
export interface GroupCheckout { group_ref: string; checkout_url: string; total: number; method: string; status: string; bank_instructions: string }
export interface ProductReview { id: number; rating: number; title: string; comment: string; verified: boolean; created_at: string; author: string }
export interface HomeSections { best_sellers: Product[]; popular: Product[]; new_arrivals: Product[]; top_rated: Product[] }
/** Multipart upload (image) — token is attached like any other request. */
export async function upload<T>(path: string, uri: string, name = 'photo.jpg', type = 'image/jpeg'): Promise<T> {
  const fd = new FormData();
  fd.append('file', { uri, name, type } as any);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + PREFIX + path, { method: 'POST', headers, body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : res.statusText);
  return data as T;
}
export const imageUrl = (u: string | null | undefined) => !u ? '' : u.startsWith('http') ? u : API_BASE + u;
