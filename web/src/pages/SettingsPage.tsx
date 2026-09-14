import { FormEvent, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert } from '../components/ui'
import { useI18n } from '../i18n'

export default function SettingsPage() {
  const { t } = useI18n()
  const { user, refresh } = useAuth()
  const [f, setF] = useState({ full_name: user?.full_name || '', phone: user?.phone || '', company_name: user?.company_name || '', city: user?.city || '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const save = async (e: FormEvent) => { e.preventDefault(); try { await api.patch('/auth/me', f); await refresh(); setMsg({ kind: 'ok', text: t('success') }) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const changePw = async (e: FormEvent) => { e.preventDefault(); try { await api.post('/auth/change-password', pw); setPw({ current_password: '', new_password: '' }); setMsg({ kind: 'ok', text: t('success') }) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  return (
    <div className="grid grid-2">
      <form className="card" onSubmit={save}><h3>{t('profile')}</h3>{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div className="field"><label>{t('full_name')}</label><input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></div>
        <div className="field"><label>{t('company')}</label><input value={f.company_name} onChange={e => setF({ ...f, company_name: e.target.value })} /></div>
        <div className="field"><label>{t('phone')}</label><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><label>{t('city')}</label><input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></div>
        <button className="btn">{t('save')}</button></form>
      <form className="card" onSubmit={changePw}><h3>{t('change_password')}</h3>
        <div className="field"><label>{t('password')}</label><input type="password" value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} required /></div>
        <div className="field"><label>{t('change_password')}</label><input type="password" value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} required minLength={8} /></div>
        <button className="btn">{t('save')}</button></form>
    </div>
  )
}
