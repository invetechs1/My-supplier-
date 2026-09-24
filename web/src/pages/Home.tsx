import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, Category } from '../api'
import { Change, Money, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export default function Home() {
  const { t, name, lang } = useI18n()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const stats = useLoad(() => api.get<any>('/market/stats'))
  const banner = stats.data?.settings?.home_banner_text
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'))
  const index = useLoad(() => api.get<any[]>('/market/index'))
  const trending = useLoad(() => api.get<any[]>('/market/trending', { limit: 6 }))
  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/catalog?q=${encodeURIComponent(q)}${city ? `&city=${encodeURIComponent(city)}` : ''}`) }
  const tops = (cats.data || []).filter(c => !c.parent_id)
  return (
    <>
      {banner && <div style={{ background: '#F2B134', color: '#1a1a1a', textAlign: 'center', padding: '8px 16px', fontWeight: 600 }}>{stats.data.settings.home_banner_link ? <a href={stats.data.settings.home_banner_link} style={{ color: 'inherit' }}>📣 {banner}</a> : <>📣 {banner}</>}</div>}
      <section className="hero">
        <div className="container">
          <div className="slogan ltr">Build for Less</div>
          <h1>{t('slogan_ar')} — {lang === 'ar' ? 'أسعار مواد البناء من كل المورّدين في مكان واحد' : 'building material prices from every supplier, in one place'}</h1>
          <p>{t('hero_sub')}</p>
          <form className="search" onSubmit={submit}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_ph')} />
            <select value={city} onChange={e => setCity(e.target.value)}>
              <option value="">{t('all_cities')}</option>
              {(stats.data?.cities || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn lg" type="submit">{t('search')}</button>
          </form>
          {stats.data && (
            <div className="row" style={{ marginTop: 26, gap: 28 }}>
              {[['products', 'stats_products'], ['suppliers', 'stats_suppliers'], ['offers', 'stats_offers']].map(([k, l]) => (
                <div key={k}><div className="num" style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.data[k].toLocaleString()}</div><div style={{ opacity: .85 }}>{t(l)}</div></div>
              ))}
              <div><div className="num" style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.data.cities.length}</div><div style={{ opacity: .85 }}>{t('stats_cities')}</div></div>
            </div>
          )}
        </div>
      </section>

      <section className="container" style={{ padding: '26px 16px 0' }}>
        <div className="mission">
          <div className="mission-mark ltr">Build<br />for Less</div>
          <div><h2 style={{ marginBottom: 4 }}>{t('mission_title')}</h2><p style={{ margin: 0 }}>{t('mission')}</p></div>
          {stats.data?.avg_saving_pct != null && <div className="mission-stat"><div className="num">{stats.data.avg_saving_pct}%</div><div className="small">{t('saved_label')}</div></div>}
        </div>
      </section>

      <section className="container" style={{ padding: '30px 16px 0' }}>
        <h2>{t('categories')}</h2>
        <div className="grid grid-4">
          {tops.map(c => (
            <Link key={c.id} to={`/catalog?category_id=${c.id}`} className="cat-tile"><span className="ic">{c.icon}</span><span><div className="n">{name(c)}</div><div className="c">{c.product_count} {t('products')}</div></span></Link>
          ))}
        </div>
      </section>

      <section className="container" style={{ padding: '30px 16px 0' }}>
        <div className="grid grid-2">
          <div className="card">
            <h3>{t('market')}</h3>
            <div className="t-wrap"><table>
              <thead><tr><th>{t('categories')}</th><th>{t('offers')}</th><th>{t('change_30d')}</th></tr></thead>
              <tbody>{(index.data || []).slice(0, 10).map(r => <tr key={r.category_id}><td><Link to={`/catalog?category_id=${r.category_id}`}>{r.icon} {name(r)}</Link></td><td className="num">{r.offers}</td><td><Change pct={r.change_30d_pct} /></td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="card">
            <h3>{t('trending')}</h3>
            <div className="t-wrap"><table>
              <thead><tr><th>{t('products')}</th><th>{t('best_price')}</th><th>{t('change_30d')}</th></tr></thead>
              <tbody>{(trending.data || []).map(r => <tr key={r.product_id}><td><Link to={`/products/${r.product_id}`}>{name(r)}</Link> <span className="muted small">{r.brand}</span></td><td><Money v={r.min_price} unit={r.unit} /></td><td><Change pct={r.change_30d_pct} /></td></tr>)}</tbody>
            </table></div>
          </div>
        </div>
      </section>

      <section className="container" style={{ padding: '30px 16px 0' }}>
        <h2>{t('how_title')}</h2>
        <div className="grid grid-3 steps">
          {['how_1', 'how_2', 'how_3'].map(k => <div key={k} className="card step"><p style={{ margin: 0 }}>{t(k)}</p></div>)}
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <Link className="btn lg" to="/register">{t('register')}</Link>
          <Link className="btn secondary lg" to="/catalog">{t('catalog')}</Link>
          <Link className="btn ghost lg" to="/register?role=supplier">{t('role_supplier')} →</Link>
        </div>
      </section>
    </>
  )
}
