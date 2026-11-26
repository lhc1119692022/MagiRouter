import { VChart } from '@visactor/react-vchart'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { useTheme } from '@/context/theme-provider'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { MediaDailyTrendPoint } from '../types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

const BYTES_PER_MIB = 1024 * 1024

interface MediaTrafficTrendChartProps {
  data: MediaDailyTrendPoint[]
}

export function MediaTrafficTrendChart(props: MediaTrafficTrendChartProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { resolvedTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const applyTheme = async () => {
      if (!themeManagerPromise) {
        themeManagerPromise = import('@visactor/vchart').then(
          (mod) => mod.ThemeManager
        )
      }
      const ThemeManager = await themeManagerPromise
      if (cancelled) return
      ThemeManager.setCurrentTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
      setThemeReady(true)
    }
    void applyTheme()
    return () => {
      cancelled = true
    }
  }, [resolvedTheme])

  const hasActivity = useMemo(
    () =>
      props.data.some(
        (point) => point.used_bytes > 0 || point.upload_count > 0
      ),
    [props.data]
  )

  const spec = useMemo(() => {
    const trafficLabel = t('Traffic (MB)')
    const uploadsLabel = t('Uploads')

    const barValues = props.data.map((point) => ({
      date: point.date.slice(5),
      fullDate: point.date,
      series: trafficLabel,
      value: Math.round((point.used_bytes / BYTES_PER_MIB) * 100) / 100,
      activeUsers: point.active_users,
    }))

    const lineValues = props.data.map((point) => ({
      date: point.date.slice(5),
      fullDate: point.date,
      series: uploadsLabel,
      value: point.upload_count,
    }))

    return {
      type: 'common',
      background: 'transparent',
      padding: { top: 16, right: 16, bottom: 8, left: 8 },
      data: [
        { id: 'traffic', values: barValues },
        { id: 'uploads', values: lineValues },
      ],
      series: [
        {
          type: 'bar',
          id: 'traffic-series',
          dataIndex: 0,
          xField: 'date',
          yField: 'value',
          seriesField: 'series',
          barMaxWidth: 22,
          bar: {
            style: {
              cornerRadius: [4, 4, 0, 0],
            },
          },
        },
        {
          type: 'line',
          id: 'uploads-series',
          dataIndex: 1,
          xField: 'date',
          yField: 'value',
          seriesField: 'series',
          line: {
            style: {
              lineWidth: 2.2,
            },
          },
          point: {
            style: {
              size: 4,
            },
          },
        },
      ],
      color: ['#0ea5e9', '#8b5cf6'],
      axes: [
        {
          orient: 'bottom',
          type: 'band',
          label: {
            autoHide: true,
          },
        },
        {
          orient: 'left',
          type: 'linear',
          seriesId: ['traffic-series'],
          label: {
            formatMethod: (val: string | number) =>
              `${formatNumber(Number(val), locale)} MB`,
          },
        },
        {
          orient: 'right',
          type: 'linear',
          seriesId: ['uploads-series'],
          grid: { visible: false },
          label: {
            formatMethod: (val: string | number) =>
              formatNumber(Math.round(Number(val)), locale),
          },
        },
      ],
      legends: {
        visible: true,
        orient: 'top',
        position: 'start',
      },
      tooltip: {
        mark: {
          title: {
            value: (datum?: Record<string, unknown>) =>
              String(datum?.fullDate ?? datum?.date ?? ''),
          },
          content: [
            {
              key: (datum?: Record<string, unknown>) =>
                String(datum?.series ?? ''),
              value: (datum?: Record<string, unknown>) => {
                const raw = Number(datum?.value ?? 0)
                if (datum?.series === trafficLabel) {
                  return `${formatNumber(raw, locale)} MB`
                }
                return formatNumber(Math.round(raw), locale)
              },
            },
          ],
        },
        dimension: {
          title: {
            value: (datum?: Record<string, unknown>) =>
              String(datum?.fullDate ?? datum?.date ?? ''),
          },
          content: [
            {
              key: (datum?: Record<string, unknown>) =>
                String(datum?.series ?? ''),
              value: (datum?: Record<string, unknown>) => {
                const raw = Number(datum?.value ?? 0)
                if (datum?.series === trafficLabel) {
                  return `${formatNumber(raw, locale)} MB`
                }
                return formatNumber(Math.round(raw), locale)
              },
            },
          ],
        },
      },
    }
  }, [locale, props.data, t])

  if (!hasActivity) {
    return (
      <EmptyState
        className='min-h-[260px]'
        title={t('No media traffic recorded in this period')}
        description={t(
          'Cloud media relay uploads will appear here once users upload assets.'
        )}
      />
    )
  }

  if (!themeReady) {
    return (
      <div className='bg-muted/40 h-[300px] w-full animate-pulse rounded-md' />
    )
  }

  return (
    <div className='h-[300px] w-full'>
      <VChart
        key={resolvedTheme}
        spec={spec as never}
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
}
