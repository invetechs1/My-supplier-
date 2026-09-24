import { Link } from 'react-router-dom'
import { api, Product } from '../api'
import { useAuth } from '../auth'
import { useCart } from '../cart'
import { Empty, Spinner, useLoad } from '../components/ui'
import { useI18n } from '../i18n'
import { ProductCard } from './Catalog'

export default function FavoritesPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const cart = useCart()
  const ids = cart.favorites
  const res = useLoad(async () => {
    if (user) return api.get<Product[]>('/account/favorites')
    if (!ids.length) return [] as Product[]
    return api.get<Product[]>('/catalog/compare', { ids: ids.join(',') })
  }, [user?.id, ids.join(',')])
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <h1>♥ {t('favorites')} <span className="muted small">({ids.length})</span></h1>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_favorites')}<div style={{ marginTop: 10 }}><Link className="btn" to="/catalog">{t('continue_shopping')}</Link></div></Empty>
        : <div className="grid grid-3">{res.data.map(p => <ProductCard key={p.id} p={p} />)}</div>}
    </div>
  )
}
