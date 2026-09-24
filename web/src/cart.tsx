/** Shopping cart + favorites. Guests keep a browser cart (localStorage); after login it is merged into the account cart on the server. */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, Cart, CartGroup, Offer, Product } from './api'
import { useAuth } from './auth'

interface GuestItem { offer_id: number; quantity: number; offer: Offer }
const readGuest = (): GuestItem[] => { try { return JSON.parse(localStorage.getItem('ms_cart') || '[]') } catch { return [] } }
const writeGuest = (items: GuestItem[]) => { try { localStorage.setItem('ms_cart', JSON.stringify(items)) } catch { /* ignore */ } }
const readFavs = (): number[] => { try { return JSON.parse(localStorage.getItem('ms_favs') || '[]') } catch { return [] } }
const writeFavs = (ids: number[]) => { try { localStorage.setItem('ms_favs', JSON.stringify(ids)) } catch { /* ignore */ } }

/** Build a Cart-shaped object from guest items so the cart page renders identically for guests. */
function guestCart(items: GuestItem[]): Cart {
  const groups: Record<number, CartGroup> = {}
  let subtotal = 0
  items.forEach((it, idx) => {
    const sup = it.offer.supplier!
    const line = Math.round(it.offer.price_ex_vat * it.quantity * 100) / 100
    subtotal += line
    const g = groups[sup.id] || (groups[sup.id] = { supplier: sup, items: [], subtotal: 0, delivery_fee: 0, free_delivery_over: null, min_order_amount: 0, below_minimum: false })
    g.items.push({ id: -(idx + 1), offer_id: it.offer_id, quantity: it.quantity, offer: it.offer, line_total: line })
    g.subtotal = Math.round((g.subtotal + line) * 100) / 100
  })
  const vat = Math.round(subtotal * 0.15 * 100) / 100
  return { groups: Object.values(groups), item_count: items.length, subtotal: Math.round(subtotal * 100) / 100, delivery_total: 0, discount: 0, coupon_code: '', coupon_error: '', vat, total: Math.round((subtotal + vat) * 100) / 100 }
}

interface CartCtx {
  cart: Cart | null; count: number; busy: boolean; error: string
  add: (offer: Offer, qty?: number) => Promise<void>
  setQty: (item: { id: number; offer_id: number }, qty: number) => Promise<void>
  remove: (item: { id: number; offer_id: number }) => Promise<void>
  clear: () => Promise<void>
  reload: (coupon?: string) => Promise<void>
  has: (offerId: number) => boolean
  favorites: number[]; isFav: (productId: number) => boolean; toggleFav: (p: Product) => Promise<void>
}
const Ctx = createContext<CartCtx>(null!)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const isBuyer = !!user && user.role === 'buyer'
  const [cart, setCart] = useState<Cart | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [favorites, setFavs] = useState<number[]>(readFavs)

  const reload = useCallback(async (coupon = '') => {
    if (!ready) return
    if (isBuyer) {
      try { setCart(await api.get<Cart>('/cart', { coupon_code: coupon })) } catch (e: any) { setError(e.message) }
    } else if (!user) setCart(guestCart(readGuest()))
    else setCart(null)
  }, [isBuyer, user, ready])

  // after login: merge the guest cart + guest favorites into the account, then load from server
  useEffect(() => {
    if (!ready) return
    (async () => {
      if (isBuyer) {
        const guest = readGuest()
        if (guest.length) { try { await api.post('/cart/sync', { items: guest.map(g => ({ offer_id: g.offer_id, quantity: g.quantity })) }); writeGuest([]) } catch { /* ignore */ } }
        const gf = readFavs()
        if (gf.length) { for (const id of gf) { try { await api.post(`/account/favorites/${id}`) } catch { /* ignore */ } } writeFavs([]) }
        try { setFavs((await api.get<Product[]>('/account/favorites')).map(p => p.id)) } catch { /* ignore */ }
      } else if (user) {
        try { setFavs((await api.get<Product[]>('/account/favorites')).map(p => p.id)) } catch { /* ignore */ }
      } else setFavs(readFavs())
      await reload()
    })()
  }, [isBuyer, user, ready, reload])

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn() } catch (e: any) { setError(e.message); throw e } finally { setBusy(false) } }

  const add = (offer: Offer, qty = 1) => run(async () => {
    const q = Math.max(qty, offer.min_qty || 1)
    if (isBuyer) { setCart(await api.post<Cart>('/cart/items', { offer_id: offer.id, quantity: q })); return }
    if (user) throw new Error('buyer_only')
    const items = readGuest()
    const cur = items.find(i => i.offer_id === offer.id)
    if (cur) cur.quantity += q; else items.push({ offer_id: offer.id, quantity: q, offer })
    writeGuest(items); setCart(guestCart(items))
  })
  const setQty = (item: { id: number; offer_id: number }, qty: number) => run(async () => {
    if (isBuyer) { setCart(await api.patch<Cart>(`/cart/items/${item.id}`, { quantity: qty })); return }
    const items = readGuest().map(i => i.offer_id === item.offer_id ? { ...i, quantity: qty } : i)
    writeGuest(items); setCart(guestCart(items))
  })
  const remove = (item: { id: number; offer_id: number }) => run(async () => {
    if (isBuyer) { setCart(await api.del<Cart>(`/cart/items/${item.id}`)); return }
    const items = readGuest().filter(i => i.offer_id !== item.offer_id)
    writeGuest(items); setCart(guestCart(items))
  })
  const clear = () => run(async () => {
    if (isBuyer) await api.del('/cart')
    writeGuest([]); setCart(isBuyer ? await api.get<Cart>('/cart') : guestCart([]))
  })
  const toggleFav = async (p: Product) => {
    const on = favorites.includes(p.id)
    const next = on ? favorites.filter(x => x !== p.id) : [...favorites, p.id]
    setFavs(next)
    if (user) { try { on ? await api.del(`/account/favorites/${p.id}`) : await api.post(`/account/favorites/${p.id}`) } catch { /* ignore */ } }
    else writeFavs(next)
  }
  const value = useMemo<CartCtx>(() => ({
    cart, count: cart?.item_count || 0, busy, error, add, setQty, remove, clear, reload,
    has: (offerId) => !!cart?.groups.some(g => g.items.some(i => i.offer_id === offerId)),
    favorites, isFav: (id) => favorites.includes(id), toggleFav,
  }), [cart, busy, error, favorites, reload])  // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useCart = () => useContext(Ctx)
