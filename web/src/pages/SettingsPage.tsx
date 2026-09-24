import { FormEvent, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import OtpBox from '../components/OtpBox'
import { Alert, Badge } from '../components/ui'
import { useI18n } from '../i18n'
import AddressesCard from './AddressesCard'

export default function SettingsPage() {
  const { t } = useI18n()
  const { user, refresh } = useAuth()
  const [f, setF] = useState({ full_name: user?.full_name || '', phone: user?.phone || '', company_name: user?.company_name || '', city: user?.city || '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const save = async (e: FormEvent) => { e.preventDefault(); try { await api.patch('/auth/me', f); await refresh(); setMsg({ kind: 'ok', text: t('success') }) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const changePw = async (e: FormEvent) => { e.preventDefault(); try { await api.post('/auth/change-password', pw); setPw({ current_password: '', new_password: '' }); setMsg({ kind: 'ok', text: t('success') }) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const [prefs, setPrefs] = useState({ notify_email: user?.notify_email ?? true, notify_sms: user?.notify_sms ?? true, notify_whatsapp: user?.notify_whatsapp ?? false, notify_push: user?.notify_push ?? true })
  const savePrefs = async (next: typeof prefs) => { setPrefs(next); try { await api.patch('/auth/me/notifications', next); await refresh() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  return (
    <div className="grid grid-2">
      <div className="card"><h3>{t('notif_prefs')}</h3>
        {(['notify_email', 'notify_sms', 'notify_whatsapp', 'notify_push'] as const).map(k => <label key={k} className="row" style={{ marginBottom: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={prefs[k]} onChange={e => savePrefs({ ...prefs, [k]: e.target.checked })} /> {t('channel_' + k.replace('notify_', ''))}</label>)}
      </div>
      <div className="card"><h3>{t('verify_phone')}</h3>
        {user?.phone_verified ? <Badge>{t('phone_verified')}</Badge> : <>
          <div className="field"><label>{t('phone')}</label><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="05xxxxxxxx" /></div>
          {f.phone.length >= 9 && <OtpBox purpose="verify" destination={f.phone} onVerified={async (tok) => { await api.post(`/auth/verify-contact?verification_token=${encodeURIComponent(tok)}`); await refresh(); setMsg({ kind: 'ok', text: t('phone_verified') }) }} />}
        </>}
      </div>
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
      {user?.role === 'buyer' && <AddressesCard />}
    </div>
  )
}
