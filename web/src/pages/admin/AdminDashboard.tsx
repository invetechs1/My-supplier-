import { api, API_BASE, getToken } from '../../api'
import { Money, Spinner, Stat, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

export default function AdminDashboard() {
  const { t, name, lang } = useI18n()
  const d = useLoad(() => api.get<any>('/admin/dashboard'))
  const a = useLoad(() => api.get<any>('/admin/analytics'))
  if (d.loading || !d.data) return <Spinner />
  const k = d.data
  const maxG = Math.max(1, ...k.series.map((s: any) => s.gmv))
  return (
    <div className="stack">
      <div className="row between"><h1>{t('dashboard')}</h1><div className="row small">{['orders', 'payments', 'users', 'suppliers', 'products', 'offers'].map(n => <a key={n} className="btn ghost sm" href={`${API_BASE}/admin/export/${n}.csv?token=${getToken()}`}>⬇ {t(n === 'offers' ? 'price_list' : n)}</a>)}</div></div>
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
      {a.data && <div className="grid grid-3">
        <div className="card"><h3>{t('funnel')}</h3><table><tbody>{Object.entries(a.data.funnel).map(([k2, v]) => <tr key={k2}><td>{({ rfqs: t('rfq'), rfqs_with_bids: lang === 'ar' ? 'طلبات وصلها عروض' : 'RFQs with bids', awarded: t('awarded'), avg_bids_per_rfq: lang === 'ar' ? 'متوسط العروض لكل طلب' : 'Avg bids / RFQ', orders_paid: t('paid'), orders_delivered: t('delivered') } as any)[k2] || k2}</td><td className="num">{String(v)}</td></tr>)}<tr><td>{t('avg_order')}</td><td><Money v={a.data.avg_order_value} digits={0} /></td></tr></tbody></table></div>
        <div className="card"><h3>{t('top_suppliers')}</h3><table><tbody>{a.data.top_suppliers.map((s2: any) => <tr key={s2.supplier_id}><td>{s2.name}</td><td><Money v={s2.gmv} digits={0} /></td></tr>)}</tbody></table></div>
        <div className="card"><h3>{t('top_demand')}</h3><table><tbody>{a.data.top_demand.map((p: any) => <tr key={p.product_id}><td>{name(p)}</td><td className="num">{p.rfq_lines}</td></tr>)}</tbody></table>{a.data.gmv_by_city.length > 0 && <><h3 style={{ marginTop: 10 }}>{t('gmv_by_city')}</h3><table><tbody>{a.data.gmv_by_city.map((c: any) => <tr key={c.city}><td>{c.city}</td><td><Money v={c.gmv} digits={0} /></td></tr>)}</tbody></table></>}</div>
      </div>}
    </div>
  )
}
