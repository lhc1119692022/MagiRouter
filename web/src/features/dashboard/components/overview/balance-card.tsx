import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { formatQuota } from '@/lib/format'

interface BalanceCardProps {
  balance?: number
  usage?: number
  loading: boolean
}

export function BalanceCard(props: BalanceCardProps) {
  const { t } = useTranslation()
  const heading = useId()
  let badge: { label: string; tone: string } | undefined
  if (props.balance !== undefined && props.balance <= 0) {
    badge = { label: t('Insufficient balance'), tone: 'is-critical' }
  } else if (props.balance !== undefined && props.usage !== undefined) {
    const days = props.usage > 0 ? props.balance / props.usage : Infinity
    badge =
      days < 3
        ? { label: t('Consider topping up'), tone: 'is-caution' }
        : { label: t('Sufficient balance'), tone: '' }
  }

  return (
    <section className='dash-balance-card' aria-labelledby={heading}>
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
      <div className='dash-balance-body'>
        <div className='dash-balance-metrics'>
          <div className='dash-balance-amount tabular-nums'>
            {props.balance === undefined ? '—' : formatQuota(props.balance)}
          </div>
          <div className='dash-balance-usage'>
            <span className='dash-balance-usage-label'>
              {t('Last 24h usage')}
            </span>
            <span className='dash-balance-usage-val tabular-nums'>
              {props.usage === undefined
                ? t(props.loading ? 'Loading...' : 'Not available')
                : formatQuota(props.usage)}
            </span>
          </div>
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
      </div>
    </section>
  )
}
