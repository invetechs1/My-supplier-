import { api } from '../../api'
import { Money, Spinner, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminQuality() {
  const { t, lang } = useI18n()
  const res = useLoad(() => api.get<any>('/admin/price-alerts'))
  if (res.loading || !res.data) return <Spinner />
  return (
    <div className="stack">
      <h1>{t('data_quality')}</h1>
      <div className="grid grid-2">
        <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('outliers')} ({res.data.outliers.length})</h3><div className="t-wrap"><table>
          <thead><tr><th>{t('products')}</th><th>{t('supplier')}</th><th>{t('price')}</th><th>{lang === 'ar' ? 'الوسيط' : 'Median'}</th><th>%</th></tr></thead>
          <tbody>{res.data.outliers.map((o: any) => <tr key={o.offer_id}><td>{o.product}</td><td>{o.supplier}<div className="small muted">{o.city}</div></td><td><Money v={o.price} /></td><td><Money v={o.median} /></td><td className={`num ${o.deviation_pct > 0 ? 'up' : 'down'}`}>{o.deviation_pct}%</td></tr>)}</tbody>
        </table></div></div>
        <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('stale')} ({res.data.stale.length})</h3><div className="t-wrap"><table>
          <thead><tr><th>{t('products')}</th><th>{t('supplier')}</th><th>{t('price')}</th><th>{t('updated')}</th></tr></thead>
          <tbody>{res.data.stale.map((o: any) => <tr key={o.offer_id}><td>{o.product}</td><td>{o.supplier}<div className="small muted">{o.city}</div></td><td><Money v={o.price} /></td><td className="small muted">{fmtDate(o.updated_at, lang)}</td></tr>)}</tbody>
        </table></div></div>
      </div>
    </div>
  )
}
