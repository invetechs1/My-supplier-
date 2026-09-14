import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, RFQ } from '../../api'
import { Empty, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function OpenRFQs() {
  const { t, lang } = useI18n()
  const [all, setAll] = useState(false)
  const res = useLoad(() => api.get<RFQ[]>('/rfq/open', { only_matching: !all, size: 100 }), [all])
  return (
    <div className="stack">
      <div className="row between"><h1>{t('open_rfqs')}</h1><label className="row" style={{ width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={all} onChange={e => setAll(e.target.checked)} /> {lang === 'ar' ? 'عرض كل الطلبات (خارج تخصصي أيضاً)' : 'Show all RFQs (outside my specialties too)'}</label></div>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>{t('title')}</th><th>{t('role_buyer')}</th><th>{t('city')}</th><th>{t('items')}</th><th>{t('bids')}</th><th>{t('closes_at')}</th><th>{t('my_bid')}</th></tr></thead>
          <tbody>{res.data.map(r => <tr key={r.id}><td><Link to={`/supplier/rfqs/${r.id}`}>{r.title}</Link><div className="small muted">{r.items.slice(0, 3).map(i => i.description).join('، ')}{r.items.length > 3 && ' …'}</div></td><td>{r.buyer_name}</td><td>{r.city}</td><td className="num">{r.items.length}</td><td className="num">{r.bid_count}</td><td className="small">{fmtDate(r.closes_at, lang)}</td><td>{r.my_bid ? <><Status s={r.my_bid.status} /> <Money v={r.my_bid.total} /></> : <Link className="btn sm" to={`/supplier/rfqs/${r.id}`}>{t('bid_now')}</Link>}</td></tr>)}</tbody>
        </table></div></div>
      )}
    </div>
  )
}
