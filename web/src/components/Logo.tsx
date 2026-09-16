import { useI18n } from '../i18n'

/** Brand mark: house roof over bricks with a down-arrow = "Build for Less". */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <rect width="200" height="200" rx="44" fill="#2E9E5B" />
      <path d="M40 100 L100 48 L160 100" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="52" y="110" width="42" height="22" rx="5" fill="#fff" /><rect x="106" y="110" width="42" height="22" rx="5" fill="#fff" />
      <rect x="75" y="138" width="50" height="20" rx="5" fill="#C6E5D1" />
      <path d="M100 168 v14 M91 175 l9 9 9-9" fill="none" stroke="#C6E5D1" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark({ light = false, withSlogan = true }: { light?: boolean; withSlogan?: boolean }) {
  const { t } = useI18n()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, lineHeight: 1.1 }}>
      <Mark />
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.15rem', color: light ? '#fff' : 'var(--ink-2)' }}>{t('brand')}</span>
        {withSlogan && <span className="ltr" style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.04em', color: light ? '#C6E5D1' : '#2E9E5B' }}>BUILD FOR LESS</span>}
      </span>
    </span>
  )
}
