import { api, Order } from '../../api'
import { Empty, Spinner, useLoad } from '../../components/ui'
import { useI18n } from '../../i18n'
import { OrdersTable } from '../buyer/BuyerOrders'

export default function SupplierOrders() {
  const { t } = useI18n()
  const res = useLoad(() => api.get<Order[]>('/orders/supplier'))
  return <div className="stack"><h1>{t('orders')}</h1>{res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : <OrdersTable orders={res.data} supplierView reload={res.reload} />}</div>
}
