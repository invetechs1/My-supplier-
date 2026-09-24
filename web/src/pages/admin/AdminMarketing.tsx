import { FormEvent, useState } from 'react'
import { api, Coupon, Review, ProductReview } from '../../api'
import { Alert, Badge, Modal, Spinner, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

const EMPTY = { code: '', kind: 'percent', value: 10, min_order: 0, max_discount: '' as string | number, max_uses: '' as string | number, audience: 'all', is_active: true, expires_at: '' }

export default function AdminMarketing() {
  const { t, lang, name } = useI18n()
  const coupons = useLoad(() => api.get<Coupon[]>('/admin/coupons'))
  const reviews = useLoad(() => api.get<Review[]>('/admin/reviews'))
  const previews = useLoad(() => api.get<ProductReview[]>('/admin/product-reviews'))
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: number }) | null>(null)
  const [bc, setBc] = useState({ title: '', body: '', audience: 'all' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const saveCoupon = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    const body = { ...edit, max_discount: edit.max_discount === '' ? null : Number(edit.max_discount), max_uses: edit.max_uses === '' ? null : Number(edit.max_uses), expires_at: edit.expires_at || null }
    try { if (edit.id) await api.put(`/admin/coupons/${edit.id}`, body); else await api.post('/admin/coupons', body); setEdit(null); coupons.reload() } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) }
  }
  const send = async (e: FormEvent) => { e.preventDefault(); try { const r = await api.post<any>('/admin/broadcast', bc); setMsg({ kind: 'ok', text: `${t('success')} — ${r.recipients} ${t('recipients')}` }); setBc({ title: '', body: '', audience: 'all' }) } catch (ex: any) { setMsg({ kind: 'error', text: ex.message }) } }
  return (
    <div className="stack">
      <h1>{t('marketing')}</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid grid-2">
        <div className="card pad-0">
          <div className="row between" style={{ padding: '12px 16px 0' }}><h3>{t('coupons')}</h3><button className="btn sm" onClick={() => setEdit({ ...EMPTY })}>➕ {t('coupon')}</button></div>
          {coupons.loading ? <Spinner /> : <div className="t-wrap"><table>
            <thead><tr><th>{t('coupon')}</th><th>{t('kind')}</th><th>{t('discount')}</th><th>{t('min_order')}</th><th>{t('used')}</th><th>{t('expires')}</th><th></th></tr></thead>
            <tbody>{(coupons.data || []).map(c => <tr key={c.id} style={{ opacity: c.is_active ? 1 : .5 }}><td className="ltr bold">{c.code}{c.audience === 'new' && <div className="small muted">{t('first_order_only')}</div>}</td><td>{t(c.kind)}</td><td className="num">{c.kind === 'percent' ? `${c.value}%` : c.value}{c.max_discount != null && <span className="muted small"> ≤ {c.max_discount}</span>}</td><td className="num">{c.min_order}</td><td className="num">{c.used}{c.max_uses != null && ` / ${c.max_uses}`}</td><td className="small">{fmtDate(c.expires_at, lang)}</td>
              <td><div className="row" style={{ gap: 4 }}><button className="btn ghost sm" onClick={() => setEdit({ ...c, max_discount: c.max_discount ?? '', max_uses: c.max_uses ?? '', expires_at: c.expires_at ? c.expires_at.slice(0, 10) : '' })}>✎</button><button className="btn ghost sm" onClick={() => api.del(`/admin/coupons/${c.id}`).then(coupons.reload)}>🗑</button></div></td></tr>)}</tbody>
          </table></div>}
        </div>
        <form className="card" onSubmit={send}>
          <h3>{t('broadcast')}</h3>
          <div className="field"><label>{t('audience')}</label><select value={bc.audience} onChange={e => setBc({ ...bc, audience: e.target.value })}>{['all', 'buyers', 'suppliers'].map(a => <option key={a} value={a}>{t('aud_' + a)}</option>)}</select></div>
          <div className="field"><label>{t('title')}</label><input required value={bc.title} onChange={e => setBc({ ...bc, title: e.target.value })} /></div>
          <div className="field"><label>{t('description')}</label><textarea rows={3} value={bc.body} onChange={e => setBc({ ...bc, body: e.target.value })} /></div>
          <p className="small muted">{lang === 'ar' ? 'يصل الإعلان داخل المنصة وعبر القنوات المفعّلة لكل مستخدم (بريد/SMS/إشعار).' : 'Delivered in-app and via each user\'s enabled channels (email/SMS/push).'}</p>
          <button className="btn">{t('send')}</button>
        </form>
      </div>
      <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('reviews')}</h3>
        {reviews.loading ? <Spinner /> : <div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('supplier')}</th><th>{t('role_buyer')}</th><th>{t('rating')}</th><th>{t('notes')}</th><th>{t('order')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>{(reviews.data || []).map(r => <tr key={r.id}><td className="num">{r.id}</td><td>{r.supplier_name}</td><td>{r.buyer_name}</td><td><Badge>{'★'.repeat(r.rating)}</Badge></td><td>{r.comment}</td><td className="num">#{r.order_id}</td><td className="small muted">{fmtDate(r.created_at, lang)}</td><td><button className="btn ghost sm" onClick={() => { if (confirm(t('delete') + '?')) api.del(`/admin/reviews/${r.id}`).then(reviews.reload) }}>🗑</button></td></tr>)}</tbody>
        </table></div>}
      </div>
      <div className="card pad-0"><h3 style={{ padding: '12px 16px 0' }}>{t('product_reviews')}</h3>
        {previews.loading ? <Spinner /> : <div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('products')}</th><th>{t('role_buyer')}</th><th>{t('rating')}</th><th>{t('title')}</th><th>{t('notes')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>{(previews.data || []).map(r => <tr key={r.id}><td className="num">{r.id}</td><td><a href={`/products/${r.product_id}`} target="_blank" rel="noreferrer">{name({ name_ar: r.product_name_ar, name_en: r.product_name_en })}</a></td><td>{r.author}{r.verified && <> <Badge>✓ {t('verified_purchase')}</Badge></>}</td><td><Badge>{'★'.repeat(r.rating)}</Badge></td><td>{r.title}</td><td>{r.comment}</td><td className="small muted">{fmtDate(r.created_at, lang)}</td><td><button className="btn ghost sm" onClick={() => { if (confirm(t('delete') + '?')) api.del(`/admin/product-reviews/${r.id}`).then(previews.reload) }}>🗑</button></td></tr>)}
            {(previews.data || []).length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>—</td></tr>}</tbody>
        </table></div>}
      </div>
      {edit && <Modal title={edit.id ? `${t('edit')} — ${edit.code}` : t('coupon')} onClose={() => setEdit(null)}>
        <form onSubmit={saveCoupon} className="grid grid-2">
          <div className="field"><label>{t('coupon')}</label><input className="ltr" style={{ display: 'block' }} required value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></div>
          <div className="field"><label>{t('kind')}</label><select value={edit.kind} onChange={e => setEdit({ ...edit, kind: e.target.value })}><option value="percent">{t('percent')}</option><option value="fixed">{t('fixed')}</option></select></div>
          <div className="field"><label>{t('discount')}</label><input type="number" step="any" min="0.01" required value={edit.value} onChange={e => setEdit({ ...edit, value: Number(e.target.value) })} /></div>
          <div className="field"><label>{t('min_order')}</label><input type="number" step="any" value={edit.min_order} onChange={e => setEdit({ ...edit, min_order: Number(e.target.value) })} /></div>
          <div className="field"><label>{lang === 'ar' ? 'أقصى خصم (ر.س)' : 'Max discount (SAR)'}</label><input type="number" step="any" value={edit.max_discount} onChange={e => setEdit({ ...edit, max_discount: e.target.value })} /></div>
          <div className="field"><label>{t('max_uses')}</label><input type="number" value={edit.max_uses} onChange={e => setEdit({ ...edit, max_uses: e.target.value })} /></div>
          <div className="field"><label>{t('expires')}</label><input type="date" value={edit.expires_at} onChange={e => setEdit({ ...edit, expires_at: e.target.value })} /></div>
          <div className="field"><label>{t('audience')}</label><select value={edit.audience} onChange={e => setEdit({ ...edit, audience: e.target.value })}><option value="all">{t('aud_all')}</option><option value="new">{t('first_order_only')}</option></select></div>
          <label className="row" style={{ gridColumn: '1 / -1' }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> {t('active')}</label>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn">{t('save')}</button></div>
        </form>
      </Modal>}
    </div>
  )
}
