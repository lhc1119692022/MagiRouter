import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  useGroupChannelStatus,
  usePublicMonitoring,
} from '@/features/dashboard/hooks/use-public-monitoring'
import {
  measuredAvailability,
  monitorHealth,
} from '@/features/dashboard/lib/public-monitoring'
import type {
  GroupChannelHealthStatus,
  GroupChannelStatusItem,
  UptimeGroupResult,
} from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import '@/styles/overview-publication.css'

function realGroupHealthMeta(status: GroupChannelHealthStatus): {
  label: string
  tone: string
} {
  switch (status) {
    case 'operational':
      return { label: 'Operational', tone: 'healthy' }
    case 'degraded':
      return { label: 'Degraded', tone: 'warning' }
    case 'outage':
      return { label: 'Outage', tone: 'error' }
    default:
      return { label: 'Awaiting data', tone: 'unknown' }
  }
}

function RealGroupStatusRow({ item }: { item: GroupChannelStatusItem }) {
  const { i18n, t } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const health = realGroupHealthMeta(item.status)
  const ratioLabel = item.is_auto
    ? t('Auto')
    : `${Number(item.ratio.toFixed(2))}x`
  let metrics = '—'
  if (item.request_count > 0) {
    metrics = `${item.success_rate.toFixed(2)}%`
    if (!item.media_only && item.avg_ttft_ms > 0) {
      metrics += ` · ${t('TTFT')} ${formatNumber(Math.round(item.avg_ttft_ms), locale)} ${t('ms')}`
    } else if (item.avg_latency_ms > 0) {
      metrics += ` · ${formatNumber(Math.round(item.avg_latency_ms), locale)} ${t('ms')}`
    }
  } else if (item.recent_probe) {
    const probeLatencyMs =
      item.recent_probe.median_latency_ms &&
      item.recent_probe.median_latency_ms > 0
        ? item.recent_probe.median_latency_ms
        : item.recent_probe.latency_ms
    metrics = `${item.recent_probe.recent_success_rate.toFixed(1)}% · ${t('Probe')} ${formatNumber(Math.round(probeLatencyMs), locale)} ${t('ms')}`
  }
  return (
    <Link
      className='dash-gs-row'
      to='/channel-status'
      search={{ group: item.group }}
    >
      <span className='dash-gs-head'>
        <span>{item.group}</span>
        <span className='dash-gs-ratio'>{ratioLabel}</span>
      </span>
      <span className='dash-gs-right'>
        <span className='dash-gs-status' data-tone={health.tone}>
          <span aria-hidden='true' className='dash-gs-dot' />
          {t(health.label)}
        </span>
        <span className='dash-gs-metrics tabular-nums'>{metrics}</span>
      </span>
    </Link>
  )
}

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
  const realStatus = useGroupChannelStatus(24)
  if (!enabled) return null
  const realGroups = realStatus.query.data?.groups ?? []
  const uptimeGroups = query.data ?? []
  const isPending =
    (query.isPending && realStatus.query.isPending) ||
    (!realGroups.length && !uptimeGroups.length && (query.isPending || realStatus.query.isPending))
  const isError = query.isError && realStatus.query.isError
  const hasAny = realGroups.length > 0 || uptimeGroups.length > 0
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
      {isPending && (
        <p role='status' className='publication-state'>
          {t('Loading...')}
        </p>
      )}
      {isError && (
        <p role='alert' className='publication-state'>
          {t('Failed to load')}{' '}
          <Button
            size='sm'
            variant='link'
            onClick={() => {
              void query.refetch()
              void realStatus.query.refetch()
            }}
          >
            {t('Retry')}
          </Button>
        </p>
      )}
      {!isPending &&
        !isError &&
        (hasAny ? (
          <div className='dash-group-status-list'>
            {realGroups.slice(0, 6).map((item) => (
              <RealGroupStatusRow key={`real-${item.group}`} item={item} />
            ))}
            {uptimeGroups.map((group) => (
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
