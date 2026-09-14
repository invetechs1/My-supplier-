import { Link } from 'react-router-dom'
import { api, RFQ } from '../../api'
import { Empty, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function MyRFQs() {
  const { t, lang } = useI18n()
  const res = useLoad(() => api.get<RFQ[]>('/rfq/mine'))
  return (
    <div className="stack">
      <div className="row between"><h1>{t('my_rfqs')}</h1><Link to="/buyer/rfq/new" className="btn">➕ {t('new_rfq')}</Link></div>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('title')}</th><th>{t('city')}</th><th>{t('items')}</th><th>{t('bids')}</th><th>{t('best_total')}</th><th>{t('closes_at')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{res.data.map(r => <tr key={r.id}><td className="num">{r.id}</td><td><Link to={`/buyer/rfqs/${r.id}`}>{r.title}</Link></td><td>{r.city}</td><td className="num">{r.items.length}</td><td className="num">{r.bid_count}</td><td><Money v={r.best_total} /></td><td className="small">{fmtDate(r.closes_at, lang)}</td><td><Status s={r.status} /></td></tr>)}</tbody>
        </table></div></div>
      )}
    </div>
  )
}
