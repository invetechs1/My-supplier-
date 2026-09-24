import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Address, api, GroupCheckout, Order, PAY_METHODS } from '../api'
import { useAuth } from '../auth'
import { useCart } from '../cart'
import { Alert, Badge, Empty, Modal, Money, Spinner } from '../components/ui'
import { useI18n } from '../i18n'
import { AddressForm } from './AddressesCard'

export default function CartPage() {
  const { t, name, lang } = useI18n()
  const { user } = useAuth()
  const cart = useCart()
  const nav = useNavigate()
  const c = cart.cart
  const [coupon, setCoupon] = useState('')
  const [applied, setApplied] = useState('')
  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressId, setAddressId] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [newAddr, setNewAddr] = useState(false)
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [method, setMethod] = useState<string>('mada')
  const [transfer, setTransfer] = useState<GroupCheckout | null>(null)
  const [busy, setBusy] = useState(false)
  const isBuyer = user?.role === 'buyer'
  useEffect(() => { if (isBuyer) api.get<Address[]>('/account/addresses').then(a => { setAddresses(a); const d = a.find(x => x.is_default) || a[0]; if (d) setAddressId(d.id) }).catch(() => {}) }, [isBuyer])
  const applyCoupon = async () => { setApplied(coupon.trim().toUpperCase()); await cart.reload(coupon.trim().toUpperCase()) }
  const checkout = async () => {
    setErr(''); setBusy(true)
    try {
      const os = await api.post<Order[]>('/cart/checkout', { address_id: newAddr ? null : addressId, delivery_address: typed, coupon_code: applied, notes })
      setOrders(os); await cart.reload()
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const payAll = async () => {
    if (!orders) return
    setBusy(true); setErr('')
    try {
      const g = await api.post<GroupCheckout>('/payments/checkout-group', { order_ids: orders.map(o => o.id), method })
      if (g.method === 'bank_transfer') setTransfer(g)
      else if (g.checkout_url) window.location.href = g.checkout_url
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  if (!c) return <div className="container" style={{ padding: 30 }}><Spinner /></div>
  if (user && !isBuyer) return <div className="container" style={{ padding: 30 }}><Empty>{t('buyer_only')}</Empty></div>
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="row between"><h1>🛒 {t('cart')} <span className="muted small">({c.item_count})</span></h1>{c.item_count > 0 && <button className="btn ghost sm" onClick={() => cart.clear()}>{t('clear')}</button>}</div>
      {(err || cart.error) && <Alert kind="error">{err || cart.error}</Alert>}
      {c.groups.length === 0 ? <Empty>{t('cart_empty')}<div style={{ marginTop: 10 }}><Link className="btn" to="/catalog">{t('continue_shopping')}</Link></div></Empty> : (
        <div className="cart-page">
          <div className="stack">
            {c.groups.map(g => (
              <div className="card" key={g.supplier.id}>
                <div className="row between"><div><b>{t('sold_by')} <Link to={`/suppliers/${g.supplier.id}`}>{g.supplier.name}</Link></b> {g.supplier.verified && <Badge>✓ {t('verified')}</Badge>} <span className="muted small">· {g.supplier.city}</span></div>
                  <div className="small">{g.delivery_fee > 0 ? <>{t('delivery_total')}: <Money v={g.delivery_fee} /></> : <Badge>{t('free_delivery')}</Badge>}{g.free_delivery_over != null && g.delivery_fee > 0 && <span className="muted"> · {t('free_over')} <Money v={g.free_delivery_over} /></span>}</div></div>
                {g.below_minimum && <Alert kind="error">{t('below_minimum')}: <Money v={g.min_order_amount} /></Alert>}
                {g.items.map(it => (
                  <div className="cart-line" key={it.id}>
                    <img src={it.offer.image_url || it.offer.product?.image_url} alt="" />
                    <div>
                      <Link to={`/products/${it.offer.product_id}`}>{name(it.offer.product!)}</Link>
                      <div className="small muted">{it.offer.product?.brand} · <Money v={it.offer.price_ex_vat} /> {it.offer.rental_period ? t('per_' + it.offer.rental_period) : `/ ${it.offer.unit}`} · {t('min_qty')} {it.offer.min_qty}{it.offer.available_qty != null && <> · {t('available_qty')} {it.offer.available_qty}</>}</div>
                      <div className="row small" style={{ marginTop: 4 }}>
                        <span className="qty"><button onClick={() => cart.setQty(it, Math.max(it.offer.min_qty || 1, it.quantity - 1))}>−</button><input type="number" value={it.quantity} min={it.offer.min_qty} onChange={e => cart.setQty(it, Math.max(it.offer.min_qty || 1, Number(e.target.value) || 1))} /><button onClick={() => cart.setQty(it, it.quantity + 1)}>+</button></span>
                        <button className="btn ghost sm" onClick={() => cart.remove(it)}>🗑 {t('remove')}</button>
                      </div>
                    </div>
                    <div className="bold num"><Money v={it.line_total} /></div>
                  </div>
                ))}
                <div className="row between small" style={{ paddingTop: 8 }}><span className="muted">{t('subtotal')} ({g.items.length} {t('items')})</span><b><Money v={g.subtotal} /></b></div>
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="card">
              <h3>{t('order_summary')}</h3>
              <div className="stack small" style={{ gap: 6 }}>
                <div className="row between"><span>{t('subtotal')}</span><Money v={c.subtotal} /></div>
                <div className="row between"><span>{t('delivery_total')}</span>{c.delivery_total > 0 ? <Money v={c.delivery_total} /> : <span className="muted">{t('free_delivery')}</span>}</div>
                {c.discount > 0 && <div className="row between" style={{ color: 'var(--ok)' }}><span>{t('discount')} <span className="ltr">({c.coupon_code})</span></span><span>- <Money v={c.discount} /></span></div>}
                <div className="row between"><span>{t('vat')} 15%</span><Money v={c.vat} /></div>
                <div className="row between bold" style={{ fontSize: '1.1rem' }}><span>{t('total')}</span><Money v={c.total} /></div>
              </div>
              {isBuyer && <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: 'nowrap' }}><input className="ltr" placeholder={t('coupon')} value={coupon} onChange={e => setCoupon(e.target.value.toUpperCase())} /><button className="btn sm secondary" onClick={applyCoupon}>{t('apply')}</button></div>}
              {c.coupon_error && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>{c.coupon_error}</div>}
              <p className="muted small" style={{ marginTop: 8 }}>{t('escrow_note')}</p>
              {!user ? <Link className="btn lg" to="/login" state={{ from: '/cart' }} style={{ width: '100%', justifyContent: 'center' }}>{t('login')} → {t('checkout')}</Link> : null}
              {!user && <div className="small muted" style={{ marginTop: 6 }}>{t('guest_cart_note')}</div>}
            </div>
            {isBuyer && (
              <div className="card">
                <h3>📍 {t('delivery_address')}</h3>
                {addresses.length > 0 && !newAddr && <div className="stack" style={{ gap: 6 }}>{addresses.map(a => <label key={a.id} className="row" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}><input type="radio" style={{ width: 'auto', marginTop: 4 }} checked={addressId === a.id} onChange={() => setAddressId(a.id)} /><span><b>{a.label || a.city}</b> {a.is_default && <Badge kind="neutral">{t('default_address')}</Badge>}<div className="small muted">{a.formatted}</div></span></label>)}</div>}
                {(addresses.length === 0 || newAddr) ? (
                  <AddressForm onSaved={a => { setAddresses(x => [...x, a]); setAddressId(a.id); setNewAddr(false) }} onCancel={addresses.length ? () => setNewAddr(false) : undefined} />
                ) : <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setNewAddr(true)}>➕ {t('new_address')}</button>}
                <div className="field" style={{ marginTop: 10 }}><label>{t('type_address')}</label><input value={typed} onChange={e => setTyped(e.target.value)} placeholder={lang === 'ar' ? 'مثال: الرياض، حي العليا، موقع المشروع…' : 'e.g. Riyadh, Olaya, project site…'} /></div>
                <div className="field"><label>{t('notes')}</label><input value={notes} onChange={e => setNotes(e.target.value)} /></div>
                <button className="btn lg" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || c.groups.some(g => g.below_minimum)} onClick={checkout}>{t('place_order')} · <Money v={c.total} /></button>
                <div className="small muted" style={{ marginTop: 6 }}>{c.groups.length > 1 ? (lang === 'ar' ? `سيتم إنشاء ${c.groups.length} طلبات (طلب لكل مورّد) وتدفعها دفعة واحدة.` : `${c.groups.length} orders will be created (one per supplier) and paid in one payment.`) : ''}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {orders && (
        <Modal title={`${t('orders_created')} — ${orders.length}`} onClose={() => { setOrders(null); nav('/buyer/orders') }}>
          {err && <Alert kind="error">{err}</Alert>}
          {transfer ? (
            <div className="stack">
              <Alert kind="ok">{t('transfer_instructions')}</Alert>
              <div className="card ltr" style={{ display: 'block', fontFamily: 'var(--font-mono)' }}>{transfer.bank_instructions}</div>
              <div className="row between"><span>{t('amount')}</span><b><Money v={transfer.total} /></b></div>
              <button className="btn" onClick={() => nav('/buyer/orders')}>{t('confirm')}</button>
            </div>
          ) : (
            <div className="stack">
              <table><tbody>{orders.map(o => <tr key={o.id}><td>#{o.id}</td><td>{o.supplier?.name}</td><td className="num">{o.items.length} {t('items')}</td><td className="bold"><Money v={o.total} /></td></tr>)}</tbody></table>
              <div className="row between"><span>{t('total')} ({t('inc_vat')})</span><b className="num" style={{ fontSize: '1.3rem' }}><Money v={orders.reduce((a, o) => a + o.total, 0)} /></b></div>
              <div><label>{t('choose_method')}</label><div className="grid grid-3">{PAY_METHODS.map(m => <button key={m} type="button" className={`btn ${method === m ? '' : 'ghost'}`} onClick={() => setMethod(m)}>{t(m)}</button>)}</div></div>
              <p className="muted small">{t('escrow_note')}</p>
              <div className="row"><button className="btn lg" onClick={payAll} disabled={busy}>💳 {t('pay_all')}</button><button className="btn ghost" onClick={() => nav('/buyer/orders')}>{t('pay_later_note')}</button></div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
