import { Link } from '@tanstack/react-router'
import {
  ArrowUpDown,
  AudioLines,
  Boxes,
  Film,
  Image,
  LayoutGrid,
  Mic,
  Type,
} from 'lucide-react'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useGroupChannelStatus,
  usePublicMonitoring,
  useUpdateGroupChannelStatusOrder,
} from '@/features/dashboard/hooks/use-public-monitoring'
import {
  areStringListsEqual,
  getGroupStatusBadgeMeta,
  moveOrderItem,
  sortGroupChannelStatusDefault,
} from '@/features/dashboard/lib/channel-status-order'
import {
  measuredAvailability,
  monitorHealth,
} from '@/features/dashboard/lib/public-monitoring'
import type {
  GroupChannelHealthStatus,
  GroupChannelStatusItem,
  GroupChannelStatusPoint,
  GroupChannelStatusSummary,
  UptimeGroupResult,
} from '@/features/dashboard/types'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import {
  CATEGORY_LABEL_KEYS,
  MODEL_CAPABILITY_CATEGORIES,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { ChannelStatusOrderEditor } from './channel-status-order-editor'

import '@/styles/overview-publication.css'

const AUTO_REFRESH_SECONDS = 30
const TIMELINE_SLOT_COUNT = 60
const WINDOW_OPTIONS = [1, 6, 24, 168] as const
type WindowHours = (typeof WINDOW_OPTIONS)[number]
type StatusFilter = 'all' | GroupChannelHealthStatus

const CAPABILITY_ICONS = {
  text: Type,
  image: Image,
  video: Film,
  audio: AudioLines,
  transcription: Mic,
  other: Boxes,
} as const

function formatSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return `${(ms / 1000).toFixed(2)}s`
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

function modelKindLabelKey(kind?: string): string {
  switch (kind) {
    case 'image':
      return 'Image'
    case 'video':
      return 'Video'
    case 'audio':
      return 'Audio'
    case 'transcription':
      return 'Speech transcription'
    case 'other':
      return 'Other'
    default:
      return 'Token-billed'
  }
}

function resolveGroupCapabilities(
  item: GroupChannelStatusItem
): ModelCapabilityCategory[] {
  if (item.capabilities && item.capabilities.length > 0) {
    return MODEL_CAPABILITY_CATEGORIES.filter((cat) =>
      item.capabilities?.includes(cat)
    )
  }
  const inferred = new Set<ModelCapabilityCategory>()
  for (const modelItem of item.top_models) {
    const kind = modelItem.model_kind
    if (
      kind === 'text' ||
      kind === 'image' ||
      kind === 'video' ||
      kind === 'audio' ||
      kind === 'transcription' ||
      kind === 'other'
    ) {
      inferred.add(kind)
    }
  }
  if (inferred.size > 0) {
    return MODEL_CAPABILITY_CATEGORIES.filter((cat) => inferred.has(cat))
  }
  return item.media_only ? ['other'] : ['text']
}

function buildScopedSummary(
  groups: GroupChannelStatusItem[]
): GroupChannelStatusSummary {
  let operationalGroups = 0
  let degradedGroups = 0
  let outageGroups = 0
  let idleGroups = 0
  let totalRequests = 0
  let totalSuccess = 0
  let weightedLatency = 0
  let weightedTtft = 0
  let ttftWeight = 0
  let tpsWeighted = 0
  let tpsWeight = 0

  for (const item of groups) {
    if (item.status === 'operational') operationalGroups += 1
    else if (item.status === 'degraded') degradedGroups += 1
    else if (item.status === 'outage') outageGroups += 1
    else idleGroups += 1

    if (item.request_count > 0) {
      totalRequests += item.request_count
      totalSuccess += item.success_count
      weightedLatency += item.avg_latency_ms * item.request_count
      if (item.avg_ttft_ms > 0) {
        weightedTtft += item.avg_ttft_ms * item.request_count
        ttftWeight += item.request_count
      }
      if (item.avg_tps > 0) {
        tpsWeighted += item.avg_tps * item.request_count
        tpsWeight += item.request_count
      }
    }
  }

  return {
    total_groups: groups.length,
    operational_groups: operationalGroups,
    degraded_groups: degradedGroups,
    outage_groups: outageGroups,
    idle_groups: idleGroups,
    total_requests: totalRequests,
    success_rate:
      totalRequests > 0
        ? Math.round((totalSuccess / totalRequests) * 10000) / 100
        : 0,
    avg_latency_ms:
      totalRequests > 0 ? Math.round(weightedLatency / totalRequests) : 0,
    avg_ttft_ms: ttftWeight > 0 ? Math.round(weightedTtft / ttftWeight) : 0,
    avg_tps:
      tpsWeight > 0 ? Math.round((tpsWeighted / tpsWeight) * 100) / 100 : 0,
  }
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const gradId = useId()
  const width = 68
  const height = 24
  const padX = 2
  const padY = 3
  const pointsSource =
    values.length >= 2 ? values : [values[0] ?? 1, values[0] ?? 1]
  const minVal = Math.min(...pointsSource)
  const maxVal = Math.max(...pointsSource)
  const span = maxVal - minVal || 1
  const pts = pointsSource.map((value, idx) => ({
    x: padX + (idx / (pointsSource.length - 1)) * (width - padX * 2),
    y: padY + (1 - (value - minVal) / span) * (height - padY * 2),
  }))
  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = Math.max(1.5, Math.min(height - 1.5, p1.y + (p2.y - p0.y) / 6))
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = Math.max(1.5, Math.min(height - 1.5, p2.y - (p3.y - p1.y) / 6))
    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  const lastPt = pts.at(-1) ?? pts[0]
  const area = `${path} L ${lastPt.x.toFixed(1)} ${height} L ${pts[0].x.toFixed(1)} ${height} Z`
  return (
    <svg
      className='gm-spark-svg'
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden='true'
    >
      <defs>
        <linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor={color} stopOpacity='0.22' />
          <stop offset='100%' stopColor={color} stopOpacity='0' />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={path}
        fill='none'
        stroke={color}
        strokeWidth='1.8'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

function buildTimelineBars(
  series: GroupChannelStatusPoint[],
  windowStart?: number,
  windowEnd?: number,
  bucketSeconds = 3600,
  slotCount = TIMELINE_SLOT_COUNT
): Array<{
  key: string
  state: 'ok' | 'warn' | 'err' | 'idle'
  point?: GroupChannelStatusPoint
}> {
  if (!series.length) {
    return Array.from({ length: slotCount }, (_, idx) => ({
      key: `empty-${idx}`,
      state: 'idle' as const,
    }))
  }
  if (series.length >= slotCount) {
    return series.slice(-slotCount).map((point) => {
      let state: 'ok' | 'warn' | 'err' | 'idle' = 'ok'
      if (point.request_count <= 0) state = 'idle'
      else if (point.success_rate < 80) state = 'err'
      else if (point.success_rate < 98) state = 'warn'
      return { key: `ts-${point.ts}`, state, point }
    })
  }
  const safeBucket = bucketSeconds > 0 ? bucketSeconds : 3600
  const firstTs = series[0].ts
  const lastTs = series.at(-1)?.ts ?? firstTs
  const start =
    windowStart && windowStart > 0 ? Math.min(windowStart, firstTs) : firstTs
  const end =
    windowEnd && windowEnd > start
      ? Math.max(windowEnd, lastTs + safeBucket)
      : lastTs + safeBucket
  const span = Math.max(safeBucket, end - start)
  const byBucket = new Map<number, GroupChannelStatusPoint>()
  for (const point of series) {
    byBucket.set(point.ts, point)
  }
  const bars: Array<{
    key: string
    state: 'ok' | 'warn' | 'err' | 'idle'
    point?: GroupChannelStatusPoint
  }> = []
  for (let i = 0; i < slotCount; i++) {
    const slotCenter = start + ((i + 0.5) / slotCount) * span
    const alignedBucket = Math.floor(slotCenter / safeBucket) * safeBucket
    const point = byBucket.get(alignedBucket)
    let state: 'ok' | 'warn' | 'err' | 'idle' = 'ok'
    if (!point || point.request_count <= 0) {
      state = 'idle'
    } else if (point.success_rate < 80) {
      state = 'err'
    } else if (point.success_rate < 98) {
      state = 'warn'
    }
    bars.push({
      key: `slot-${i}`,
      state,
      point,
    })
  }
  return bars
}

function TimelineTrack({
  groupName,
  series,
  windowStart,
  windowEnd,
  bucketSeconds,
  locale,
  rightLabel,
}: {
  groupName: string
  series: GroupChannelStatusPoint[]
  windowStart?: number
  windowEnd?: number
  bucketSeconds?: number
  locale?: string
  rightLabel: string
}) {
  const { t } = useTranslation()
  const bars = useMemo(
    () =>
      buildTimelineBars(
        series,
        windowStart,
        windowEnd,
        bucketSeconds,
        TIMELINE_SLOT_COUNT
      ),
    [series, windowStart, windowEnd, bucketSeconds]
  )
  return (
    <div className='gm-probe-block'>
      <div className='gm-probe-head'>
        <span>{t('Recent request buckets')}</span>
        <span className='tabular-nums'>{rightLabel}</span>
      </div>
      <div
        className='gm-probe-track'
        aria-label={t('Recent request buckets for {{group}}', {
          group: groupName,
        })}
      >
        {bars.map((bar) => {
          const timeText = bar.point
            ? new Date(bar.point.ts * 1000).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''
          const title = bar.point
            ? `${timeText} · ${bar.point.success_rate.toFixed(1)}% (${bar.point.success_count}/${bar.point.request_count}) · ${formatSeconds(bar.point.avg_ttft_ms || bar.point.avg_latency_ms)}`
            : t('No traffic in bucket')
          let barClassName = 'gm-probe-bar'
          if (bar.state === 'warn') barClassName = 'gm-probe-bar is-warn'
          else if (bar.state === 'err') barClassName = 'gm-probe-bar is-err'
          else if (bar.state === 'idle') barClassName = 'gm-probe-bar is-idle'
          return <span key={bar.key} className={barClassName} title={title} />
        })}
      </div>
      <div className='gm-probe-axis'>
        <span>PAST</span>
        <span>NOW</span>
      </div>
    </div>
  )
}

function GroupMonitorCard({
  item,
  locale,
  countdown,
  windowStart,
  windowEnd,
  bucketSeconds,
  onSelect,
}: {
  item: GroupChannelStatusItem
  locale?: string
  countdown: number
  windowStart?: number
  windowEnd?: number
  bucketSeconds?: number
  onSelect: (item: GroupChannelStatusItem) => void
}) {
  const { t } = useTranslation()
  const meta = getGroupStatusBadgeMeta(item.status)
  const ratioLabel = item.is_auto
    ? t('Auto')
    : `${Number(item.ratio.toFixed(2))}x`
  const tpsSeries = useMemo(
    () => item.series.map((point) => point.avg_tps).filter((v) => v > 0),
    [item.series]
  )
  const rateSeries = useMemo(
    () => item.series.map((point) => point.success_rate),
    [item.series]
  )
  const ttftSeries = useMemo(
    () => item.series.map((point) => point.avg_ttft_ms).filter((v) => v > 0),
    [item.series]
  )
  const useCacheRate =
    !item.media_only &&
    (item.metric_focus === 'cache_rate' ||
      (item.metric_focus === undefined && item.cache_hit_rate !== undefined))
  const hasTps = item.avg_tps > 0
  const hasTtft = !item.media_only && item.avg_ttft_ms > 0
  const ttftValue = hasTtft ? item.avg_ttft_ms : 0
  let ttftSparkColor = '#a1a1aa'
  if (hasTtft) {
    ttftSparkColor = meta.tone === 'healthy' ? '#0ea5e9' : meta.color
  }
  let probeContent: ReactNode = <span className='gm-submetric-val'>—</span>
  if (item.media_only) {
    probeContent = (
      <span
        className='gm-submetric-val'
        title={t(
          'Non-chat media models skip active probes and show real user metrics only'
        )}
      >
        {t('Real user traffic only')}
      </span>
    )
  } else if (item.recent_probe) {
    probeContent = (
      <span
        className='gm-probe-badge'
        title={`${item.recent_probe.tested_model} · ${formatSeconds(item.recent_probe.latency_ms)}`}
      >
        <span
          className='gm-probe-badge-dot'
          data-ok={item.recent_probe.success ? 'true' : 'false'}
        />
        <span className='truncate'>
          {item.recent_probe.tested_model} ·{' '}
          {formatSeconds(item.recent_probe.latency_ms)}
        </span>
      </span>
    )
  } else if (item.request_count > 0) {
    probeContent = (
      <span
        className='gm-submetric-val'
        title={t(
          'Active real user traffic verified this group; idle probing waits until traffic cools down'
        )}
      >
        {t('Active user traffic')}
      </span>
    )
  }

  return (
    <article
      className='group-monitor-card'
      role='button'
      tabIndex={0}
      aria-label={t('View model details for {{group}}', { group: item.group })}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(item)
        }
      }}
    >
      <div className='gm-card-head'>
        <div className='gm-head-left'>
          <div className='gm-title-row'>
            <span className='gm-group-name'>{item.group}</span>
            <span className='dash-gs-ratio'>{ratioLabel}</span>
            <span className='dash-gs-ratio'>
              {t('{{count}} models', { count: item.enabled_models })}
            </span>
          </div>
          {item.description && (
            <p className='gm-group-desc'>{item.description}</p>
          )}
        </div>
        <span className='channel-status-pill' data-tone={meta.tone}>
          <span aria-hidden='true' className='dash-gs-dot' />
          <span>{t(meta.label)}</span>
        </span>
      </div>

      <TimelineTrack
        groupName={item.group}
        series={item.series}
        windowStart={windowStart}
        windowEnd={windowEnd}
        bucketSeconds={bucketSeconds}
        locale={locale}
        rightLabel={t('Refresh in {{seconds}}s', { seconds: countdown })}
      />

      <div className='gm-curves-grid'>
        <div className='gm-curve-item'>
          <span className='gm-curve-label'>{t('Throughput')}</span>
          <div className='gm-curve-main'>
            <Sparkline
              values={tpsSeries.length ? tpsSeries : [0, 0]}
              color={hasTps ? '#0ea5e9' : '#a1a1aa'}
            />
            <span className='gm-curve-val tabular-nums'>
              {hasTps ? `${item.avg_tps.toFixed(1)} tok/s` : '—'}
            </span>
          </div>
        </div>
        <div className='gm-curve-item'>
          <span className='gm-curve-label'>{t('Success rate')}</span>
          <div className='gm-curve-main'>
            <Sparkline
              values={rateSeries.length ? rateSeries : [100, 100]}
              color={meta.color}
            />
            <span className='gm-curve-val tabular-nums'>
              {item.request_count > 0
                ? `${item.success_rate.toFixed(2)}%`
                : '—'}
            </span>
          </div>
        </div>
        <div className='gm-curve-item'>
          <span className='gm-curve-label'>{t('First token')}</span>
          <div className='gm-curve-main'>
            <Sparkline
              values={hasTtft && ttftSeries.length ? ttftSeries : [0, 0]}
              color={ttftSparkColor}
            />
            <span className='gm-curve-val tabular-nums'>
              {formatSeconds(ttftValue)}
            </span>
          </div>
        </div>
      </div>

      <div className='gm-submetrics-row'>
        <div className='gm-submetric'>
          <span className='gm-submetric-label'>{t('Valid samples')}</span>
          <span
            className='gm-submetric-val tabular-nums'
            title={t('Real user requests only; active probes are excluded')}
          >
            {item.request_count > 0
              ? formatNumber(item.request_count, locale)
              : '0'}
          </span>
        </div>
        <div className='gm-submetric'>
          <span className='gm-submetric-label'>
            {useCacheRate ? t('Cache hit rate') : t('Avg duration')}
          </span>
          <span className='gm-submetric-val tabular-nums'>
            {useCacheRate
              ? formatPercent(item.cache_hit_rate)
              : formatSeconds(item.avg_latency_ms)}
          </span>
        </div>
        <div className='gm-submetric'>
          <span className='gm-submetric-label'>{t('Latest probe')}</span>
          {probeContent}
        </div>
      </div>
    </article>
  )
}

function GroupDetailSheet({
  item,
  open,
  onOpenChange,
  locale,
  windowStart,
  windowEnd,
  bucketSeconds,
}: {
  item: GroupChannelStatusItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  locale?: string
  windowStart?: number
  windowEnd?: number
  bucketSeconds?: number
}) {
  const { t } = useTranslation()
  const [modelSearch, setModelSearch] = useState('')

  useEffect(() => {
    setModelSearch('')
  }, [item?.group])

  const filteredModels = useMemo(() => {
    if (!item) return []
    const queryText = modelSearch.trim().toLowerCase()
    if (!queryText) return item.top_models
    return item.top_models.filter((modelItem) =>
      modelItem.model_name.toLowerCase().includes(queryText)
    )
  }, [item, modelSearch])

  if (!item) return null
  const meta = getGroupStatusBadgeMeta(item.status)
  const ratioLabel = item.is_auto
    ? t('Auto')
    : `${Number(item.ratio.toFixed(2))}x`
  const useCacheRate =
    !item.media_only &&
    (item.metric_focus === 'cache_rate' ||
      (item.metric_focus === undefined && item.cache_hit_rate !== undefined))
  let drawerProbeText = '—'
  if (item.media_only) {
    drawerProbeText = t('Real user traffic only')
  } else if (item.recent_probe) {
    drawerProbeText = `${item.recent_probe.tested_model} · ${formatSeconds(item.recent_probe.latency_ms)}`
  } else if (item.request_count > 0) {
    drawerProbeText = t('Active user traffic')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='w-full sm:max-w-xl'>
        <SheetHeader className='border-b pb-4'>
          <div className='flex flex-wrap items-center gap-2 pr-8'>
            <SheetTitle>{item.group}</SheetTitle>
            <span className='dash-gs-ratio'>{ratioLabel}</span>
            <span className='dash-gs-ratio'>
              {t('{{count}} models', { count: item.enabled_models })}
            </span>
            <span className='channel-status-pill' data-tone={meta.tone}>
              <span aria-hidden='true' className='dash-gs-dot' />
              <span>{t(meta.label)}</span>
            </span>
          </div>
          <SheetDescription>
            {item.description ||
              t('Real user request telemetry and model-level performance')}
          </SheetDescription>
          {resolveGroupCapabilities(item).length > 0 && (
            <div className='gm-drawer-probe-tags pt-1'>
              {resolveGroupCapabilities(item).map((cap) => {
                const CapIcon = CAPABILITY_ICONS[cap]
                return (
                  <span
                    className='dash-gs-ratio inline-flex items-center gap-1'
                    key={cap}
                  >
                    <CapIcon className='size-3' aria-hidden='true' />
                    <span>{t(CATEGORY_LABEL_KEYS[cap])}</span>
                  </span>
                )
              })}
            </div>
          )}
        </SheetHeader>

        <div className='gm-drawer-body'>
          <TimelineTrack
            groupName={item.group}
            series={item.series}
            windowStart={windowStart}
            windowEnd={windowEnd}
            bucketSeconds={bucketSeconds}
            locale={locale}
            rightLabel={
              item.request_count > 0
                ? `${formatNumber(item.request_count, locale)} ${t('req')}`
                : t('Awaiting data')
            }
          />

          <div className='gm-drawer-metrics'>
            <div className='gm-drawer-metric-box'>
              <span className='gm-submetric-label'>{t('Success rate')}</span>
              <span className='gm-submetric-val tabular-nums'>
                {item.request_count > 0
                  ? `${item.success_rate.toFixed(2)}%`
                  : '—'}
              </span>
            </div>
            <div className='gm-drawer-metric-box'>
              <span className='gm-submetric-label'>{t('Valid samples')}</span>
              <span className='gm-submetric-val tabular-nums'>
                {formatNumber(item.request_count, locale)}
              </span>
            </div>
            {item.media_only ? (
              <>
                <div className='gm-drawer-metric-box'>
                  <span className='gm-submetric-label'>
                    {t('Avg duration')}
                  </span>
                  <span className='gm-submetric-val tabular-nums'>
                    {formatSeconds(item.avg_latency_ms)}
                  </span>
                </div>
                <div className='gm-drawer-metric-box'>
                  <span className='gm-submetric-label'>
                    {t('Succeeded samples')}
                  </span>
                  <span className='gm-submetric-val tabular-nums'>
                    {formatNumber(item.success_count, locale)}
                  </span>
                </div>
                <div className='gm-drawer-metric-box'>
                  <span className='gm-submetric-label'>{t('Models')}</span>
                  <span className='gm-submetric-val tabular-nums'>
                    {formatNumber(item.enabled_models, locale)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className='gm-drawer-metric-box'>
                  <span className='gm-submetric-label'>{t('First token')}</span>
                  <span className='gm-submetric-val tabular-nums'>
                    {formatSeconds(item.avg_ttft_ms)}
                  </span>
                </div>
                <div className='gm-drawer-metric-box'>
                  <span className='gm-submetric-label'>
                    {useCacheRate ? t('Cache hit rate') : t('Avg duration')}
                  </span>
                  <span className='gm-submetric-val tabular-nums'>
                    {useCacheRate
                      ? formatPercent(item.cache_hit_rate)
                      : formatSeconds(item.avg_latency_ms)}
                  </span>
                </div>
                <div className='gm-drawer-metric-box'>
                  <span className='gm-submetric-label'>{t('Throughput')}</span>
                  <span className='gm-submetric-val tabular-nums'>
                    {item.avg_tps > 0
                      ? `${item.avg_tps.toFixed(1)} tok/s`
                      : '—'}
                  </span>
                </div>
              </>
            )}
            <div className='gm-drawer-metric-box'>
              <span className='gm-submetric-label'>{t('Latest probe')}</span>
              <span className='gm-submetric-val tabular-nums'>
                {drawerProbeText}
              </span>
            </div>
          </div>

          {item.recent_probe?.recent_models &&
            item.recent_probe.recent_models.length > 0 && (
              <div className='space-y-2'>
                <div className='gm-drawer-section-title'>
                  {t('Recently probed models')}
                </div>
                <div className='gm-drawer-probe-tags'>
                  {item.recent_probe.recent_models.map((probedModel) => (
                    <span className='dash-gs-ratio' key={probedModel}>
                      {probedModel}
                    </span>
                  ))}
                </div>
              </div>
            )}

          <div className='space-y-3'>
            <div className='gm-drawer-section-head'>
              <span className='gm-drawer-section-title'>
                {t('Model details')} ({item.top_models.length})
              </span>
              {item.top_models.length > 0 && (
                <input
                  type='search'
                  className='ch-search-input'
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder={t('Search models...')}
                  aria-label={t('Search models...')}
                />
              )}
            </div>

            {filteredModels.length > 0 ? (
              <div className='gm-drawer-model-list'>
                {filteredModels.map((modelItem) => {
                  let modelTone = 'healthy'
                  if (modelItem.success_rate < 80) modelTone = 'error'
                  else if (modelItem.success_rate < 98) modelTone = 'warning'
                  const modelUsesCache =
                    modelItem.metric_focus === 'cache_rate' ||
                    (modelItem.metric_focus === undefined &&
                      modelItem.cache_hit_rate !== undefined)
                  const showTtft =
                    modelItem.model_kind !== 'image' &&
                    modelItem.model_kind !== 'video' &&
                    modelItem.model_kind !== 'audio' &&
                    modelItem.model_kind !== 'transcription' &&
                    modelItem.avg_ttft_ms > 0
                  return (
                    <div
                      className='gm-drawer-model-row'
                      key={modelItem.model_name}
                    >
                      <div className='gm-drawer-model-top'>
                        <div className='gm-drawer-model-name-wrap'>
                          <span className='gm-model-name'>
                            {modelItem.model_name}
                          </span>
                          <span className='dash-gs-ratio'>
                            {t(modelKindLabelKey(modelItem.model_kind))}
                          </span>
                        </div>
                        <span
                          className='gm-model-rate text-xs font-medium tabular-nums'
                          data-tone={modelTone}
                        >
                          {modelItem.success_rate.toFixed(2)}%
                        </span>
                      </div>
                      <div className='gm-drawer-model-stats tabular-nums'>
                        <div className='gm-drawer-stat-cell'>
                          <span className='gm-drawer-stat-label'>
                            {t('Valid samples')}
                          </span>
                          <span className='gm-drawer-stat-val'>
                            {formatNumber(modelItem.request_count, locale)}
                          </span>
                        </div>
                        {modelUsesCache ? (
                          <>
                            <div className='gm-drawer-stat-cell'>
                              <span className='gm-drawer-stat-label'>
                                {showTtft
                                  ? t('First token')
                                  : t('Avg duration')}
                              </span>
                              <span className='gm-drawer-stat-val'>
                                {formatSeconds(
                                  showTtft
                                    ? modelItem.avg_ttft_ms
                                    : modelItem.avg_latency_ms
                                )}
                              </span>
                            </div>
                            <div className='gm-drawer-stat-cell'>
                              <span className='gm-drawer-stat-label'>
                                {t('Cache hit rate')}
                              </span>
                              <span className='gm-drawer-stat-val'>
                                {formatPercent(modelItem.cache_hit_rate)}
                              </span>
                            </div>
                            <div className='gm-drawer-stat-cell'>
                              <span className='gm-drawer-stat-label'>
                                {t('Throughput')}
                              </span>
                              <span className='gm-drawer-stat-val'>
                                {modelItem.avg_tps > 0
                                  ? `${modelItem.avg_tps.toFixed(1)} tok/s`
                                  : '—'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className='gm-drawer-stat-cell'>
                              <span className='gm-drawer-stat-label'>
                                {t('Succeeded samples')}
                              </span>
                              <span className='gm-drawer-stat-val'>
                                {formatNumber(modelItem.success_count, locale)}
                              </span>
                            </div>
                            <div className='gm-drawer-stat-cell'>
                              <span className='gm-drawer-stat-label'>
                                {t('Avg duration')}
                              </span>
                              <span className='gm-drawer-stat-val'>
                                {formatSeconds(modelItem.avg_latency_ms)}
                              </span>
                            </div>
                            <div className='gm-drawer-stat-cell'>
                              <span className='gm-drawer-stat-label'>
                                {t('Probe policy')}
                              </span>
                              <span className='gm-drawer-stat-val'>
                                {t('Real user traffic only')}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className='publication-state'>
                {t('No real user model samples in this time window.')}
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function UptimeKumaSectionCard({
  groups,
  selectedGroup,
  locale,
}: {
  groups: UptimeGroupResult[]
  selectedGroup?: string
  locale?: string
}) {
  const { t } = useTranslation()
  return (
    <>
      {groups.map((group) => (
        <section
          key={group.categoryName}
          aria-label={group.categoryName}
          className='monitor-group'
        >
          {!selectedGroup && (
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
    </>
  )
}

export function UptimePanel(props: { group?: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const isAdmin = Boolean(userRole && userRole >= ROLE.ADMIN)
  const [windowHours, setWindowHours] = useState<WindowHours>(24)
  const [selectedCapabilities, setSelectedCapabilities] = useState<
    ModelCapabilityCategory[]
  >([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS)
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(
    null
  )
  const [isReordering, setIsReordering] = useState(false)
  const [draftOrder, setDraftOrder] = useState<string[]>([])
  const [draftIsManual, setDraftIsManual] = useState(false)

  const { enabled, query, publication } = usePublicMonitoring()
  const realStatus = useGroupChannelStatus(windowHours)
  const saveOrderMutation = useUpdateGroupChannelStatusOrder()
  const refetchUptime = query.refetch
  const refetchRealStatus = realStatus.query.refetch

  const isFetching = query.isFetching || realStatus.query.isFetching

  const handleRefresh = () => {
    setCountdown(AUTO_REFRESH_SECONDS)
    void refetchUptime()
    void refetchRealStatus()
  }

  useEffect(() => {
    if (!enabled || isReordering) return
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void refetchUptime()
          void refetchRealStatus()
          return AUTO_REFRESH_SECONDS
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [enabled, isReordering, refetchUptime, refetchRealStatus])

  if (!enabled) {
    let message = t('Monitoring is not published.')
    if (publication.loading) message = t('Loading...')
    if (publication.error) message = t('Failed to load')
    return <p className='dash-panel publication-state'>{message}</p>
  }

  const allRealGroups = realStatus.query.data?.groups ?? []
  const savedCustomOrder = realStatus.query.data?.custom_order ?? []
  const hasSavedCustomOrder = savedCustomOrder.length > 0
  const canManageOrder =
    isAdmin && !props.group && (allRealGroups.length > 1 || hasSavedCustomOrder)
  const currentGroupOrder = allRealGroups.map((item) => item.group)

  let isOrderDirty = false
  if (draftIsManual !== hasSavedCustomOrder) {
    if (!draftIsManual) {
      isOrderDirty = true
    } else {
      isOrderDirty = !areStringListsEqual(draftOrder, currentGroupOrder)
    }
  } else if (draftIsManual) {
    isOrderDirty = !areStringListsEqual(draftOrder, currentGroupOrder)
  }

  const handleStartReordering = () => {
    setSelectedGroupName(null)
    setDraftOrder(currentGroupOrder)
    setDraftIsManual(hasSavedCustomOrder)
    setIsReordering(true)
  }

  const handleMoveOrderItem = (fromIndex: number, toIndex: number) => {
    setDraftOrder((prev) => {
      const base = prev.length > 0 ? prev : currentGroupOrder
      return moveOrderItem(base, fromIndex, toIndex)
    })
    setDraftIsManual(true)
  }

  const handleResetOrderDefault = () => {
    const defaultOrdered = sortGroupChannelStatusDefault(allRealGroups).map(
      (item) => item.group
    )
    setDraftOrder(defaultOrdered)
    setDraftIsManual(false)
  }

  const handleCancelReordering = () => {
    setIsReordering(false)
    setDraftOrder([])
    setDraftIsManual(hasSavedCustomOrder)
  }

  const handleSaveOrder = () => {
    const payload = draftIsManual ? draftOrder : []
    saveOrderMutation.mutate(payload, {
      onSuccess: () => {
        setIsReordering(false)
        setCountdown(AUTO_REFRESH_SECONDS)
        toast.success(
          payload.length > 0
            ? t('Channel status card order saved')
            : t('Channel status card order reset to default')
        )
      },
      onError: (error) => {
        handleServerError(error, t('Failed to save configuration'))
      },
    })
  }
  const filteredRealGroupsByRoute = allRealGroups.filter(
    (item) => !props.group || item.group === props.group
  )
  const uptimeGroups = (query.data ?? []).filter(
    (group) => !props.group || group.categoryName === props.group
  )

  const capabilityCounts: Partial<Record<ModelCapabilityCategory, number>> = {}
  for (const item of filteredRealGroupsByRoute) {
    for (const cap of resolveGroupCapabilities(item)) {
      capabilityCounts[cap] = (capabilityCounts[cap] ?? 0) + 1
    }
  }

  const availableCapabilities = MODEL_CAPABILITY_CATEGORIES.filter(
    (cap) => (capabilityCounts[cap] ?? 0) > 0
  )

  const toggleCapability = (cap: ModelCapabilityCategory) => {
    setSelectedCapabilities((prev) =>
      prev.includes(cap)
        ? prev.filter((item) => item !== cap)
        : MODEL_CAPABILITY_CATEGORIES.filter(
            (item) => item === cap || prev.includes(item)
          )
    )
  }

  const capabilityFilteredGroups = selectedCapabilities.length
    ? filteredRealGroupsByRoute.filter((item) =>
        resolveGroupCapabilities(item).some((cap) =>
          selectedCapabilities.includes(cap)
        )
      )
    : filteredRealGroupsByRoute

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visibleRealGroups = capabilityFilteredGroups.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) {
      return false
    }
    if (normalizedSearch) {
      const haystack = [
        item.group,
        item.description,
        ...item.top_models.map((m) => m.model_name),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(normalizedSearch)) {
        return false
      }
    }
    return true
  })

  const hasRealGroups = filteredRealGroupsByRoute.length > 0
  const hasUptimeGroups = uptimeGroups.length > 0
  const isPending =
    !hasRealGroups &&
    !hasUptimeGroups &&
    (query.isPending || realStatus.query.isPending)
  const isError = query.isError && realStatus.query.isError
  const summary =
    selectedCapabilities.length > 0
      ? buildScopedSummary(capabilityFilteredGroups)
      : realStatus.query.data?.summary
  const hasAnyFilter =
    selectedCapabilities.length > 0 ||
    statusFilter !== 'all' ||
    normalizedSearch.length > 0
  const handleResetFilters = () => {
    setSelectedCapabilities([])
    setStatusFilter('all')
    setSearchQuery('')
  }
  const selectedGroupItem = selectedGroupName
    ? (allRealGroups.find((item) => item.group === selectedGroupName) ?? null)
    : null

  const windowLabel = (hours: WindowHours) => {
    if (hours === 168) return t('7d')
    return `${hours}h`
  }

  const windowPills = (
    <div className='ch-window-pills' role='group' aria-label={t('Time window')}>
      {WINDOW_OPTIONS.map((hours) => (
        <button
          key={hours}
          type='button'
          className={`ch-window-pill ${windowHours === hours ? 'is-active' : ''}`}
          aria-pressed={windowHours === hours}
          onClick={() => setWindowHours(hours)}
        >
          {windowLabel(hours)}
        </button>
      ))}
    </div>
  )

  return (
    <div className='channel-status-board'>
      {hasRealGroups && isReordering && (
        <ChannelStatusOrderEditor
          groups={allRealGroups}
          draftOrder={draftOrder}
          isManual={draftIsManual}
          isDirty={isOrderDirty}
          saving={saveOrderMutation.isPending}
          onMove={handleMoveOrderItem}
          onResetDefault={handleResetOrderDefault}
          onCancel={handleCancelReordering}
          onSave={handleSaveOrder}
        />
      )}
      {hasRealGroups && !isReordering && (
        <>
          <div className='ch-top-bar'>
            {!props.group && availableCapabilities.length > 0 ? (
              <div
                className='ch-cap-line'
                role='group'
                aria-label={t('Task capabilities')}
              >
                <span className='ch-cap-label' aria-hidden='true'>
                  {t('Task capabilities')}
                </span>
                <div className='ch-cap-pills'>
                  <button
                    type='button'
                    className='ch-cap-pill'
                    aria-pressed={selectedCapabilities.length === 0}
                    onClick={() => setSelectedCapabilities([])}
                  >
                    <LayoutGrid className='size-3.5' aria-hidden='true' />
                    <span>{t('All')}</span>
                    <span className='ch-cap-count tabular-nums'>
                      {filteredRealGroupsByRoute.length}
                    </span>
                  </button>
                  {availableCapabilities.map((cap) => {
                    const Icon = CAPABILITY_ICONS[cap]
                    const active = selectedCapabilities.includes(cap)
                    return (
                      <button
                        key={cap}
                        type='button'
                        className='ch-cap-pill'
                        aria-pressed={active}
                        onClick={() => toggleCapability(cap)}
                      >
                        <Icon className='size-3.5' aria-hidden='true' />
                        <span>{t(CATEGORY_LABEL_KEYS[cap])}</span>
                        <span className='ch-cap-count tabular-nums'>
                          {capabilityCounts[cap] ?? 0}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              windowPills
            )}
            <div className='ch-top-actions'>
              {!props.group && hasAnyFilter && (
                <button
                  type='button'
                  className='ch-cap-reset'
                  onClick={handleResetFilters}
                >
                  {t('Reset')}
                </button>
              )}
              {props.group && (
                <Link
                  to='/channel-status'
                  search={{}}
                  className='dash-panel-link'
                >
                  {t('Show all groups')}
                </Link>
              )}
              {canManageOrder && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={handleStartReordering}
                >
                  <ArrowUpDown className='mr-1.5 size-3.5' aria-hidden='true' />
                  {t('Reorder cards')}
                </Button>
              )}
              <span className='ch-countdown-chip tabular-nums'>
                <span aria-hidden='true' className='ch-autorefresh-dot' />
                <span>
                  {t('Auto refresh · {{seconds}}s', { seconds: countdown })}
                </span>
              </span>
              <Button
                size='sm'
                variant='outline'
                disabled={isFetching}
                onClick={handleRefresh}
              >
                {t('Refresh')}
              </Button>
            </div>
          </div>

          {summary && !props.group && (
            <div className='ch-stat-strip'>
              <button
                type='button'
                className='ch-stat-cell-btn'
                aria-pressed={statusFilter === 'all'}
                data-active-filter='false'
                onClick={() => setStatusFilter('all')}
              >
                <span className='ch-stat-label'>{t('Monitored groups')}</span>
                <div className='ch-stat-val-row'>
                  <span className='ch-stat-val tabular-nums'>
                    {summary.total_groups}
                  </span>
                  <span className='ch-stat-sub tabular-nums'>
                    {summary.total_requests > 0
                      ? `${summary.success_rate.toFixed(2)}% · ${formatNumber(summary.total_requests, locale)} ${t('req')}`
                      : t('Awaiting data')}
                  </span>
                </div>
              </button>
              <button
                type='button'
                className='ch-stat-cell-btn'
                aria-pressed={statusFilter === 'operational'}
                data-active-filter={
                  statusFilter === 'operational' ? 'true' : 'false'
                }
                onClick={() => setStatusFilter('operational')}
              >
                <span className='ch-stat-label'>{t('Operational')}</span>
                <div className='ch-stat-val-row'>
                  <span
                    className='ch-stat-val tabular-nums'
                    data-tone={
                      summary.operational_groups > 0 ? 'healthy' : undefined
                    }
                  >
                    {summary.operational_groups}
                  </span>
                  <span className='ch-stat-sub'>
                    {t('Stable availability')}
                  </span>
                </div>
              </button>
              <button
                type='button'
                className='ch-stat-cell-btn'
                aria-pressed={statusFilter === 'degraded'}
                data-active-filter={
                  statusFilter === 'degraded' ? 'true' : 'false'
                }
                onClick={() => setStatusFilter('degraded')}
              >
                <span className='ch-stat-label'>{t('Degraded')}</span>
                <div className='ch-stat-val-row'>
                  <span
                    className='ch-stat-val tabular-nums'
                    data-tone={
                      summary.degraded_groups > 0 ? 'warning' : undefined
                    }
                  >
                    {summary.degraded_groups}
                  </span>
                  <span className='ch-stat-sub'>
                    {t('Elevated error or latency')}
                  </span>
                </div>
              </button>
              <button
                type='button'
                className='ch-stat-cell-btn'
                aria-pressed={statusFilter === 'outage'}
                data-active-filter={
                  statusFilter === 'outage' ? 'true' : 'false'
                }
                onClick={() => setStatusFilter('outage')}
              >
                <span className='ch-stat-label'>{t('Outage')}</span>
                <div className='ch-stat-val-row'>
                  <span
                    className='ch-stat-val tabular-nums'
                    data-tone={summary.outage_groups > 0 ? 'error' : undefined}
                  >
                    {summary.outage_groups}
                  </span>
                  <span className='ch-stat-sub'>
                    {t('Idle: {{count}}', { count: summary.idle_groups })}
                  </span>
                </div>
              </button>
            </div>
          )}

          {!props.group && (
            <div className='ch-toolbar'>
              <div className='ch-toolbar-left'>
                {availableCapabilities.length > 0 && windowPills}
                <input
                  type='search'
                  className='ch-search-input'
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('Search groups, descriptions, or models...')}
                  aria-label={t('Search groups, descriptions, or models...')}
                />
              </div>
              <div
                className='ch-filter-pills'
                role='group'
                aria-label={t('Filter by status')}
              >
                {(
                  [
                    ['all', 'All'],
                    ['operational', 'Operational'],
                    ['degraded', 'Degraded'],
                    ['outage', 'Outage'],
                    ['idle', 'Awaiting data'],
                  ] as const
                ).map(([value, labelKey]) => (
                  <button
                    key={value}
                    type='button'
                    className={`ch-filter-pill ${statusFilter === value ? 'is-active' : ''}`}
                    aria-pressed={statusFilter === value}
                    onClick={() => setStatusFilter(value)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibleRealGroups.length > 0 ? (
            <div className='channel-groups-grid'>
              {visibleRealGroups.map((item) => (
                <GroupMonitorCard
                  key={item.group}
                  item={item}
                  locale={locale}
                  countdown={countdown}
                  windowStart={realStatus.query.data?.window_start}
                  windowEnd={realStatus.query.data?.window_end}
                  bucketSeconds={realStatus.query.data?.bucket_seconds}
                  onSelect={(selected) => setSelectedGroupName(selected.group)}
                />
              ))}
            </div>
          ) : (
            <p className='dash-panel publication-state'>
              {t('No matching group status records.')}
            </p>
          )}

          <GroupDetailSheet
            item={selectedGroupItem}
            open={selectedGroupItem !== null}
            onOpenChange={(open) => {
              if (!open) setSelectedGroupName(null)
            }}
            locale={locale}
            windowStart={realStatus.query.data?.window_start}
            windowEnd={realStatus.query.data?.window_end}
            bucketSeconds={realStatus.query.data?.bucket_seconds}
          />
        </>
      )}

      {(!hasRealGroups || hasUptimeGroups) && (
        <section
          className='dash-panel monitor-details'
          aria-label={hasRealGroups ? t('External probes') : t('Group status')}
        >
          <div className='dash-panel-head'>
            <h2 className='dash-panel-title'>
              {hasRealGroups
                ? t('External probes')
                : props.group || t('Group status')}
            </h2>
            {!hasRealGroups && (
              <div className='flex flex-wrap items-center gap-2'>
                {props.group && (
                  <Link
                    to='/channel-status'
                    search={{}}
                    className='dash-panel-link'
                  >
                    {t('Show all groups')}
                  </Link>
                )}
                <Button
                  size='sm'
                  variant='outline'
                  disabled={isFetching}
                  onClick={handleRefresh}
                >
                  {t('Refresh')}
                </Button>
              </div>
            )}
          </div>
          {isPending && (
            <p role='status' className='publication-state'>
              {t('Loading...')}
            </p>
          )}
          {isError && (
            <p role='alert' className='publication-state'>
              {t('Failed to load')}
            </p>
          )}
          {!isPending && !isError && !hasRealGroups && !hasUptimeGroups && (
            <p className='publication-state'>
              {props.group
                ? t('This group is no longer published.')
                : t('No uptime monitoring configured')}
            </p>
          )}
          {hasUptimeGroups && (
            <UptimeKumaSectionCard
              groups={uptimeGroups}
              selectedGroup={props.group}
              locale={locale}
            />
          )}
        </section>
      )}
    </div>
  )
}
