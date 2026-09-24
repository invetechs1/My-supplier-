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
export interface Summary { min_price?: number | null; avg_price?: number | null; max_price?: number | null; offer_count: number; supplier_count: number; change_30d_pct?: number | null; basis?: string; rental_min_price?: number | null; rental_basis?: string }
export interface Product { id: number; sku: string; name_ar: string; name_en: string; brand: string; unit: string; category_name_ar: string; category_name_en: string; summary?: Summary | null }
export interface Offer { id: number; supplier_id: number; price_ex_vat: number; price_inc_vat: number; unit: string; min_qty: number; city: string; stock_status: string; rental_period: string; delivery_included: boolean; updated_at: string; source: string; source_name: string; supplier?: { id: number; name: string; verified: boolean; is_external: boolean; rating: number } | null; product?: Product | null }
export interface ProductDetail extends Product { offers: Offer[]; history: { date: string; avg_price: number; min_price: number; max_price: number }[] }
export interface RFQItem { id: number; product_id: number | null; description: string; quantity: number; unit: string; market_min?: number | null; market_avg?: number | null }
export interface Bid { id: number; rfq_id: number; supplier_id: number; subtotal: number; vat: number; total: number; delivery_days: number; delivery_fee: number; status: string; rank?: number | null; supplier?: { name: string; verified: boolean; rating: number } | null; items: { rfq_item_id: number; unit_price: number; quantity: number; line_total: number }[]; rfq_title: string }
export interface RFQ { id: number; title: string; city: string; status: string; closes_at: string | null; created_at: string; items: RFQItem[]; bid_count: number; best_total: number | null; buyer_name: string; my_bid?: Bid | null; bids?: Bid[] }
export interface Order { id: number; total: number; status: string; payment_status: string; created_at: string; supplier?: { name: string } | null; buyer_name: string; items: { description: string; quantity: number; unit: string; unit_price: number }[] }
export interface Notification { id: number; title: string; body: string; is_read: boolean; ref_type: string; ref_id: number | null; created_at: string }
export interface Payment { id: number; order_id: number; method: string; amount: number; status: string; checkout_url: string; bank_instructions: string; platform_fee: number; supplier_net: number }
export interface Payout { id: number; order_id: number; amount: number; status: string; reference: string; iban_masked: string; created_at: string }
