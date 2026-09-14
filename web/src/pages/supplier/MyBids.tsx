import { Link } from 'react-router-dom'
import { api, Bid } from '../../api'
import { Empty, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function MyBids() {
  const { t, lang } = useI18n()
  const res = useLoad(() => api.get<Bid[]>('/rfq/bids/mine'))
  return (
    <div className="stack"><h1>{t('my_bids')}</h1>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>{t('rfq')}</th><th>{t('items')}</th><th>{t('subtotal')}</th><th>{t('total')}</th><th>{t('delivery_days')}</th><th>{t('updated')}</th><th>{t('status')}</th></tr></thead>
          <tbody>{res.data.map(b => <tr key={b.id}><td><Link to={`/supplier/rfqs/${b.rfq_id}`}>{b.rfq_title}</Link></td><td className="num">{b.items.length}</td><td><Money v={b.subtotal} /></td><td className="bold"><Money v={b.total} /></td><td className="num">{b.delivery_days}</td><td className="small muted">{fmtDate(b.updated_at, lang)}</td><td><Status s={b.status} /></td></tr>)}</tbody>
        </table></div></div>
      )}
    </div>
  )
}
