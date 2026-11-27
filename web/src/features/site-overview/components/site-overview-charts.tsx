import { VChart } from '@visactor/react-vchart'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTheme } from '@/context/theme-provider'
import {
  formatLatency,
  formatUptimePct,
} from '@/features/performance-metrics/lib/format'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'

import { formatBucketAxisLabel, formatOverviewMoney } from '../lib/format'
import type { SiteOverviewTrendPoint } from '../types'

type TrafficChartMode = 'usage' | 'latency'
type UserChartMode = 'activity' | 'cumulative'

let themeManagerPromise: Promise<
  typeof import('@visactor/vchart').ThemeManager
> | null = null

function useVChartThemeReady() {
  const { resolvedTheme } = useTheme()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function applyTheme() {
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (mod) => mod.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      if (cancelled) return
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setReady(true)
    }
    void applyTheme()
    return () => {
      cancelled = true
    }
  }, [resolvedTheme])

  return { ready, resolvedTheme }
}

interface SiteOverviewChartsProps {
  trend: SiteOverviewTrendPoint[]
  bucketUnit: 'hour' | 'day'
  currencySymbol: string
}

export function SiteOverviewCharts(props: SiteOverviewChartsProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { ready: themeReady, resolvedTheme } = useVChartThemeReady()

  const [trafficMode, setTrafficMode] = useState<TrafficChartMode>('usage')
  const [userMode, setUserMode] = useState<UserChartMode>('activity')

  const hasUsageData = useMemo(
    () =>
      props.trend.some(
        (point) =>
          point.requests > 0 || point.billed_local > 0 || point.tokens > 0
      ),
    [props.trend]
  )

  const hasPerfData = useMemo(
    () =>
      props.trend.some(
        (point) => point.perf_requests > 0 || point.avg_latency_ms > 0
      ),
    [props.trend]
  )

  const hasUserTrendData = useMemo(
    () =>
      props.trend.some(
        (point) =>
          point.active_users > 0 ||
          point.new_users > 0 ||
          point.deleted_users > 0 ||
          point.cumulative_users > 0
      ),
    [props.trend]
  )

  const trafficSpec = useMemo(() => {
    if (trafficMode === 'usage') {
      const reqLabel = t('Requests')
      const billedLabel = t('Billed consumption')
      const barValues = props.trend.map((point) => ({
        bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
        fullLabel: point.label,
        series: reqLabel,
        value: point.requests,
      }))
      const lineValues = props.trend.map((point) => ({
        bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
        fullLabel: point.label,
        series: billedLabel,
        value: point.billed_local,
      }))
      return {
        type: 'common',
        background: 'transparent',
        padding: { top: 14, right: 12, bottom: 8, left: 8 },
        data: [
          { id: 'requests', values: barValues },
          { id: 'billed', values: lineValues },
        ],
        series: [
          {
            type: 'bar',
            id: 'requests-series',
            dataIndex: 0,
            xField: 'bucket',
            yField: 'value',
            seriesField: 'series',
            barMaxWidth: 18,
            bar: { style: { cornerRadius: [4, 4, 0, 0] } },
          },
          {
            type: 'line',
            id: 'billed-series',
            dataIndex: 1,
            xField: 'bucket',
            yField: 'value',
            seriesField: 'series',
            line: { style: { lineWidth: 2.2 } },
            point: { style: { size: 3.5 } },
          },
        ],
        color: ['#2563eb', '#10b981'],
        axes: [
          { orient: 'bottom', type: 'band', label: { autoHide: true } },
          {
            orient: 'left',
            type: 'linear',
            seriesIndex: [0],
            label: {
              formatMethod: (val: string | number) =>
                formatCompactNumber(Number(val), locale),
            },
          },
          {
            orient: 'right',
            type: 'linear',
            seriesIndex: [1],
            grid: { visible: false },
            label: {
              formatMethod: (val: string | number) =>
                `${props.currencySymbol}${formatCompactNumber(Number(val), locale)}`,
            },
          },
        ],
        legends: { visible: true, orient: 'top', position: 'start' },
        tooltip: {
          dimension: {
            title: {
              value: (datum?: Record<string, unknown>) =>
                String(datum?.fullLabel ?? datum?.bucket ?? ''),
            },
            content: [
              {
                key: (datum?: Record<string, unknown>) =>
                  String(datum?.series ?? ''),
                value: (datum?: Record<string, unknown>) => {
                  const num = Number(datum?.value ?? 0)
                  if (datum?.series === billedLabel) {
                    return formatOverviewMoney(
                      num,
                      props.currencySymbol,
                      locale
                    )
                  }
                  return formatNumber(num, locale)
                },
              },
            ],
          },
        },
      }
    }

    const latencyLabel = t('Avg latency')
    const ttftLabel = t('Avg TTFT')
    const successLabel = t('Success rate')
    const latencyValues = props.trend.flatMap((point) => [
      {
        bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
        fullLabel: point.label,
        series: latencyLabel,
        value: point.perf_requests > 0 ? point.avg_latency_ms : null,
      },
      {
        bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
        fullLabel: point.label,
        series: ttftLabel,
        value:
          point.perf_requests > 0 && point.avg_ttft_ms > 0
            ? point.avg_ttft_ms
            : null,
      },
    ])
    const successValues = props.trend.map((point) => ({
      bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
      fullLabel: point.label,
      series: successLabel,
      value: point.perf_requests > 0 ? point.success_rate : null,
    }))

    return {
      type: 'common',
      background: 'transparent',
      padding: { top: 14, right: 12, bottom: 8, left: 8 },
      data: [
        { id: 'latency', values: latencyValues },
        { id: 'success', values: successValues },
      ],
      series: [
        {
          type: 'line',
          id: 'latency-series',
          dataIndex: 0,
          xField: 'bucket',
          yField: 'value',
          seriesField: 'series',
          invalidType: 'ignore',
          line: { style: { lineWidth: 2 } },
          point: { style: { size: 3.5 } },
        },
        {
          type: 'line',
          id: 'success-series',
          dataIndex: 1,
          xField: 'bucket',
          yField: 'value',
          seriesField: 'series',
          invalidType: 'ignore',
          line: { style: { lineWidth: 2, lineDash: [4, 3] } },
          point: { style: { size: 3 } },
        },
      ],
      color: ['#f59e0b', '#6366f1', '#10b981'],
      axes: [
        { orient: 'bottom', type: 'band', label: { autoHide: true } },
        {
          orient: 'left',
          type: 'linear',
          seriesIndex: [0],
          label: {
            formatMethod: (val: string | number) => formatLatency(Number(val)),
          },
        },
        {
          orient: 'right',
          type: 'linear',
          seriesIndex: [1],
          min: 0,
          max: 100,
          grid: { visible: false },
          label: {
            formatMethod: (val: string | number) => `${val}%`,
          },
        },
      ],
      legends: { visible: true, orient: 'top', position: 'start' },
      tooltip: {
        dimension: {
          title: {
            value: (datum?: Record<string, unknown>) =>
              String(datum?.fullLabel ?? datum?.bucket ?? ''),
          },
          content: [
            {
              key: (datum?: Record<string, unknown>) =>
                String(datum?.series ?? ''),
              value: (datum?: Record<string, unknown>) => {
                if (datum?.value == null) return '—'
                const num = Number(datum.value)
                if (datum?.series === successLabel) {
                  return formatUptimePct(num)
                }
                return formatLatency(num)
              },
            },
          ],
        },
      },
    }
  }, [
    locale,
    props.bucketUnit,
    props.currencySymbol,
    props.trend,
    t,
    trafficMode,
  ])

  const userSpec = useMemo(() => {
    if (userMode === 'activity') {
      const newLabel = t('New users')
      const deletedLabel = t('Deleted users')
      const activeLabel = t('Active users')
      const changeBars = props.trend.flatMap((point) => [
        {
          bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
          fullLabel: point.label,
          series: newLabel,
          value: point.new_users,
        },
        {
          bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
          fullLabel: point.label,
          series: deletedLabel,
          value: point.deleted_users,
        },
      ])
      const activeLine = props.trend.map((point) => ({
        bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
        fullLabel: point.label,
        series: activeLabel,
        value: point.active_users,
      }))
      return {
        type: 'common',
        background: 'transparent',
        padding: { top: 14, right: 12, bottom: 8, left: 8 },
        data: [
          { id: 'changes', values: changeBars },
          { id: 'active', values: activeLine },
        ],
        series: [
          {
            type: 'bar',
            dataIndex: 0,
            xField: ['bucket', 'series'],
            yField: 'value',
            seriesField: 'series',
            barMaxWidth: 14,
            bar: { style: { cornerRadius: [3, 3, 0, 0] } },
          },
          {
            type: 'line',
            dataIndex: 1,
            xField: 'bucket',
            yField: 'value',
            seriesField: 'series',
            line: { style: { lineWidth: 2.2 } },
            point: { style: { size: 3.5 } },
          },
        ],
        color: ['#10b981', '#ef4444', '#2563eb'],
        axes: [
          { orient: 'bottom', type: 'band', label: { autoHide: true } },
          {
            orient: 'left',
            type: 'linear',
            label: {
              formatMethod: (val: string | number) =>
                formatNumber(Number(val), locale),
            },
          },
        ],
        legends: { visible: true, orient: 'top', position: 'start' },
        tooltip: {
          dimension: {
            title: {
              value: (datum?: Record<string, unknown>) =>
                String(datum?.fullLabel ?? datum?.bucket ?? ''),
            },
            content: [
              {
                key: (datum?: Record<string, unknown>) =>
                  String(datum?.series ?? ''),
                value: (datum?: Record<string, unknown>) =>
                  formatNumber(Number(datum?.value ?? 0), locale),
              },
            ],
          },
        },
      }
    }

    const totalLabel = t('Total users')
    const cumulativeValues = props.trend.map((point) => ({
      bucket: formatBucketAxisLabel(point.label, props.bucketUnit),
      fullLabel: point.label,
      series: totalLabel,
      value: point.cumulative_users,
    }))
    return {
      type: 'area',
      background: 'transparent',
      padding: { top: 14, right: 12, bottom: 8, left: 8 },
      data: [{ id: 'cumulative', values: cumulativeValues }],
      xField: 'bucket',
      yField: 'value',
      seriesField: 'series',
      color: ['#2563eb'],
      line: { style: { lineWidth: 2.2 } },
      area: { style: { fillOpacity: 0.14 } },
      point: { style: { size: 3.5 } },
      axes: [
        { orient: 'bottom', type: 'band', label: { autoHide: true } },
        {
          orient: 'left',
          type: 'linear',
          zero: false,
          label: {
            formatMethod: (val: string | number) =>
              formatNumber(Number(val), locale),
          },
        },
      ],
      legends: { visible: true, orient: 'top', position: 'start' },
      tooltip: {
        dimension: {
          title: {
            value: (datum?: Record<string, unknown>) =>
              String(datum?.fullLabel ?? datum?.bucket ?? ''),
          },
          content: [
            {
              key: (datum?: Record<string, unknown>) =>
                String(datum?.series ?? ''),
              value: (datum?: Record<string, unknown>) =>
                formatNumber(Number(datum?.value ?? 0), locale),
            },
          ],
        },
      },
    }
  }, [locale, props.bucketUnit, props.trend, t, userMode])

  const trafficHasData = trafficMode === 'usage' ? hasUsageData : hasPerfData

  let trafficChartContent = (
    <div className='h-[280px] w-full'>
      <VChart
        key={`traffic-${resolvedTheme}-${trafficMode}-${props.bucketUnit}`}
        spec={trafficSpec as never}
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
  if (!trafficHasData) {
    trafficChartContent = (
      <EmptyState
        className='min-h-[260px]'
        title={
          trafficMode === 'usage'
            ? t('No request traffic in this period')
            : t('No performance telemetry in this period')
        }
        description={t(
          'Try switching to a wider time range or check back after requests are processed.'
        )}
      />
    )
  } else if (!themeReady) {
    trafficChartContent = (
      <div className='bg-muted/40 h-[280px] w-full animate-pulse rounded-md' />
    )
  }

  let userChartContent = (
    <div className='h-[280px] w-full'>
      <VChart
        key={`users-${resolvedTheme}-${userMode}-${props.bucketUnit}`}
        spec={userSpec as never}
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
  if (!hasUserTrendData) {
    userChartContent = (
      <EmptyState
        className='min-h-[260px]'
        title={t('No user activity in this period')}
        description={t(
          'User registrations, deletions, and active counts will appear here.'
        )}
      />
    )
  } else if (!themeReady) {
    userChartContent = (
      <div className='bg-muted/40 h-[280px] w-full animate-pulse rounded-md' />
    )
  }

  return (
    <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
      <Card>
        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2'>
          <div className='space-y-1'>
            <CardTitle className='text-base'>
              {t('Traffic & Performance Trend')}
            </CardTitle>
            <CardDescription>
              {trafficMode === 'usage'
                ? t('Site-wide request volume and billed consumption over time')
                : t('Response latency, TTFT, and request success rate trend')}
            </CardDescription>
          </div>
          <div className='bg-muted/60 inline-flex items-center rounded-md border p-0.5'>
            <Button
              type='button'
              size='sm'
              variant={trafficMode === 'usage' ? 'secondary' : 'ghost'}
              className='h-7 px-2.5 text-xs'
              onClick={() => setTrafficMode('usage')}
            >
              {t('Traffic')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={trafficMode === 'latency' ? 'secondary' : 'ghost'}
              className='h-7 px-2.5 text-xs'
              onClick={() => setTrafficMode('latency')}
            >
              {t('Latency & Success')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>{trafficChartContent}</CardContent>
      </Card>

      <Card>
        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2'>
          <div className='space-y-1'>
            <CardTitle className='text-base'>
              {t('User Growth & Activity')}
            </CardTitle>
            <CardDescription>
              {userMode === 'activity'
                ? t('Active users alongside new registrations and deletions')
                : t('Cumulative non-deleted user count across the period')}
            </CardDescription>
          </div>
          <div className='bg-muted/60 inline-flex items-center rounded-md border p-0.5'>
            <Button
              type='button'
              size='sm'
              variant={userMode === 'activity' ? 'secondary' : 'ghost'}
              className='h-7 px-2.5 text-xs'
              onClick={() => setUserMode('activity')}
            >
              {t('Active & Changes')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant={userMode === 'cumulative' ? 'secondary' : 'ghost'}
              className='h-7 px-2.5 text-xs'
              onClick={() => setUserMode('cumulative')}
            >
              {t('Total Users')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>{userChartContent}</CardContent>
      </Card>
    </div>
  )
}
