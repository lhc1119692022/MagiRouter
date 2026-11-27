import { formatCompactNumber } from '@/lib/format'

export function formatOverviewMoney(
  value: number,
  symbol: string,
  locale: string | undefined,
  signed = false
): string {
  const safeVal = Number.isFinite(value) ? value : 0
  const absVal = Math.abs(safeVal)
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal)
  if (safeVal < 0) return `-${symbol}${formatted}`
  if (signed && safeVal > 0) return `+${symbol}${formatted}`
  return `${symbol}${formatted}`
}

export function formatAxisMoney(
  value: number,
  symbol: string,
  locale: string | undefined
): string {
  const safeVal = Number.isFinite(value) ? value : 0
  const absVal = Math.abs(safeVal)
  const prefix = safeVal < 0 ? `-${symbol}` : symbol
  if (absVal >= 1000) {
    return `${prefix}${formatCompactNumber(absVal, locale)}`
  }
  if (absVal === 0 || absVal >= 1) {
    return `${prefix}${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
    }).format(absVal)}`
  }
  return `${prefix}${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 4,
  }).format(absVal)}`
}

export function formatDeltaPercent(
  value: number | null | undefined,
  locale: string | undefined
): string | null {
  if (value == null || !Number.isFinite(value)) return null
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(Math.abs(value))
  if (value > 0) return `+${formatted}%`
  if (value < 0) return `-${formatted}%`
  return '0%'
}

export function formatRateDeltaPoints(
  value: number | null | undefined,
  locale: string | undefined
): string | null {
  if (value == null || !Number.isFinite(value)) return null
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  if (value > 0) return `+${formatted} pp`
  if (value < 0) return `-${formatted} pp`
  return '0 pp'
}

export function formatSignedInt(
  value: number,
  locale: string | undefined
): string {
  const formatted = new Intl.NumberFormat(locale).format(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return '0'
}

export function formatOneDecimal(
  value: number,
  locale: string | undefined
): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    value
  )
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx++
  }
  return `${size.toFixed(size >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

export function formatShortDateTime(
  unixSeconds: number,
  locale: string | undefined
): string {
  if (!unixSeconds) return '—'
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000))
}

export function formatBucketAxisLabel(
  label: string,
  bucketUnit: 'hour' | 'day'
): string {
  if (bucketUnit === 'hour') {
    const parts = label.split(' ')
    return parts[1] ?? label
  }
  return label.length >= 10 ? label.slice(5) : label
}
