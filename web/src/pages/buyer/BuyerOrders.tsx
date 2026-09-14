import { useState } from 'react'
import { api, Order } from '../../api'
import { Empty, Modal, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export function OrdersTable({ orders, supplierView, reload }: { orders: Order[]; supplierView: boolean; reload: () => void }) {
  const { t, lang } = useI18n()
  const [review, setReview] = useState<Order | null>(null)
  const [rating, setRating] = useState(5); const [comment, setComment] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const move = async (o: Order, status: string) => { try { await api.patch(`/orders/${o.id}/status`, { status }); reload() } catch (e: any) { alert(e.message) } }
  const next: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['in_delivery', 'cancelled'], in_delivery: ['delivered'] }
  return (
    <div className="card pad-0"><div className="t-wrap"><table>
      <thead><tr><th>#</th><th>{supplierView ? t('role_buyer') : t('supplier')}</th><th>{t('items')}</th><th>{t('total')}</th><th>{t('status')}</th><th>{t('updated')}</th><th>{t('actions')}</th></tr></thead>
      <tbody>{orders.map(o => (
        <>
          <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(open === o.id ? null : o.id)}>
            <td className="num">{o.id}{o.rfq_id && <div className="small muted">RFQ #{o.rfq_id}</div>}</td>
            <td>{supplierView ? o.buyer_name : o.supplier?.name}</td>
            <td className="num">{o.items.length}</td>
            <td className="bold"><Money v={o.total} /></td>
            <td><Status s={o.status} /></td>
            <td className="small muted">{fmtDate(o.updated_at, lang)}</td>
            <td onClick={e => e.stopPropagation()}>
              <div className="row" style={{ gap: 4 }}>
                {supplierView && (next[o.status] || []).map(s => <button key={s} className={`btn sm ${s === 'cancelled' ? 'danger' : ''}`} onClick={() => move(o, s)}>{t(s)}</button>)}
                {!supplierView && o.status === 'pending' && <button className="btn sm danger" onClick={() => move(o, 'cancelled')}>{t('cancelled')}</button>}
                {!supplierView && o.status === 'delivered' && !o.has_review && <button className="btn sm secondary" onClick={() => setReview(o)}>★ {t('rate_supplier')}</button>}
              </div>
            </td>
          </tr>
          {open === o.id && <tr key={o.id + 'd'}><td colSpan={7} style={{ background: 'var(--card-2)' }}>
            <table><tbody>{o.items.map(i => <tr key={i.id}><td>{i.description}</td><td className="num">{i.quantity} {i.unit}</td><td><Money v={i.unit_price} /></td><td><Money v={i.line_total} /></td></tr>)}
              <tr><td colSpan={3} className="muted">{t('vat')}</td><td><Money v={o.vat} /></td></tr></tbody></table>
            {o.delivery_address && <div className="small muted">📍 {o.delivery_address}</div>}{o.notes && <div className="small muted">{o.notes}</div>}
          </td></tr>}
        </>
      ))}</tbody>
    </table></div>
      {review && <Modal title={`${t('rate_supplier')} — ${review.supplier?.name}`} onClose={() => setReview(null)}>
        <div className="row" style={{ fontSize: '1.6rem', cursor: 'pointer' }}>{[1, 2, 3, 4, 5].map(n => <span key={n} onClick={() => setRating(n)} style={{ color: n <= rating ? '#F2B134' : '#ccc' }}>★</span>)}</div>
        <div className="field"><label>{t('notes')}</label><textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} /></div>
        <button className="btn" onClick={async () => { await api.post(`/orders/${review.id}/review`, { rating, comment }); setReview(null); reload() }}>{t('save')}</button>
      </Modal>}
    </div>
  )
}

export default function BuyerOrders() {
  const { t } = useI18n()
  const res = useLoad(() => api.get<Order[]>('/orders/mine'))
  return <div className="stack"><h1>{t('orders')}</h1>{res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : <OrdersTable orders={res.data} supplierView={false} reload={res.reload} />}</div>
}
