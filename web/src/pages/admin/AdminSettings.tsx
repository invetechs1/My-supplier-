import { FormEvent, useEffect, useState } from 'react'
import { api } from '../../api'
import { Alert, Spinner, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

const GROUPS: Record<string, string[]> = {
  general: ['platform_name', 'platform_name_ar', 'tagline', 'support_email', 'support_phone', 'home_banner_text', 'home_banner_link', 'maintenance_message'],
  finance: ['platform_fee_pct', 'vat_rate_pct', 'platform_vat_number', 'bank_instructions', 'min_order_amount'],
  marketplace: ['rfq_default_days', 'supplier_registration_open', 'buyer_registration_open', 'auto_verify_suppliers'],
}

export default function AdminSettings() {
  const { t } = useI18n()
  const res = useLoad(() => api.get<{ values: Record<string, string>; schema: { key: string; type: string; description: string; default: string }[] }>('/admin/settings'))
  const [v, setV] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { if (res.data) setV(res.data.values) }, [res.data])
  if (res.loading || !res.data) return <Spinner />
  const schema = Object.fromEntries(res.data.schema.map(s => [s.key, s]))
  const save = async (e: FormEvent) => { e.preventDefault(); try { await api.put('/admin/settings', { values: v }); setMsg({ kind: 'ok', text: t('settings_saved') }) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const field = (k: string) => {
    const s = schema[k]; if (!s) return null
    const val = v[k] ?? ''
    if (s.type === 'bool') return <label key={k} className="row" style={{ marginBottom: 10 }}><input type="checkbox" style={{ width: 'auto' }} checked={['1', 'true', 'yes', 'on'].includes(String(val).toLowerCase())} onChange={e => setV({ ...v, [k]: e.target.checked ? '1' : '0' })} /> {s.description}</label>
    if (s.type === 'text') return <div key={k} className="field"><label>{s.description}</label><textarea rows={2} value={val} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>
    return <div key={k} className="field"><label>{s.description}</label><input type={s.type === 'float' || s.type === 'int' ? 'number' : 'text'} step="any" value={val} onChange={e => setV({ ...v, [k]: e.target.value })} /></div>
  }
  return (
    <form className="stack" onSubmit={save}>
      <div className="row between"><h1>{t('settings')}</h1><button className="btn">{t('save')}</button></div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid grid-2">
        <div className="card"><h3>{t('general')}</h3>{GROUPS.general.map(field)}</div>
        <div className="stack"><div className="card"><h3>{t('finance')}</h3>{GROUPS.finance.map(field)}</div><div className="card"><h3>{t('market')}</h3>{GROUPS.marketplace.map(field)}</div></div>
      </div>
    </form>
  )
}
