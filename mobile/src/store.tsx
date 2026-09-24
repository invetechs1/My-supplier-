import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, Cart, loadToken, Offer, Product, setToken, User } from './api';
import { registerForPush } from './push';
import { t } from './i18n';

interface QuoteItem { product_id: number; name_ar: string; name_en: string; unit: string; quantity: number }
interface Ctx { user: User | null; ready: boolean; login: (e: string, p: string) => Promise<User>; register: (b: any) => Promise<User>; logout: () => Promise<void>;
  quote: QuoteItem[]; addQuote: (p: { id: number; name_ar: string; name_en: string; unit: string }) => void; removeQuote: (id: number) => void; setQty: (id: number, q: number) => void; clearQuote: () => void; unread: number; refreshUnread: () => void;
  cart: Cart | null; cartCount: number; refreshCart: (coupon?: string) => Promise<void>; addToCart: (offer: Offer, qty?: number) => Promise<void>; setCartQty: (item: { id: number; offer_id: number }, qty: number) => Promise<void>; removeFromCart: (item: { id: number; offer_id: number }) => Promise<void>; clearCart: () => Promise<void>;
  favorites: number[]; toggleFav: (p: Product) => Promise<void> }
const Store = createContext<Ctx>(null!);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [quote, setQuote] = useState<QuoteItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [cart, setCart] = useState<Cart | null>(null);
  const [guest, setGuest] = useState<{ offer_id: number; quantity: number; offer: Offer }[]>([]);
  const [favorites, setFavs] = useState<number[]>([]);
  const guestCart = (items: typeof guest): Cart => {
    const groups: Record<number, any> = {}; let subtotal = 0;
    items.forEach((it, idx) => { const sup = it.offer.supplier!; const line = Math.round(it.offer.price_ex_vat * it.quantity * 100) / 100; subtotal += line;
      const g = groups[sup.id] || (groups[sup.id] = { supplier: { id: sup.id, name: sup.name, verified: sup.verified, city: sup.city || '' }, items: [], subtotal: 0, delivery_fee: 0, free_delivery_over: null, min_order_amount: 0, below_minimum: false });
      g.items.push({ id: -(idx + 1), offer_id: it.offer_id, quantity: it.quantity, offer: it.offer, line_total: line }); g.subtotal += line; });
    const vat = Math.round(subtotal * 0.15 * 100) / 100;
    return { groups: Object.values(groups), item_count: items.length, subtotal, delivery_total: 0, discount: 0, coupon_code: '', coupon_error: '', vat, total: Math.round((subtotal + vat) * 100) / 100 };
  };
  const persistGuest = (items: typeof guest) => { setGuest(items); setCart(guestCart(items)); AsyncStorage.setItem('ms_cart', JSON.stringify(items)).catch(() => {}); };
  const refreshUnread = useCallback(() => { api.get<{ count: number }>('/notifications/unread-count').then(r => setUnread(r.count)).catch(() => setUnread(0)); }, []);
  useEffect(() => {
    (async () => {
      try { const q = await AsyncStorage.getItem('ms_quote'); if (q) setQuote(JSON.parse(q)); } catch {}
      let g: typeof guest = [];
      try { const c = await AsyncStorage.getItem('ms_cart'); if (c) g = JSON.parse(c); } catch {}
      try { const f = await AsyncStorage.getItem('ms_favs'); if (f) setFavs(JSON.parse(f)); } catch {}
      if (await loadToken()) { try { const u = await api.get<User>('/auth/me'); setUser(u); refreshUnread(); registerForPush(); await syncAfterLogin(u, g); } catch { await setToken(null); setGuest(g); setCart(guestCart(g)); } }
      else { setGuest(g); setCart(guestCart(g)); }
      setReady(true);
    })();
  }, [refreshUnread]);
  useEffect(() => { if (!user) return; const id = setInterval(refreshUnread, 30000); return () => clearInterval(id); }, [user, refreshUnread]);
  /** Merge the guest cart / favorites into the account after login and load the server cart. */
  const syncAfterLogin = async (u: User, g: typeof guest) => {
    if (u.role !== 'buyer') { setCart(null); return; }
    if (g.length) { try { await api.post('/cart/sync', { items: g.map(x => ({ offer_id: x.offer_id, quantity: x.quantity })) }); } catch {} setGuest([]); AsyncStorage.removeItem('ms_cart').catch(() => {}); }
    try { const f = JSON.parse((await AsyncStorage.getItem('ms_favs')) || '[]'); for (const id of f) { try { await api.post(`/account/favorites/${id}`); } catch {} } AsyncStorage.removeItem('ms_favs').catch(() => {}); } catch {}
    try { setFavs((await api.get<Product[]>('/account/favorites')).map(p => p.id)); } catch {}
    try { setCart(await api.get<Cart>('/cart')); } catch {}
  };
  const isBuyer = !!user && user.role === 'buyer';
  const refreshCart = async (coupon = '') => { if (isBuyer) { try { setCart(await api.get<Cart>('/cart', { coupon_code: coupon })); } catch {} } else if (!user) setCart(guestCart(guest)); };
  const persist = (q: QuoteItem[]) => { setQuote(q); AsyncStorage.setItem('ms_quote', JSON.stringify(q)).catch(() => {}); };
  const value: Ctx = {
    user, ready, unread, refreshUnread,
    login: async (email, password) => { const r = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password }); await setToken(r.access_token); setUser(r.user); refreshUnread(); registerForPush(); await syncAfterLogin(r.user, guest); return r.user; },
    register: async (body) => { const r = await api.post<{ access_token: string; user: User }>('/auth/register', body); await setToken(r.access_token); setUser(r.user); return r.user; },
    logout: async () => { await setToken(null); setUser(null); setUnread(0); setCart(guestCart([])); setFavs([]); },
    cart, cartCount: cart?.item_count || 0, refreshCart,
    addToCart: async (offer, qty = 1) => {
      const q = Math.max(qty, offer.min_qty || 1);
      if (isBuyer) { setCart(await api.post<Cart>('/cart/items', { offer_id: offer.id, quantity: q })); return; }
      if (user) throw new Error(t('buyer_only'));
      const items = [...guest]; const cur = items.find(i => i.offer_id === offer.id);
      if (cur) cur.quantity += q; else items.push({ offer_id: offer.id, quantity: q, offer });
      persistGuest(items);
    },
    setCartQty: async (item, qty) => { if (isBuyer) setCart(await api.patch<Cart>(`/cart/items/${item.id}`, { quantity: qty })); else persistGuest(guest.map(i => i.offer_id === item.offer_id ? { ...i, quantity: qty } : i)); },
    removeFromCart: async (item) => { if (isBuyer) setCart(await api.del<Cart>(`/cart/items/${item.id}`)); else persistGuest(guest.filter(i => i.offer_id !== item.offer_id)); },
    clearCart: async () => { if (isBuyer) { await api.del('/cart'); setCart(await api.get<Cart>('/cart')); } else persistGuest([]); },
    favorites,
    toggleFav: async (p) => {
      const on = favorites.includes(p.id); const next = on ? favorites.filter(x => x !== p.id) : [...favorites, p.id]; setFavs(next);
      if (user) { try { on ? await api.del(`/account/favorites/${p.id}`) : await api.post(`/account/favorites/${p.id}`); } catch {} } else AsyncStorage.setItem('ms_favs', JSON.stringify(next)).catch(() => {});
    },
    quote,
    addQuote: (p) => { if (quote.some(i => i.product_id === p.id)) return; persist([...quote, { product_id: p.id, name_ar: p.name_ar, name_en: p.name_en, unit: p.unit, quantity: 1 }]); },
    removeQuote: (id) => persist(quote.filter(i => i.product_id !== id)),
    setQty: (id, q) => persist(quote.map(i => i.product_id === id ? { ...i, quantity: q } : i)),
    clearQuote: () => persist([]),
  };
  return <Store.Provider value={value}>{children}</Store.Provider>;
}
export const useStore = () => useContext(Store);

/** Loader hook with pull-to-refresh support. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => { let alive = true; setLoading(true); setError(null); fn().then(d => alive && setData(d)).catch(e => alive && setError(e.message)).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [...deps, tick]); // eslint-disable-line
  return { data, error, loading, reload: () => setTick(x => x + 1) };
}
