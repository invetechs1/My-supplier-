import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, Offer, ProductDetail, ProductReview } from '../api'
import { useAuth, useQuoteList } from '../auth'
import { useCart } from '../cart'
import { Alert, Badge, Change, Modal, Money, PriceChart, Spinner, Status, useLoad } from '../components/ui'
import { fmtDate, useI18n } from '../i18n'
import { ProductCard, Stars } from './Catalog'

function Qty({ v, min, max, onChange }: { v: number; min: number; max?: number | null; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(n, max) : n)
  return <span className="qty"><button type="button" onClick={() => onChange(clamp(v - 1))}>−</button><input type="number" value={v} min={min} onChange={e => onChange(clamp(Number(e.target.value) || min))} /><button type="button" onClick={() => onChange(clamp(v + 1))}>+</button></span>
}

export default function ProductPage() {
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const city = sp.get('city') || ''
  const { t, name, lang } = useI18n()
  const { user } = useAuth()
  const quote = useQuoteList()
  const cart = useCart()
  const nav = useNavigate()
  const res = useLoad(() => api.get<ProductDetail>(`/catalog/products/${id}`, { city }), [id, city])
  const reviews = useLoad(() => api.get<ProductReview[]>(`/catalog/products/${id}/reviews`), [id])
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'))
  const [sel, setSel] = useState<number | null>(null)
  const [qty, setQty] = useState(1)
  const [img, setImg] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [rv, setRv] = useState({ rating: 5, title: '', comment: '' })

  if (res.loading) return <div className="container" style={{ padding: 30 }}><Spinner /></div>
  if (res.error || !res.data) return <div className="container" style={{ padding: 30 }}><Alert kind="error">{res.error}</Alert></div>
  const p = res.data, s = p.summary!
  const shopper = !user || user.role === 'buyer'
  const orderable = p.offers.filter(o => o.supplier && !o.supplier.is_external && o.stock_status !== 'out_of_stock')
  const chosen: Offer | undefined = (sel ? p.offers.find(o => o.id === sel) : undefined) || (s.best_offer_id ? p.offers.find(o => o.id === s.best_offer_id) : undefined) || orderable[0]
  const images = [p.image_url, ...p.offers.map(o => o.image_url).filter(Boolean)].filter((v, i, a) => v && a.indexOf(v) === i)
  const mainImg = img || (chosen?.image_url) || images[0]
  const q = chosen ? Math.max(qty, chosen.min_qty || 1) : qty
  const addToCart = async () => {
    if (!chosen) return
    try { await cart.add({ ...chosen, product: chosen.product || p }, q); setMsg({ kind: 'ok', text: `✓ ${t('in_cart')} — ${name(p)}` }) } catch (e: any) { setMsg({ kind: 'error', text: e.message === 'buyer_only' ? t('buyer_only') : e.message }) }
  }
  const buyNow = async () => { if (!chosen) return; try { await cart.add({ ...chosen, product: chosen.product || p }, q); nav('/cart') } catch (e: any) { setMsg({ kind: 'error', text: e.message === 'buyer_only' ? t('buyer_only') : e.message }) } }
  const addAlert = async () => {
    if (!user) return nav('/login')
    try { await api.post('/catalog/alerts', { product_id: p.id, city, target_price: target ? Number(target) : null }); setAlertOpen(false); setMsg({ kind: 'ok', text: t('success') }) }
    catch (e: any) { setMsg({ kind: 'error', text: e.message }) }
  }
  const sendReview = async () => {
    if (!user) return nav('/login')
    try { await api.post(`/catalog/products/${p.id}/reviews`, rv); setRv({ rating: 5, title: '', comment: '' }); reviews.reload(); res.reload(); setMsg({ kind: 'ok', text: t('success') }) } catch (e: any) { setMsg({ kind: 'error', text: e.message }) }
  }
  const stockLine = (o: Offer) => o.available_qty == null ? <Status s={o.stock_status} /> : o.available_qty <= 0 ? <Status s="out_of_stock" /> : o.available_qty <= (o.low_stock_threshold || 0) ? <Badge kind="warn">{t('only_left')} {o.available_qty}</Badge> : <Badge>{t('in_stock')} · {o.available_qty}</Badge>
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <div className="small muted" style={{ marginBottom: 8 }}><Link to="/catalog">{t('catalog')}</Link> / <Link to={`/catalog?category_id=${p.category_id}`}>{name({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</Link> / {name(p)}</div>
      {msg && <Alert kind={msg.kind}>{msg.text} {msg.kind === 'ok' && cart.count > 0 && <Link to="/cart" className="btn sm" style={{ marginInlineStart: 8 }}>🛒 {t('cart')} ({cart.count})</Link>}</Alert>}
      <div className="pdp">
        <div className="gallery">
          <div className="main"><img src={mainImg} alt={name(p)} /></div>
          {images.length > 1 && <div className="thumbs">{images.map(u => <img key={u} src={u} alt="" className={u === mainImg ? 'on' : ''} onClick={() => setImg(u)} />)}</div>}
        </div>
        <div>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ marginBottom: 4 }}>{name(p)}</h1>
              <div className="muted">{p.brand && <span>{t('brand_name')}: <b>{p.brand}</b> · </span>}<span className="ltr">{p.sku}</span> · {t('unit')}: {p.unit}</div>
              <div className="row small" style={{ marginTop: 4 }}>{p.rating_count > 0 ? <><Stars v={p.rating} count={p.rating_count} /><a href="#reviews">{t('product_reviews')}</a></> : <span className="muted">{t('no_reviews')}</span>}<span className="muted">· {p.views} {t('views')}{p.sold_qty > 0 && <> · {p.sold_qty} {t('sold')}</>}</span></div>
              {Object.keys(p.spec).filter(k => !k.startsWith('base_')).length > 0 && <div className="row small" style={{ marginTop: 6 }}>{Object.entries(p.spec).filter(([k]) => !k.startsWith('base_')).map(([k, v]) => <Badge key={k} kind="neutral">{k}: {String(v)}</Badge>)}</div>}
            </div>
            <div className="row">
              <select style={{ width: 'auto' }} value={city} onChange={e => { const n = new URLSearchParams(sp); e.target.value ? n.set('city', e.target.value) : n.delete('city'); setSp(n) }}>
                <option value="">{t('all_cities')}</option>{(cities.data || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {shopper && <button className={`btn ghost ${cart.isFav(p.id) ? 'on' : ''}`} onClick={() => cart.toggleFav(p)}>{cart.isFav(p.id) ? '♥' : '♡'} {t('favorites')}</button>}
              <button className="btn ghost" onClick={() => setAlertOpen(true)}>🔔 {t('watch_price')}</button>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginTop: 14, gridTemplateColumns: '1fr 300px', alignItems: 'start' }}>
            <div className="kpi-grid">
              <div className="stat"><div className="v">{s.min_price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}</div><div className="l">{s.basis ? `${t('best_price')} — ${t('basis_' + s.basis)}` : `${t('best_price')} (${t('sar')}, ${t('ex_vat')})`}</div></div>
              {!s.basis && s.rental_min_price != null && <div className="stat"><div className="v">{s.rental_min_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div><div className="l">{t('rent_from')} {t('per_' + (s.rental_basis || 'day'))}</div></div>}
              <div className="stat"><div className="v">{s.avg_price?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}</div><div className="l">{t('avg_price')}</div></div>
              <div className="stat"><div className="v">{s.offer_count}</div><div className="l">{t('offers')} · {s.supplier_count} {t('suppliers')}</div></div>
              <div className="stat"><div className="v"><Change pct={s.change_30d_pct} /></div><div className="l">{t('change_30d')}</div></div>
            </div>
            {shopper && (
              <div className="buybox">
                {chosen ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="big">{chosen.price_ex_vat.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '.9rem' }}>{t('sar')} {chosen.rental_period ? t('per_' + chosen.rental_period) : `/ ${chosen.unit || p.unit}`}</span></div>
                    <div className="small muted">{t('inc_vat')}: <Money v={chosen.price_inc_vat} /></div>
                    <div className="small">{t('sold_by')} <Link to={`/suppliers/${chosen.supplier_id}`}>{chosen.supplier?.name}</Link> {chosen.supplier?.verified && <Badge>✓ {t('verified')}</Badge>} · {chosen.city}</div>
                    <div>{stockLine(chosen)} {chosen.delivery_included && <Badge kind="info">{t('delivery')}</Badge>}</div>
                    <div className="row small"><span className="muted">{t('qty')} ({t('min_qty')} {chosen.min_qty}):</span><Qty v={q} min={chosen.min_qty || 1} max={chosen.available_qty} onChange={setQty} /></div>
                    <div className="row between bold"><span>{t('subtotal')}</span><Money v={chosen.price_ex_vat * q} /></div>
                    <button className="btn lg" onClick={addToCart} disabled={cart.busy}>🛒 {t('add_to_cart')}</button>
                    <button className="btn secondary" onClick={buyNow} disabled={cart.busy}>{t('buy_now')}</button>
                    <button className="btn ghost sm" onClick={() => quote.add(p)}>{quote.has(p.id) ? '✓ ' + t('added') : '+ ' + t('add_to_rfq')}</button>
                    {!user && <div className="small muted">{t('guest_cart_note')}</div>}
                  </div>
                ) : (
                  <div className="stack"><div className="muted">{t('reference_only')}</div><button className="btn" onClick={() => { quote.add(p); nav('/buyer/rfq/new') }}>+ {t('add_to_rfq')}</button></div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 22 }}>{t('offers')} ({p.offers.length})</h2>
      <div className="card pad-0">
        <div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('supplier')}</th><th>{t('city')}</th><th>{t('price_basis')}</th><th>{t('price')} ({t('ex_vat')})</th><th>{t('inc_vat')}</th><th>{t('min_qty')}</th><th>{t('stock')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>
            {p.offers.map((o, i) => (
              <tr key={o.id} className={chosen?.id === o.id ? 'hl' : ''}>
                <td className="num">{i + 1}</td>
                <td>
                  {o.image_url && <img src={o.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, verticalAlign: 'middle', marginInlineEnd: 6 }} />}
                  {o.supplier?.is_external ? <span>{o.source_name || o.supplier?.name} <Badge kind="neutral">{t('external')}</Badge></span>
                    : <Link to={`/suppliers/${o.supplier_id}`}>{o.supplier?.name}</Link>}
                  {o.supplier?.verified && <span> <Badge>✓ {t('verified')}</Badge></span>}
                  {o.supplier && !o.supplier.is_external && o.supplier.rating_count > 0 && <span className="muted small"> ★ {o.supplier.rating}</span>}
                  {o.delivery_included && <span> <Badge kind="info">{t('delivery')}</Badge></span>}
                </td>
                <td>{o.city}</td>
                <td>{o.rental_period ? <span className="badge warn">{t('basis_' + o.rental_period)}</span> : <span className="badge">{t('sale')}</span>}</td>
                <td className="bold"><Money v={o.price_ex_vat} /> <span className="muted small">{o.rental_period ? t('per_' + o.rental_period) : `/ ${o.unit || p.unit}`}</span></td>
                <td className="muted"><Money v={o.price_inc_vat} /></td>
                <td className="num">{o.min_qty}</td>
                <td>{stockLine(o)}</td>
                <td className="small muted">{fmtDate(o.updated_at, lang)}</td>
                <td>{o.supplier?.is_external ? (o.source_url ? <a className="btn ghost sm" href={o.source_url} target="_blank" rel="noreferrer">↗</a> : null)
                  : shopper && o.stock_status !== 'out_of_stock' ? <button className={`btn sm ${chosen?.id === o.id ? '' : 'ghost'}`} onClick={() => { setSel(o.id); setQty(o.min_qty || 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>{chosen?.id === o.id ? '✓' : t('buy_now')}</button> : null}</td>
              </tr>
            ))}
            {p.offers.length === 0 && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center' }}>{t('no_results')}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card"><h3>{t('history_90')}</h3><PriceChart data={p.history} /></div>
        <div className="card" id="reviews"><h3>{t('product_reviews')} {p.rating_count > 0 && <Stars v={p.rating} count={p.rating_count} />}</h3>
          {p.description && <p className="small muted">{p.description}</p>}
          {reviews.loading ? <Spinner /> : (reviews.data || []).length === 0 ? <div className="muted small">{t('no_reviews')}</div> : (
            <div className="stack" style={{ gap: 8 }}>{reviews.data!.map(r => <div key={r.id} style={{ borderBottom: '1px solid var(--line-2)', paddingBottom: 8 }}>
              <div className="row between"><span><Stars v={r.rating} /> <b>{r.title}</b> {r.verified && <Badge>✓ {t('verified_purchase')}</Badge>}</span><span className="small muted">{r.author} · {fmtDate(r.created_at, lang)}</span></div>
              {r.comment && <div className="small">{r.comment}</div>}
            </div>)}</div>
          )}
          {shopper && <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>{t('write_review')}</h4>
            {!user ? <Link className="btn ghost sm" to="/login">{t('required_login')}</Link> : (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ fontSize: '1.5rem', cursor: 'pointer' }}>{[1, 2, 3, 4, 5].map(n => <span key={n} onClick={() => setRv({ ...rv, rating: n })} style={{ color: n <= rv.rating ? '#F2B134' : '#ccc' }}>★</span>)}</div>
                <input placeholder={t('title')} value={rv.title} onChange={e => setRv({ ...rv, title: e.target.value })} />
                <textarea rows={3} placeholder={t('notes')} value={rv.comment} onChange={e => setRv({ ...rv, comment: e.target.value })} />
                <div><button className="btn sm" onClick={sendReview}>{t('send')}</button></div>
              </div>
            )}
          </div>}
        </div>
      </div>
      <h2 style={{ marginTop: 22 }}>{t('related')}</h2>
      <div className="grid grid-4">{p.related.map(r => <ProductCard key={r.id} p={r} />)}</div>

      {alertOpen && (
        <Modal title={t('watch_price')} onClose={() => setAlertOpen(false)}>
          <div className="field"><label>{t('target_price')} ({t('sar')}) — {lang === 'ar' ? 'اتركه فارغاً لأي انخفاض' : 'leave empty for any drop'}</label><input type="number" value={target} onChange={e => setTarget(e.target.value)} /></div>
          <button className="btn" onClick={addAlert}>{t('save')}</button>
        </Modal>
      )}
    </div>
  )
}
