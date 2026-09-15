import { useState } from 'react'
import { api, Order, PAY_METHODS, Payment } from '../api'
import { Alert, Modal, Money } from './ui'
import { useI18n } from '../i18n'

export default function PayModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { t } = useI18n()
  const [method, setMethod] = useState<string>('mada')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [transfer, setTransfer] = useState<Payment | null>(null)
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const p = await api.post<Payment>('/payments/checkout', { order_id: order.id, method })
      if (p.method === 'bank_transfer') setTransfer(p)
      else if (p.checkout_url) window.location.href = p.checkout_url
      else setErr(t('error'))
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title={`${t('pay_now')} — ${t('order')} #${order.id}`} onClose={onClose}>
      {err && <Alert kind="error">{err}</Alert>}
      {transfer ? (
        <div className="stack">
          <Alert kind="ok">{t('transfer_instructions')}</Alert>
          <div className="card ltr" style={{ display: 'block', fontFamily: 'var(--font-mono)' }}>{transfer.bank_instructions}</div>
          <div className="row between"><span>{t('amount')}</span><b><Money v={transfer.amount} /></b></div>
          <p className="muted small">{t('escrow_note')}</p>
          <button className="btn" onClick={onClose}>{t('confirm')}</button>
        </div>
      ) : (
        <div className="stack">
          <div className="row between"><span>{t('total')} ({t('inc_vat')})</span><b className="num" style={{ fontSize: '1.3rem' }}><Money v={order.total} /></b></div>
          <div><label>{t('choose_method')}</label>
            <div className="grid grid-3">{PAY_METHODS.map(m => <button key={m} type="button" className={`btn ${method === m ? '' : 'ghost'}`} onClick={() => setMethod(m)}>{t(m)}</button>)}</div></div>
          <p className="muted small">{t('escrow_note')}</p>
          <div className="row"><button className="btn lg" onClick={go} disabled={busy}>{t('pay_now')}</button><button className="btn ghost" onClick={onClose}>{t('cancel')}</button></div>
        </div>
      )}
    </Modal>
  )
}
