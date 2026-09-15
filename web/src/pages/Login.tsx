import { FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Alert } from '../components/ui'
import { useI18n } from '../i18n'

export default function Login() {
  const { t } = useI18n()
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as any
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { const u = await login(email, password); nav(loc.state?.from || (u.role === 'supplier' ? '/supplier' : u.role === 'admin' ? '/admin' : '/buyer')) }
    catch (ex: any) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <div className="container"><form className="card auth-box" onSubmit={submit}>
      <h1>{t('login')}</h1>
      {err && <Alert kind="error">{err}</Alert>}
      <div className="field"><label>{t('email')}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></div>
      <div className="field"><label>{t('password')}</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
      <button className="btn lg" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{t('login')}</button>
      <p className="muted small" style={{ marginTop: 12 }}>{t('no_account')} <Link to="/register">{t('register')}</Link> · <Link to="/reset-password">{t('forgot_password')}</Link> · <Link to="/reset-password?mode=login">{t('login_otp')}</Link></p>
      <details className="small muted"><summary>{t('demo_accounts')}</summary>
        <div className="ltr" style={{ display: 'block' }}>buyer@demo.sa / Demo@2026<br />supplier1@demo.sa … supplier7@demo.sa / Demo@2026<br />admin@mysupplier.sa / Admin@2026</div>
      </details>
    </form></div>
  )
}
