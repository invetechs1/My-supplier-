import { Link, useSearchParams } from 'react-router-dom'
import { api, Category, Paged, Product } from '../api'
import { useAuth, useQuoteList } from '../auth'
import { Change, Empty, Money, Spinner, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export function ProductCard({ p }: { p: Product }) {
  const { t, name } = useI18n()
  const { user } = useAuth()
  const quote = useQuoteList()
  const s = p.summary
  return (
    <Link to={`/products/${p.id}`} className="product-card">
      <div className="row between"><span className="badge neutral">{name({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</span>{s?.change_30d_pct != null && <Change pct={s.change_30d_pct} />}</div>
      <div className="bold">{name(p)}</div>
      <div className="muted small">{p.brand || p.sku} · {p.unit}</div>
      {s && s.offer_count > 0 ? (
        <>
          <div className="p">{s.min_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '.8rem' }}>{t('sar')}{s.basis ? ' ' + t('per_' + s.basis) : ''}</span></div>
          <div className="muted small">{s.basis ? <span className="badge warn">{t('rent')}</span> : <>{t('avg_price')}: <Money v={s.avg_price} /></>}{!s.basis && s.rental_min_price != null && <> · <span className="badge warn">{t('rent_from')} {s.rental_min_price.toLocaleString('en-US')} {t('per_' + (s.rental_basis || 'day'))}</span></>} · {s.offer_count} {t('offers')} · {s.supplier_count} {t('suppliers')}</div>
        </>
      ) : <div className="muted small">{t('no_results')}</div>}
      {(!user || user.role === 'buyer') && (
        <button className={`btn sm ${quote.has(p.id) ? 'ghost' : 'secondary'}`} onClick={e => { e.preventDefault(); quote.add(p) }}>{quote.has(p.id) ? '✓ ' + t('added') : '+ ' + t('add_to_rfq')}</button>
      )}
    </Link>
  )
}

export default function Catalog() {
  const { t, name } = useI18n()
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') || '', category_id = sp.get('category_id') || '', city = sp.get('city') || '', sort = sp.get('sort') || 'relevance', page = Number(sp.get('page') || 1)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n) }
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'))
  const res = useLoad(() => api.get<Paged<Product>>('/catalog/products', { q, category_id, city, sort, page, size: 24 }), [q, category_id, city, sort, page])
  const pages = res.data ? Math.ceil(res.data.total / res.data.size) : 0
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="card row" style={{ marginBottom: 16 }}>
        <input className="grow" style={{ minWidth: 200 }} placeholder={t('search_ph')} value={q} onChange={e => set('q', e.target.value)} />
        <select style={{ width: 'auto' }} value={category_id} onChange={e => set('category_id', e.target.value)}>
          <option value="">{t('categories')}</option>
          {(cats.data || []).map(c => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{name(c)}</option>)}
        </select>
        <select style={{ width: 'auto' }} value={city} onChange={e => set('city', e.target.value)}>
          <option value="">{t('all_cities')}</option>
          {(cities.data || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select style={{ width: 'auto' }} value={sort} onChange={e => set('sort', e.target.value)}>
          {['relevance', 'price_asc', 'price_desc', 'offers'].map(s => <option key={s} value={s}>{t('sort_' + s)}</option>)}
        </select>
      </div>
      {res.loading ? <Spinner /> : res.error ? <Empty>{res.error}</Empty> : res.data && res.data.items.length === 0 ? <Empty>{t('no_results')}</Empty> : (
        <>
          <div className="muted small" style={{ marginBottom: 8 }}>{res.data!.total} {t('products')}</div>
          <div className="grid grid-3">{res.data!.items.map(p => <ProductCard key={p.id} p={p} />)}</div>
          {pages > 1 && <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
            {Array.from({ length: pages }, (_, i) => i + 1).map(n => <button key={n} className={`btn sm ${n === page ? '' : 'ghost'}`} onClick={() => set('page', String(n))}>{n}</button>)}
          </div>}
        </>
      )}
    </div>
  )
}
