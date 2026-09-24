import { FormEvent, useEffect, useRef, useState } from 'react'
import { api, Category, Offer, Product } from '../../api'
import { Alert, Badge, Empty, Modal, Spinner, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

/** "منتجاتي" — the supplier's storefront exactly as buyers see it, with in-place price / quantity editing and image upload. */
export default function MyProducts() {
  const { t, name, lang } = useI18n()
  const res = useLoad(() => api.get<Offer[]>('/suppliers/me/products'))
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [modal, setModal] = useState<'catalog' | 'new' | null>(null)
  const fileFor = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const patch = async (o: Offer, body: any) => {
    try { const u = await api.patch<Offer>(`/suppliers/me/offers/${o.id}`, body); res.setData((res.data || []).map(x => x.id === u.id ? { ...u, product: x.product } : x)); setSaved(o.id); setTimeout(() => setSaved(null), 1500) }
    catch (e: any) { setMsg({ kind: 'error', text: e.message }) }
  }
  const upload = async (file: File) => {
    const id = fileFor.current; if (!id) return
    try { const u = await api.upload<Offer>(`/suppliers/me/offers/${id}/image`, file); res.setData((res.data || []).map(x => x.id === u.id ? { ...u, product: x.product } : x)); setMsg({ kind: 'ok', text: t('success') }) } catch (e: any) { setMsg({ kind: 'error', text: e.message }) }
  }
  const del = async (o: Offer) => { if (!confirm(t('delete') + '?')) return; await api.del(`/suppliers/me/offers/${o.id}`); res.reload() }
  const rows = (res.data || []).filter(o => !q || name(o.product!).toLowerCase().includes(q.toLowerCase()) || (o.product?.sku || '').toLowerCase().includes(q.toLowerCase()))
  const stockBadge = (o: Offer) => o.available_qty != null && o.available_qty <= 0 ? <Badge kind="danger">{t('out_of_stock')}</Badge> : o.available_qty != null && o.available_qty <= (o.low_stock_threshold || 0) ? <Badge kind="warn">{t('limited')} · {o.available_qty}</Badge> : <Badge kind={o.stock_status === 'in_stock' ? '' : o.stock_status === 'limited' ? 'warn' : 'danger'}>{t(o.stock_status)}</Badge>
  return (
    <div className="stack">
      <div className="row between"><div><h1>🛍️ {t('my_products')}</h1><div className="muted small">{t('storefront_hint')}</div></div>
        <div className="row"><button className="btn secondary" onClick={() => setModal('catalog')}>➕ {t('add_from_catalog')}</button><button className="btn" onClick={() => setModal('new')}>✨ {t('create_product')}</button></div></div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <input type="file" accept="image/png,image/jpeg,image/webp" ref={fileRef} style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = '' }} />
      <div className="row between"><input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 360 }} /><span className="muted small">{rows.length} {t('products')}</span></div>
      {res.loading ? <Spinner /> : !rows.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="grid grid-3">{rows.map(o => (
          <div className="card myprod" key={o.id}>
            <div className="img"><img src={o.image_url || o.product?.image_url} alt="" />
              {o.rental_period && <span className="badge warn" style={{ position: 'absolute', top: 8, insetInlineStart: 8 }}>{t('rent')} · {t('basis_' + o.rental_period)}</span>}
              <button className="btn sm secondary up" onClick={() => { fileFor.current = o.id; fileRef.current?.click() }}>📷 {t('upload_image')}</button></div>
            <div className="bold" style={{ minHeight: '2.6em' }}>{name(o.product!)}</div>
            <div className="small muted">{o.product?.brand} · <span className="ltr">{o.product?.sku}</span> · {o.unit || o.product?.unit} · {o.city}</div>
            <div className="row between small">{stockBadge(o)}{saved === o.id && <span style={{ color: 'var(--ok)' }}>✓ {t('saved')}</span>}</div>
            <div className="edit">
              <div><label>{t('price')} ({t('sar')}, {t('ex_vat')}){o.rental_period ? ' ' + t('per_' + o.rental_period) : ''}</label><input type="number" step="0.01" min="0.01" defaultValue={o.price_ex_vat} key={'p' + o.id + o.price_ex_vat} onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== o.price_ex_vat) patch(o, { price: v, includes_vat: false }) }} /></div>
              <div><label>{t('available_qty')}</label><input type="number" min="0" placeholder={t('not_tracked')} defaultValue={o.available_qty ?? ''} key={'q' + o.id + o.available_qty} onBlur={e => { const raw = e.target.value.trim(); if (raw === '' && o.available_qty != null) patch(o, { clear_qty: true }); else if (raw !== '' && Number(raw) !== o.available_qty) patch(o, { available_qty: Number(raw) }) }} /></div>
              <div><label>{t('min_qty')}</label><input type="number" min="1" defaultValue={o.min_qty} key={'m' + o.id + o.min_qty} onBlur={e => Number(e.target.value) > 0 && Number(e.target.value) !== o.min_qty && patch(o, { min_qty: Number(e.target.value) })} /></div>
              <div><label>{t('stock')}</label><select value={o.stock_status} onChange={e => patch(o, { stock_status: e.target.value })}>{['in_stock', 'limited', 'out_of_stock'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></div>
            </div>
            <div className="row between small"><a href={`/products/${o.product_id}`} target="_blank" rel="noreferrer">👁 {t('view')}</a><button className="btn ghost sm" onClick={() => del(o)}>🗑 {t('delete')}</button></div>
          </div>
        ))}</div>
      )}
      {modal === 'catalog' && <AddFromCatalog onClose={() => setModal(null)} onDone={() => { setModal(null); res.reload(); setMsg({ kind: 'ok', text: t('success') }) }} />}
      {modal === 'new' && <Modal title={t('create_product')} onClose={() => setModal(null)}>
        <NewProductForm cats={cats.data || []} onDone={() => { setModal(null); res.reload(); setMsg({ kind: 'ok', text: t('success') }) }} lang={lang} />
      </Modal>}
    </div>
  )
}

function AddFromCatalog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, name, lang } = useI18n()
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Product[]>([]); const [picked, setPicked] = useState<Product | null>(null)
  const [f, setF] = useState({ price: '', city: '', min_qty: 1, available_qty: '', includes_vat: false, delivery_included: false, rental_period: '' })
  const [err, setErr] = useState('')
  useEffect(() => { if (!q.trim()) { setHits([]); return } const h = setTimeout(() => api.get<any>('/catalog/products', { q, size: 8 }).then(r => setHits(r.items)).catch(() => {}), 250); return () => clearTimeout(h) }, [q])
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!picked) return
    try { await api.post('/suppliers/me/offers', { ...f, product_id: picked.id, price: Number(f.price), available_qty: f.available_qty === '' ? null : Number(f.available_qty), stock_status: 'in_stock' }); onDone() } catch (ex: any) { setErr(ex.message) }
  }
  return <Modal title={t('add_from_catalog')} onClose={onClose}>
    <form onSubmit={save}>
      {err && <Alert kind="error">{err}</Alert>}
      <div className="field" style={{ position: 'relative' }}><label>{t('products')}</label>
        {picked ? <div className="row between card" style={{ padding: 8 }}><span><img src={picked.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, verticalAlign: 'middle', marginInlineEnd: 6 }} />{name(picked)} <span className="muted small">{picked.brand} · {picked.unit}</span></span><button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>✕</button></div>
          : <><input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_ph')} autoFocus />
            {hits.length > 0 && <div className="card" style={{ position: 'absolute', zIndex: 5, insetInline: 0, top: '100%', maxHeight: 240, overflow: 'auto', padding: 4 }}>{hits.map(h => <div key={h.id} className="sug-row" onClick={() => { setPicked(h); setQ(''); setHits([]) }}><img src={h.image_url} alt="" /><span>{name(h)}</span><span className="muted small">{h.brand} · {h.unit}{h.summary?.min_price != null && <> · {t('best_price')} {h.summary.min_price}</>}</span></div>)}</div>}</>}
      </div>
      <div className="grid grid-2">
        <div className="field"><label>{t('price')} ({t('sar')})</label><input type="number" step="0.01" min="0.01" required value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div>
        <div className="field"><label>{t('available_qty')}</label><input type="number" min="0" value={f.available_qty} onChange={e => setF({ ...f, available_qty: e.target.value })} placeholder={t('not_tracked')} /></div>
        <div className="field"><label>{t('city')}</label><input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder={lang === 'ar' ? 'افتراضي: مدينتك' : 'default: your city'} /></div>
        <div className="field"><label>{t('min_qty')}</label><input type="number" min="1" value={f.min_qty} onChange={e => setF({ ...f, min_qty: Number(e.target.value) })} /></div>
        <div className="field"><label>{t('price_basis')}</label><select value={f.rental_period} onChange={e => setF({ ...f, rental_period: e.target.value })}><option value="">{t('basis_sale')}</option><option value="day">{t('basis_day')}</option><option value="week">{t('basis_week')}</option><option value="month">{t('basis_month')}</option></select></div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}><label className="row" style={{ width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.includes_vat} onChange={e => setF({ ...f, includes_vat: e.target.checked })} /> {t('inc_vat')}</label><label className="row" style={{ width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.delivery_included} onChange={e => setF({ ...f, delivery_included: e.target.checked })} /> {t('delivery')}</label></div>
      <button className="btn" disabled={!picked}>{t('save')}</button>
    </form>
  </Modal>
}

function NewProductForm({ cats, onDone, lang }: { cats: Category[]; onDone: () => void; lang: string }) {
  const { t, name } = useI18n()
  const [f, setF] = useState({ category_id: '', name_ar: '', name_en: '', brand: '', unit: 'piece', description: '', price: '', city: '', available_qty: '', min_qty: 1, rental_period: '', includes_vat: false, delivery_included: false })
  const [err, setErr] = useState('')
  const save = async (e: FormEvent) => {
    e.preventDefault()
    try { await api.post('/suppliers/me/products', { ...f, category_id: Number(f.category_id), price: Number(f.price), available_qty: f.available_qty === '' ? null : Number(f.available_qty) }); onDone() } catch (ex: any) { setErr(ex.message) }
  }
  const units = ['piece', 'bag', 'ton', 'kg', 'm', 'm2', 'm3', 'lm', 'roll', 'sheet', 'pail', 'drum', 'box', 'set', 'pair', 'unit', 'load', 'trip']
  return <form onSubmit={save}>
    {err && <Alert kind="error">{err}</Alert>}
    <div className="grid grid-2">
      <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('category')}</label><select required value={f.category_id} onChange={e => setF({ ...f, category_id: e.target.value })}><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{c.icon} {name(c)}</option>)}</select></div>
      <div className="field"><label>{lang === 'ar' ? 'اسم المنتج (عربي)' : 'Product name (Arabic)'}</label><input required minLength={2} value={f.name_ar} onChange={e => setF({ ...f, name_ar: e.target.value })} /></div>
      <div className="field"><label>{lang === 'ar' ? 'اسم المنتج (إنجليزي)' : 'Product name (English)'}</label><input required minLength={2} className="ltr" style={{ display: 'block' }} value={f.name_en} onChange={e => setF({ ...f, name_en: e.target.value })} /></div>
      <div className="field"><label>{t('brand_name')}</label><input value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} /></div>
      <div className="field"><label>{t('unit')}</label><select value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}>{units.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
      <div className="field"><label>{t('price')} ({t('sar')})</label><input type="number" step="0.01" min="0.01" required value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></div>
      <div className="field"><label>{t('available_qty')}</label><input type="number" min="0" value={f.available_qty} onChange={e => setF({ ...f, available_qty: e.target.value })} placeholder={t('not_tracked')} /></div>
      <div className="field"><label>{t('city')}</label><input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></div>
      <div className="field"><label>{t('min_qty')}</label><input type="number" min="1" value={f.min_qty} onChange={e => setF({ ...f, min_qty: Number(e.target.value) })} /></div>
      <div className="field"><label>{t('price_basis')}</label><select value={f.rental_period} onChange={e => setF({ ...f, rental_period: e.target.value })}><option value="">{t('basis_sale')}</option><option value="day">{t('basis_day')}</option><option value="week">{t('basis_week')}</option><option value="month">{t('basis_month')}</option></select></div>
      <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('description')}</label><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
    </div>
    <div className="row" style={{ marginBottom: 12 }}><label className="row" style={{ width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.includes_vat} onChange={e => setF({ ...f, includes_vat: e.target.checked })} /> {t('inc_vat')}</label><label className="row" style={{ width: 'auto' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.delivery_included} onChange={e => setF({ ...f, delivery_included: e.target.checked })} /> {t('delivery')}</label></div>
    <button className="btn">{t('save')}</button>
  </form>
}
