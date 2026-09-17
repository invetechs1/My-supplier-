import { FormEvent, useEffect, useRef, useState } from 'react'
import { api, Category, Supplier, SupplierDocument } from '../../api'
import { Alert, Spinner, Status, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

export default function SupplierProfileEdit() {
  const { t, name } = useI18n()
  const res = useLoad(() => api.get<Supplier>('/suppliers/me'))
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const [f, setF] = useState<any>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const docs = useLoad(() => api.get<SupplierDocument[]>('/suppliers/me/documents'))
  const logoRef = useRef<HTMLInputElement>(null); const docRef = useRef<HTMLInputElement>(null); const [docKind, setDocKind] = useState('cr')
  const uploadLogo = async (file: File) => { try { await api.upload('/suppliers/me/logo', file); res.reload(); setMsg({ kind: 'ok', text: t('success') }) } catch (e: any) { setMsg({ kind: 'error', text: e.message }) } }
  const uploadDoc = async (file: File) => { try { await api.upload(`/suppliers/me/documents?kind=${docKind}`, file); docs.reload(); setMsg({ kind: 'ok', text: t('success') }) } catch (e: any) { setMsg({ kind: 'error', text: e.message }) } }
  useEffect(() => { if (res.data) setF({ name: res.data.name, cr_number: res.data.cr_number, vat_number: res.data.vat_number, city: res.data.city, description: res.data.description, website: res.data.website, phone: res.data.phone, delivery_available: res.data.delivery_available, lead_time_days: res.data.lead_time_days, category_ids: res.data.category_ids, regions: res.data.regions, iban: '', bank_name: res.data.bank_name }) }, [res.data])
  if (!f) return <Spinner />
  const save = async (e: FormEvent) => { e.preventDefault(); try { const body = { ...f }; if (!body.iban) delete body.iban; await api.put('/suppliers/me', body); setMsg({ kind: 'ok', text: t('success') }) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  return (
    <form className="stack" onSubmit={save}>
      <h1>{t('profile')}</h1>{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card grid grid-2">
        <div className="field"><label>{t('company')}</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
        <div className="field"><label>{t('city')}</label><input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></div>
        <div className="field"><label>{t('cr_number')}</label><input value={f.cr_number} onChange={e => setF({ ...f, cr_number: e.target.value })} /></div>
        <div className="field"><label>{t('vat_number')}</label><input value={f.vat_number} onChange={e => setF({ ...f, vat_number: e.target.value })} /></div>
        <div className="field"><label>{t('phone')}</label><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><label>{t('website')}</label><input value={f.website} onChange={e => setF({ ...f, website: e.target.value })} /></div>
        <div className="field"><label>{t('iban')} {res.data?.iban_masked && <span className="ltr muted">({res.data.iban_masked})</span>}</label><input className="ltr" style={{ display: 'block' }} value={f.iban} onChange={e => setF({ ...f, iban: e.target.value })} placeholder="SA00 0000 0000 0000 0000 0000" /></div>
        <div className="field"><label>{t('bank_name')}</label><input value={f.bank_name} onChange={e => setF({ ...f, bank_name: e.target.value })} /></div>
        <div className="field"><label>{t('lead_time')} ({t('days')})</label><input type="number" min={0} value={f.lead_time_days} onChange={e => setF({ ...f, lead_time_days: Number(e.target.value) })} /></div>
        <div className="field"><label>{t('delivery')}</label><select value={String(f.delivery_available)} onChange={e => setF({ ...f, delivery_available: e.target.value === 'true' })}><option value="true">✓</option><option value="false">✕</option></select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('description')}</label><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('specialties')}</label><div className="row">{(cats.data || []).filter(c => !c.parent_id).map(c => <label key={c.id} className="row" style={{ width: 'auto', gap: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.category_ids.includes(c.id)} onChange={e => setF({ ...f, category_ids: e.target.checked ? [...f.category_ids, c.id] : f.category_ids.filter((x: number) => x !== c.id) })} />{c.icon} {name(c)}</label>)}</div></div>
      </div>
      <div><button className="btn">{t('save')}</button></div>
      <div className="grid grid-2">
        <div className="card"><h3>{t('logo')}</h3><div className="row">{res.data?.logo_url && <img src={res.data.logo_url} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--line)' }} />}<input type="file" accept="image/png,image/jpeg,image/webp" ref={logoRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} /><button type="button" className="btn secondary" onClick={() => logoRef.current?.click()}>⬆ {t('upload_logo')}</button></div></div>
        <div className="card"><h3>{t('documents')}</h3>
          <div className="row" style={{ marginBottom: 10 }}><select style={{ width: 'auto' }} value={docKind} onChange={e => setDocKind(e.target.value)}>{['cr', 'vat', 'classification', 'bank', 'other'].map(k => <option key={k} value={k}>{t('doc_' + k)}</option>)}</select><input type="file" accept=".pdf,image/png,image/jpeg" ref={docRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && uploadDoc(e.target.files[0])} /><button type="button" className="btn secondary" onClick={() => docRef.current?.click()}>⬆ {t('upload_document')}</button></div>
          <table><tbody>{(docs.data || []).map(d => <tr key={d.id}><td>{t('doc_' + d.kind)}<div className="small muted">{d.filename}</div></td><td><Status s={d.status} />{d.note && <div className="small muted">{d.note}</div>}</td><td><a href={d.file_url} target="_blank" rel="noreferrer" className="btn ghost sm">↗</a></td></tr>)}</tbody></table>
        </div>
      </div>
    </form>
  )
}
