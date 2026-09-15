import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, Category } from '../api'
import { useAuth } from '../auth'
import OtpBox from '../components/OtpBox'
import { Alert, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export default function Register() {
  const { t, name } = useI18n()
  const { register } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [f, setF] = useState({ role: sp.get('role') === 'supplier' ? 'supplier' : 'buyer', email: '', password: '', full_name: '', company_name: '', phone: '', city: 'الرياض', cr_number: '', category_ids: [] as number[], otp_token: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'))
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { const u = await register(f); nav(u.role === 'supplier' ? '/supplier' : '/buyer') } catch (ex: any) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <div className="container"><form className="card auth-box" style={{ maxWidth: 560 }} onSubmit={submit}>
      <h1>{t('register')}</h1>
      {err && <Alert kind="error">{err}</Alert>}
      <div className="tabs"><button type="button" className={f.role === 'buyer' ? 'active' : ''} onClick={() => set('role', 'buyer')}>{t('role_buyer')}</button><button type="button" className={f.role === 'supplier' ? 'active' : ''} onClick={() => set('role', 'supplier')}>{t('role_supplier')}</button></div>
      <div className="grid grid-2">
        <div className="field"><label>{t('full_name')}</label><input value={f.full_name} onChange={e => set('full_name', e.target.value)} required minLength={2} /></div>
        <div className="field"><label>{t('company')}</label><input value={f.company_name} onChange={e => set('company_name', e.target.value)} required={f.role === 'supplier'} /></div>
        <div className="field"><label>{t('email')}</label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} required /></div>
        <div className="field"><label>{t('password')}</label><input type="password" value={f.password} onChange={e => set('password', e.target.value)} required minLength={8} /></div>
        <div className="field"><label>{t('phone')}</label><input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+9665xxxxxxxx" /></div>
        <div className="field"><label>{t('city')}</label><select value={f.city} onChange={e => set('city', e.target.value)}>{[...new Set([f.city, ...(cities.data || [])])].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        {f.role === 'supplier' && <div className="field"><label>{t('cr_number')}</label><input value={f.cr_number} onChange={e => set('cr_number', e.target.value)} /></div>}
      </div>
      {f.role === 'supplier' && <div className="field"><label>{t('specialties')}</label>
        <div className="row">{(cats.data || []).filter(c => !c.parent_id).map(c => <label key={c.id} className="row" style={{ width: 'auto', gap: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.category_ids.includes(c.id)} onChange={e => set('category_ids', e.target.checked ? [...f.category_ids, c.id] : f.category_ids.filter(x => x !== c.id))} />{c.icon} {name(c)}</label>)}</div>
      </div>}
      {f.phone.length >= 9 && <div className="field"><OtpBox purpose="register" destination={f.phone} label={t('verify_phone')} onVerified={(tok, dest) => { setF(x => ({ ...x, otp_token: tok, phone: dest })) }} /></div>}
      <button className="btn lg" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{t('register')}</button>
      <p className="muted small" style={{ marginTop: 12 }}>{t('have_account')} <Link to="/login">{t('login')}</Link></p>
    </form></div>
  )
}
