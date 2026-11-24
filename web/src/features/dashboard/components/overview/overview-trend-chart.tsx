import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  peakValue,
  type TrendBucket,
  type TrendMetric,
} from '@/features/dashboard/lib/trend'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'

import type { OverviewRange } from './use-overview-report'

export type OverviewMetric = TrendMetric

const width = 640
const height = 196
const plot = { left: 48, top: 16, width: 580, height: 152 }

export function OverviewTrendChart(props: {
  buckets: TrendBucket[]
  range: OverviewRange
  metric: OverviewMetric
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const tipId = useId()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const buckets = props.buckets
  const active = activeIndex === null ? undefined : buckets[activeIndex]
  const max = peakValue(buckets, props.metric) * 1.15
  const slot = plot.width / Math.max(1, buckets.length)
  const barWidth = Math.min(10, Math.max(1, slot * 0.56))
  const minSlots = Math.max(1, Math.ceil(64 / slot))
  const tickCount = Math.min(7, 1 + Math.floor((buckets.length - 1) / minSlots))
  const tickIndices = new Set(
    Array.from({ length: tickCount }, (_, index) =>
      Math.round((index * (buckets.length - 1)) / Math.max(1, tickCount - 1))
    )
  )
  const stampFormat: Record<OverviewRange, Intl.DateTimeFormatOptions> = {
    today: { hour: '2-digit', minute: '2-digit' },
    '7d': { month: 'numeric', day: 'numeric' },
    '30d': { month: 'numeric', day: 'numeric' },
    all: { year: 'numeric', month: 'short' },
  }
  const dates = new Intl.DateTimeFormat(locale, stampFormat[props.range])
  const tipText = active
    ? `${dates.format(active.startedAt * 1000)} · ${t('Spend')} ${formatQuota(active.quota)} · ${t('Requests')} ${formatNumber(active.count, locale)} · ${t('Tokens')} ${formatNumber(active.token, locale)}`
    : undefined
  return (
    <div className='dash-chart-stage overview-report-chart'>
      {active && (
        <div className='dash-chart-tooltip' aria-hidden='true'>
          <div className='dash-chart-tooltip-date'>
            {dates.format(active.startedAt * 1000)}
          </div>
          <div>
            {t('Spend')}: {formatQuota(active.quota)}
          </div>
          <div>
            {t('Requests')}: {formatNumber(active.count, locale)}
          </div>
          <div>
            {t('Tokens')}: {formatNumber(active.token, locale)}
          </div>
        </div>
      )}
      <span id={tipId} className='sr-only'>
        {t('Use arrow keys to inspect the chart.')}
      </span>
      <svg
        className='dash-chart-svg'
        viewBox={`0 0 ${width} ${height}`}
        role='slider'
        tabIndex={0}
        aria-label={t('Usage trend')}
        aria-describedby={tipId}
        aria-valuemin={1}
        aria-valuemax={buckets.length}
        aria-valuenow={(activeIndex ?? 0) + 1}
        aria-valuetext={tipText}
        onFocus={() => setActiveIndex((index) => index ?? 0)}
        onBlur={() => setActiveIndex(null)}
        onPointerLeave={() => setActiveIndex(null)}
        onKeyDown={(event) => {
          const index = activeIndex ?? 0
          const indices: Record<string, number> = {
            ArrowLeft: index - 1,
            ArrowDown: index - 1,
            ArrowRight: index + 1,
            ArrowUp: index + 1,
            Home: 0,
            End: buckets.length - 1,
          }
          if (event.key === 'Escape') setActiveIndex(null)
          if (!(event.key in indices)) return
          event.preventDefault()
          setActiveIndex(
            Math.max(0, Math.min(buckets.length - 1, indices[event.key]))
          )
        }}
      >
        {[0, 1 / 3, 2 / 3, 1].map((ratio) => {
          const offset = plot.top + (1 - ratio) * plot.height
          const tick = max * ratio
          return (
            <g key={ratio}>
              <line
                className='dash-chart-gridline'
                x1={plot.left}
                x2={plot.left + plot.width}
                y1={offset}
                y2={offset}
              />
              <text
                className='dash-chart-axis-label'
                textAnchor='end'
                x={plot.left - 8}
                y={offset + 4}
              >
                {props.metric === 'quota'
                  ? formatQuota(tick)
                  : formatCompactNumber(tick, locale)}
              </text>
            </g>
          )
        })}
        {buckets.map((bucket, index) => {
          const left = plot.left + slot * index
          const value = bucket[props.metric]
          const barHeight =
            value > 0 ? Math.max(1.5, (value / max) * plot.height) : 0
          return (
            <g key={bucket.startedAt}>
              {value > 0 && (
                <rect
                  className={
                    activeIndex === index
                      ? 'dash-chart-bar is-hovered'
                      : 'dash-chart-bar'
                  }
                  x={left + (slot - barWidth) / 2}
                  y={plot.top + plot.height - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={1.5}
                />
              )}
              <rect
                className='dash-chart-hit'
                x={left}
                y={plot.top}
                width={slot}
                height={plot.height}
                onPointerEnter={() => setActiveIndex(index)}
                onPointerDown={() => setActiveIndex(index)}
              />
              {tickIndices.has(index) && (
                <text
                  className='dash-chart-axis-label'
                  x={left + slot / 2}
                  y={height - 8}
                  textAnchor='middle'
                >
                  {dates.format(bucket.startedAt * 1000)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
