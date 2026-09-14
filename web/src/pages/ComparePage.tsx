import { useSearchParams } from 'react-router-dom'
import { api, ProductDetail } from '../api'
import { Money, Spinner, useLoad } from '../components/ui'
import { useI18n } from '../i18n'

export default function ComparePage() {
  const [sp] = useSearchParams()
  const ids = sp.get('ids') || ''
  const { t, name } = useI18n()
  const res = useLoad(() => ids ? api.get<ProductDetail[]>('/catalog/compare', { ids }) : Promise.resolve([]), [ids])
  if (res.loading) return <div className="container" style={{ padding: 30 }}><Spinner /></div>
  return (
    <div className="container" style={{ padding: '20px 16px' }}>
      <h1>{t('compare')}</h1>
      <div className="card pad-0"><div className="t-wrap"><table>
        <thead><tr><th></th>{(res.data || []).map(p => <th key={p.id}>{name(p)}</th>)}</tr></thead>
        <tbody>
          <tr><td>{t('best_price')}</td>{(res.data || []).map(p => <td key={p.id} className="bold"><Money v={p.summary?.min_price} unit={p.unit} /></td>)}</tr>
          <tr><td>{t('avg_price')}</td>{(res.data || []).map(p => <td key={p.id}><Money v={p.summary?.avg_price} /></td>)}</tr>
          <tr><td>{t('offers')}</td>{(res.data || []).map(p => <td key={p.id} className="num">{p.summary?.offer_count}</td>)}</tr>
          <tr><td>{t('suppliers')}</td>{(res.data || []).map(p => <td key={p.id}>{p.offers.slice(0, 3).map(o => <div key={o.id} className="small">{o.supplier?.name}: <Money v={o.price_ex_vat} /></div>)}</td>)}</tr>
        </tbody>
      </table></div></div>
    </div>
  )
}
