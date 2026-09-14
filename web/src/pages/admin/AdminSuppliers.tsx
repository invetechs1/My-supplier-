import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Supplier } from '../../api'
import { Badge, Spinner, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminSuppliers() {
  const { t, lang } = useI18n()
  const [tab, setTab] = useState<'pending' | 'verified' | 'all'>('pending')
  const res = useLoad(() => api.get<Supplier[]>('/admin/suppliers', tab === 'all' ? {} : { verified: tab === 'verified' }), [tab])
  const verify = async (s: Supplier, verified: boolean, plan?: string) => { await api.post(`/admin/suppliers/${s.id}/verify?verified=${verified}${plan ? `&plan=${plan}` : ''}`); res.reload() }
  return (
    <div className="stack">
      <h1>{t('suppliers')}</h1>
      <div className="tabs">{(['pending', 'verified', 'all'] as const).map(k => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{k === 'all' ? '∑' : t(k)}</button>)}</div>
      {res.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>#</th><th>{t('supplier')}</th><th>{t('city')}</th><th>{t('cr_number')}</th><th>{t('offers')}</th><th>{t('rating')}</th><th>{t('plan')}</th><th></th><th>{t('actions')}</th></tr></thead>
        <tbody>{(res.data || []).map(s => <tr key={s.id}><td className="num">{s.id}</td><td><Link to={`/suppliers/${s.id}`}>{s.name}</Link> {s.verified && <Badge>✓</Badge>}<div className="small muted">{s.phone}</div></td><td>{s.city}</td><td className="ltr">{s.cr_number || '—'}</td><td className="num">{s.offer_count}</td><td>★ {s.rating || '—'} ({s.rating_count})</td>
          <td><select value={s.plan} style={{ width: 'auto' }} onChange={e => verify(s, s.verified, e.target.value)}>{['free', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}</select></td><td className="small muted">{fmtDate(s.created_at, lang)}</td>
          <td>{s.verified ? <button className="btn ghost sm" onClick={() => verify(s, false)}>{t('unverify')}</button> : <button className="btn sm" onClick={() => verify(s, true)}>✓ {t('verify')}</button>}</td></tr>)}</tbody>
      </table></div></div>}
    </div>
  )
}
