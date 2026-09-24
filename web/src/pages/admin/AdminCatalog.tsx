import { FormEvent, useRef, useState } from 'react'
import { api, API_BASE, Category, getToken, Product } from '../../api'
import { Badge, Modal, Money, Spinner, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

const EMPTY = { category_id: 0, sku: '', name_ar: '', name_en: '', brand: '', unit: 'piece', description: '', image_url: '', spec: {} as Record<string, any>, is_active: true }

export default function AdminCatalog() {
  const { t, name, lang } = useI18n()
  const [tab, setTab] = useState<'products' | 'categories'>('products')
  const [q, setQ] = useState(''); const [cat, setCat] = useState('')
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const prods = useLoad(() => api.get<Product[]>('/admin/products', { q, category_id: cat, limit: 300 }), [q, cat])
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: number }) | null>(null)
  const [catEdit, setCatEdit] = useState<{ id?: number; slug: string; name_ar: string; name_en: string; parent_id: number | null; icon: string; sort_order: number } | null>(null)
  const [msg, setMsg] = useState('')
  const imgRef = useRef<HTMLInputElement>(null)
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return
    try {
      if (edit.id) await api.put(`/admin/products/${edit.id}`, edit); else await api.post('/catalog/products', edit)
      setEdit(null); prods.reload(); cats.reload()
    } catch (ex: any) { setMsg(ex.message) }
  }
  const saveCat = async (e: FormEvent) => {
    e.preventDefault(); if (!catEdit) return
    try { if (catEdit.id) await api.put(`/admin/categories/${catEdit.id}`, catEdit); else await api.post('/admin/categories', catEdit); setCatEdit(null); cats.reload() } catch (ex: any) { setMsg(ex.message) }
  }
  const toggle = async (p: Product) => { await (p.is_active ? api.del(`/admin/products/${p.id}`) : api.post(`/admin/products/${p.id}/activate`)); prods.reload() }
  const uploadImg = async (p: Product, file: File) => { try { await api.upload(`/catalog/products/${p.id}/image`, file); prods.reload() } catch (ex: any) { setMsg(ex.message) } }
  const [imgTarget, setImgTarget] = useState<Product | null>(null)
  return (
    <div className="stack">
      <div className="row between"><h1>{t('catalog_mgmt')}</h1><div className="row"><a className="btn ghost sm" href={`${API_BASE}/admin/export/products.csv?token=${getToken()}`}>⬇ CSV</a><button className="btn secondary" onClick={() => setCatEdit({ slug: '', name_ar: '', name_en: '', parent_id: null, icon: '📦', sort_order: 99 })}>➕ {t('new_category')}</button><button className="btn" onClick={() => setEdit({ ...EMPTY, category_id: cats.data?.[0]?.id || 0 })}>➕ {t('new_product')}</button></div></div>
      {msg && <div className="alert error" onClick={() => setMsg('')}>{msg}</div>}
      <div className="tabs"><button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>{t('products')} ({prods.data?.length ?? 0})</button><button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>{t('categories')} ({cats.data?.length ?? 0})</button></div>
      {tab === 'products' ? (
        <>
          <div className="card row"><input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 260 }} /><select style={{ width: 'auto' }} value={cat} onChange={e => setCat(e.target.value)}><option value="">{t('categories')}</option>{(cats.data || []).map(c => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{name(c)}</option>)}</select></div>
          <input type="file" accept="image/*" ref={imgRef} style={{ display: 'none' }} onChange={e => e.target.files?.[0] && imgTarget && uploadImg(imgTarget, e.target.files[0])} />
          {prods.loading ? <Spinner /> : <div className="card pad-0"><div className="t-wrap"><table>
            <thead><tr><th></th><th>{t('sku')}</th><th>{t('products')}</th><th>{t('category')}</th><th>{t('brand_name')}</th><th>{t('unit')}</th><th>{t('best_price')}</th><th>{t('offers')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr></thead>
            <tbody>{(prods.data || []).map(p => <tr key={p.id} style={{ opacity: p.is_active ? 1 : .55 }}>
              <td>{p.image_url ? <img src={p.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} /> : <button className="btn ghost sm" onClick={() => { setImgTarget(p); imgRef.current?.click() }}>🖼</button>}</td>
              <td className="ltr small">{p.sku}</td><td>{p.name_ar}<div className="small muted">{p.name_en}</div></td><td className="small">{name({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</td><td>{p.brand}</td><td>{p.unit}</td><td><Money v={p.summary?.min_price} /></td><td className="num">{p.summary?.offer_count ?? 0}</td>
              <td>{p.is_active ? <Badge>{t('active')}</Badge> : <Badge kind="danger">{t('inactive')}</Badge>}</td>
              <td><div className="row" style={{ gap: 4 }}><button className="btn ghost sm" onClick={() => setEdit({ ...EMPTY, ...p, spec: p.spec || {} })}>✎ {t('edit')}</button><button className={`btn sm ${p.is_active ? 'danger' : ''}`} onClick={() => toggle(p)}>{p.is_active ? t('deactivate') : t('activate')}</button></div></td>
            </tr>)}</tbody>
          </table></div></div>}
        </>
      ) : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th></th><th>{t('category')}</th><th>English</th><th>slug</th><th>{t('parent')}</th><th>{t('products')}</th><th>{t('actions')}</th></tr></thead>
          <tbody>{(cats.data || []).map(c => <tr key={c.id}><td>{c.icon}</td><td style={{ paddingInlineStart: c.parent_id ? 28 : 12 }}>{c.name_ar}</td><td>{c.name_en}</td><td className="ltr small">{c.slug}</td><td className="small">{c.parent_id ? name(cats.data!.find(x => x.id === c.parent_id) || null) : '—'}</td><td className="num">{c.product_count}</td>
            <td><div className="row" style={{ gap: 4 }}><button className="btn ghost sm" onClick={() => setCatEdit({ id: c.id, slug: c.slug, name_ar: c.name_ar, name_en: c.name_en, parent_id: c.parent_id, icon: c.icon, sort_order: c.sort_order })}>✎</button><button className="btn ghost sm" onClick={async () => { if (!confirm(t('delete') + '?')) return; try { await api.del(`/admin/categories/${c.id}`); cats.reload() } catch (ex: any) { setMsg(ex.message) } }}>🗑</button></div></td></tr>)}</tbody>
        </table></div></div>
      )}
      {edit && <Modal title={edit.id ? `${t('edit')} — ${edit.name_ar}` : t('new_product')} onClose={() => setEdit(null)}>
        <form onSubmit={save} className="grid grid-2">
          <div className="field"><label>{t('category')}</label><select value={edit.category_id} onChange={e => setEdit({ ...edit, category_id: Number(e.target.value) })}>{(cats.data || []).map(c => <option key={c.id} value={c.id}>{c.parent_id ? '— ' : ''}{name(c)}</option>)}</select></div>
          <div className="field"><label>{t('sku')}</label><input className="ltr" style={{ display: 'block' }} value={edit.sku} onChange={e => setEdit({ ...edit, sku: e.target.value })} placeholder="auto" /></div>
          <div className="field"><label>{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'}</label><input required value={edit.name_ar} onChange={e => setEdit({ ...edit, name_ar: e.target.value })} /></div>
          <div className="field"><label>English name</label><input required value={edit.name_en} onChange={e => setEdit({ ...edit, name_en: e.target.value })} /></div>
          <div className="field"><label>{t('brand_name')}</label><input value={edit.brand} onChange={e => setEdit({ ...edit, brand: e.target.value })} /></div>
          <div className="field"><label>{t('unit')}</label><input value={edit.unit} onChange={e => setEdit({ ...edit, unit: e.target.value })} placeholder="piece / ton / m2 / unit" /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('description')}</label><textarea rows={2} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>{lang === 'ar' ? 'المواصفات (JSON)' : 'Spec (JSON)'}</label><input className="ltr" style={{ display: 'block' }} defaultValue={JSON.stringify(edit.spec)} onBlur={e => { try { setEdit({ ...edit, spec: JSON.parse(e.target.value || '{}') }) } catch { setMsg('Invalid JSON') } }} /></div>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn">{t('save')}</button></div>
        </form>
      </Modal>}
      {catEdit && <Modal title={catEdit.id ? t('edit') : t('new_category')} onClose={() => setCatEdit(null)}>
        <form onSubmit={saveCat} className="grid grid-2">
          <div className="field"><label>{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'}</label><input required value={catEdit.name_ar} onChange={e => setCatEdit({ ...catEdit, name_ar: e.target.value })} /></div>
          <div className="field"><label>English name</label><input required value={catEdit.name_en} onChange={e => setCatEdit({ ...catEdit, name_en: e.target.value, slug: catEdit.id ? catEdit.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></div>
          <div className="field"><label>slug</label><input className="ltr" style={{ display: 'block' }} required value={catEdit.slug} onChange={e => setCatEdit({ ...catEdit, slug: e.target.value })} /></div>
          <div className="field"><label>{t('parent')}</label><select value={catEdit.parent_id ?? ''} onChange={e => setCatEdit({ ...catEdit, parent_id: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{(cats.data || []).filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{name(c)}</option>)}</select></div>
          <div className="field"><label>Icon (emoji)</label><input value={catEdit.icon} onChange={e => setCatEdit({ ...catEdit, icon: e.target.value })} /></div>
          <div className="field"><label>{t('sort')}</label><input type="number" value={catEdit.sort_order} onChange={e => setCatEdit({ ...catEdit, sort_order: Number(e.target.value) })} /></div>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn">{t('save')}</button></div>
        </form>
      </Modal>}
    </div>
  )
}
