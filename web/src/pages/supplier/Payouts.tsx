import { api, Payout } from '../../api'
import { Alert, Empty, Money, Spinner, Stat, Status, useLoad } from '../../components/ui'
import { fmtDate, useI18n } from '../../i18n'

export default function Payouts() {
  const { t, lang } = useI18n()
  const sum = useLoad(() => api.get<any>('/payments/supplier/summary'))
  const res = useLoad(() => api.get<Payout[]>('/payments/payouts/mine'))
  return (
    <div className="stack"><h1>{t('payouts')}</h1>
      {sum.data && !sum.data.iban_set && <Alert kind="error">{lang === 'ar' ? 'أضف الآيبان في الملف التعريفي لاستلام التحويلات.' : 'Add your IBAN in the profile to receive payouts.'}</Alert>}
      {sum.data && <div className="kpi-grid">
        <Stat label={t('in_escrow')} value={<Money v={sum.data.in_escrow} digits={0} />} />
        <Stat label={t('payouts_pending')} value={<Money v={sum.data.payouts_pending} digits={0} />} />
        <Stat label={t('payouts_paid')} value={<Money v={sum.data.payouts_paid} digits={0} />} />
        <Stat label={t('fees_paid')} value={<Money v={sum.data.fees_paid} digits={0} />} />
      </div>}
      {res.loading ? <Spinner /> : !res.data?.length ? <Empty>{t('no_results')}</Empty> : (
        <div className="card pad-0"><div className="t-wrap"><table>
          <thead><tr><th>#</th><th>{t('order')}</th><th>{t('amount')}</th><th>{t('iban')}</th><th>{t('status')}</th><th>{t('reference')}</th><th>{t('updated')}</th></tr></thead>
          <tbody>{res.data.map(x => <tr key={x.id}><td className="num">{x.id}</td><td className="num">#{x.order_id}</td><td className="bold"><Money v={x.amount} /></td><td className="ltr">{x.iban_masked || '—'}</td><td><Status s={x.status} /></td><td className="ltr small">{x.reference}</td><td className="small muted">{fmtDate(x.paid_at || x.created_at, lang)}</td></tr>)}</tbody>
        </table></div></div>
      )}
    </div>
  )
}
