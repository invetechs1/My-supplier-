import { FormEvent, useEffect, useRef, useState } from 'react'
import { api, ImportResult, Offer, Product } from '../../api'
import { Alert, Empty, Modal, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function PriceList() {
  const { t, name, lang } = useI18n()
  const res = useLoad(() => api.get<Offer[]>('/suppliers/me/offers'))
  const [modal, setModal] = useState(false)
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Product[]>([]); const [picked, setPicked] = useState<Product | null>(null)
  const [f, setF] = useState({ price: '', city: '', min_qty: 1, includes_vat: false, delivery_included: false, stock_status: 'in_stock', notes: '' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  useEffect(() => { if (!q.trim()) { setHits([]); return } const h = setTimeout(() => api.get<any>('/catalog/products', { q, size: 8 }).then(r => setHits(r.items)).catch(() => {}), 250); return () => clearTimeout(h) }, [q])
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!picked) return
    try { await api.post('/suppliers/me/offers', { ...f, product_id: picked.id, price: Number(f.price) }); setModal(false); setPicked(null); setF({ ...f, price: '' }); setMsg({ kind: 'ok', text: t('success') }); res.reload() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) }
  }
  const quick = async (o: Offer, patch: any) => { try { await api.patch(`/suppliers/me/offers/${o.id}`, patch); res.reload() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const del = async (o: Offer) => { if (!confirm(t('delete') + '?')) return; await api.del(`/suppliers/me/offers/${o.id}`); res.reload() }
  const upload = async (file: File) => { try { setResult(await api.upload<ImportResult>('/suppliers/me/offers/import', file)); res.reload() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const rows = (res.data || []).filter(o => !filter || name(o.product!).includes(filter) || o.product?.sku.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="stack">
      <div className="row between"><h1>{t('price_list')}</h1>
        <div className="row"><input type="file" accept=".csv,.json" ref={fileRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>⬆ {t('import_csv')}</button><a className="btn ghost" href={`data:text/csv;charset=utf-8,${encodeURIComponent('sku,product_name,category,unit,price,city,min_qty,includes_vat,stock_status\nCEM-YAM-50,,cement,bag,14.5,الرياض,1,false,in_stock\n,منتج جديد,paint,pail,120,جدة,1,false,in_stock\n')}`} download="price-list-template.csv">CSV ⬇</a>
          <button className="btn" onClick={() => setModal(true)}>➕ {t('add_price')}</button></div></div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {result && <Alert kind={result.errors.length && !result.created_offers && !result.updated_offers ? 'error' : 'ok'}>
        {lang === 'ar' ? `تم: ${result.created_offers} جديد، ${result.updated_offers} محدّث، ${result.created_products} منتج جديد، ${result.skipped} متجاهل` : `Done: ${result.created_offers} new, ${result.updated_offers} updated, ${result.created_products} new products, ${result.skipped} skipped`}
        {result.errors.length > 0 && <ul className="small">{result.errors.slice(0, 5).map((e, i) => <li key={i} className="ltr">{e}</li>)}</ul>}</Alert>}
      <input placeholder={t('search')} value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 360 }} />
      {res.loading ? <Spinner /> : !rows.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>{t('products')}</th><th>{t('city')}</th><th>{t('price')} ({t('ex_vat')})</th><th>{t('min_qty')}</th><th>{t('stock')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>{rows.map(o => <tr key={o.id}>
            <td>{name(o.product!)}<div className="small muted">{o.product?.brand} · <span className="ltr">{o.product?.sku}</span> · {o.unit}</div></td>
            <td>{o.city}</td>
            <td><input type="number" step="0.01" defaultValue={o.price_ex_vat} style={{ width: 110 }} onBlur={e => Number(e.target.value) !== o.price_ex_vat && Number(e.target.value) > 0 && quick(o, { price: Number(e.target.value), includes_vat: false })} /></td>
            <td className="num">{o.min_qty}</td>
            <td><select value={o.stock_status} style={{ width: 'auto' }} onChange={e => quick(o, { stock_status: e.target.value })}>{['in_stock', 'limited', 'out_of_stock'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></td>
            <td className="small muted">{fmtDate(o.updated_at, lang)}</td>
            <td><button className="btn ghost sm" onClick={() => del(o)}>🗑</button></td>
          </tr>)}</tbody>
        </table></div></div>
      )}
      {modal && <Modal title={t('add_price')} onClose={() => setModal(false)}>
        <form onSubmit={save}>
          <div className="field" style={{ position: 'relative' }}><label>{t('products')}</label>
            {picked ? <div className="row between card" style={{ padding: 8 }}><span>{name(picked)} <span className="muted small">{picked.brand} · {picked.unit}</span></span><button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>✕</button></div>
              : <><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_ph')} autoFocus />
                {hits.length > 0 && <div className="card" style={{ position: 'absolute', zIndex: 5, insetInline: 0, top: '100%', maxHeight: 220, overflow: 'auto', padding: 4 }}>{hits.map(h => <div key={h.id} style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => { setPicked(h); setQ(''); setHits([]) }}>{name(h)} <span className="muted small">{h.brand} · {h.unit}{h.summary?.min_price != null && <> · {t('best_price')} {h.summary.min_price}</>}</span></div>)}</div>}</>}
          </div>
          <div className="grid grid-2">
            <div className="field"><label>{t('price')} ({t('sar')})</label><input type="number" step="0.01" min="0.01" required value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div>
            <div className="field"><label>{t('city')}</label><input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder={lang === 'ar' ? 'افتراضي: مدينتك' : 'default: your city'} /></div>
            <div className="field"><label>{t('min_qty')}</label><input type="number" min="1" value={f.min_qty} onChange={e => setF({ ...f, min_qty: Number(e.target.value) })} /></div>
            <div className="field"><label>{t('stock')}</label><select value={f.stock_status} onChange={e => setF({ ...f, stock_status: e.target.value })}>{['in_stock', 'limited', 'out_of_stock'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></div>
          </div>
          <div className="row" style={{ marginBottom: 12 }}><label className="row" style={{ width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.includes_vat} onChange={e => setF({ ...f, includes_vat: e.target.checked })} /> {t('inc_vat')}</label><label className="row" style={{ width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.delivery_included} onChange={e => setF({ ...f, delivery_included: e.target.checked })} /> {t('delivery')}</label></div>
          <button className="btn" disabled={!picked}>{t('save')}</button>
        </form>
      </Modal>}
    </div>
  )
}
