import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table } from '@/components/ui/table'
import { getUserQuotaDates } from '@/features/dashboard/api'
import {
  DASHBOARD_CHART_PREFERENCES_STORAGE_KEY,
  TIME_GRANULARITY_STORAGE_KEY,
} from '@/features/dashboard/constants'
import {
  buildDefaultDashboardFilters,
  buildQueryParams,
  calculateDashboardStats,
  getSavedChartPreferences,
  saveChartPreferences,
} from '@/features/dashboard/lib'
import type {
  DashboardFilters,
  QuotaDataItem,
} from '@/features/dashboard/types'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange, getRollingDateRange } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

import { ModelAnalyticsTrend } from './model-analytics-trend'
import { ModelsChartPreferences } from './models-chart-preferences'
import { ModelsFilter } from './models-filter-dialog'

import './model-analytics.css'

const ModelCharts = lazy(() =>
  import('./model-charts').then((module) => ({ default: module.ModelCharts }))
)
const ConsumptionDistribution = lazy(() =>
  import('./consumption-distribution-chart').then((module) => ({
    default: module.ConsumptionDistributionChart,
  }))
)
const PerformanceOverview = lazy(() =>
  import('./performance-overview').then((module) => ({
    default: module.PerformanceOverview,
  }))
)
const presets = [
  { days: 1, label: 'Today (report)' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 0, label: 'All' },
] as const
const emptyRows: QuotaDataItem[] = []

export default function ModelAnalytics() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = (user?.role ?? ROLE.GUEST) >= ROLE.ADMIN
  const { status } = useStatus()
  const [preferences, setPreferences] = useState(() => {
    const saved = getSavedChartPreferences()
    return localStorage.getItem(DASHBOARD_CHART_PREFERENCES_STORAGE_KEY) ||
      localStorage.getItem(TIME_GRANULARITY_STORAGE_KEY)
      ? saved
      : {
          ...saved,
          defaultTimeRangeDays: 7,
          defaultTimeGranularity: 'day' as const,
        }
  })
  const [filters, setFilters] = useState(() =>
    buildDefaultDashboardFilters(preferences)
  )
  const [allTime, setAllTime] = useState(false)
  const [model, setModel] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const window = useMemo(
    () =>
      computeTimeRange(
        preferences.defaultTimeRangeDays,
        filters.start_timestamp,
        filters.end_timestamp
      ),
    [filters, preferences.defaultTimeRangeDays]
  )
  const queryParams = buildQueryParams(
    { ...window, start_timestamp: allTime ? 0 : window.start_timestamp },
    filters
  )
  const query = useQuery({
    queryKey: ['dashboard', 'model-analytics', user?.id, isAdmin, queryParams],
    queryFn: async () =>
      requireServerSuccess(await getUserQuotaDates(queryParams, isAdmin))
        .data ?? emptyRows,
    staleTime: 60_000,
  })
  const rows = query.data ?? emptyRows
  const byModel = useMemo(() => {
    const groups = new Map<string, QuotaDataItem[]>()
    for (const row of rows) {
      const name = row.model_name ?? ''
      const group = groups.get(name)
      if (group) group.push(row)
      else groups.set(name, [row])
    }
    return Array.from(groups, ([name, entries]) => ({
      name,
      ...calculateDashboardStats(entries),
    })).sort(
      (left, right) =>
        right.totalQuota - left.totalQuota ||
        right.totalCount - left.totalCount ||
        left.name.localeCompare(right.name)
    )
  }, [rows])
  if (
    query.isSuccess &&
    model &&
    !byModel.some((item) => item.name === model)
  ) {
    setModel('')
  }
  const filtered = useMemo(
    () => (model ? rows.filter((row) => row.model_name === model) : rows),
    [model, rows]
  )
  const totals = useMemo(() => calculateDashboardStats(filtered), [filtered])
  const models = model ? byModel.filter((item) => item.name === model) : byModel
  const reportStart = useMemo(() => {
    if (!allTime) return window.start_timestamp
    if (!isAdmin && status?.log_max_range_days) {
      return window.end_timestamp - status.log_max_range_days * 86400
    }
    return rows.reduce(
      (first, row) => Math.min(first, row.created_at),
      window.end_timestamp
    )
  }, [allTime, isAdmin, rows, status?.log_max_range_days, window])
  const minutes = Math.max(1, (window.end_timestamp - reportStart) / 60)
  const selectedDays = (window.end_timestamp - window.start_timestamp) / 86400
  const granularity = filters.time_granularity ?? 'day'
  const stats = [
    ['Total requests made', formatNumber(totals.totalCount, locale)],
    ['Total consumed quota', formatQuota(totals.totalQuota)],
    ['Total Tokens', formatCompactNumber(totals.totalTokens, locale)],
    [
      'Cache hit rate',
      Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(
        totals.totalTokens
          ? totals.totalCacheReadTokens / totals.totalTokens
          : 0
      ),
    ],
    ['Cache Read', formatCompactNumber(totals.totalCacheReadTokens, locale)],
    [
      'Cache Write',
      formatCompactNumber(totals.totalCacheCreationTokens, locale),
    ],
    [
      'Average RPM',
      (totals.totalCount / minutes).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ],
    ['Average TPM', formatCompactNumber(totals.totalTokens / minutes, locale)],
  ]
  const applyFilters = (next: DashboardFilters) => {
    setAllTime(false)
    setFilters(next)
  }
  const choosePreset = (days: number) => {
    const { start, end } = getRollingDateRange(
      days || status?.log_max_range_days || 1
    )
    let nextGranularity: DashboardFilters['time_granularity'] = 'day'
    if (days === 1) {
      start.setTime(new Date(end).setHours(0, 0, 0, 0))
      nextGranularity = 'hour'
    } else if (days === 0) {
      nextGranularity = 'week'
    }
    applyFilters({
      ...filters,
      start_timestamp: start,
      end_timestamp: end,
      time_granularity: nextGranularity,
    })
    if (!days) setAllTime(true)
  }
  const startDate = new Date(reportStart * 1000)
  const endDate = new Date(window.end_timestamp * 1000)
  const today =
    !allTime && startDate.getTime() === new Date(endDate).setHours(0, 0, 0, 0)
  let selectedPreset = selectedDays === 1 ? null : selectedDays
  let chartStep = 1
  let groupedBy = {
    hour: 'Hourly buckets',
    day: 'Daily buckets',
    week: 'Weekly buckets',
  }[granularity]
  if (allTime) {
    selectedPreset = 0
    groupedBy = 'Monthly buckets'
  } else if (today) {
    selectedPreset = 1
    if (granularity === 'hour') {
      chartStep = 2
      groupedBy = 'Two-hour buckets'
    }
  } else if (selectedDays === 30 && granularity === 'day') {
    chartStep = 3
    groupedBy = 'Three-day buckets'
  }
  const tools = (
    <div className='analytics-tools'>
      <ModelsChartPreferences
        preferences={preferences}
        onPreferencesChange={(next) => {
          setPreferences(next)
          saveChartPreferences(next)
          applyFilters(buildDefaultDashboardFilters(next))
        }}
      />
      <ModelsFilter
        preferences={preferences}
        currentFilters={
          allTime ? { ...filters, start_timestamp: startDate } : filters
        }
        onFilterChange={applyFilters}
        onReset={() => applyFilters(buildDefaultDashboardFilters(preferences))}
      />
      <Link to='/dashboard/$section' params={{ section: 'flow' }}>
        {t('Flow')}
      </Link>
      {isAdmin && (
        <Link to='/dashboard/$section' params={{ section: 'users' }}>
          {t('User Analytics')}
        </Link>
      )}
    </div>
  )

  return (
    <div className='model-analytics'>
      <div className='analytics-toolbar'>
        <div className='analytics-filter-left'>
          <div
            className='console-subtabs'
            role='group'
            aria-label={t('Time range')}
          >
            {presets.map(({ days, label }) => {
              const active = days === selectedPreset
              return (
                <button
                  type='button'
                  key={days}
                  className={`console-subtab-btn${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => choosePreset(days)}
                >
                  {t(label)}
                </button>
              )
            })}
          </div>
          <span
            className='analytics-granularity'
            title={`${startDate.toLocaleString(locale)} – ${endDate.toLocaleString(locale)}`}
          >
            {t(groupedBy)}
            {allTime &&
              ` · ${startDate.toLocaleDateString(locale)} – ${endDate.toLocaleDateString(locale)}`}
          </span>
        </div>
        <Select
          value={model}
          onValueChange={(next, event) => {
            if (event.reason === 'none') {
              event.cancel()
              return
            }
            setModel(next ?? '')
          }}
        >
          <SelectTrigger
            className='analytics-model-select el-select-trigger'
            aria-label={t('Model')}
          >
            <SelectValue>{model || t('All models in report')}</SelectValue>
          </SelectTrigger>
          <SelectContent align='end' alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value=''>
                <span>{t('All models in report')}</span>
                <small className='analytics-option-meta'>
                  {t('{{count}} models', { count: byModel.length })}
                </small>
              </SelectItem>
              {byModel
                .filter((item) => item.name)
                .map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    <span className='truncate'>{item.name}</span>
                    <small className='analytics-option-meta'>
                      {formatQuota(item.totalQuota)}
                    </small>
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {query.isPending && (
        <div role='status' className='dash-panel analytics-message'>
          {t('Loading...')}
        </div>
      )}
      {query.isError && (
        <div role='alert' className='dash-panel analytics-message'>
          {t('Failed to load')}{' '}
          <Button
            variant='outline'
            size='sm'
            onClick={() => void query.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <>
          <dl
            className='analytics-stat-strip'
            role='group'
            aria-label={t('Model Call Analytics')}
          >
            {stats.map(([key, value]) => (
              <div key={key} className='analytics-stat-cell'>
                <dt>{t(key)}</dt>
                <dd className='tabular-nums'>{value}</dd>
              </div>
            ))}
          </dl>
          <div className='analytics-stack'>
            <ModelAnalyticsTrend
              rows={filtered}
              start={reportStart}
              end={window.end_timestamp}
              granularity={allTime ? 'month' : granularity}
              step={chartStep}
            />
            <section className='dash-panel analytics-model-table'>
              <div className='dash-panel-head'>
                <h2 className='dash-panel-title'>{t('Model usage details')}</h2>
                <span className='console-head-meta'>
                  {t('{{count}} models', { count: models.length })} ·{' '}
                  {t('Total')} {formatQuota(totals.totalQuota)}
                </span>
              </div>
              <Table
                className='keys-table'
                aria-label={t('Model usage details')}
              >
                <thead>
                  <tr>
                    {[
                      t('Model'),
                      t('Requests'),
                      t('Total Tokens'),
                      `${t('Cache Read')} / ${t('Cache Write')}`,
                      t('Used Quota'),
                      t('Share'),
                    ].map((label) => (
                      <th key={label} scope='col'>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.map((item) => {
                    const share = totals.totalQuota
                      ? (100 * item.totalQuota) / totals.totalQuota
                      : 0
                    return (
                      <tr key={item.name}>
                        <td>
                          {item.name ? (
                            <Link
                              className='dash-model-share-btn'
                              to='/pricing/$modelId'
                              params={{ modelId: item.name }}
                            >
                              {item.name}
                            </Link>
                          ) : (
                            t('Unknown')
                          )}
                        </td>
                        <td>{formatNumber(item.totalCount, locale)}</td>
                        <td>{formatCompactNumber(item.totalTokens, locale)}</td>
                        <td>
                          {item.totalCacheReadTokens ||
                          item.totalCacheCreationTokens
                            ? `${formatCompactNumber(item.totalCacheReadTokens, locale)} / ${formatCompactNumber(item.totalCacheCreationTokens, locale)}`
                            : '—'}
                        </td>
                        <td>{formatQuota(item.totalQuota)}</td>
                        <td>
                          <div className='analytics-share'>
                            <div
                              className='dash-share-track'
                              aria-hidden='true'
                            >
                              <div
                                className='dash-share-fill'
                                style={{
                                  width: `${Math.min(100, Math.max(0, share))}%`,
                                }}
                              />
                            </div>
                            <span className='dash-share-val'>
                              {share.toLocaleString(locale, {
                                maximumFractionDigits: 1,
                              })}
                              %
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!models.length && (
                    <tr>
                      <td colSpan={6} className='analytics-message'>
                        {t('No data available')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </section>
          </div>
        </>
      )}
      <section className='dash-panel analytics-extra'>
        <div className='dash-panel-head'>
          <h2 className='dash-panel-title'>{t('More tools')}</h2>
          {tools}
        </div>
        <details
          open={advanced}
          onToggle={(event) => setAdvanced(event.currentTarget.open)}
        >
          <summary>{t('Additional charts')}</summary>
          {advanced && (
            <div className='analytics-stack'>
              <Suspense fallback={<div role='status'>{t('Loading...')}</div>}>
                {isAdmin && <PerformanceOverview />}
                {query.isSuccess && (
                  <>
                    <ConsumptionDistribution
                      data={filtered}
                      timeGranularity={granularity}
                      defaultChartType={
                        preferences.consumptionDistributionChart
                      }
                    />
                    <ModelCharts
                      data={filtered}
                      timeGranularity={granularity}
                      defaultChartTab={preferences.modelAnalyticsChart}
                    />
                  </>
                )}
              </Suspense>
            </div>
          )}
        </details>
      </section>
    </div>
  )
}
