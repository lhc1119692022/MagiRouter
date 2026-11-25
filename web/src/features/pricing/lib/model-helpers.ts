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
import { EXCLUDED_GROUPS, FILTER_ALL, QUOTA_TYPE_VALUES } from '../constants'
import type { PricingModel } from '../types'

// ----------------------------------------------------------------------------
// Model Helper Utilities
// ----------------------------------------------------------------------------

/**
 * Get available groups for a model
 */
export function getAvailableGroups(
  model: PricingModel,
  usableGroup: Record<string, { desc: string; ratio: number }>
): string[] {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []

  return Object.keys(usableGroup)
    .filter((g) => !EXCLUDED_GROUPS.includes(g))
    .filter((g) => modelEnableGroups.includes(g))
}

/**
 * Read a configured group ratio while preserving valid zero ratios.
 */
export function getConfiguredGroupRatio(
  groupRatio: Record<string, number>,
  group: string
): number {
  const ratio = groupRatio[group]
  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 1
}

export interface DisplayGroupResolution {
  group?: string
  ratio: number
  isSelectedGroup: boolean
}

/**
 * Resolve the active group and multiplier for model square summary prices.
 *
 * When no specific group is selected, picks the lowest-multiplier group
 * available to the viewer. When a group filter is active, uses that group.
 */
export function resolveDisplayGroup(
  model: PricingModel,
  selectedGroup?: string
): DisplayGroupResolution {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups.filter(
        (group) => group !== FILTER_ALL && !EXCLUDED_GROUPS.includes(group)
      )
    : []
  const groupRatio = model.group_ratio || {}

  if (
    selectedGroup &&
    selectedGroup !== FILTER_ALL &&
    modelEnableGroups.includes(selectedGroup)
  ) {
    return {
      group: selectedGroup,
      ratio: getConfiguredGroupRatio(groupRatio, selectedGroup),
      isSelectedGroup: true,
    }
  }

  if (modelEnableGroups.length === 0) {
    return { group: undefined, ratio: 1, isSelectedGroup: false }
  }

  let bestGroup: string | undefined
  let minRatio = Number.POSITIVE_INFINITY

  for (const group of modelEnableGroups) {
    const ratio = Object.hasOwn(groupRatio, group)
      ? groupRatio[group]
      : Number.NaN
    if (
      typeof ratio === 'number' &&
      Number.isFinite(ratio) &&
      ratio < minRatio
    ) {
      minRatio = ratio
      bestGroup = group
    }
  }

  if (minRatio === Number.POSITIVE_INFINITY) {
    return {
      group: modelEnableGroups[0],
      ratio: 1,
      isSelectedGroup: false,
    }
  }

  return {
    group: bestGroup,
    ratio: minRatio,
    isSelectedGroup: false,
  }
}

/**
 * Resolve the group ratio used by model square summary prices.
 *
 * When no specific group is selected, the model square shows the best price
 * available to the viewer. When a group filter is active, it shows that
 * group's price instead.
 */
export function getDisplayGroupRatio(
  model: PricingModel,
  selectedGroup?: string
): number {
  return resolveDisplayGroup(model, selectedGroup).ratio
}

/**
 * Replace model placeholder in endpoint path
 */
export function replaceModelInPath(path: string, modelName: string): string {
  return path.replaceAll('{model}', modelName)
}

/**
 * Check if model is token-based pricing
 */
export function isTokenBasedModel(model: PricingModel): boolean {
  return model.quota_type === QUOTA_TYPE_VALUES.TOKEN
}
