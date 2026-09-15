import { useState } from 'react'
import { api, Delivery } from '../../api'
import { Badge, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminOps() {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState('')
  const del = useLoad(() => api.get<Delivery[]>('/admin/deliveries', { status }), [status])
  const jobs = useLoad(() => api.get<any>('/admin/jobs'))
  const run = async (name: string) => { const r = await api.post<any>(`/admin/jobs/${name}/run`); alert(JSON.stringify(r.result)); jobs.reload(); del.reload() }
  return (
    <div className="stack">
      <h1>{t('deliveries')} · {t('jobs')}</h1>
      <div className="card"><h3>{t('jobs')}</h3><div className="row">{(jobs.data?.jobs || []).map((j: string) => <button key={j} className="btn secondary sm" onClick={() => run(j)}>▶ {j}</button>)}</div>
        <div className="t-wrap" style={{ marginTop: 10 }}><table><thead><tr><th>{t('jobs')}</th><th>{t('status')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>{(jobs.data?.runs || []).slice(0, 12).map((r: any) => <tr key={r.id}><td>{r.name}</td><td><Badge kind={r.status === 'ok' ? '' : 'danger'}>{r.status}</Badge></td><td className="small muted">{fmtDate(r.started_at, lang)}</td><td className="ltr small muted">{JSON.stringify(r.detail)}</td></tr>)}</tbody></table></div></div>
      <div className="row between"><h3>{t('deliveries')}</h3><select style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value)}><option value="">∑</option>{['queued', 'sent', 'failed'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></div>
      {del.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>#</th><th>{t('users')}</th><th>{lang === 'ar' ? 'القناة' : 'Channel'}</th><th>{lang === 'ar' ? 'الوجهة' : 'Destination'}</th><th>{t('status')}</th><th>{lang === 'ar' ? 'المزوّد' : 'Provider'}</th><th>{lang === 'ar' ? 'المحاولات' : 'Attempts'}</th><th>{t('updated')}</th><th></th></tr></thead>
        <tbody>{(del.data || []).map(d => <tr key={d.id}><td className="num">{d.id}</td><td className="num">{d.user_id}</td><td>{t('channel_' + d.channel)}</td><td className="ltr small">{d.destination}</td><td><Status s={d.status} />{d.error && <div className="small muted ltr">{d.error}</div>}</td><td>{d.provider}</td><td className="num">{d.attempts}</td><td className="small muted">{fmtDate(d.sent_at || d.created_at, lang)}</td><td>{d.status === 'failed' && <button className="btn ghost sm" onClick={() => api.post(`/admin/deliveries/${d.id}/retry`).then(del.reload)}>{t('retry')}</button>}</td></tr>)}</tbody>
      </table></div></div>}
    </div>
  )
}
