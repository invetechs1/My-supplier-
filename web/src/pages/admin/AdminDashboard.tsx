import { api } from '../../api'
import { Money, Spinner, Stat, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

export default function AdminDashboard() {
  const { t, name, lang } = useI18n()
  const d = useLoad(() => api.get<any>('/admin/dashboard'))
  if (d.loading || !d.data) return <Spinner />
  const k = d.data
  const maxG = Math.max(1, ...k.series.map((s: any) => s.gmv))
  return (
    <div className="stack">
      <h1>{t('dashboard')}</h1>
      <div className="kpi-grid">
        <Stat label={t('gmv')} value={<Money v={k.gmv} digits={0} />} sub={<>30d: <Money v={k.gmv_30d} digits={0} /></>} />
        <Stat label={t('est_revenue')} value={<Money v={k.est_revenue_30d} digits={0} />} />
        <Stat label={t('orders')} value={k.orders} sub={Object.entries(k.orders_by_status).map(([s, n]) => `${t(s)}: ${n}`).join(' · ')} />
        <Stat label={t('rfq')} value={k.rfqs_total} sub={`${k.rfqs_open} ${t('open')} · ${k.bids} ${t('bids')}`} />
        <Stat label={t('suppliers')} value={k.suppliers} sub={`${k.suppliers_pending} ${t('pending')} · ${k.external_sources} ${t('external')}`} />
        <Stat label={t('users')} value={k.users} sub={`+${k.new_users_7d} / 7d`} />
        <Stat label={t('products')} value={k.products} sub={`${k.offers} ${t('offers')} · ${k.stale_offers} ${t('stale')}`} />
      </div>
      <div className="grid grid-2">
        <div className="card"><h3>{t('gmv')} — 30 {t('days')}</h3><div className="bars">{k.series.map((s: any) => <div key={s.date} title={`${s.date}: ${s.gmv} (${s.orders} ${t('orders')}, ${s.rfqs} RFQ)`} style={{ height: `${(s.gmv / maxG) * 100}%` }} />)}</div></div>
        <div className="card"><h3>{lang === 'ar' ? 'أكبر الفئات' : 'Top categories'}</h3><table><tbody>{k.top_categories.map((c: any) => <tr key={c.name_en}><td>{name(c)}</td><td className="num">{c.products}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  )
}
