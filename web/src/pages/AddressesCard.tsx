import { FormEvent, useState } from 'react'
import { Address, api } from '../api'
import { Badge, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export function AddressForm({ initial, onSaved, onCancel }: { initial?: Address; onSaved: (a: Address) => void; onCancel?: () => void }) {
  const { t } = useI18n()
  const [f, setF] = useState({ label: initial?.label || '', recipient: initial?.recipient || '', phone: initial?.phone || '', city: initial?.city || '', district: initial?.district || '', street: initial?.street || '', building: initial?.building || '', notes: initial?.notes || '', is_default: initial?.is_default || false })
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    try { onSaved(initial ? await api.put<Address>(`/account/addresses/${initial.id}`, f) : await api.post<Address>('/account/addresses', f)) } catch (ex: any) { setErr(ex.message) }
  }
  const F = (k: keyof typeof f, label: string, req = false) => <div className="field"><label>{label}</label><input required={req} value={f[k] as string} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>
  return (
    <form onSubmit={submit} className="stack" style={{ gap: 4 }}>
      {err && <div className="alert error">{err}</div>}
      <div className="grid grid-2" style={{ gap: 8 }}>
        {F('label', t('label'))}{F('city', t('city'), true)}{F('district', t('district'))}{F('street', t('street'))}{F('building', t('building'))}{F('recipient', t('recipient'))}{F('phone', t('phone'))}{F('notes', t('notes'))}
      </div>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.is_default} onChange={e => setF({ ...f, is_default: e.target.checked })} /> {t('make_default')}</label>
      <div className="row"><button className="btn sm">{t('save')}</button>{onCancel && <button type="button" className="btn ghost sm" onClick={onCancel}>{t('cancel')}</button>}</div>
    </form>
  )
}

export default function AddressesCard() {
  const { t } = useI18n()
  const res = useLoad(() => api.get<Address[]>('/account/addresses'))
  const [edit, setEdit] = useState<Address | 'new' | null>(null)
  return (
    <div className="card"><div className="row between"><h3>📍 {t('addresses')}</h3>{edit === null && <button className="btn ghost sm" onClick={() => setEdit('new')}>➕ {t('add_address')}</button>}</div>
      {edit !== null ? <AddressForm initial={edit === 'new' ? undefined : edit} onSaved={() => { setEdit(null); res.reload() }} onCancel={() => setEdit(null)} /> : (
        <div className="stack" style={{ gap: 6 }}>
          {(res.data || []).length === 0 && <div className="muted small">—</div>}
          {(res.data || []).map(a => <div key={a.id} className="row between" style={{ borderBottom: '1px solid var(--line-2)', paddingBottom: 6 }}>
            <span><b>{a.label || a.city}</b> {a.is_default && <Badge kind="neutral">{t('default_address')}</Badge>}<div className="small muted">{a.formatted}</div></span>
            <span className="row" style={{ gap: 4 }}>{!a.is_default && <button className="btn ghost sm" onClick={async () => { await api.put(`/account/addresses/${a.id}`, { ...a, is_default: true }); res.reload() }}>{t('make_default')}</button>}<button className="btn ghost sm" onClick={() => setEdit(a)}>✎</button><button className="btn ghost sm" onClick={async () => { if (confirm(t('delete') + '?')) { await api.del(`/account/addresses/${a.id}`); res.reload() } }}>🗑</button></span>
          </div>)}
        </div>
      )}
    </div>
  )
}
