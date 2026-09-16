import { ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth, useQuoteList } from '../auth'
import { useI18n } from '../i18n'
import { Wordmark } from './Logo'

export function TopNav() {
  const { t, lang, setLang } = useI18n()
  const { user, logout } = useAuth()
  const quote = useQuoteList()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!user) { setUnread(0); return }
    const load = () => api.get<{ count: number }>('/notifications/unread-count').then(r => setUnread(r.count)).catch(() => {})
    load(); const id = setInterval(load, 30000); return () => clearInterval(id)
  }, [user])
  const portal = user?.role === 'supplier' ? '/supplier' : user?.role === 'admin' ? '/admin' : '/buyer'
  return (
    <nav className="nav">
      <div className="container">
        <Link to="/" className="logo"><Wordmark light /></Link>
        <button className="pill menu-btn" onClick={() => setOpen(o => !o)}>☰</button>
        <div className={`links row ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
          <NavLink to="/catalog" className="link">{t('catalog')}</NavLink>
          <NavLink to="/suppliers" className="link">{t('suppliers')}</NavLink>
          <NavLink to="/market" className="link">{t('market')}</NavLink>
          {user && <NavLink to={portal} className="link">{t('dashboard')}</NavLink>}
        </div>
        <div className="spacer" />
        {(!user || user.role === 'buyer') && (
          <button className="pill" onClick={() => nav('/buyer/rfq/new')}>📋 {t('quote_list')}{quote.items.length > 0 && <span className="dot">{quote.items.length}</span>}</button>
        )}
        {user && <button className="pill" onClick={() => nav('/notifications')}>🔔{unread > 0 && <span className="dot">{unread}</span>}</button>}
        <button className="pill" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'عربي'}</button>
        {user ? (
          <button className="pill" onClick={() => { logout(); nav('/') }}>{t('logout')}</button>
        ) : (
          <Link to="/login" className="btn secondary sm">{t('login')}</Link>
        )}
      </div>
    </nav>
  )
}

export function SiteLayout() {
  const { t } = useI18n()
  return (
    <>
      <TopNav />
      <main><Outlet /></main>
      <footer><div className="container row between"><span className="row"><Wordmark /><span className="muted">© {new Date().getFullYear()} — {t('footer')}</span></span><span className="ltr">API: /api/v1 · Docs: /docs</span></div></footer>
    </>
  )
}

export function Portal({ links, children }: { links: { to: string; label: string; icon?: string; group?: string }[]; children?: ReactNode }) {
  let lastGroup = ''
  return (
    <div className="container portal">
      <aside className="side">
        {links.map(l => {
          const g = l.group && l.group !== lastGroup ? <div className="grp" key={'g' + l.group}>{l.group}</div> : null
          lastGroup = l.group || lastGroup
          return <div key={l.to}>{g}<NavLink to={l.to} end={l.to.endsWith('/buyer') || l.to.endsWith('/supplier') || l.to.endsWith('/admin')}>{l.icon} {l.label}</NavLink></div>
        })}
      </aside>
      <section>{children ?? <Outlet />}</section>
    </div>
  )
}
