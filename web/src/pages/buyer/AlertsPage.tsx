import { Link } from 'react-router-dom'
import { api, PriceAlert } from '../../api'
import { Empty, Money, Spinner, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'

export default function AlertsPage() {
  const { t, name } = useI18n()
  const res = useLoad(() => api.get<PriceAlert[]>('/catalog/alerts'))
  return (
    <div className="stack"><h1>{t('alerts')}</h1>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>{t('products')}</th><th>{t('city')}</th><th>{t('target_price')}</th><th>{t('best_price')}</th><th></th></tr></thead>
          <tbody>{res.data.map(a => <tr key={a.id} className={a.target_price != null && a.current_min != null && a.current_min <= a.target_price ? 'hl' : ''}>
            <td><Link to={`/products/${a.product_id}`}>{name(a.product!)}</Link></td><td>{a.city || t('all_cities')}</td><td><Money v={a.target_price} /></td><td className="bold"><Money v={a.current_min} /></td>
            <td><button className="btn ghost sm" onClick={() => api.del(`/catalog/alerts/${a.id}`).then(res.reload)}>✕</button></td></tr>)}</tbody>
        </table></div></div>
      )}
    </div>
  )
}
