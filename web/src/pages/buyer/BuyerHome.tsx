import { Link } from 'react-router-dom'
import { api, Order, RFQ } from '../../api'
import { useAuth } from '../../auth'
import { Money, Stat, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function BuyerHome() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const rfqs = useLoad(() => api.get<RFQ[]>('/rfq/mine'))
  const orders = useLoad(() => api.get<Order[]>('/orders/mine'))
  const open = (rfqs.data || []).filter(r => r.status === 'open')
  return (
    <div className="stack">
      <div className="row between"><h1>{user?.company_name || user?.full_name}</h1><Link to="/buyer/rfq/new" className="btn">➕ {t('new_rfq')}</Link></div>
      <div className="kpi-grid">
        <Stat label={t('open')} value={open.length} />
        <Stat label={t('bids')} value={open.reduce((s, r) => s + r.bid_count, 0)} />
        <Stat label={t('orders')} value={orders.data?.length ?? 0} />
        <Stat label={t('total')} value={<Money v={(orders.data || []).filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0)} digits={0} />} />
      </div>
      <div className="grid grid-2">
        <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('my_rfqs')}</h3><div className="t-wrap"><table>
          <thead><tr><th>{t('title')}</th><th>{t('bids')}</th><th>{t('best_total')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{(rfqs.data || []).slice(0, 6).map(r => <tr key={r.id}><td><Link to={`/buyer/rfqs/${r.id}`}>{r.title}</Link><div className="small muted">{fmtDate(r.created_at, lang)}</div></td><td className="num">{r.bid_count}</td><td><Money v={r.best_total} /></td><td><Status s={r.status} /></td></tr>)}</tbody>
        </table></div></div>
        <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('orders')}</h3><div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('supplier')}</th><th>{t('total')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{(orders.data || []).slice(0, 6).map(o => <tr key={o.id}><td className="num">{o.id}</td><td>{o.supplier?.name}</td><td><Money v={o.total} /></td><td><Status s={o.status} /></td></tr>)}</tbody>
        </table></div></div>
      </div>
    </div>
  )
}
