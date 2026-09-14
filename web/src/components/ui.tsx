import { ReactNode, useEffect, useState } from 'react'
import { HistoryPoint } from '../api'
import { fmtMoney, useI18n } from '../i18n'

export const Spinner = () => <span className="spinner" aria-label="loading" />

export function Money({ v, digits = 2, unit }: { v: number | null | undefined; digits?: number; unit?: string }) {
  const { t } = useI18n()
  return <span className="num">{fmtMoney(v, digits)} {t('sar')}{unit ? ` / ${unit}` : ''}</span>
}

export function Badge({ kind = '', children }: { kind?: '' | 'warn' | 'danger' | 'info' | 'neutral'; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>
}

const STATUS_KIND: Record<string, '' | 'warn' | 'danger' | 'info' | 'neutral'> = {
  open: '', awarded: '', delivered: '', confirmed: 'info', in_delivery: 'info', submitted: 'info', pending: 'warn', limited: 'warn',
  closed: 'neutral', draft: 'neutral', withdrawn: 'neutral', cancelled: 'danger', rejected: 'danger', out_of_stock: 'danger', in_stock: '',
}
export function Status({ s }: { s: string }) {
  const { t } = useI18n()
  return <Badge kind={STATUS_KIND[s] ?? 'neutral'}>{t(s)}</Badge>
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="stat"><div className="v">{value}</div><div className="l">{label}</div>{sub && <div className="small muted">{sub}</div>}</div>
}

export function Alert({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return <div className={`alert ${kind}`}>{children}</div>
}

export function Change({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span className="muted">—</span>
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'muted'
  return <span className={`num ${cls}`}>{pct > 0 ? '▲' : pct < 0 ? '▼' : ''} {Math.abs(pct).toFixed(1)}%</span>
}

/** Small SVG line chart of price history (min/avg/max band). */
export function PriceChart({ data }: { data: HistoryPoint[] }) {
  if (!data.length) return <div className="muted small">—</div>
  const W = 600, H = 180, P = 28
  const min = Math.min(...data.map(d => d.min_price)), max = Math.max(...data.map(d => d.max_price))
  const span = max - min || 1
  const x = (i: number) => P + (i / Math.max(1, data.length - 1)) * (W - 2 * P)
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P)
  const path = (k: keyof HistoryPoint) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k] as number).toFixed(1)}`).join(' ')
  const band = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.max_price).toFixed(1)}`).join(' ') + ' ' +
    [...data].reverse().map((d, j) => `L${x(data.length - 1 - j).toFixed(1)},${y(d.min_price).toFixed(1)}`).join(' ') + ' Z'
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
      <path d={band} fill="#C6E5D1" opacity=".6" />
      <path d={path('avg_price')} fill="none" stroke="#175934" strokeWidth="2.5" />
      <text x={P} y={12} fontSize="11" fill="#6B7A70" className="num">{fmtMoney(max)}</text>
      <text x={P} y={H - 8} fontSize="11" fill="#6B7A70" className="num">{fmtMoney(min)}</text>
      <text x={W - P} y={H - 8} fontSize="11" fill="#6B7A70" textAnchor="end">{data[data.length - 1].date}</text>
      <text x={W / 2} y={H - 8} fontSize="11" fill="#6B7A70" textAnchor="middle">{data[0].date}</text>
    </svg>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row between"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  )
}

/** Generic data loader hook. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fn().then(d => alive && setData(d)).catch(e => alive && setError(e.message || String(e))).finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, error, loading, reload: () => setTick(t => t + 1), setData }
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card muted" style={{ textAlign: 'center', padding: 30 }}>{children}</div>
}
