import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, Category, Paged, Product } from '../api'
import { useAuth, useQuoteList } from '../auth'
import { useCart } from '../cart'
import { Change, Empty, Money, Spinner, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export function Stars({ v, count, small }: { v: number; count?: number; small?: boolean }) {
  const r = Math.round(v || 0)
  return <span className={`stars ${small ? 'small' : ''}`}>{[1, 2, 3, 4, 5].map(n => <span key={n} className={n <= r ? '' : 'off'}>★</span>)}{count != null && <span className="muted small"> ({count})</span>}</span>
}

/** Storefront product card: image, price, rating, add-to-cart (best orderable offer), favorite, add-to-RFQ. */
export function ProductCard({ p }: { p: Product }) {
  const { t, name } = useI18n()
  const { user } = useAuth()
  const quote = useQuoteList()
  const cart = useCart()
  const [adding, setAdding] = useState(false)
  const s = p.summary
  const shopper = !user || user.role === 'buyer'
  const addToCart = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (!s?.best_offer_id) return
    setAdding(true)
    try { const d = await api.get<any>(`/catalog/products/${p.id}`); const o = d.offers.find((x: any) => x.id === s.best_offer_id); if (o) await cart.add({ ...o, product: o.product || d }, o.min_qty || 1) } catch { /* shown by cart ctx */ } finally { setAdding(false) }
  }
  const inCart = !!s?.best_offer_id && cart.has(s.best_offer_id)
  return (
    <Link to={`/products/${p.id}`} className="product-card">
      <span className="img"><img src={p.image_url} alt={name(p)} loading="lazy" />
        {s?.basis ? <span className="badge warn ribbon">{t('rent')}</span> : s?.change_30d_pct != null && s.change_30d_pct < -3 ? <span className="badge ribbon">▼ {Math.abs(s.change_30d_pct).toFixed(0)}%</span> : null}
        {shopper && <button className={`fav ${cart.isFav(p.id) ? 'on' : ''}`} title={t('favorites')} onClick={e => { e.preventDefault(); e.stopPropagation(); cart.toggleFav(p) }}>{cart.isFav(p.id) ? '♥' : '♡'}</button>}
      </span>
      <span className="body">
        <span className="row between small"><span className="badge neutral">{name({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</span>{s?.change_30d_pct != null && <Change pct={s.change_30d_pct} />}</span>
        <span className="title">{name(p)}</span>
        <span className="muted small">{p.brand || p.sku} · {p.unit}{p.rating_count > 0 && <> · <Stars v={p.rating} count={p.rating_count} small /></>}</span>
        {s && s.offer_count > 0 ? (
          <>
            <span className="p">{s.min_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '.8rem' }}>{t('sar')}{s.basis ? ' ' + t('per_' + s.basis) : ''}</span></span>
            <span className="muted small">{!s.basis && s.rental_min_price != null && <><span className="badge warn">{t('rent_from')} {s.rental_min_price.toLocaleString('en-US')} {t('per_' + (s.rental_basis || 'day'))}</span> · </>}{s.offer_count} {t('offers')} · {s.supplier_count} {t('suppliers')}{s.best_offer_supplier && <> · {t('sold_by')} {s.best_offer_supplier}</>}</span>
          </>
        ) : <span className="muted small">{t('no_results')}</span>}
        {shopper && (
          <span className="row" style={{ gap: 6, marginTop: 4 }}>
            {s?.best_offer_id ? <button className={`btn sm ${inCart ? 'secondary' : ''}`} disabled={adding} onClick={addToCart}>{inCart ? '✓ ' + t('in_cart') : '🛒 ' + t('add_to_cart')}</button>
              : <span className="badge neutral">{t('reference_only')}</span>}
            <button className={`btn sm ghost`} onClick={e => { e.preventDefault(); quote.add(p) }}>{quote.has(p.id) ? '✓ ' + t('added') : '+ ' + t('add_to_rfq')}</button>
          </span>
        )}
      </span>
    </Link>
  )
}

export default function Catalog() {
  const { t, name, lang } = useI18n()
  const [sp, setSp] = useSearchParams()
  const g = (k: string) => sp.get(k) || ''
  const q = g('q'), category_id = g('category_id'), city = g('city'), sort = g('sort') || 'relevance', page = Number(g('page') || 1)
  const brand = g('brand'), price_min = g('price_min'), price_max = g('price_max'), basis = g('basis'), in_stock = g('in_stock')
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => v ? n.set(k, v) : n.delete(k)); if (!('page' in patch)) n.delete('page'); setSp(n) }
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'))
  const brands = useLoad(() => api.get<string[]>('/catalog/brands'))
  const res = useLoad(() => api.get<Paged<Product>>('/catalog/products', { q, category_id, city, sort, page, size: 24, brand, price_min, price_max, basis, in_stock: in_stock ? true : undefined }), [q, category_id, city, sort, page, brand, price_min, price_max, basis, in_stock])
  const pages = res.data ? Math.ceil(res.data.total / res.data.size) : 0
  const all = cats.data || []
  const cur = all.find(c => String(c.id) === category_id)
  const parent = cur?.parent_id ? all.find(c => c.id === cur.parent_id) : cur
  const subs = parent ? all.filter(c => c.parent_id === parent.id) : []
  const tops = all.filter(c => !c.parent_id)
  const [pmin, setPmin] = useState(price_min), [pmax, setPmax] = useState(price_max)
  const active = [brand, price_min, price_max, basis, in_stock, category_id, city].filter(Boolean).length
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="small muted" style={{ marginBottom: 8 }}><Link to="/">{lang === 'ar' ? 'الرئيسية' : 'Home'}</Link> / <Link to="/catalog">{t('catalog')}</Link>{parent && <> / <Link to={`/catalog?category_id=${parent.id}`}>{name(parent)}</Link></>}{cur && cur.id !== parent?.id && <> / {name(cur)}</>}</div>
      <div className="catalog">
        <aside className="card filters">
          <div className="row between"><h3 style={{ margin: 0 }}>{t('filters')}</h3>{active > 0 && <button className="btn ghost sm" onClick={() => { setPmin(''); setPmax(''); setSp(new URLSearchParams(q ? { q } : {})) }}>{t('clear_filters')}</button>}</div>
          <div className="fgroup"><h4>{t('categories')}</h4>
            <div className="chips">{(parent ? subs : tops).map(c => <button key={c.id} className={`chip ${String(c.id) === category_id ? 'on' : ''}`} onClick={() => set({ category_id: String(c.id) })}>{c.icon} {name(c)}</button>)}
              {parent && <button className={`chip ${String(parent.id) === category_id ? 'on' : ''}`} onClick={() => set({ category_id: String(parent.id) })}>{t('all')} {name(parent)}</button>}</div></div>
          <div className="fgroup"><h4>{t('price_basis')}</h4><div className="chips">{[['', 'all'], ['sale', 'sale_only'], ['rent', 'rent_only']].map(([v, k]) => <button key={k} className={`chip ${basis === v ? 'on' : ''}`} onClick={() => set({ basis: v })}>{t(k)}</button>)}</div></div>
          <div className="fgroup"><h4>{t('price_range')} ({t('sar')})</h4><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><input type="number" placeholder={t('from')} value={pmin} onChange={e => setPmin(e.target.value)} /><input type="number" placeholder={t('to')} value={pmax} onChange={e => setPmax(e.target.value)} /><button className="btn sm" onClick={() => set({ price_min: pmin, price_max: pmax })}>✓</button></div></div>
          <div className="fgroup"><h4>{t('brands')}</h4><select value={brand} onChange={e => set({ brand: e.target.value })}><option value="">{t('all')}</option>{(brands.data || []).map(b => <option key={b} value={b}>{b}</option>)}</select></div>
          <div className="fgroup"><h4>{t('city')}</h4><select value={city} onChange={e => set({ city: e.target.value })}><option value="">{t('all_cities')}</option>{(cities.data || []).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!in_stock} onChange={e => set({ in_stock: e.target.checked ? '1' : '' })} /> {t('in_stock_only')}</label>
        </aside>
        <section>
          <div className="card row" style={{ marginBottom: 14 }}>
            <input className="grow" style={{ minWidth: 200 }} placeholder={t('search_ph')} value={q} onChange={e => set({ q: e.target.value })} />
            <select style={{ width: 'auto' }} value={sort} onChange={e => set({ sort: e.target.value })}>
              {['relevance', 'price_asc', 'price_desc', 'offers', 'rating', 'newest', 'popular'].map(s => <option key={s} value={s}>{t('sort_' + s)}</option>)}
            </select>
          </div>
          {res.loading ? <Spinner /> : res.error ? <Empty>{res.error}</Empty> : res.data && res.data.items.length === 0 ? <Empty>{t('no_results')}</Empty> : (
            <>
              <div className="muted small" style={{ marginBottom: 8 }}>{res.data!.total} {t('products')}{cur && <> · {name(cur)}</>}</div>
              <div className="grid grid-3">{res.data!.items.map(p => <ProductCard key={p.id} p={p} />)}</div>
              {pages > 1 && <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
                {Array.from({ length: pages }, (_, i) => i + 1).map(n => <button key={n} className={`btn sm ${n === page ? '' : 'ghost'}`} onClick={() => set({ page: String(n) })}>{n}</button>)}
              </div>}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
