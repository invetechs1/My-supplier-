/** Reusable OTP step: send a code to a phone/email, verify it, hand back the verification token. */
import { useState } from 'react'
import { api } from '../api'
import { Alert } from './ui'
import { useI18n } from '../i18n'

export default function OtpBox({ purpose, destination, onVerified, label }: { purpose: 'register' | 'login' | 'reset' | 'verify'; destination: string; onVerified: (token: string, dest: string, extra?: any) => void; label?: string }) {
  const { t } = useI18n()
  const [sent, setSent] = useState<{ destination: string; debug_code?: string } | null>(null)
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false)
  const send = async () => { setBusy(true); setErr(''); try { setSent(await api.post('/auth/otp/request', { destination, purpose })) } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  const verify = async () => { setBusy(true); setErr(''); try { const r = await api.post<any>('/auth/otp/verify', { destination, code, purpose }); setDone(true); onVerified(r.verification_token, r.destination, r) } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  if (done) return <Alert kind="ok">{t('verified')} ✓</Alert>
  return (
    <div className="card" style={{ background: 'var(--card-2)' }}>
      {label && <label>{label}</label>}
      {err && <Alert kind="error">{err}</Alert>}
      {!sent ? <button type="button" className="btn secondary" onClick={send} disabled={busy || !destination}>{t('otp_send')} → <span className="ltr">{destination}</span></button> : (
        <div className="row">
          <span className="small muted">{t('otp_sent')} <span className="ltr">{sent.destination}</span> {sent.debug_code && <b>{t('otp_debug')} <span className="ltr">{sent.debug_code}</span>)</b>}</span>
          <input className="ltr" style={{ width: 140, display: 'inline-block', letterSpacing: 4 }} inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} placeholder="••••••" />
          <button type="button" className="btn" onClick={verify} disabled={busy || code.length < 4}>{t('otp_verify')}</button>
          <button type="button" className="btn ghost sm" onClick={send} disabled={busy}>↻</button>
        </div>
      )}
    </div>
  )
}
