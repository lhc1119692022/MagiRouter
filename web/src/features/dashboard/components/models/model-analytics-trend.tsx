import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import type { TimeGranularity } from '@/lib/time'

type Granularity = TimeGranularity | 'month'
type Metric = 'quota' | 'tokens' | 'requests'
const metrics = [
  { id: 'quota', label: 'Quota', title: 'Quota consumption trend' },
  { id: 'tokens', label: 'Tokens', title: 'Token throughput trend' },
  { id: 'requests', label: 'Requests', title: 'Request count trend' },
] as const

export function ModelAnalyticsTrend({
  rows,
  start,
  end,
  granularity,
  step = 1,
}: {
  rows: QuotaDataItem[]
  start: number
  end: number
  granularity: Granularity
  step?: number
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [metric, setMetric] = useState<Metric>('quota')
  const bars = useMemo(() => {
    const first = dayjs.unix(start).startOf(granularity)
    const count =
      dayjs.unix(end).startOf(granularity).diff(first, granularity) + 1
    const stride = Math.max(step, Math.ceil(count / 180))
    const buckets = Array.from(
      { length: Math.max(1, Math.ceil(count / stride)) },
      (_, index) => ({
        time: first.add(index * stride, granularity).unix(),
        quota: 0,
        tokens: 0,
        requests: 0,
      })
    )
    for (const row of rows) {
      if (row.created_at < start || row.created_at > end) continue
      const index = Math.floor(
        dayjs
          .unix(row.created_at)
          .startOf(granularity)
          .diff(first, granularity) / stride
      )
      const bucket = buckets[index]
      if (!bucket) continue
      bucket.quota += row.quota ?? 0
      bucket.tokens += row.token_used ?? 0
      bucket.requests += row.count ?? 0
    }
    return buckets
  }, [rows, start, end, granularity, step])
  const dateFormat: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  }
  const dateFormats: Record<Granularity, Intl.DateTimeFormatOptions> = {
    hour: { hour: '2-digit', minute: '2-digit' },
    day: dateFormat,
    week: dateFormat,
    month: { month: 'short', year: 'numeric' },
  }
  const formatDate = (time: number) =>
    new Date(time * 1000).toLocaleString(locale, dateFormats[granularity])
  const title = t(
    (metrics.find((item) => item.id === metric) ?? metrics[0]).title
  )
  return (
    <section className='dash-panel'>
      <div className='dash-panel-head'>
        <h2 className='dash-panel-title'>{title}</h2>
        <div className='dash-metric-pills' role='group' aria-label={t('Usage')}>
          {metrics.map((item) => (
            <button
              key={item.id}
              type='button'
              aria-pressed={item.id === metric}
              className={`dash-metric-pill${item.id === metric ? ' is-active' : ''}`}
              onClick={() => setMetric(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>
      {rows.length ? (
        <ChartContainer
          config={{ [metric]: { label: title, color: 'var(--ink-strong)' } }}
          className='analytics-trend-chart'
        >
          <BarChart
            accessibilityLayer
            aria-label={title}
            data={bars}
            margin={{ top: 8, right: 8, bottom: 2, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke='var(--divider-color)' />
            <XAxis
              dataKey='time'
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatDate}
            />
            <YAxis
              width='auto'
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              tickFormatter={(value) =>
                metric === 'quota'
                  ? formatQuota(value)
                  : formatCompactNumber(value, locale)
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(_, payload) =>
                    formatDate(Number(payload?.[0]?.payload?.time))
                  }
                  formatter={(value) =>
                    metric === 'quota'
                      ? formatQuota(Number(value))
                      : formatNumber(Number(value), locale)
                  }
                />
              }
            />
            <Bar
              dataKey={metric}
              fill='var(--ink-strong)'
              fillOpacity={0.82}
              radius={[1, 1, 0, 0]}
              activeBar={{ fill: 'var(--mr-orange)' }}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      ) : (
        <div className='analytics-trend-chart analytics-message'>
          {t('No data available')}
        </div>
      )}
    </section>
  )
}
