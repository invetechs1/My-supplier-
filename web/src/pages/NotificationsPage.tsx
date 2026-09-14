import { useNavigate } from 'react-router-dom'
import { api, Notification } from '../api'
import { useAuth } from '../auth'
import { Empty, Spinner, useLoad } from '../components/ui'
import { fmtDate, useI18n } from '../i18n'

export default function NotificationsPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const nav = useNavigate()
  const res = useLoad(() => api.get<Notification[]>('/notifications'))
  const open = async (n: Notification) => {
    await api.post(`/notifications/${n.id}/read`).catch(() => {})
    if (n.ref_type === 'rfq' && n.ref_id) nav(user?.role === 'supplier' ? `/supplier/rfqs/${n.ref_id}` : `/buyer/rfqs/${n.ref_id}`)
    else if (n.ref_type === 'order') nav(user?.role === 'supplier' ? '/supplier/orders' : '/buyer/orders')
    else res.reload()
  }
  return (
    <div className="container" style={{ padding: '20px 16px', maxWidth: 800 }}>
      <div className="row between"><h1>{t('notifications')}</h1><button className="btn ghost sm" onClick={() => api.post('/notifications/read-all').then(res.reload)}>{t('mark_all_read')}</button></div>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>—</Empty> : (
        <div className="card pad-0">{res.data.map(n => <div key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`} style={{ cursor: 'pointer' }} onClick={() => open(n)}><div className="bold">{n.title}</div><div className="small">{n.body}</div><div className="small muted">{fmtDate(n.created_at, lang)}</div></div>)}</div>
      )}
    </div>
  )
}
