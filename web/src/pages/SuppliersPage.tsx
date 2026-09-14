import { Link, useSearchParams } from 'react-router-dom'
import { api, Category, Supplier } from '../api'
import { Badge, Empty, Spinner, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export default function SuppliersPage() {
  const { t, name } = useI18n()
  const [sp, setSp] = useSearchParams()
  const city = sp.get('city') || '', category_id = sp.get('category_id') || ''
  const res = useLoad(() => api.get<Supplier[]>('/suppliers', { city, category_id }), [city, category_id])
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'))
  const catName = (id: number) => name(cats.data?.find(c => c.id === id) || null)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n) }
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="row between"><h1>{t('suppliers')}</h1><Link className="btn" to="/register?role=supplier">{t('role_supplier')} →</Link></div>
      <div className="card row" style={{ marginBottom: 16 }}>
        <select style={{ width: 'auto' }} value={city} onChange={e => set('city', e.target.value)}><option value="">{t('all_cities')}</option>{(cities.data || []).map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select style={{ width: 'auto' }} value={category_id} onChange={e => set('category_id', e.target.value)}><option value="">{t('categories')}</option>{(cats.data || []).filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{name(c)}</option>)}</select>
      </div>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="grid grid-2">
          {res.data.map(s => (
            <Link key={s.id} to={`/suppliers/${s.id}`} className="product-card">
              <div className="row between"><span className="bold">{s.name}</span>{s.verified ? <Badge>✓ {t('verified')}</Badge> : <Badge kind="neutral">{t('pending')}</Badge>}</div>
              <div className="muted small">📍 {s.city} · ★ {s.rating || '—'} ({s.rating_count}) · {s.offer_count} {t('offers')} · {t('lead_time')}: {s.lead_time_days} {t('days')}</div>
              <div className="row small">{(s.category_ids || []).slice(0, 5).map(id => <Badge key={id} kind="neutral">{catName(id)}</Badge>)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
