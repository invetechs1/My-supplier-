import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, API_BASE, getToken, RFQ } from '../../api'
import { Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminRFQs() {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState('')
  const res = useLoad(() => api.get<RFQ[]>('/admin/rfqs', { status }), [status])
  const close = async (r: RFQ) => { if (!confirm(`${t('close_rfq')} #${r.id}?`)) return; await api.post(`/admin/rfqs/${r.id}/close`); res.reload() }
  return (
    <div className="stack">
      <div className="row between"><h1>{t('rfq')}</h1><div className="row"><select style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value)}><option value="">∑</option>{['draft', 'open', 'closed', 'awarded', 'cancelled'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select><a className="btn ghost sm" href={`${API_BASE}/admin/export/rfqs.csv?token=${getToken()}`}>⬇ CSV</a></div></div>
      {res.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>#</th><th>{t('title')}</th><th>{t('role_buyer')}</th><th>{t('city')}</th><th>{t('items')}</th><th>{t('bids')}</th><th>{t('best_total')}</th><th>{t('closes_at')}</th><th>{t('status')}</th><th></th></tr></thead>
        <tbody>{(res.data || []).map(r => <tr key={r.id}><td className="num">{r.id}</td><td><Link to={`/rfq/${r.id}`}>{r.title}</Link></td><td>{r.buyer_name}</td><td>{r.city}</td><td className="num">{r.items.length}</td><td className="num">{r.bid_count}</td><td><Money v={r.best_total} /></td><td className="small">{fmtDate(r.closes_at, lang)}</td><td><Status s={r.status} /></td><td>{['open', 'draft'].includes(r.status) && <button className="btn ghost sm" onClick={() => close(r)}>{t('close_rfq')}</button>}</td></tr>)}</tbody>
      </table></div></div>}
    </div>
  )
}
