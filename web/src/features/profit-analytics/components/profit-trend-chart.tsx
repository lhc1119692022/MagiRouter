import { VChart } from '@visactor/react-vchart'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { useTheme } from '@/context/theme-provider'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { ProfitDailyTrendPoint } from '../types'

let themeManagerPromise: Promise<
  (typeof import('@visactor/vchart'))['ThemeManager']
> | null = null

export type ProfitChartBasis = 'cash' | 'billed'

interface ProfitTrendChartProps {
  data: ProfitDailyTrendPoint[]
  symbol: string
  basis: ProfitChartBasis
}

export function ProfitTrendChart(props: ProfitTrendChartProps) {
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
        (point) =>
          point.cash_revenue > 0 ||
          point.billed_local > 0 ||
          point.total_cost > 0
      ),
    [props.data]
  )

  const spec = useMemo(() => {
    const revenueLabel =
      props.basis === 'cash' ? t('Cash revenue') : t('Billed consumption')
    const costLabel =
      props.basis === 'cash'
        ? t('Estimated total cost')
        : t('Upstream variable cost')
    const profitLabel =
      props.basis === 'cash' ? t('Net cash profit') : t('Billed gross profit')

    const barValues = props.data.flatMap((point) => [
      {
        date: point.date.slice(5),
        fullDate: point.date,
        series: revenueLabel,
        value: props.basis === 'cash' ? point.cash_revenue : point.billed_local,
      },
      {
        date: point.date.slice(5),
        fullDate: point.date,
        series: costLabel,
        value: props.basis === 'cash' ? point.total_cost : point.upstream_cost,
      },
    ])

    const lineValues = props.data.map((point) => ({
      date: point.date.slice(5),
      fullDate: point.date,
      series: profitLabel,
      value:
        props.basis === 'cash'
          ? point.cash_net_profit
          : point.billed_gross_profit,
    }))

    return {
      type: 'common',
      background: 'transparent',
      padding: { top: 16, right: 16, bottom: 8, left: 8 },
      data: [
        { id: 'bars', values: barValues },
        { id: 'line', values: lineValues },
      ],
      series: [
        {
          type: 'bar',
          dataIndex: 0,
          xField: ['date', 'series'],
          yField: 'value',
          seriesField: 'series',
          barMaxWidth: 16,
          bar: {
            style: {
              cornerRadius: [4, 4, 0, 0],
            },
          },
        },
        {
          type: 'line',
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
      color: ['#2563eb', '#f59e0b', '#10b981'],
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
          label: {
            formatMethod: (val: string | number) =>
              `${props.symbol}${formatNumber(Number(val), locale)}`,
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
              value: (datum?: Record<string, unknown>) =>
                `${props.symbol}${new Intl.NumberFormat(locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(Number(datum?.value ?? 0))}`,
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
              value: (datum?: Record<string, unknown>) =>
                `${props.symbol}${new Intl.NumberFormat(locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(Number(datum?.value ?? 0))}`,
            },
          ],
        },
      },
    }
  }, [locale, props.basis, props.data, props.symbol, t])

  if (!hasActivity) {
    return (
      <EmptyState
        className='min-h-[260px]'
        title={t('No revenue or consumption data in this period')}
        description={t(
          'Try switching to a wider date range or adjust your cost model settings.'
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
        key={`${resolvedTheme}-${props.basis}`}
        spec={spec as never}
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
}
