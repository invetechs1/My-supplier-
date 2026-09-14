import { Link, useParams } from 'react-router-dom'
import { api, Offer, Supplier } from '../api'
import { Badge, Money, Spinner, Status, useLoad } from '../components/ui'
import { fmtDate, useI18n } from '../i18n'

export default function SupplierProfilePage() {
  const { id } = useParams()
  const { t, name, lang } = useI18n()
  const s = useLoad(() => api.get<Supplier>(`/suppliers/${id}`), [id])
  const offers = useLoad(() => api.get<Offer[]>(`/suppliers/${id}/offers`), [id])
  if (s.loading || !s.data) return <div className="container" style={{ padding: 30 }}><Spinner /></div>
  const sup = s.data
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="card">
        <div className="row between"><h1>{sup.name}</h1>{sup.verified && <Badge>✓ {t('verified')}</Badge>}</div>
        <p className="muted">{sup.description}</p>
        <div className="row small muted">
          <span>📍 {sup.city}</span><span>★ {sup.rating || '—'} ({sup.rating_count})</span><span>{t('lead_time')}: {sup.lead_time_days} {t('days')}</span>
          {sup.delivery_available && <Badge kind="info">{t('delivery')}</Badge>}{sup.website && <a href={sup.website} target="_blank" rel="noreferrer" className="ltr">{sup.website}</a>}
          {sup.cr_number && <span>{t('cr_number')}: <span className="ltr">{sup.cr_number}</span></span>}
        </div>
      </div>
      <h2 style={{ marginTop: 20 }}>{t('price_list')} ({offers.data?.length ?? 0})</h2>
      <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>{t('products')}</th><th>{t('city')}</th><th>{t('price')} ({t('ex_vat')})</th><th>{t('min_qty')}</th><th>{t('stock')}</th><th>{t('updated')}</th></tr></thead>
        <tbody>{(offers.data || []).map(o => <tr key={o.id}><td><Link to={`/products/${o.product_id}`}>{name(o.product!)}</Link> <span className="muted small">{o.product?.brand}</span></td><td>{o.city}</td><td className="bold"><Money v={o.price_ex_vat} unit={o.unit} /></td><td className="num">{o.min_qty}</td><td><Status s={o.stock_status} /></td><td className="small muted">{fmtDate(o.updated_at, lang)}</td></tr>)}</tbody>
      </table></div></div>
    </div>
  )
}
