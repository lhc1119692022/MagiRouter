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

export type ModelShare = {
  model: string
  quota: number
  /** Portion of the total quota, 0..1. */
  share: number
}

/**
 * Sum quota per model and return the largest consumers.
 *
 * Rows without a model name are ignored: they cannot be attributed, and folding
 * them into a placeholder would put a fake entry at the top of the list.
 */
export function aggregateModelShare(
  rows: QuotaDataItem[],
  limit: number
): ModelShare[] {
  const totals = new Map<string, number>()
  let sum = 0

  for (const row of rows) {
    const model = (row.model_name || '').trim()
    if (!model) continue
    const quota = Number(row.quota) || 0
    totals.set(model, (totals.get(model) ?? 0) + quota)
    sum += quota
  }

  if (sum <= 0) return []

  return [...totals.entries()]
    .map(([model, quota]) => ({ model, quota, share: quota / sum }))
    .sort((a, b) => b.quota - a.quota || a.model.localeCompare(b.model))
    .slice(0, limit)
}

/** Width of a share bar in percent, never collapsing a real value to nothing. */
export function shareBarWidth(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return '0%'
  return `${Math.max(2, Math.min(100, share * 100)).toFixed(1)}%`
}
