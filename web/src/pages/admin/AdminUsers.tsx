import { useState } from 'react'
import { api, User } from '../../api'
import { Badge, Spinner, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminUsers() {
  const { t, lang } = useI18n()
  const [q, setQ] = useState(''); const [role, setRole] = useState('')
  const res = useLoad(() => api.get<User[]>('/admin/users', { q, role }), [q, role])
  const patch = async (u: User, params: Record<string, any>) => { await api.patch(`/admin/users/${u.id}?${new URLSearchParams(params)}`); res.reload() }
  return (
    <div className="stack">
      <div className="row between"><h1>{t('users')}</h1><div className="row"><input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} /><select style={{ width: 'auto' }} value={role} onChange={e => setRole(e.target.value)}><option value="">{t('role')}</option>{['buyer', 'supplier', 'admin'].map(r => <option key={r} value={r}>{r}</option>)}</select></div></div>
      {res.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>#</th><th>{t('full_name')}</th><th>{t('email')}</th><th>{t('role')}</th><th>{t('city')}</th><th>{t('status')}</th><th></th><th>{t('actions')}</th></tr></thead>
        <tbody>{(res.data || []).map(u => <tr key={u.id}><td className="num">{u.id}</td><td>{u.full_name}<div className="small muted">{u.company_name}</div></td><td className="ltr">{u.email}</td><td><select value={u.role} style={{ width: 'auto' }} onChange={e => patch(u, { role: e.target.value })}>{['buyer', 'supplier', 'admin'].map(r => <option key={r} value={r}>{r}</option>)}</select></td><td>{u.city}</td><td>{u.is_active ? <Badge>{t('active')}</Badge> : <Badge kind="danger">{t('disabled')}</Badge>}</td><td className="small muted">{fmtDate(u.created_at, lang)}</td><td><button className={`btn sm ${u.is_active ? 'danger' : ''}`} onClick={() => patch(u, { is_active: String(!u.is_active) })}>{u.is_active ? t('disabled') : t('active')}</button></td></tr>)}</tbody>
      </table></div></div>}
    </div>
  )
}
