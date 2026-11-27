import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  Gauge,
  RefreshCw,
  UserCheck,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  StatCard,
  type StatCardDetail,
} from '@/features/dashboard/components/ui/stat-card'
import {
  formatCacheHitRate,
  formatLatency,
  formatThroughputDisplay,
  formatUptimePct,
} from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import { getSiteOverview } from './api'
import { SiteOverviewCharts } from './components/site-overview-charts'
import { SiteOverviewHealthRow } from './components/site-overview-health-row'
import { SiteOverviewTables } from './components/site-overview-tables'
import {
  formatDeltaPercent,
  formatOneDecimal,
  formatOverviewMoney,
  formatRateDeltaPoints,
  formatSignedInt,
} from './lib/format'
import type { SiteOverviewRange } from './types'

const RANGE_OPTIONS: { value: SiteOverviewRange; labelKey: string }[] = [
  { value: '24h', labelKey: '24h' },
  { value: '7d', labelKey: '7d' },
  { value: '30d', labelKey: '30d' },
  { value: '90d', labelKey: '90d' },
]

function changeTone(
  delta: number | null | undefined,
  invert = false
): StatCardDetail['tone'] {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return 'muted'
  const favorable = invert ? delta < 0 : delta > 0
  return favorable ? 'success' : 'warning'
}

export function SiteOverview() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const [range, setRange] = useState<SiteOverviewRange>('7d')
  const [excludeAdminsOverride, setExcludeAdminsOverride] = useState<
    boolean | null
  >(null)

  const overviewQuery = useQuery({
    queryKey: ['site-overview', range, excludeAdminsOverride],
    queryFn: () =>
      getSiteOverview({
        range,
        ...(excludeAdminsOverride !== null
          ? { exclude_admins: excludeAdminsOverride }
          : {}),
      }),
  })

  const report = overviewQuery.data
  const meta = report?.meta
  const usage = report?.usage
  const perf = report?.performance
  const users = report?.users
  const channels = report?.channels
  const symbol = meta?.currency.symbol || '$'

  const effectiveExcludeAdmins =
    excludeAdminsOverride ?? meta?.exclude_admin_users ?? false

  const requestsSparkline = useMemo(
    () => (report?.trend ?? []).map((item) => item.requests),
    [report?.trend]
  )
  const latencySparkline = useMemo(
    () => (report?.trend ?? []).map((item) => item.avg_latency_ms),
    [report?.trend]
  )
  const activeUsersSparkline = useMemo(
    () => (report?.trend ?? []).map((item) => item.active_users),
    [report?.trend]
  )
  const cumulativeUsersSparkline = useMemo(
    () => (report?.trend ?? []).map((item) => item.cumulative_users),
    [report?.trend]
  )

  const reqDeltaText = formatDeltaPercent(usage?.requests_change_pct, locale)
  const quotaDeltaText = formatDeltaPercent(usage?.quota_change_pct, locale)
  const latencyDeltaText = formatDeltaPercent(perf?.latency_change_pct, locale)
  const rateDeltaText = formatRateDeltaPoints(perf?.success_rate_delta, locale)
  const activeDeltaText = formatDeltaPercent(
    users?.active_users_change_pct,
    locale
  )
  const newUsersDeltaText = formatDeltaPercent(
    users?.new_users_change_pct,
    locale
  )

  const usageDetails: StatCardDetail[] = usage
    ? [
        {
          label: t('Billed consumption'),
          value: quotaDeltaText
            ? `${formatOverviewMoney(usage.billed_local, symbol, locale)} (${quotaDeltaText})`
            : formatOverviewMoney(usage.billed_local, symbol, locale),
        },
        {
          label: t('Tokens'),
          value: formatCompactNumber(usage.total_tokens, locale),
        },
        {
          label: t('Avg RPM / Cache'),
          value: `${formatOneDecimal(usage.avg_rpm, locale)} / ${formatCacheHitRate(usage.cache_hit_rate)}`,
          tone: 'muted',
        },
      ]
    : []

  const perfDetails: StatCardDetail[] = perf?.has_data
    ? [
        {
          label: t('Avg latency'),
          value: latencyDeltaText
            ? `${formatLatency(perf.avg_latency_ms)} (${latencyDeltaText})`
            : formatLatency(perf.avg_latency_ms),
          tone: changeTone(perf.latency_change_pct, true),
        },
        {
          label: t('Avg TTFT / TPS'),
          value: `${formatLatency(perf.avg_ttft_ms)} / ${formatThroughputDisplay(
            perf.avg_tps,
            {
              insufficient: perf.tps_insufficient,
              insufficientLabel: t('Low sample'),
            }
          )}`,
        },
        {
          label: t('Failed requests'),
          value: formatNumber(perf.failed_requests, locale),
          tone: perf.failed_requests > 0 ? 'warning' : 'success',
        },
      ]
    : [
        {
          label: t('Telemetry'),
          value: t('No samples in this period'),
          tone: 'muted',
        },
      ]

  const activeDetails: StatCardDetail[] = users
    ? [
        {
          label: 'DAU / WAU / MAU',
          value: `${formatNumber(users.dau, locale)} / ${formatNumber(users.wau, locale)} / ${formatNumber(users.mau, locale)}`,
        },
        {
          label: t('Active rate'),
          value: `${formatOneDecimal(users.active_rate, locale)}%`,
          tone: changeTone(users.active_users_change_pct),
        },
        {
          label: t('Paying / Logged in'),
          value: `${formatNumber(users.paying_users, locale)} / ${formatNumber(users.login_active_users, locale)}`,
          tone: 'muted',
        },
      ]
    : []

  let netChangeTone: StatCardDetail['tone'] = 'muted'
  if (users && users.net_user_change > 0) {
    netChangeTone = 'success'
  } else if (users && users.net_user_change < 0) {
    netChangeTone = 'destructive'
  }

  const userGrowthDetails: StatCardDetail[] = users
    ? [
        {
          label: t('New in period'),
          value: newUsersDeltaText
            ? `+${formatNumber(users.new_users, locale)} (${newUsersDeltaText})`
            : `+${formatNumber(users.new_users, locale)}`,
          tone: users.new_users > 0 ? 'success' : 'muted',
        },
        {
          label: t('Net change / Today'),
          value: `${formatSignedInt(users.net_user_change, locale)} / +${formatNumber(users.today_new_users, locale)}`,
          tone: netChangeTone,
        },
        {
          label: t('Enabled / Disabled'),
          value: `${formatNumber(users.enabled_users, locale)} / ${formatNumber(users.disabled_users, locale)}`,
          tone: 'muted',
        },
      ]
    : []

  const adminBadgeText = meta?.exclude_admin_users
    ? t('Admins excluded ({{count}})', { count: meta.excluded_admin_count })
    : t('All users included')

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <div className='flex flex-wrap items-center gap-2'>
          <span>{t('Site Overview')}</span>
          {meta && (
            <Badge
              variant={meta.exclude_admin_users ? 'secondary' : 'outline'}
              className='font-normal'
            >
              {adminBadgeText}
            </Badge>
          )}
        </div>
      </SectionPageLayout.Title>

      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='bg-muted/60 inline-flex h-8 items-center gap-2 rounded-md border px-2.5'>
            <Switch
              id='site-overview-exclude-admins'
              checked={effectiveExcludeAdmins}
              onCheckedChange={(checked) => setExcludeAdminsOverride(checked)}
            />
            <Label
              htmlFor='site-overview-exclude-admins'
              className='cursor-pointer text-xs font-normal whitespace-nowrap'
            >
              {t('Exclude admins')}
            </Label>
          </div>
          <div className='bg-muted/60 inline-flex items-center rounded-md border p-0.5'>
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type='button'
                size='sm'
                variant={range === option.value ? 'secondary' : 'ghost'}
                className='h-7 px-2.5 text-xs'
                onClick={() => setRange(option.value)}
              >
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => void overviewQuery.refetch()}
            disabled={overviewQuery.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${overviewQuery.isFetching ? 'animate-spin' : ''}`}
            />
            {t('Refresh')}
          </Button>
        </div>
      </SectionPageLayout.Actions>

      <SectionPageLayout.Content>
        {overviewQuery.isError ? (
          <ErrorState
            title={t('Failed to load site overview')}
            onRetry={() => void overviewQuery.refetch()}
          />
        ) : (
          <div className='space-y-5'>
            {channels && channels.auto_disabled > 0 && (
              <Alert className='border-amber-500/40 bg-amber-500/5'>
                <AlertTriangle className='text-amber-600 dark:text-amber-400' />
                <AlertTitle className='flex flex-wrap items-center justify-between gap-2'>
                  <span>
                    {t('{{count}} channel(s) auto-disabled', {
                      count: channels.auto_disabled,
                    })}
                  </span>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='border-amber-500/40 hover:bg-amber-500/10'
                    render={<Link to='/channels' />}
                  >
                    {t('Inspect channels')}
                  </Button>
                </AlertTitle>
                <AlertDescription>
                  {t(
                    '{{enabled}} of {{total}} channels are currently active. Review auto-disabled channels to keep routing healthy.',
                    {
                      enabled: formatNumber(channels.enabled, locale),
                      total: formatNumber(channels.total, locale),
                    }
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard
                title={t('Requests & Consumption')}
                value={
                  usage
                    ? formatCompactNumber(usage.total_requests, locale)
                    : '—'
                }
                description={
                  reqDeltaText
                    ? t('{{delta}} vs previous period', {
                        delta: reqDeltaText,
                      })
                    : t('Site-wide gateway requests')
                }
                icon={Activity}
                tone='accent-1'
                sparkline={requestsSparkline}
                sparklineVariant='bars'
                details={usageDetails}
                loading={overviewQuery.isLoading}
              />
              <StatCard
                title={t('Performance & Latency')}
                value={
                  perf?.has_data ? formatUptimePct(perf.success_rate) : '—'
                }
                description={
                  rateDeltaText
                    ? t('Success rate ({{delta}} vs prev)', {
                        delta: rateDeltaText,
                      })
                    : t('Gateway success rate & response time')
                }
                icon={Gauge}
                tone='accent-2'
                sparkline={latencySparkline}
                sparklineVariant='line'
                details={perfDetails}
                loading={overviewQuery.isLoading}
              />
              <StatCard
                title={t('Active Users')}
                value={users ? formatNumber(users.active_users, locale) : '—'}
                description={
                  activeDeltaText
                    ? t('{{delta}} vs previous period', {
                        delta: activeDeltaText,
                      })
                    : t('Users with API usage in period')
                }
                icon={UserCheck}
                tone='accent-3'
                sparkline={activeUsersSparkline}
                sparklineVariant='line'
                details={activeDetails}
                loading={overviewQuery.isLoading}
              />
              <StatCard
                title={t('Total Users & Changes')}
                value={users ? formatNumber(users.total_users, locale) : '—'}
                description={
                  users
                    ? t('Period net {{net}} (deleted {{deleted}})', {
                        net: formatSignedInt(users.net_user_change, locale),
                        deleted: formatNumber(users.deleted_users, locale),
                      })
                    : t('Registered non-deleted accounts')
                }
                icon={Users}
                tone='accent-1'
                sparkline={cumulativeUsersSparkline}
                sparklineVariant='line'
                details={userGrowthDetails}
                loading={overviewQuery.isLoading}
              />
            </div>

            {report && (
              <>
                <SiteOverviewCharts
                  trend={report.trend}
                  bucketUnit={report.meta.bucket_unit}
                  currencySymbol={symbol}
                />
                <SiteOverviewHealthRow
                  users={report.users}
                  channels={report.channels}
                  runtime={report.runtime}
                  currencySymbol={symbol}
                />
                <SiteOverviewTables
                  topModels={report.top_models}
                  perfAlerts={report.perf_alerts}
                  groups={report.groups}
                  topUsers={report.top_users}
                  currencySymbol={symbol}
                />
              </>
            )}
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
