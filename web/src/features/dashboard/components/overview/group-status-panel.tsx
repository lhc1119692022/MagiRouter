import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { usePublicMonitoring } from '@/features/dashboard/hooks/use-public-monitoring'
import {
  measuredAvailability,
  monitorHealth,
} from '@/features/dashboard/lib/public-monitoring'
import type { UptimeGroupResult } from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import '@/styles/overview-publication.css'

function GroupStatusRow({ group }: { group: UptimeGroupResult }) {
  const { i18n, t } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const health = monitorHealth(group.monitors)
  const availability = group.monitors
    .map(measuredAvailability)
    .filter((value): value is number => value !== undefined)
  const latencies = group.monitors
    .map((monitor) => monitor.latencyMs)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0
    )
  const count = group.monitors.length
  let metrics = '—'
  if (availability.length) {
    const pct =
      availability.reduce((total, value) => total + value, 0) /
      availability.length
    metrics = Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(pct)
  }
  if (latencies.length) {
    const latency =
      latencies.reduce((total, value) => total + value, 0) / latencies.length
    metrics += ` · ${formatNumber(Math.round(latency), locale)} ${t('ms')}`
  }
  return (
    <Link
      className='dash-gs-row'
      to='/channel-status'
      search={{ group: group.categoryName }}
    >
      <span className='dash-gs-head'>
        <span>{group.categoryName}</span>
        <span className='dash-gs-ratio'>
          {t('Monitors: {{count}}', { count })}
        </span>
      </span>
      <span className='dash-gs-right'>
        <span className='dash-gs-status' data-tone={health.tone}>
          <span aria-hidden='true' className='dash-gs-dot' />
          {t(health.label)}
        </span>
        <span
          className='dash-gs-metrics tabular-nums'
          title={t(
            'Average 24h availability and latest latency of measured monitors'
          )}
        >
          {metrics}
        </span>
      </span>
    </Link>
  )
}

export function GroupStatusPanel() {
  const { t } = useTranslation()
  const { enabled, query } = usePublicMonitoring()
  if (!enabled) return null
  return (
    <section
      className='dash-panel overview-group-status'
      aria-label={t('Group status')}
    >
      <div className='dash-panel-head'>
        <h2 className='dash-panel-title'>{t('Group status')}</h2>
        <Link to='/channel-status' className='dash-panel-link'>
          {t('Channel status')} <span aria-hidden='true'>→</span>
        </Link>
      </div>
      {query.isPending && (
        <p role='status' className='publication-state'>
          {t('Loading...')}
        </p>
      )}
      {query.isError && (
        <p role='alert' className='publication-state'>
          {t('Failed to load')}{' '}
          <Button size='sm' variant='link' onClick={() => void query.refetch()}>
            {t('Retry')}
          </Button>
        </p>
      )}
      {query.isSuccess &&
        (query.data.length ? (
          <div className='dash-group-status-list'>
            {query.data.map((group) => (
              <GroupStatusRow key={group.categoryName} group={group} />
            ))}
          </div>
        ) : (
          <p className='publication-state'>
            {t('No uptime monitoring configured')}
          </p>
        ))}
    </section>
  )
}
