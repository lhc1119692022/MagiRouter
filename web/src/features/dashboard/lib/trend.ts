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
import type { QuotaDataItem } from '../types'

export type TrendMetric = 'quota' | 'count' | 'token'

export type TrendBucket = {
  /** Bucket start, in seconds since the epoch. */
  startedAt: number
  quota: number
  count: number
  token: number
}

/** Split a window into evenly sized buckets and fold the rows into them. */
export function bucketTrend(
  rows: QuotaDataItem[],
  startTimestamp: number,
  endTimestamp: number,
  bucketCount: number
): TrendBucket[] {
  const span = Math.max(1, endTimestamp - startTimestamp)
  const bucketMs = span / bucketCount
  const buckets: TrendBucket[] = Array.from(
    { length: bucketCount },
    (_, i) => ({
      startedAt: startTimestamp + Math.round(i * bucketMs),
      quota: 0,
      count: 0,
      token: 0,
    })
  )

  for (const row of rows) {
    const timestamp = Number(row.created_at) || startTimestamp
    const raw = Math.floor((timestamp - startTimestamp) / bucketMs)
    const index = Math.min(bucketCount - 1, Math.max(0, raw))
    buckets[index].quota += Number(row.quota) || 0
    buckets[index].count += Number(row.count) || 0
    buckets[index].token += Number(row.token_used) || 0
  }

  return buckets
}

/** Largest value in the series, never zero so the scale stays usable. */
export function peakValue(buckets: TrendBucket[], metric: TrendMetric): number {
  let peak = 0
  for (const bucket of buckets) {
    if (bucket[metric] > peak) peak = bucket[metric]
  }
  return peak > 0 ? peak : 1
}

export type BarGeometry = {
  x: number
  y: number
  width: number
  height: number
  /** Full-width hit target covering the whole plot height for this bucket. */
  hitX: number
  hitWidth: number
}

/** Lay out one bar per bucket inside the plot box, in SVG user units. */
export function layoutBars(
  buckets: TrendBucket[],
  metric: TrendMetric,
  plot: { left: number; top: number; width: number; height: number }
): BarGeometry[] {
  const peak = peakValue(buckets, metric)
  const slot = plot.width / Math.max(1, buckets.length)
  const barWidth = Math.max(1, Math.round(slot * 0.62))

  return buckets.map((bucket, index) => {
    const height = (bucket[metric] / peak) * plot.height
    return {
      x: Math.round(plot.left + index * slot + (slot - barWidth) / 2),
      y: Math.round(plot.top + plot.height - height),
      width: barWidth,
      height: Math.max(bucket[metric] > 0 ? 2 : 0, Math.round(height)),
      hitX: Math.round(plot.left + index * slot),
      hitWidth: Math.round(slot),
    }
  })
}
