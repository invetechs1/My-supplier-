import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, BOQItem, Product, Supplier } from '../../api'
import { useAuth, useQuoteList } from '../../auth'
import { Alert } from '../../components/ui'
import { useI18n } from '../../i18n'

interface Row { product_id: number | null; description: string; quantity: number; unit: string; target_price: string }

export default function NewRFQ() {
  const { t, name, lang } = useI18n()
  const { user } = useAuth()
  const quote = useQuoteList()
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [f, setF] = useState({ title: '', project_name: '', city: user?.city || 'الرياض', delivery_address: '', description: '', needed_by: '', closes_at: '', visibility: 'public', invited_supplier_ids: [] as number[] })
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const boqRef = useRef<HTMLInputElement>(null)
  const [boqMsg, setBoqMsg] = useState('')
  const importBoq = async (file: File) => {
    setErr(''); setBusy(true)
    try {
      const items = await api.upload<BOQItem[]>('/rfq/import-boq', file)
      setRows(rs => [...rs, ...items.map(i => ({ product_id: i.product_id, description: i.product_id ? (lang === 'ar' ? i.match_name_ar : i.match_name_en) : i.description, quantity: i.quantity, unit: i.unit, target_price: i.target_price != null ? String(i.target_price) : '' }))])
      setBoqMsg(`${items.length} ${t('items')} · ${items.filter(i => i.product_id).length} ${t('matched')}`)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false); if (boqRef.current) boqRef.current.value = '' }
  }
  useEffect(() => { setRows(quote.items.map(i => ({ product_id: i.product_id, description: lang === 'ar' ? i.name_ar : i.name_en, quantity: i.quantity, unit: i.unit, target_price: '' }))) }, [])  // eslint-disable-line
  useEffect(() => { if (!q.trim()) { setHits([]); return } const h = setTimeout(() => api.get<any>('/catalog/products', { q, size: 6 }).then(r => setHits(r.items)).catch(() => {}), 250); return () => clearTimeout(h) }, [q])
  useEffect(() => { if (f.visibility === 'invited' && !suppliers.length) api.get<Supplier[]>('/suppliers').then(setSuppliers).catch(() => {}) }, [f.visibility, suppliers.length])
  const upd = (i: number, k: keyof Row, v: any) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const body = { ...f, needed_by: f.needed_by || null, closes_at: f.closes_at || null, items: rows.map(r => ({ product_id: r.product_id, description: r.description, quantity: Number(r.quantity), unit: r.unit, target_price: r.target_price ? Number(r.target_price) : null })) }
      const r = await api.post<any>('/rfq', body)
      quote.clear(); nav(`/buyer/rfqs/${r.id}`)
    } catch (ex: any) { setErr(ex.message) } finally { setBusy(false) }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <h1>{t('new_rfq')}</h1>
      {err && <Alert kind="error">{err}</Alert>}
      <div className="card grid grid-2">
        <div className="field"><label>{t('title')} *</label><input required minLength={3} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder={lang === 'ar' ? 'مثال: توريد حديد وأسمنت — فيلا الياسمين' : 'e.g. Rebar & cement — Yasmin villa'} /></div>
        <div className="field"><label>{t('project')}</label><input value={f.project_name} onChange={e => setF({ ...f, project_name: e.target.value })} /></div>
        <div className="field"><label>{t('city')} *</label><input required value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></div>
        <div className="field"><label>{t('delivery_address')}</label><input value={f.delivery_address} onChange={e => setF({ ...f, delivery_address: e.target.value })} /></div>
        <div className="field"><label>{t('needed_by')}</label><input type="date" value={f.needed_by} onChange={e => setF({ ...f, needed_by: e.target.value })} /></div>
        <div className="field"><label>{t('closes_at')}</label><input type="date" value={f.closes_at} onChange={e => setF({ ...f, closes_at: e.target.value })} /></div>
        <div className="field"><label>{t('visibility')}</label><select value={f.visibility} onChange={e => setF({ ...f, visibility: e.target.value })}><option value="public">{t('vis_public')}</option><option value="invited">{t('vis_invited')}</option></select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('description')}</label><textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        {f.visibility === 'invited' && <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('invite_suppliers')}</label><div className="row">{suppliers.map(s => <label key={s.id} className="row" style={{ width: 'auto', gap: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.invited_supplier_ids.includes(s.id)} onChange={e => setF({ ...f, invited_supplier_ids: e.target.checked ? [...f.invited_supplier_ids, s.id] : f.invited_supplier_ids.filter(x => x !== s.id) })} />{s.name} {s.verified && '✓'}</label>)}</div></div>}
      </div>

      <div className="card">
        <div className="row between"><h3>{t('items')}</h3><div className="row"><input type="file" accept=".xlsx,.xlsm,.csv" ref={boqRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && importBoq(e.target.files[0])} /><button type="button" className="btn secondary sm" onClick={() => boqRef.current?.click()} disabled={busy}>📄 {t('import_boq')}</button>{boqMsg && <span className="small muted">{boqMsg}</span>}</div></div>
        <p className="small muted">{t('boq_hint')}</p>
        <div className="field" style={{ position: 'relative' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_ph')} />
          {hits.length > 0 && <div className="card" style={{ position: 'absolute', zIndex: 5, insetInline: 0, top: '100%', maxHeight: 260, overflow: 'auto', padding: 4 }}>
            {hits.map(h => <div key={h.id} style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => { setRows([...rows, { product_id: h.id, description: name(h), quantity: 1, unit: h.unit, target_price: '' }]); setQ(''); setHits([]) }}>{name(h)} <span className="muted small">{h.brand} · {h.unit}{h.summary?.min_price != null && <> · {t('best_price')} {h.summary.min_price}</>}</span></div>)}
          </div>}
        </div>
        <div className="t-wrap"><table>
          <thead><tr><th>{t('description')}</th><th>{t('quantity')}</th><th>{t('unit')}</th><th>{t('target_price')}</th><th></th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>
            <td><input required value={r.description} onChange={e => upd(i, 'description', e.target.value)} style={{ minWidth: 220 }} />{r.product_id && <span className="small muted">SKU #{r.product_id}</span>}</td>
            <td><input type="number" min="0.01" step="any" required value={r.quantity} onChange={e => upd(i, 'quantity', e.target.value)} style={{ width: 100 }} /></td>
            <td><input value={r.unit} onChange={e => upd(i, 'unit', e.target.value)} style={{ width: 90 }} /></td>
            <td><input type="number" step="0.01" value={r.target_price} onChange={e => upd(i, 'target_price', e.target.value)} style={{ width: 110 }} /></td>
            <td><button type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
          </tr>)}</tbody>
        </table></div>
        <button type="button" className="btn secondary sm" style={{ marginTop: 8 }} onClick={() => setRows([...rows, { product_id: null, description: '', quantity: 1, unit: '', target_price: '' }])}>+ {t('add_item')}</button>
      </div>
      <div className="row"><button className="btn lg" disabled={busy || rows.length === 0}>{t('submit_rfq')}</button><span className="muted small">{rows.length} {t('items')}</span></div>
    </form>
  )
}
