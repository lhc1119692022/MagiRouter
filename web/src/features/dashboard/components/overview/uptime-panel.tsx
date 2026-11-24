import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { usePublicMonitoring } from '@/features/dashboard/hooks/use-public-monitoring'
import {
  measuredAvailability,
  monitorHealth,
} from '@/features/dashboard/lib/public-monitoring'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import '@/styles/overview-publication.css'

export function UptimePanel(props: { group?: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { enabled, query, publication } = usePublicMonitoring()
  const groups = (query.data ?? []).filter(
    (group) => !props.group || group.categoryName === props.group
  )
  if (!enabled) {
    let message = t('Monitoring is not published.')
    if (publication.loading) message = t('Loading...')
    if (publication.error) message = t('Failed to load')
    return <p className='dash-panel publication-state'>{message}</p>
  }
  return (
    <section
      className='dash-panel monitor-details'
      aria-label={t('Group status')}
    >
      <div className='dash-panel-head'>
        <h2 className='dash-panel-title'>{props.group || t('Group status')}</h2>
        <div className='flex flex-wrap items-center gap-2'>
          {props.group && (
            <Link to='/channel-status' search={{}} className='dash-panel-link'>
              {t('Show all groups')}
            </Link>
          )}
          <Button
            size='sm'
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('Refresh')}
          </Button>
        </div>
      </div>
      {query.isPending && (
        <p role='status' className='publication-state'>
          {t('Loading...')}
        </p>
      )}
      {query.isError && (
        <p role='alert' className='publication-state'>
          {t('Failed to load')}
        </p>
      )}
      {query.isSuccess && !groups.length && (
        <p className='publication-state'>
          {props.group
            ? t('This group is no longer published.')
            : t('No uptime monitoring configured')}
        </p>
      )}
      {query.isSuccess &&
        groups.map((group) => (
          <section
            key={group.categoryName}
            aria-label={group.categoryName}
            className='monitor-group'
          >
            {!props.group && (
              <h3 className='dash-panel-title'>{group.categoryName}</h3>
            )}
            {!group.monitors.length && (
              <p className='publication-state'>{t('Awaiting data')}</p>
            )}
            {group.monitors.map((monitor) => {
              const health = monitorHealth([monitor])
              const uptime = measuredAvailability(monitor)
              return (
                <div
                  className='dash-gs-row'
                  key={`${monitor.group}-${monitor.name}`}
                >
                  <span className='dash-gs-head'>
                    <span>{monitor.name}</span>
                    {monitor.group && (
                      <span className='dash-gs-ratio'>{monitor.group}</span>
                    )}
                  </span>
                  <span className='dash-gs-right'>
                    <span className='dash-gs-status' data-tone={health.tone}>
                      <span aria-hidden='true' className='dash-gs-dot' />
                      {t(health.label)}
                    </span>
                    <span className='dash-gs-metrics tabular-nums'>
                      {uptime === undefined
                        ? '—'
                        : Intl.NumberFormat(locale, {
                            style: 'percent',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(uptime)}
                      {typeof monitor.latencyMs === 'number' &&
                        ` · ${formatNumber(monitor.latencyMs, locale)} ${t('ms')}`}
                    </span>
                  </span>
                </div>
              )
            })}
          </section>
        ))}
    </section>
  )
}
