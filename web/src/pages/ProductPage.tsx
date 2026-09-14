import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, Offer, ProductDetail } from '../api'
import { useAuth, useQuoteList } from '../auth'
import { Alert, Badge, Change, Modal, Money, PriceChart, Spinner, Status, useLoad } from '../components/ui'
import { fmtDate, useI18n } from '../i18n'
import { ProductCard } from './Catalog'

export default function ProductPage() {
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const city = sp.get('city') || ''
  const { t, name, lang } = useI18n()
  const { user } = useAuth()
  const quote = useQuoteList()
  const nav = useNavigate()
  const res = useLoad(() => api.get<ProductDetail>(`/catalog/products/${id}`, { city }), [id, city])
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'))
  const [order, setOrder] = useState<Offer | null>(null)
  const [qty, setQty] = useState(1)
  const [addr, setAddr] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const [target, setTarget] = useState('')

  if (res.loading) return <div className="container" style={{ padding: 30 }}><Spinner /></div>
  if (res.error || !res.data) return <div className="container" style={{ padding: 30 }}><Alert kind="error">{res.error}</Alert></div>
  const p = res.data, s = p.summary!
  const placeOrder = async () => {
    if (!user) return nav('/login')
    try {
      const o = await api.post<any>('/orders/direct', { offer_id: order!.id, quantity: qty, delivery_address: addr })
      setOrder(null); setMsg({ kind: 'ok', text: `${t('order')} #${o.id} — ${t('success')}` })
    } catch (e: any) { setMsg({ kind: 'error', text: e.message }) }
  }
  const addAlert = async () => {
    if (!user) return nav('/login')
    try { await api.post('/catalog/alerts', { product_id: p.id, city, target_price: target ? Number(target) : null }); setAlertOpen(false); setMsg({ kind: 'ok', text: t('success') }) }
    catch (e: any) { setMsg({ kind: 'error', text: e.message }) }
  }
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="small muted" style={{ marginBottom: 8 }}><Link to="/catalog">{t('catalog')}</Link> / <Link to={`/catalog?category_id=${p.category_id}`}>{name({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</Link></div>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>{name(p)}</h1>
          <div className="muted">{p.brand && <span>{p.brand} · </span>}<span className="ltr">{p.sku}</span> · {t('unit')}: {p.unit}</div>
          {Object.keys(p.spec).filter(k => k !== 'base_price').length > 0 && <div className="row small" style={{ marginTop: 6 }}>{Object.entries(p.spec).filter(([k]) => k !== 'base_price').map(([k, v]) => <Badge key={k} kind="neutral">{k}: {String(v)}</Badge>)}</div>}
        </div>
        <div className="row">
          <select style={{ width: 'auto' }} value={city} onChange={e => { const n = new URLSearchParams(sp); e.target.value ? n.set('city', e.target.value) : n.delete('city'); setSp(n) }}>
            <option value="">{t('all_cities')}</option>{(cities.data || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(!user || user.role === 'buyer') && <button className={`btn ${quote.has(p.id) ? 'ghost' : ''}`} onClick={() => quote.add(p)}>{quote.has(p.id) ? '✓ ' + t('added') : '+ ' + t('add_to_rfq')}</button>}
          <button className="btn secondary" onClick={() => setAlertOpen(true)}>🔔 {t('watch_price')}</button>
        </div>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="kpi-grid" style={{ margin: '16px 0' }}>
        <div className="stat"><div className="v">{s.min_price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}</div><div className="l">{t('best_price')} ({t('sar')}, {t('ex_vat')})</div></div>
        <div className="stat"><div className="v">{s.avg_price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}</div><div className="l">{t('avg_price')}</div></div>
        <div className="stat"><div className="v">{s.max_price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}</div><div className="l">{lang === 'ar' ? 'أعلى سعر' : 'Highest'}</div></div>
        <div className="stat"><div className="v">{s.offer_count}</div><div className="l">{t('offers')} · {s.supplier_count} {t('suppliers')}</div></div>
        <div className="stat"><div className="v"><Change pct={s.change_30d_pct} /></div><div className="l">{t('change_30d')}</div></div>
      </div>

      <div className="card pad-0">
        <div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('supplier')}</th><th>{t('city')}</th><th>{t('price')} ({t('ex_vat')})</th><th>{t('inc_vat')}</th><th>{t('min_qty')}</th><th>{t('stock')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>
            {p.offers.map((o, i) => (
              <tr key={o.id} className={i === 0 ? 'hl' : ''}>
                <td className="num">{i + 1}</td>
                <td>
                  {o.supplier?.is_external ? <span>{o.source_name || o.supplier?.name} <Badge kind="neutral">{t('external')}</Badge></span>
                    : <Link to={`/suppliers/${o.supplier_id}`}>{o.supplier?.name}</Link>}
                  {o.supplier?.verified && <span> <Badge>✓ {t('verified')}</Badge></span>}
                  {o.supplier && !o.supplier.is_external && o.supplier.rating_count > 0 && <span className="muted small"> ★ {o.supplier.rating}</span>}
                  {o.delivery_included && <span> <Badge kind="info">{t('delivery')}</Badge></span>}
                </td>
                <td>{o.city}</td>
                <td className="bold"><Money v={o.price_ex_vat} /> <span className="muted small">/ {o.unit || p.unit}</span></td>
                <td className="muted"><Money v={o.price_inc_vat} /></td>
                <td className="num">{o.min_qty}</td>
                <td><Status s={o.stock_status} /></td>
                <td className="small muted">{fmtDate(o.updated_at, lang)}</td>
                <td>{o.supplier?.is_external ? (o.source_url ? <a className="btn ghost sm" href={o.source_url} target="_blank" rel="noreferrer">↗</a> : null)
                  : (!user || user.role === 'buyer') ? <button className="btn sm" onClick={() => { setOrder(o); setQty(o.min_qty) }}>{t('buy_now')}</button> : null}</td>
              </tr>
            ))}
            {p.offers.length === 0 && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>{t('no_results')}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card"><h3>{t('history_90')}</h3><PriceChart data={p.history} /></div>
        <div className="card"><h3>{t('related')}</h3><div className="grid grid-2">{p.related.map(r => <ProductCard key={r.id} p={r} />)}</div></div>
      </div>

      {order && (
        <Modal title={`${t('buy_now')} — ${order.supplier?.name}`} onClose={() => setOrder(null)}>
          <div className="field"><label>{t('quantity')} ({order.unit || p.unit}, {t('min_qty')} {order.min_qty})</label><input type="number" min={order.min_qty} value={qty} onChange={e => setQty(Number(e.target.value))} /></div>
          <div className="field"><label>{t('delivery_address')}</label><input value={addr} onChange={e => setAddr(e.target.value)} /></div>
          <div className="stack small" style={{ marginBottom: 12 }}>
            <div className="row between"><span>{t('subtotal')}</span><Money v={order.price_ex_vat * qty} /></div>
            <div className="row between"><span>{t('vat')}</span><Money v={order.price_ex_vat * qty * 0.15} /></div>
            <div className="row between bold"><span>{t('total')}</span><Money v={order.price_ex_vat * qty * 1.15} /></div>
          </div>
          <div className="row"><button className="btn" onClick={placeOrder} disabled={qty < order.min_qty}>{t('confirm')}</button><button className="btn ghost" onClick={() => setOrder(null)}>{t('cancel')}</button></div>
        </Modal>
      )}
      {alertOpen && (
        <Modal title={t('watch_price')} onClose={() => setAlertOpen(false)}>
          <div className="field"><label>{t('target_price')} ({t('sar')}) — {lang === 'ar' ? 'اتركه فارغاً لأي انخفاض' : 'leave empty for any drop'}</label><input type="number" value={target} onChange={e => setTarget(e.target.value)} /></div>
          <button className="btn" onClick={addAlert}>{t('save')}</button>
        </Modal>
      )}
    </div>
  )
}
