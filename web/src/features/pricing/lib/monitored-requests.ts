import {
  getSuccessRateLevel,
  shouldAllowCriticalSuccessRate,
} from '@/features/performance-metrics/lib/format'
import type { SuccessRatePoint } from '@/features/performance-metrics/types'
import { formatTimestampToDate } from '@/lib/format'

export type MonitoringWindow = { window_start?: number; window_end?: number }

const HOUR_SECONDS = 3600
export const DEFAULT_MONITOR_SLOT_COUNT = 24

export type HourlyMonitorSlotState = 'empty' | 'ok' | 'good' | 'warn' | 'err'

export type HourlyMonitorSlot = {
  key: string
  ts?: number
  rate?: number
  state: HourlyMonitorSlotState
}

export function isMeasuredRate(rate: number | undefined): rate is number {
  return rate != null && Number.isFinite(rate) && rate >= 0 && rate <= 100
}

export function observedRequestSamples(
  series?: SuccessRatePoint[],
  window?: MonitoringWindow
): SuccessRatePoint[] {
  return (series ?? [])
    .filter(
      (point) =>
        Number.isFinite(new Date(point.ts * 1000).getTime()) &&
        isMeasuredRate(point.success_rate) &&
        (window?.window_start == null || point.ts >= window.window_start) &&
        (window?.window_end == null || point.ts <= window.window_end)
    )
    .sort((first, second) => first.ts - second.ts)
}

export function monitoringWindowLabel(window?: MonitoringWindow): string {
  const start = window?.window_start
  const end = window?.window_end
  if (
    start == null ||
    end == null ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start <= 0 ||
    end < start
  ) {
    return ''
  }
  return `${formatTimestampToDate(start)} – ${formatTimestampToDate(end)}`
}

export function buildHourlyMonitorSlots(
  series?: SuccessRatePoint[],
  window?: MonitoringWindow,
  hours = DEFAULT_MONITOR_SLOT_COUNT,
  overallRate?: number
): HourlyMonitorSlot[] {
  const slotCount = Math.max(1, Math.floor(hours))
  const observed = observedRequestSamples(series, window)

  if (observed.length === 0) {
    return Array.from({ length: slotCount }, (_, index) => ({
      key: `empty-${index}`,
      state: 'empty',
    }))
  }

  const byHour = new Map<number, SuccessRatePoint>()
  for (const point of observed) {
    const hourTs = Math.floor(point.ts / HOUR_SECONDS) * HOUR_SECONDS
    byHour.set(hourTs, point)
  }

  const allowCritical = shouldAllowCriticalSuccessRate(
    isMeasuredRate(overallRate) ? overallRate : undefined,
    observed.map((point) => point.success_rate)
  )

  let startHour: number
  if (
    window?.window_start != null &&
    Number.isFinite(window.window_start) &&
    window.window_start > 0
  ) {
    startHour = Math.floor(window.window_start / HOUR_SECONDS) * HOUR_SECONDS
  } else {
    const latestPoint = observed.at(-1)
    const latestTs = latestPoint ? latestPoint.ts : 0
    const endHour = Math.floor(latestTs / HOUR_SECONDS) * HOUR_SECONDS
    startHour = endHour - (slotCount - 1) * HOUR_SECONDS
  }

  return Array.from({ length: slotCount }, (_, index) => {
    const bucketTs = startHour + index * HOUR_SECONDS
    const sample = byHour.get(bucketTs)
    if (!sample) {
      return {
        key: `${bucketTs}`,
        ts: bucketTs,
        state: 'empty',
      }
    }

    const level = getSuccessRateLevel(sample.success_rate, { allowCritical })
    let state: HourlyMonitorSlotState = 'empty'
    if (level === 'excellent') {
      state = 'ok'
    } else if (level === 'good') {
      state = 'good'
    } else if (level === 'warning') {
      state = 'warn'
    } else if (level === 'critical') {
      state = 'err'
    }

    return {
      key: `${bucketTs}`,
      ts: sample.ts,
      rate: sample.success_rate,
      state,
    }
  })
}
