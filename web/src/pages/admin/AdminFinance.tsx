import { useState } from 'react'
import { api, Payment, Payout } from '../../api'
import { Money, Spinner, Stat, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminFinance() {
  const { t, lang } = useI18n()
  const fin = useLoad(() => api.get<any>('/admin/finance'))
  const pays = useLoad(() => api.get<Payment[]>('/admin/payments'))
  const outs = useLoad(() => api.get<Payout[]>('/admin/payouts'))
  const [tab, setTab] = useState<'payments' | 'payouts'>('payments')
  const reloadAll = () => { fin.reload(); pays.reload(); outs.reload() }
  const confirm = async (p: Payment) => { const ref = prompt(t('reference')) || ''; await api.post(`/admin/payments/${p.id}/confirm-transfer?reference=${encodeURIComponent(ref)}`); reloadAll() }
  const refund = async (p: Payment) => { if (!window.confirm(`${t('refund')} #${p.id}?`)) return; try { await api.post(`/admin/payments/${p.id}/refund`); reloadAll() } catch (e: any) { alert(e.message) } }
  const paid = async (x: Payout) => { const ref = prompt(t('reference')) || ''; await api.post(`/admin/payouts/${x.id}/paid?reference=${encodeURIComponent(ref)}`); reloadAll() }
  const k = fin.data
  return (
    <div className="stack">
      <div className="row between"><h1>{t('finance')}</h1>{k && <span className="muted small">{t('platform_fee')}: {k.fee_pct}% · {k.provider}</span>}</div>
      {k && <div className="kpi-grid">
        <Stat label={t('volume')} value={<Money v={k.volume_paid} digits={0} />} sub={<>30d: <Money v={k.volume_paid_30d} digits={0} /></>} />
        <Stat label={t('fees_earned')} value={<Money v={k.fees_earned} digits={0} />} sub={<>30d: <Money v={k.fees_earned_30d} digits={0} /></>} />
        <Stat label={t('in_escrow')} value={<Money v={k.escrow_held} digits={0} />} />
        <Stat label={t('payouts_pending')} value={<Money v={k.payouts_pending} digits={0} />} />
        <Stat label={t('payouts_paid')} value={<Money v={k.payouts_paid} digits={0} />} />
        <Stat label={t('refunded')} value={<Money v={k.refunded} digits={0} />} />
        <Stat label={t('pending_transfer')} value={k.pending_transfers} />
      </div>}
      <div className="tabs"><button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>{t('payments')}</button><button className={tab === 'payouts' ? 'active' : ''} onClick={() => setTab('payouts')}>{t('payouts')}</button></div>
      {tab === 'payments' ? (pays.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>#</th><th>{t('order')}</th><th>{t('role_buyer')}</th><th>{t('supplier')}</th><th>{t('method')}</th><th>{t('amount')}</th><th>{t('platform_fee')}</th><th>{t('status')}</th><th>{t('reference')}</th><th>{t('updated')}</th><th>{t('actions')}</th></tr></thead>
        <tbody>{(pays.data || []).map(p => <tr key={p.id}><td className="num">{p.id}</td><td className="num">#{p.order_id}</td><td>{p.buyer_name}</td><td>{p.supplier_name}</td><td>{t(p.method)}</td><td className="bold"><Money v={p.amount} /></td><td><Money v={p.platform_fee} /></td><td><Status s={p.status} /></td><td className="ltr small">{p.transfer_reference || p.provider_ref}</td><td className="small muted">{fmtDate(p.paid_at || p.created_at, lang)}</td>
          <td><div className="row" style={{ gap: 4 }}>{p.status === 'pending_transfer' && <button className="btn sm" onClick={() => confirm(p)}>{t('confirm_transfer')}</button>}{p.status === 'paid' && <button className="btn ghost sm" onClick={() => refund(p)}>{t('refund')}</button>}</div></td></tr>)}</tbody>
      </table></div></div>) : (outs.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>#</th><th>{t('supplier')}</th><th>{t('order')}</th><th>{t('amount')}</th><th>{t('iban')}</th><th>{t('status')}</th><th>{t('reference')}</th><th>{t('updated')}</th><th>{t('actions')}</th></tr></thead>
        <tbody>{(outs.data || []).map(x => <tr key={x.id}><td className="num">{x.id}</td><td>{x.supplier_name}</td><td className="num">#{x.order_id}</td><td className="bold"><Money v={x.amount} /></td><td className="ltr">{x.iban_masked || '—'}</td><td><Status s={x.status} /></td><td className="ltr small">{x.reference}</td><td className="small muted">{fmtDate(x.paid_at || x.created_at, lang)}</td><td>{x.status === 'pending' && <button className="btn sm" onClick={() => paid(x)}>{t('mark_paid')}</button>}</td></tr>)}</tbody>
      </table></div></div>)}
    </div>
  )
}
