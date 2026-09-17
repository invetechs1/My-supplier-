/** Supplier document review + order disputes. */
import { useState } from 'react'
import { api, Dispute, SupplierDocument } from '../../api'
import { Modal, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function AdminTrust() {
  const { t, lang } = useI18n()
  const docs = useLoad(() => api.get<SupplierDocument[]>('/admin/documents', { status: 'pending' }))
  const disputes = useLoad(() => api.get<Dispute[]>('/admin/disputes', { status: 'open' }))
  const [resolving, setResolving] = useState<Dispute | null>(null)
  const [f, setF] = useState({ status: 'resolved', resolution: '', refund: false })
  const review = async (d: SupplierDocument, status: 'approved' | 'rejected') => { const note = status === 'rejected' ? (prompt(t('notes')) || '') : ''; await api.post(`/admin/documents/${d.id}/review`, { status, note }); docs.reload() }
  const resolve = async () => { if (!resolving) return; await api.post(`/admin/disputes/${resolving.id}/resolve`, f); setResolving(null); setF({ status: 'resolved', resolution: '', refund: false }); disputes.reload() }
  return (
    <div className="stack">
      <h1>{t('documents')} · {t('disputes')}</h1>
      <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('documents')} — {t('pending')} ({docs.data?.length ?? 0})</h3>
        {docs.loading ? <Spinner /> : <div className="t-wrap"><table>
          <thead><tr><th>{t('supplier')}</th><th>{lang === 'ar' ? 'النوع' : 'Kind'}</th><th>{lang === 'ar' ? 'الملف' : 'File'}</th><th>{t('updated')}</th><th>{t('actions')}</th></tr></thead>
          <tbody>{(docs.data || []).map(d => <tr key={d.id}><td>{d.supplier_name}</td><td>{t('doc_' + d.kind)}</td><td><a href={d.file_url} target="_blank" rel="noreferrer">{d.filename || '↗'}</a></td><td className="small muted">{fmtDate(d.uploaded_at, lang)}</td><td><div className="row" style={{ gap: 4 }}><button className="btn sm" onClick={() => review(d, 'approved')}>✓ {t('approved')}</button><button className="btn danger sm" onClick={() => review(d, 'rejected')}>✕ {t('rejected')}</button></div></td></tr>)}</tbody>
        </table></div>}
      </div>
      <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('disputes')} — {t('open')} ({disputes.data?.length ?? 0})</h3>
        {disputes.loading ? <Spinner /> : <div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('order')}</th><th>{t('role_buyer')}</th><th>{t('supplier')}</th><th>{t('total')}</th><th>{t('reason')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>{(disputes.data || []).map(d => <tr key={d.id}><td className="num">{d.id}</td><td className="num">#{d.order_id}</td><td>{d.buyer_name}</td><td>{d.supplier_name}</td><td><Money v={d.order_total} /></td><td>{d.reason}<div className="small muted">{t(d.role === 'buyer' ? 'role_buyer' : 'supplier')}</div></td><td className="small muted">{fmtDate(d.created_at, lang)}</td><td><button className="btn sm" onClick={() => setResolving(d)}>{t('resolve')}</button></td></tr>)}</tbody>
        </table></div>}
      </div>
      {resolving && <Modal title={`${t('resolve')} — #${resolving.order_id}`} onClose={() => setResolving(null)}>
        <div className="field"><label>{t('status')}</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="resolved">{t('resolved')}</option><option value="rejected">{t('rejected')}</option></select></div>
        <div className="field"><label>{t('resolution')}</label><textarea rows={3} value={f.resolution} onChange={e => setF({ ...f, resolution: e.target.value })} /></div>
        <label className="row" style={{ marginBottom: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.refund} onChange={e => setF({ ...f, refund: e.target.checked })} /> {t('refund_buyer')}</label>
        <button className="btn" onClick={resolve}>{t('confirm')}</button>
      </Modal>}
    </div>
  )
}
