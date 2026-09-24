import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, Suggest } from '../api'
import { useI18n } from '../i18n'

/** Search-as-you-type box used in the header and the hero. */
export default function SearchBox({ large = false, city = '' }: { large?: boolean; city?: string }) {
  const { t, name } = useI18n()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sug, setSug] = useState<Suggest | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (q.trim().length < 2) { setSug(null); return }
    const h = setTimeout(() => api.get<Suggest>('/catalog/suggest', { q }).then(r => { setSug(r); setOpen(true) }).catch(() => {}), 200)
    return () => clearTimeout(h)
  }, [q])
  useEffect(() => { const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const go = (path: string) => { setOpen(false); setQ(''); nav(path) }
  const submit = (e: FormEvent) => { e.preventDefault(); go(`/catalog?q=${encodeURIComponent(q)}${city ? `&city=${encodeURIComponent(city)}` : ''}`) }
  const any = sug && (sug.products.length || sug.categories.length || sug.brands.length)
  return (
    <div className={`searchbox ${large ? 'lg' : ''}`} ref={box}>
      <form onSubmit={submit} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} onFocus={() => sug && setOpen(true)} placeholder={t('search_ph')} aria-label={t('search')} />
        <button className={`btn ${large ? 'lg' : 'sm'}`} type="submit">🔍{large ? ' ' + t('search') : ''}</button>
      </form>
      {open && any ? (
        <div className="sug card">
          {sug!.categories.map(c => <div key={'c' + c.id} className="sug-row" onClick={() => go(`/catalog?category_id=${c.id}`)}><span className="ic">{c.icon}</span><span>{name(c)}</span><span className="muted small">{t('categories')}</span></div>)}
          {sug!.products.map(p => <div key={'p' + p.id} className="sug-row" onClick={() => go(`/products/${p.id}`)}><img src={p.image_url} alt="" /><span>{name(p)}</span><span className="muted small">{p.brand}</span></div>)}
          {sug!.brands.map(b => <div key={'b' + b} className="sug-row" onClick={() => go(`/catalog?brand=${encodeURIComponent(b)}`)}><span className="ic">🏷️</span><span>{b}</span><span className="muted small">{t('brands')}</span></div>)}
          <div className="sug-row muted small" onClick={() => go(`/catalog?q=${encodeURIComponent(q)}`)}>🔍 {t('search')}: “{q}”</div>
        </div>
      ) : null}
    </div>
  )
}
