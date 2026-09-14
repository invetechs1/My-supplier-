import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, loadToken, setToken, User } from './api';

interface QuoteItem { product_id: number; name_ar: string; name_en: string; unit: string; quantity: number }
interface Ctx { user: User | null; ready: boolean; login: (e: string, p: string) => Promise<User>; register: (b: any) => Promise<User>; logout: () => Promise<void>;
  quote: QuoteItem[]; addQuote: (p: { id: number; name_ar: string; name_en: string; unit: string }) => void; removeQuote: (id: number) => void; setQty: (id: number, q: number) => void; clearQuote: () => void; unread: number; refreshUnread: () => void }
const Store = createContext<Ctx>(null!);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [quote, setQuote] = useState<QuoteItem[]>([]);
  const [unread, setUnread] = useState(0);
  const refreshUnread = useCallback(() => { api.get<{ count: number }>('/notifications/unread-count').then(r => setUnread(r.count)).catch(() => setUnread(0)); }, []);
  useEffect(() => {
    (async () => {
      try { const q = await AsyncStorage.getItem('ms_quote'); if (q) setQuote(JSON.parse(q)); } catch {}
      if (await loadToken()) { try { setUser(await api.get<User>('/auth/me')); refreshUnread(); } catch { await setToken(null); } }
      setReady(true);
    })();
  }, [refreshUnread]);
  useEffect(() => { if (!user) return; const id = setInterval(refreshUnread, 30000); return () => clearInterval(id); }, [user, refreshUnread]);
  const persist = (q: QuoteItem[]) => { setQuote(q); AsyncStorage.setItem('ms_quote', JSON.stringify(q)).catch(() => {}); };
  const value: Ctx = {
    user, ready, unread, refreshUnread,
    login: async (email, password) => { const r = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password }); await setToken(r.access_token); setUser(r.user); refreshUnread(); return r.user; },
    register: async (body) => { const r = await api.post<{ access_token: string; user: User }>('/auth/register', body); await setToken(r.access_token); setUser(r.user); return r.user; },
    logout: async () => { await setToken(null); setUser(null); setUnread(0); },
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
