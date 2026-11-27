/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { DatabaseZap, HeartPulse, Timer } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  staticDataTableClassNames as tableStyles,
} from '@/components/data-table'
import { GroupBadge } from '@/components/group-badge'
import {
  formatCacheHitRate,
  formatLatency,
  formatThroughputDisplay,
  formatUptimePct,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerformanceSeriesPoint } from '@/features/performance-metrics/types'
import { cn } from '@/lib/utils'

import { useModelMonitoring } from '../hooks/use-model-monitoring'
import {
  isMeasuredRate,
  monitoringWindowLabel,
  observedRequestSamples,
} from '../lib/monitored-requests'
import type { PricingModel } from '../types'
import { LatencyTrendChart, UptimeTrendChart } from './model-details-charts'
import { UptimeSparkline } from './model-details-uptime-sparkline'

function StatCard(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  hint?: string
  valueClassName?: string
}) {
  const Icon = props.icon
  return (
    <div className='bg-background flex flex-col gap-1 rounded-lg border p-3'>
      <span className='text-muted-foreground inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wider uppercase'>
        <Icon className='size-3' />
        {props.label}
      </span>
      <span
        className={cn(
          'text-foreground font-mono text-lg font-semibold tabular-nums',
          props.valueClassName
        )}
      >
        {props.value}
      </span>
      {props.hint && (
        <span className='text-muted-foreground/70 text-[11px]'>
          {props.hint}
        </span>
      )}
    </div>
  )
}

function toLatencySeries(series: PerformanceSeriesPoint[]) {
  return series
    .filter(
      (point) =>
        point.avg_ttft_ms > 0 &&
        Number.isFinite(new Date(point.ts * 1000).getTime())
    )
    .map((point) => ({
      timestamp: new Date(point.ts * 1000).toISOString(),
      group: 'latency',
      ttft_ms: point.avg_ttft_ms,
    }))
}

export function ModelDetailsPerformance(props: {
  model: PricingModel
  mode?: 'full' | 'trends'
}) {
  const { t } = useTranslation()
  const metricsQuery = useModelMonitoring(props.model.model_name)
  const data = metricsQuery.data
  const summary = data?.summary
  const groups = data?.groups ?? []
  const mode = props.mode ?? 'full'
  const latencySeries = useMemo(
    () => toLatencySeries(data?.series ?? []),
    [data]
  )
  const uptimeSeries = useMemo(
    () => observedRequestSamples(data?.series, data ?? undefined),
    [data]
  )

  if (!summary && !groups.length) {
    let statusText = t('Not monitored')
    if (metricsQuery.isPending) statusText = t('Loading...')
    if (metricsQuery.isError) statusText = t('Monitoring unavailable')
    return (
      <div className='text-muted-foreground rounded-lg border p-6 text-center text-sm'>
        {statusText}
      </div>
    )
  }

  if (mode === 'trends') {
    return (
      <div className='space-y-4'>
        <section>
          <SectionHeader
            icon={Timer}
            title={t('Latency trend (last 24h)')}
            description={t('Average TTFT')}
          />
          <LatencyTrendChart series={latencySeries} />
        </section>

        <section>
          <SectionHeader
            icon={HeartPulse}
            title={t('Sampled request success rates')}
            description={t(
              'Success rate excludes business rejections and includes the current partial hour.'
            )}
          />
          <UptimeTrendChart series={uptimeSeries} />
        </section>
      </div>
    )
  }

  const avgTps = summary?.avg_tps ?? 0
  const avgLatency = summary?.avg_latency_ms ?? 0
  const successRate = isMeasuredRate(summary?.success_rate)
    ? summary.success_rate
    : Number.NaN
  const cacheHitRate = summary?.cache_hit_rate
  const isSummaryTpsInsufficient =
    Boolean(summary?.tps_insufficient) && avgTps <= 0
  const summaryThroughput = formatThroughputDisplay(avgTps, {
    insufficient: summary?.tps_insufficient,
    insufficientLabel: t('Insufficient samples'),
  })

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-xs'>
        {t('All visible groups')} · {t('Monitored relay requests')}{' '}
        {monitoringWindowLabel(data ?? undefined)}
      </p>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
        <StatCard
          icon={Timer}
          label='TPS'
          value={summaryThroughput}
          hint={t('Sustained tokens per second')}
          valueClassName={
            isSummaryTpsInsufficient
              ? 'text-muted-foreground font-sans text-sm font-normal'
              : undefined
          }
        />
        <StatCard
          icon={Timer}
          label={t('Average latency')}
          value={formatLatency(avgLatency)}
        />
        <StatCard
          icon={DatabaseZap}
          label={t('Cache hit rate')}
          value={formatCacheHitRate(cacheHitRate)}
        />
        <StatCard
          icon={HeartPulse}
          label={t('Success rate')}
          value={formatUptimePct(successRate)}
          hint={t(
            'Success rate excludes business rejections and includes the current partial hour.'
          )}
          valueClassName={getSuccessRateTextClass(successRate)}
        />
      </div>

      <section>
        <SectionHeader
          icon={HeartPulse}
          title={t('Per-group performance')}
          description={t('Average latency, TTFT, TPS, and success rate')}
        />
        <StaticDataTable
          className='rounded-lg'
          tableClassName='text-sm'
          headerRowClassName={tableStyles.compactHeaderRow}
          data={groups}
          getRowKey={(perf) => perf.group}
          columns={[
            {
              id: 'group',
              header: t('Group'),
              className: tableStyles.compactHeaderCell,
              cellClassName: tableStyles.compactCell,
              cell: (perf) => <GroupBadge group={perf.group} size='sm' />,
            },
            {
              id: 'tps',
              header: 'TPS',
              className: tableStyles.compactHeaderCellRight,
              cellClassName: tableStyles.compactNumericCell,
              cell: (perf) =>
                formatThroughputDisplay(perf.avg_tps, {
                  insufficient: perf.tps_insufficient,
                  insufficientLabel: t('Insufficient samples'),
                }),
            },
            {
              id: 'ttft',
              header: t('Average TTFT'),
              className: tableStyles.compactHeaderCellRight,
              cellClassName: tableStyles.compactNumericCell,
              cell: (perf) => formatLatency(perf.avg_ttft_ms),
            },
            {
              id: 'latency',
              header: t('Average latency'),
              className: tableStyles.compactHeaderCellRight,
              cellClassName: tableStyles.compactMutedNumericCell,
              cell: (perf) => formatLatency(perf.avg_latency_ms),
            },
            {
              id: 'cache',
              header: t('Cache hit rate'),
              className: tableStyles.compactHeaderCellRight,
              cellClassName: tableStyles.compactMutedNumericCell,
              cell: (perf) => formatCacheHitRate(perf.cache_hit_rate),
            },
            {
              id: 'success',
              header: t('Success rate'),
              className: cn(tableStyles.compactHeaderCell, 'min-w-[180px]'),
              cellClassName: tableStyles.compactCell,
              cell: (perf) => (
                <UptimeSparkline
                  size='sm'
                  series={observedRequestSamples(
                    perf.series,
                    data ?? undefined
                  )}
                  overallSuccessRate={perf.success_rate}
                />
              ),
            },
          ]}
        />
      </section>

      <section>
        <SectionHeader
          icon={Timer}
          title={t('Latency trend (last 24h)')}
          description={t('Average TTFT')}
        />
        <LatencyTrendChart series={latencySeries} />
      </section>

      <section>
        <SectionHeader
          icon={HeartPulse}
          title={t('Sampled request success rates')}
          description={t(
            'Success rate excludes business rejections and includes the current partial hour.'
          )}
        />
        <UptimeTrendChart series={uptimeSeries} />
      </section>
    </div>
  )
}

function SectionHeader(props: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
}) {
  const Icon = props.icon
  return (
    <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <Icon className='text-muted-foreground/70 size-3.5 shrink-0' />
        <div className='min-w-0'>
          <div className='text-foreground text-sm font-semibold'>
            {props.title}
          </div>
          {props.description && (
            <p className='text-muted-foreground/80 text-xs'>
              {props.description}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
