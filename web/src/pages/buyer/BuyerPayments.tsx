import { api, Payment } from '../../api'
import { Empty, Money, Spinner, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function BuyerPayments() {
  const { t, lang } = useI18n()
  const res = useLoad(() => api.get<Payment[]>('/payments/mine'))
  const cancel = async (p: Payment) => { await api.post(`/payments/${p.id}/cancel`); res.reload() }
  return (
    <div className="stack"><h1>{t('payments')}</h1>
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('order')}</th><th>{t('supplier')}</th><th>{t('method')}</th><th>{t('amount')}</th><th>{t('status')}</th><th>{t('reference')}</th><th>{t('updated')}</th><th></th></tr></thead>
          <tbody>{res.data.map(p => <tr key={p.id}><td className="num">{p.id}</td><td className="num">#{p.order_id}</td><td>{p.supplier_name}</td><td>{t(p.method)}</td><td className="bold"><Money v={p.amount} /></td><td><Status s={p.status} />{p.failure_reason && <div className="small muted">{p.failure_reason}</div>}</td><td className="ltr small">{p.transfer_reference || p.provider_ref}</td><td className="small muted">{fmtDate(p.paid_at || p.created_at, lang)}</td>
            <td>{p.status === 'initiated' && p.checkout_url && <a className="btn sm" href={p.checkout_url}>{t('pay_now')}</a>}{p.status === 'pending_transfer' && <details className="small"><summary>{t('transfer_instructions')}</summary><div className="ltr" style={{ display: 'block' }}>{p.bank_instructions}</div></details>}{['initiated', 'pending_transfer'].includes(p.status) && <button className="btn ghost sm" onClick={() => cancel(p)}>{t('cancel')}</button>}</td></tr>)}</tbody>
        </table></div></div>
      )}
    </div>
  )
}
