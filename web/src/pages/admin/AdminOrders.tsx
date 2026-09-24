import { useState } from 'react'
import { api, API_BASE, getToken, Order } from '../../api'
import { Modal, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminOrders() {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState(''); const [pay, setPay] = useState(''); const [q, setQ] = useState('')
  const res = useLoad(() => api.get<Order[]>('/admin/orders', { status, payment_status: pay, q }), [status, pay, q])
  const [open, setOpen] = useState<number | null>(null)
  const [ovr, setOvr] = useState<Order | null>(null); const [f, setF] = useState({ status: 'confirmed', note: '' })
  const save = async () => { if (!ovr) return; try { await api.patch(`/admin/orders/${ovr.id}/status`, f); setOvr(null); res.reload() } catch (e: any) { alert(e.message) } }
  return (
    <div className="stack">
      <div className="row between"><h1>{t('orders')}</h1><a className="btn ghost sm" href={`${API_BASE}/admin/export/orders.csv?token=${getToken()}`}>⬇ CSV</a></div>
      <div className="card row">
        <input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <select style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value)}><option value="">{t('status')}: ∑</option>{['pending', 'confirmed', 'in_delivery', 'delivered', 'cancelled'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select>
        <select style={{ width: 'auto' }} value={pay} onChange={e => setPay(e.target.value)}><option value="">{t('payment_status')}: ∑</option>{['unpaid', 'pending', 'paid', 'released', 'refunded'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select>
        <span className="muted small">{res.data?.length ?? 0}</span>
      </div>
      {res.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>#</th><th>{t('role_buyer')}</th><th>{t('supplier')}</th><th>{t('city')}</th><th>{t('items')}</th><th>{t('total')}</th><th>{t('status')}</th><th>{t('payment_status')}</th><th>{t('updated')}</th><th></th></tr></thead>
        <tbody>{(res.data || []).map(o => (
          <>
            <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(open === o.id ? null : o.id)}>
              <td className="num">{o.id}{o.rfq_id && <div className="small muted">RFQ #{o.rfq_id}</div>}</td><td>{o.buyer_name}</td><td>{o.supplier?.name}</td><td>{o.city}</td><td className="num">{o.items.length}</td><td className="bold"><Money v={o.total} /></td><td><Status s={o.status} /></td><td><Status s={o.payment_status} /></td><td className="small muted">{fmtDate(o.updated_at, lang)}</td>
              <td onClick={e => e.stopPropagation()}><button className="btn ghost sm" onClick={() => { setOvr(o); setF({ status: 'confirmed', note: '' }) }}>{t('override_status')}</button></td>
            </tr>
            {open === o.id && <tr key={o.id + 'd'}><td colSpan={10} style={{ background: 'var(--card-2)' }}>
              <table><tbody>{o.items.map(i => <tr key={i.id}><td>{i.description}</td><td className="num">{i.quantity} {i.unit}</td><td><Money v={i.unit_price} /></td><td><Money v={i.line_total} /></td></tr>)}
                {o.discount > 0 && <tr><td colSpan={3} className="muted">{t('discount')} {o.coupon_code}</td><td>- <Money v={o.discount} /></td></tr>}<tr><td colSpan={3} className="muted">{t('vat')}</td><td><Money v={o.vat} /></td></tr></tbody></table>
              <div className="small muted">📍 {o.delivery_address} {o.notes && <>· {o.notes}</>}</div>
            </td></tr>}
          </>
        ))}</tbody>
      </table></div></div>}
      {ovr && <Modal title={`${t('override_status')} — #${ovr.id}`} onClose={() => setOvr(null)}>
        <div className="field"><label>{t('status')}</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{['pending', 'confirmed', 'in_delivery', 'delivered', 'cancelled'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></div>
        <div className="field"><label>{t('notes')}</label><textarea rows={2} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
        <p className="small muted">{lang === 'ar' ? 'التسليم يحرّر المبلغ المحجوز للمورّد، والإلغاء يردّ المبلغ المدفوع تلقائياً.' : 'Delivered releases escrow to the supplier; cancelled refunds automatically.'}</p>
        <button className="btn" onClick={save}>{t('confirm')}</button>
      </Modal>}
    </div>
  )
}
