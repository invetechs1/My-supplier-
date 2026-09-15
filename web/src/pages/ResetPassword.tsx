import { FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, setToken } from '../api'
import { useAuth } from '../auth'
import OtpBox from '../components/OtpBox'
import { Alert } from '../components/ui'
import { useI18n } from '../i18n'

export default function ResetPassword() {
  const { t } = useI18n()
  const [sp] = useSearchParams()
  const loginMode = sp.get('mode') === 'login'
  const { refresh } = useAuth()
  const nav = useNavigate()
  const [dest, setDest] = useState(''); const [token, setTok] = useState(''); const [pw, setPw] = useState(''); const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await api.post('/auth/password/reset', { verification_token: token, new_password: pw }); setMsg({ kind: 'ok', text: t('success') }); setTimeout(() => nav('/login'), 800) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) }
  }
  return (
    <div className="container"><form className="card auth-box" onSubmit={submit}>
      <h1>{loginMode ? t('login_otp') : t('reset_password')}</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="field"><label>{t('phone')} / {t('email')}</label><input value={dest} onChange={e => setDest(e.target.value)} placeholder="05xxxxxxxx / name@company.sa" /></div>
      {dest.length >= 5 && !token && <OtpBox purpose={loginMode ? 'login' : 'reset'} destination={dest} onVerified={async (tok, _d, extra) => {
        if (loginMode && extra?.access_token) { setToken(extra.access_token); await refresh(); nav(extra.user?.role === 'supplier' ? '/supplier' : extra.user?.role === 'admin' ? '/admin' : '/buyer') } else setTok(tok)
      }} />}
      {token && !loginMode && <>
        <div className="field"><label>{t('new_password')}</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required /></div>
        <button className="btn lg" style={{ width: '100%', justifyContent: 'center' }}>{t('reset_password')}</button>
      </>}
    </form></div>
  )
}
