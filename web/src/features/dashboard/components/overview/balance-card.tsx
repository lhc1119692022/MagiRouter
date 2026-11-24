import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatQuota } from '@/lib/format'

interface BalanceCardProps {
  balance?: number
  usage?: number
  loading: boolean
}

export function BalanceCard(props: BalanceCardProps) {
  const { t, i18n } = useTranslation()
  const heading = useId()
  let badge: { label: string; tone: string } | undefined
  let estimate: string | undefined
  if (props.balance !== undefined && props.balance <= 0) {
    badge = { label: t('Insufficient balance'), tone: 'is-critical' }
    estimate = t('Balance depleted')
  } else if (props.balance !== undefined && props.usage !== undefined) {
    const days = props.usage > 0 ? props.balance / props.usage : Infinity
    badge =
      days < 3
        ? { label: t('Consider topping up'), tone: 'is-caution' }
        : { label: t('Sufficient balance'), tone: '' }
    if (props.usage <= 0) estimate = t('No recent usage')
    else if (days < 1) estimate = t('Less than 1 day left')
    else if (days > 999) estimate = `999+ ${t('days')}`
    else {
      const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
      estimate = `~${new Intl.NumberFormat(locale, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(Math.floor(days))}`
    }
  }

  return (
    <section className='dash-balance-card' aria-labelledby={heading}>
      <div>
        <div className='dash-balance-head'>
          <h2 id={heading} className='dash-kpi-label'>
            {t('Available Balance')}
          </h2>
          {badge && (
            <span className={`dash-health-badge ${badge.tone}`}>
              <span className='dash-health-dot' aria-hidden='true' />
              {badge.label}
            </span>
          )}
        </div>
        <div className='dash-balance-amount tabular-nums'>
          {props.balance === undefined ? '—' : formatQuota(props.balance)}
        </div>
        <p className='dash-balance-runway'>
          <span>
            {t('Last 24h usage')}{' '}
            <span>
              {props.usage === undefined
                ? t(props.loading ? 'Loading...' : 'Not available')
                : formatQuota(props.usage)}
            </span>
          </span>
          {estimate && (
            <span>
              <span aria-hidden='true'>· </span>
              {t('Runway')} <span>{estimate}</span>
            </span>
          )}
        </p>
      </div>
      <div className='dash-balance-actions'>
        <Link to='/wallet' className='el-btn el-btn-sm el-btn-primary'>
          {t('Top up balance')}
        </Link>
        <Link
          to='/keys'
          search={{ action: 'create' }}
          className='el-btn el-btn-sm el-btn-white'
        >
          <span aria-hidden='true'>+</span>
          {t('Create key')}
        </Link>
      </div>
    </section>
  )
}
