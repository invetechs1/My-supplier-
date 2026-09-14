import { FormEvent, useRef, useState } from 'react'
import { api, ImportResult, PriceSource } from '../../api'
import { Alert, Badge, Spinner, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminSources() {
  const { t, lang } = useI18n()
  const res = useLoad(() => api.get<PriceSource[]>('/admin/sources'))
  const [f, setF] = useState({ name: '', kind: 'csv', url: '', city: '' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null); const [uploadTo, setUploadTo] = useState<number | null>(null)
  const show = (r: ImportResult) => setMsg({ kind: r.errors.length && !r.created_offers && !r.updated_offers ? 'error' : 'ok', text: `${r.created_offers} new · ${r.updated_offers} updated · ${r.created_products} products · ${r.skipped} skipped ${r.errors[0] ? '— ' + r.errors[0] : ''}` })
  const add = async (e: FormEvent) => { e.preventDefault(); try { await api.post('/admin/sources', f); setF({ name: '', kind: 'csv', url: '', city: '' }); res.reload() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const fetchNow = async (s: PriceSource) => { try { show(await api.post<ImportResult>(`/admin/sources/${s.id}/fetch`)); res.reload() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  const upload = async (file: File) => { if (!uploadTo) return; try { show(await api.upload<ImportResult>(`/admin/sources/${uploadTo}/upload`, file)); res.reload() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  return (
    <div className="stack">
      <h1>{t('sources')}</h1>
      <p className="muted small">{lang === 'ar' ? 'مصادر أسعار خارجية (قوائم أسعار مورّدين غير مسجّلين، مؤشرات، ملفات CSV/JSON عبر رابط أو رفع يدوي). تظهر كأسعار مرجعية في صفحات المقارنة إلى جانب المورّدين المسجّلين.' : 'External price feeds (unregistered suppliers, indices, CSV/JSON by URL or manual upload). They appear as reference prices next to registered suppliers.'}</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <form className="card row" onSubmit={add}>
        <input required placeholder={t('title')} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} style={{ minWidth: 200 }} />
        <select style={{ width: 'auto' }} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="csv">CSV URL</option><option value="json">JSON URL</option><option value="manual">{t('upload')}</option></select>
        <input placeholder="https://…/prices.csv" className="ltr grow" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} disabled={f.kind === 'manual'} />
        <input placeholder={t('city')} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} style={{ width: 140 }} />
        <button className="btn">➕</button>
      </form>
      <input type="file" accept=".csv,.json" ref={fileRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
      {res.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th>{t('title')}</th><th>{t('city')}</th><th>URL</th><th>{t('updated')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead>
        <tbody>{(res.data || []).map(s => <tr key={s.id}><td>{s.name} <Badge kind="neutral">{s.kind}</Badge></td><td>{s.city}</td><td className="ltr small">{s.url}</td><td className="small">{fmtDate(s.last_fetched_at, lang)} · {s.imported_rows}</td><td className="small muted">{s.last_status}</td>
          <td><div className="row" style={{ gap: 4 }}>{s.url && <button className="btn sm" onClick={() => fetchNow(s)}>{t('fetch')}</button>}<button className="btn secondary sm" onClick={() => { setUploadTo(s.id); fileRef.current?.click() }}>⬆ {t('upload')}</button><button className="btn ghost sm" onClick={() => api.del(`/admin/sources/${s.id}`).then(res.reload)}>🗑</button></div></td></tr>)}</tbody>
      </table></div></div>}
    </div>
  )
}
