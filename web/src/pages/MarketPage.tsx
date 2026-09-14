import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Change, Money, Spinner, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export default function MarketPage() {
  const { t, name, lang } = useI18n()
  const [city, setCity] = useState('')
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'))
  const index = useLoad(() => api.get<any[]>('/market/index', { city }), [city])
  const trending = useLoad(() => api.get<any[]>('/market/trending', { limit: 15, city }), [city])
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="row between"><h1>{t('market')}</h1>
        <select style={{ width: 'auto' }} value={city} onChange={e => setCity(e.target.value)}><option value="">{t('all_cities')}</option>{(cities.data || []).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
      <p className="muted">{lang === 'ar' ? 'مؤشر مبني على متوسط أسعار المورّدين المسجّلين والمصادر الخارجية لكل فئة، مقارنة بالأسبوع نفسه قبل 30 يوماً.' : 'Index built from the average of registered-supplier and external-source prices per category, versus the same week 30 days ago.'}</p>
      <div className="grid grid-2">
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>{t('categories')}</th><th>{t('products')}</th><th>{t('offers')}</th><th>{t('change_30d')}</th></tr></thead>
          <tbody>{index.loading ? <tr><td colSpan={4}><Spinner /></td></tr> : (index.data || []).map(r => <tr key={r.category_id}><td><Link to={`/catalog?category_id=${r.category_id}`}>{r.icon} {name(r)}</Link></td><td className="num">{r.priced_products}/{r.products}</td><td className="num">{r.offers}</td><td><Change pct={r.change_30d_pct} /></td></tr>)}</tbody>
        </table></div></div>
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>{t('trending')}</th><th>{t('best_price')}</th><th>{t('avg_price')}</th><th>{t('change_30d')}</th></tr></thead>
          <tbody>{(trending.data || []).map(r => <tr key={r.product_id}><td><Link to={`/products/${r.product_id}`}>{name(r)}</Link></td><td><Money v={r.min_price} unit={r.unit} /></td><td><Money v={r.avg_price} /></td><td><Change pct={r.change_30d_pct} /></td></tr>)}</tbody>
        </table></div></div>
      </div>
    </div>
  )
}
