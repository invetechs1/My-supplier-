import { Link } from 'react-router-dom'
import { api, Bid, RFQ } from '../../api'
import { Badge, Money, Stat, Status, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

export default function SupplierDashboard() {
  const { t, lang } = useI18n()
  const d = useLoad(() => api.get<any>('/suppliers/me/dashboard'))
  const open = useLoad(() => api.get<RFQ[]>('/rfq/open', { size: 6 }))
  const bids = useLoad(() => api.get<Bid[]>('/rfq/bids/mine'))
  const k = d.data
  return (
    <div className="stack">
      <div className="row between"><h1>{t('dashboard')}</h1>{k && (k.verified ? <Badge>✓ {t('verified')} · {k.plan}</Badge> : <Badge kind="warn">{lang === 'ar' ? 'بانتظار التوثيق من إدارة المنصة' : 'Pending platform verification'}</Badge>)}</div>
      {k && <div className="kpi-grid">
        <Stat label={t('price_list')} value={k.offers} sub={`${k.stale_offers} ${t('stale')}`} />
        <Stat label={t('best_price_offers')} value={k.best_price_offers} />
        <Stat label={t('my_bids')} value={k.bids} sub={`${t('win_rate')}: ${k.win_rate_pct ?? '—'}%`} />
        <Stat label={t('orders')} value={k.orders} sub={`${k.orders_open} ${t('open')}`} />
        <Stat label={t('revenue')} value={<Money v={k.revenue} digits={0} />} />
        <Stat label={t('pipeline')} value={<Money v={k.pipeline} digits={0} />} />
        <Stat label={t('rating')} value={`★ ${k.rating || '—'}`} sub={`${k.rating_count}`} />
      </div>}
      <div className="grid grid-2">
        <div className="card pad-0"><div className="row between" style={{ padding: '12px 16px 0' }}><h3>{t('open_rfqs')}</h3><Link to="/supplier/rfqs" className="small">{t('view')} →</Link></div><div className="t-wrap"><table>
          <thead><tr><th>{t('title')}</th><th>{t('city')}</th><th>{t('items')}</th><th></th></tr></thead>
          <tbody>{(open.data || []).map(r => <tr key={r.id}><td><Link to={`/supplier/rfqs/${r.id}`}>{r.title}</Link></td><td>{r.city}</td><td className="num">{r.items.length}</td><td>{r.my_bid ? <Status s={r.my_bid.status} /> : <Link className="btn sm" to={`/supplier/rfqs/${r.id}`}>{t('bid_now')}</Link>}</td></tr>)}</tbody>
        </table></div></div>
        <div className="card pad-0"><div className="row between" style={{ padding: '12px 16px 0' }}><h3>{t('my_bids')}</h3><Link to="/supplier/bids" className="small">{t('view')} →</Link></div><div className="t-wrap"><table>
          <thead><tr><th>{t('rfq')}</th><th>{t('total')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{(bids.data || []).slice(0, 6).map(b => <tr key={b.id}><td><Link to={`/supplier/rfqs/${b.rfq_id}`}>{b.rfq_title}</Link></td><td><Money v={b.total} /></td><td><Status s={b.status} /></td></tr>)}</tbody>
        </table></div></div>
      </div>
    </div>
  )
}
