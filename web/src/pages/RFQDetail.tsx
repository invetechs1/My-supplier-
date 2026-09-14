/** Shared RFQ page: buyer sees ranked bids and awards; supplier sees items with market reference and submits a bid. */
import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, Bid, RFQ } from '../api'
import { useAuth } from '../auth'
import { Alert, Badge, Money, Spinner, Status, useLoad } from '../components/ui'
import { fmtDate, useI18n } from '../i18n'

function BidForm({ rfq, onDone }: { rfq: RFQ; onDone: () => void }) {
  const { t } = useI18n()
  const mine = rfq.my_bid
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [brands, setBrands] = useState<Record<number, string>>({})
  const [f, setF] = useState({ delivery_days: mine?.delivery_days ?? 3, delivery_fee: mine?.delivery_fee ?? 0, payment_terms: mine?.payment_terms ?? '', notes: mine?.notes ?? '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => {
    const p: Record<number, string> = {}, b: Record<number, string> = {}
    mine?.items.forEach(i => { p[i.rfq_item_id] = String(i.unit_price); b[i.rfq_item_id] = i.brand })
    setPrices(p); setBrands(b)
  }, [mine])
  const subtotal = rfq.items.reduce((s, it) => s + (Number(prices[it.id]) || 0) * it.quantity, 0) + Number(f.delivery_fee || 0)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await api.post(`/rfq/${rfq.id}/bids`, { ...f, items: rfq.items.map(it => ({ rfq_item_id: it.id, unit_price: Number(prices[it.id] || 0), brand: brands[it.id] || '' })) })
      onDone()
    } catch (ex: any) { setErr(ex.message) } finally { setBusy(false) }
  }
  const withdraw = async () => { if (!mine) return; await api.post(`/rfq/${rfq.id}/bids/${mine.id}/withdraw`); onDone() }
  const locked = mine && mine.status !== 'submitted' && mine.status !== 'withdrawn'
  return (
    <form className="card" onSubmit={submit}>
      <div className="row between"><h3>{mine ? t('my_bid') : t('bid_now')}</h3>{mine && <Status s={mine.status} />}</div>
      {err && <Alert kind="error">{err}</Alert>}
      <div className="t-wrap"><table>
        <thead><tr><th>{t('items')}</th><th>{t('quantity')}</th><th>{t('market_ref')}</th><th>{t('price')} / {t('unit')} ({t('ex_vat')})</th><th>{lang_brand(t)}</th><th>{t('total')}</th></tr></thead>
        <tbody>{rfq.items.map(it => (
          <tr key={it.id}>
            <td>{it.description}{it.product && <div className="small muted">{it.product.brand} · {it.product.sku}</div>}</td>
            <td className="num">{it.quantity} {it.unit}</td>
            <td className="small">{it.market_min != null ? <><Money v={it.market_min} /> – <Money v={it.market_avg} /></> : '—'}{it.target_price != null && <div className="muted">{t('target_price')}: <Money v={it.target_price} /></div>}</td>
            <td><input type="number" step="0.01" min="0" required disabled={!!locked} value={prices[it.id] ?? ''} onChange={e => setPrices({ ...prices, [it.id]: e.target.value })} style={{ minWidth: 110 }} /></td>
            <td><input disabled={!!locked} value={brands[it.id] ?? ''} onChange={e => setBrands({ ...brands, [it.id]: e.target.value })} style={{ minWidth: 100 }} /></td>
            <td className="num">{((Number(prices[it.id]) || 0) * it.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="grid grid-3" style={{ marginTop: 12 }}>
        <div className="field"><label>{t('delivery_days')}</label><input type="number" min={0} disabled={!!locked} value={f.delivery_days} onChange={e => setF({ ...f, delivery_days: Number(e.target.value) })} /></div>
        <div className="field"><label>{t('delivery_fee')}</label><input type="number" min={0} disabled={!!locked} value={f.delivery_fee} onChange={e => setF({ ...f, delivery_fee: Number(e.target.value) })} /></div>
        <div className="field"><label>{t('payment_terms')}</label><input disabled={!!locked} value={f.payment_terms} onChange={e => setF({ ...f, payment_terms: e.target.value })} /></div>
      </div>
      <div className="field"><label>{t('notes')}</label><textarea rows={2} disabled={!!locked} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
      <div className="row between">
        <div><span className="muted">{t('subtotal')}: </span><Money v={subtotal} /> · <span className="muted">{t('total')} ({t('inc_vat')}): </span><b><Money v={subtotal * 1.15} /></b></div>
        {!locked && rfq.status === 'open' && <div className="row"><button className="btn" disabled={busy}>{mine && mine.status === 'submitted' ? t('update_bid') : t('submit_bid')}</button>{mine?.status === 'submitted' && <button type="button" className="btn ghost" onClick={withdraw}>{t('withdraw')}</button>}</div>}
      </div>
    </form>
  )
}
const lang_brand = (t: (k: string) => string) => t('brand') === 'مورّدي' ? 'الماركة' : 'Brand'

export default function RFQDetail() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const res = useLoad(() => api.get<RFQ>(`/rfq/${id}`), [id])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  if (res.loading) return <Spinner />
  if (res.error || !res.data) return <Alert kind="error">{res.error}</Alert>
  const r = res.data
  const isOwner = user && (user.id === r.buyer_id || user.role === 'admin')
  const award = async (b: Bid) => {
    if (!confirm(`${t('award')} → ${b.supplier?.name} — ${b.total.toLocaleString()} ${t('sar')}?`)) return
    try { const o = await api.post<any>(`/rfq/${r.id}/award/${b.id}`); setMsg({ kind: 'ok', text: `${t('awarded')} — ${t('order')} #${o.order_id}` }); res.reload() } catch (e: any) { setMsg({ kind: 'error', text: e.message }) }
  }
  const close = async () => { try { await api.post(`/rfq/${r.id}/close`); res.reload() } catch (e: any) { setMsg({ kind: 'error', text: e.message }) } }
  const publish = async () => { try { await api.post(`/rfq/${r.id}/publish`); res.reload() } catch (e: any) { setMsg({ kind: 'error', text: e.message }) } }
  return (
    <div className="stack">
      <div className="card">
        <div className="row between">
          <div><h1 style={{ marginBottom: 4 }}>{r.title} <Status s={r.status} /></h1>
            <div className="muted small">#{r.id} · {r.project_name && <>{r.project_name} · </>}📍 {r.city} · {t('closes_at')}: {fmtDate(r.closes_at, lang)} {r.needed_by && <>· {t('needed_by')}: {fmtDate(r.needed_by, lang)}</>} · {r.visibility === 'invited' && <Badge kind="info">{t('vis_invited')}</Badge>}</div>
            {r.description && <p style={{ marginBottom: 0 }}>{r.description}</p>}
            {!isOwner && r.buyer_name && <div className="small muted">{r.buyer_name}</div>}
          </div>
          {isOwner && <div className="row">{r.status === 'draft' && <button className="btn" onClick={publish}>{t('submit_rfq')}</button>}{(r.status === 'open' || r.status === 'draft') && <button className="btn ghost" onClick={close}>{t('close_rfq')}</button>}</div>}
        </div>
        {msg && <div style={{ marginTop: 10 }}><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      </div>

      {isOwner && (
        <>
          <div className="card pad-0"><div className="t-wrap"><table>
            <thead><tr><th>{t('items')}</th><th>{t('quantity')}</th><th>{t('market_ref')}</th><th>{t('target_price')}</th></tr></thead>
            <tbody>{r.items.map(it => <tr key={it.id}><td>{it.product ? <Link to={`/products/${it.product_id}`}>{it.description}</Link> : it.description}</td><td className="num">{it.quantity} {it.unit}</td><td className="small">{it.market_min != null ? <><Money v={it.market_min} /> – <Money v={it.market_avg} /></> : '—'}</td><td>{it.target_price != null ? <Money v={it.target_price} /> : '—'}</td></tr>)}</tbody>
          </table></div></div>
          <div className="card pad-0">
            <div className="row between" style={{ padding: '12px 16px 0' }}><h3>{t('bids')} ({r.bid_count})</h3>{r.best_total != null && <span>{t('best_total')}: <b><Money v={r.best_total} /></b></span>}</div>
            <div className="t-wrap"><table>
              <thead><tr><th>{t('rank')}</th><th>{t('supplier')}</th><th>{t('subtotal')}</th><th>{t('vat')}</th><th>{t('total')}</th><th>{t('delivery_days')}</th><th>{t('status')}</th><th></th></tr></thead>
              <tbody>{(r.bids || []).map(b => (
                <>
                  <tr key={b.id} className={b.rank === 1 ? 'hl' : ''} style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                    <td className="num">{b.rank}</td>
                    <td><Link to={`/suppliers/${b.supplier_id}`} onClick={e => e.stopPropagation()}>{b.supplier?.name}</Link> {b.supplier?.verified && <Badge>✓</Badge>} <span className="muted small">★ {b.supplier?.rating || '—'}</span></td>
                    <td><Money v={b.subtotal} /></td><td className="muted"><Money v={b.vat} /></td><td className="bold"><Money v={b.total} /></td>
                    <td className="num">{b.delivery_days}</td><td><Status s={b.status} /></td>
                    <td>{r.status !== 'awarded' && b.status === 'submitted' && <button className="btn sm" onClick={e => { e.stopPropagation(); award(b) }}>{t('award')}</button>}</td>
                  </tr>
                  {expanded === b.id && <tr key={b.id + 'x'}><td colSpan={8} style={{ background: 'var(--card-2)' }}>
                    <table><thead><tr><th>{t('items')}</th><th>{t('quantity')}</th><th>{t('price')}</th><th>{lang_brand(t)}</th><th>{t('total')}</th></tr></thead>
                      <tbody>{b.items.map(bi => { const it = r.items.find(x => x.id === bi.rfq_item_id); return <tr key={bi.id}><td>{it?.description}</td><td className="num">{bi.quantity}</td><td><Money v={bi.unit_price} /></td><td>{bi.brand}</td><td><Money v={bi.line_total} /></td></tr> })}</tbody></table>
                    {(b.payment_terms || b.notes) && <div className="small muted" style={{ padding: 8 }}>{b.payment_terms} {b.notes}</div>}
                  </td></tr>}
                </>
              ))}
              {!r.bids?.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>—</td></tr>}</tbody>
            </table></div>
          </div>
        </>
      )}
      {user?.role === 'supplier' && <BidForm rfq={r} onDone={() => { res.reload(); setMsg({ kind: 'ok', text: t('success') }) }} />}
    </div>
  )
}
