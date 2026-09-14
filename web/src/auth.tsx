import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { api, getToken, setToken, User } from './api'

interface AuthCtx { user: User | null; ready: boolean; login: (email: string, password: string) => Promise<User>; register: (body: any) => Promise<User>; logout: () => void; refresh: () => Promise<void> }
const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); return }
    try { setUser(await api.get<User>('/auth/me')) } catch { setToken(null); setUser(null) }
  }, [])

  useEffect(() => { refresh().finally(() => setReady(true)) }, [refresh])

  const login = async (email: string, password: string) => {
    const res = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password })
    setToken(res.access_token); setUser(res.user); return res.user
  }
  const register = async (body: any) => {
    const res = await api.post<{ access_token: string; user: User }>('/auth/register', body)
    setToken(res.access_token); setUser(res.user); return res.user
  }
  const logout = () => { setToken(null); setUser(null) }
  return <Ctx.Provider value={{ user, ready, login, register, logout, refresh }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

/** Products the buyer collected to turn into an RFQ (persisted per browser). */
export function useQuoteList() {
  const read = (): { product_id: number; name_ar: string; name_en: string; unit: string; quantity: number }[] => {
    try { return JSON.parse(localStorage.getItem('ms_quote') || '[]') } catch { return [] }
  }
  const [items, setItems] = useState(read)
  const persist = (next: typeof items) => { setItems(next); try { localStorage.setItem('ms_quote', JSON.stringify(next)) } catch { /* ignore */ } window.dispatchEvent(new Event('ms_quote')) }
  useEffect(() => { const h = () => setItems(read()); window.addEventListener('ms_quote', h); return () => window.removeEventListener('ms_quote', h) }, [])
  return {
    items,
    add: (p: { id: number; name_ar: string; name_en: string; unit: string }, quantity = 1) => {
      const cur = read()
      if (cur.some(i => i.product_id === p.id)) return
      persist([...cur, { product_id: p.id, name_ar: p.name_ar, name_en: p.name_en, unit: p.unit, quantity }])
    },
    remove: (id: number) => persist(read().filter(i => i.product_id !== id)),
    setQty: (id: number, q: number) => persist(read().map(i => i.product_id === id ? { ...i, quantity: q } : i)),
    clear: () => persist([]),
    has: (id: number) => items.some(i => i.product_id === id),
  }
}
