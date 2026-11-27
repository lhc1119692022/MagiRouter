import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { peakValue, type TrendMetric } from '@/features/dashboard/lib/trend'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber, formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import type {
  OverviewModelSummary,
  OverviewRange,
  OverviewTrendBucket,
} from './use-overview-report'

export type OverviewMetric = TrendMetric

const width = 640
const height = 196
const plot = { left: 48, top: 16, width: 580, height: 152 }
const todayTickIndices = new Set([0, 4, 8, 12, 16, 20, 23])

type StackedSegment = {
  name: string
  color: string
  value: number
  y: number
  height: number
}

type StackedBar = {
  startedAt: number
  barX: number
  barTop: number
  totalHeight: number
  radius: number
  segments: StackedSegment[]
}

export function OverviewTrendChart(props: {
  buckets: OverviewTrendBucket[]
  models: OverviewModelSummary[]
  range: OverviewRange
  metric: OverviewMetric
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const tipId = useId()
  const clipPrefix = useId().replaceAll(/[^a-zA-Z0-9_-]/g, '')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hoveredModel, setHoveredModel] = useState<string | null>(null)
  const [pinnedModel, setPinnedModel] = useState<string | null>(null)
  const buckets = props.buckets
  const active = activeIndex === null ? undefined : buckets[activeIndex]
  const max = peakValue(buckets, props.metric) * 1.15
  const slot = plot.width / Math.max(1, buckets.length)
  const barWidth = Math.min(12, Math.max(1, slot * 0.56))
  const minSlots = Math.max(1, Math.ceil(64 / slot))
  const tickCount = Math.min(7, 1 + Math.floor((buckets.length - 1) / minSlots))
  const tickIndices =
    props.range === 'today' && buckets.length === 24
      ? todayTickIndices
      : new Set(
          Array.from({ length: tickCount }, (_, index) =>
            Math.round(
              (index * (buckets.length - 1)) / Math.max(1, tickCount - 1)
            )
          )
        )
  const stampFormat: Record<OverviewRange, Intl.DateTimeFormatOptions> = {
    today: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    '7d': { month: 'numeric', day: 'numeric' },
    '30d': { month: 'numeric', day: 'numeric' },
    all: { year: 'numeric', month: 'short' },
  }
  const dates = new Intl.DateTimeFormat(locale, stampFormat[props.range])
  const visibleModels = useMemo(
    () => props.models.filter((model) => model[props.metric] > 0),
    [props.metric, props.models]
  )
  const focusedCandidate = hoveredModel ?? pinnedModel
  const focusedModel =
    focusedCandidate !== null &&
    visibleModels.some((model) => model.name === focusedCandidate)
      ? focusedCandidate
      : null
  const formatMetricValue = (value: number) =>
    props.metric === 'quota' ? formatQuota(value) : formatNumber(value, locale)

  const stackedBars = useMemo(() => {
    const baseline = plot.top + plot.height
    return buckets.map((bucket, index): StackedBar | null => {
      const total = bucket[props.metric]
      if (total <= 0) return null
      const rawSegments = props.models.flatMap((model) => {
        const value = bucket.models.get(model.name)?.[props.metric] ?? 0
        if (value <= 0) return []
        return [{ name: model.name, color: model.color, value }]
      })
      const entries =
        rawSegments.length > 0
          ? rawSegments
          : [{ name: '', color: 'var(--ink-strong)', value: total }]
      const segmentSum =
        entries.reduce((sum, entry) => sum + entry.value, 0) || total
      const totalHeight = Math.max(1.5, (total / max) * plot.height)
      const barX = plot.left + slot * index + (slot - barWidth) / 2
      const barTop = baseline - totalHeight
      const radius = Math.min(2, totalHeight / 2, barWidth / 2)
      let accumulated = 0
      const segments: StackedSegment[] = entries.map((entry) => {
        const bottom = baseline - (accumulated / segmentSum) * totalHeight
        accumulated += entry.value
        const top = baseline - (accumulated / segmentSum) * totalHeight
        return {
          ...entry,
          y: top,
          height: Math.max(0, bottom - top),
        }
      })
      return {
        startedAt: bucket.startedAt,
        barX,
        barTop,
        totalHeight,
        radius,
        segments,
      }
    })
  }, [barWidth, buckets, max, props.metric, props.models, slot])

  const activeSegments = useMemo(() => {
    if (!active) return []
    return props.models
      .flatMap((model) => {
        const value = active.models.get(model.name)?.[props.metric] ?? 0
        if (value <= 0) return []
        return [{ name: model.name, color: model.color, value }]
      })
      .sort((left, right) => right.value - left.value)
  }, [active, props.metric, props.models])

  const activeBreakdownText = activeSegments.length
    ? ` · ${activeSegments
        .map(
          (segment) =>
            `${segment.name || t('Unknown')} ${formatMetricValue(segment.value)}`
        )
        .join(', ')}`
    : ''
  const tipText = active
    ? `${dates.format(active.startedAt * 1000)} · ${t('Spend')} ${formatQuota(active.quota)} · ${t('Requests')} ${formatNumber(active.count, locale)} · ${t('Tokens')} ${formatNumber(active.token, locale)}${activeBreakdownText}`
    : undefined

  const resolveSegmentOpacity = (bucketIndex: number, modelName: string) => {
    if (focusedModel !== null) {
      return modelName === focusedModel ? 1 : 0.2
    }
    if (activeIndex !== null) {
      return activeIndex === bucketIndex ? 1 : 0.42
    }
    return 0.9
  }

  const tooltipOnLeft =
    activeIndex !== null && activeIndex >= buckets.length / 2

  return (
    <div className='dash-chart-stage overview-report-chart'>
      {active && (
        <div
          className={cn(
            'dash-chart-tooltip overview-report-tooltip',
            tooltipOnLeft && 'is-left'
          )}
          aria-hidden='true'
        >
          <div className='dash-chart-tooltip-date'>
            {dates.format(active.startedAt * 1000)}
          </div>
          <div className='overview-report-tooltip-totals'>
            <div>
              <span>{t('Spend')}</span>
              <span className='tabular-nums'>{formatQuota(active.quota)}</span>
            </div>
            <div>
              <span>{t('Requests')}</span>
              <span className='tabular-nums'>
                {formatNumber(active.count, locale)}
              </span>
            </div>
            <div>
              <span>{t('Tokens')}</span>
              <span className='tabular-nums'>
                {formatNumber(active.token, locale)}
              </span>
            </div>
          </div>
          {activeSegments.length > 0 && (
            <div className='overview-report-tooltip-models'>
              {activeSegments.map((segment) => {
                const label = segment.name || t('Unknown')
                return (
                  <div
                    key={segment.name}
                    className='overview-report-tooltip-model'
                  >
                    <span className='overview-report-tooltip-model-left'>
                      <span
                        className='overview-report-swatch'
                        style={{ backgroundColor: segment.color }}
                      />
                      <span className='overview-report-tooltip-model-name'>
                        {label}
                      </span>
                    </span>
                    <span className='overview-report-tooltip-model-val tabular-nums'>
                      {formatMetricValue(segment.value)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
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
        <defs>
          {stackedBars.map((bar) => {
            if (!bar) return null
            return (
              <clipPath
                key={bar.startedAt}
                id={`${clipPrefix}-bar-${bar.startedAt}`}
              >
                <rect
                  x={bar.barX}
                  y={bar.barTop}
                  width={barWidth}
                  height={bar.totalHeight + bar.radius}
                  rx={bar.radius}
                />
              </clipPath>
            )
          })}
        </defs>
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
          const bar = stackedBars[index]
          return (
            <g key={bucket.startedAt}>
              {activeIndex === index && (
                <rect
                  className='dash-chart-active-band'
                  x={left}
                  y={plot.top}
                  width={slot}
                  height={plot.height}
                  rx={4}
                />
              )}
              {bar && (
                <g
                  data-bucket-index={index}
                  clipPath={`url(#${clipPrefix}-bar-${bar.startedAt})`}
                >
                  {bar.segments.map((segment) => (
                    <rect
                      key={segment.name}
                      className='dash-chart-bar-segment'
                      data-model={segment.name}
                      data-bucket-index={index}
                      x={bar.barX}
                      y={segment.y}
                      width={barWidth}
                      height={segment.height}
                      fill={segment.color}
                      opacity={resolveSegmentOpacity(index, segment.name)}
                    />
                  ))}
                </g>
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
      {visibleModels.length > 0 && (
        <div
          className='overview-report-legend'
          role='group'
          aria-label={t('Models')}
        >
          {visibleModels.map((model) => {
            const label = model.name || t('Unknown')
            const isPinned = pinnedModel === model.name
            const isDimmed =
              focusedModel !== null && focusedModel !== model.name
            return (
              <Button
                key={model.name}
                type='button'
                variant='ghost'
                aria-pressed={isPinned}
                title={label}
                className={cn(
                  'overview-report-legend-item',
                  isPinned && 'is-active',
                  isDimmed && 'is-dimmed'
                )}
                onPointerEnter={() => setHoveredModel(model.name)}
                onPointerLeave={() => setHoveredModel(null)}
                onFocus={() => setHoveredModel(model.name)}
                onBlur={() => setHoveredModel(null)}
                onClick={() =>
                  setPinnedModel((current) =>
                    current === model.name ? null : model.name
                  )
                }
              >
                <span
                  className='overview-report-swatch'
                  aria-hidden='true'
                  style={{ backgroundColor: model.color }}
                />
                <span className='overview-report-legend-name'>{label}</span>
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
