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
import {
  getConfiguredTaskCapabilities,
  getModelCategories,
  getModelTaskCapabilities,
  getOrdinaryModelTags,
  MODEL_CAPABILITY_CATEGORIES,
  type ModelCapabilityCategory,
  type ModelTaskCapability,
} from '@/lib/model-task-capabilities'

import {
  SORT_OPTIONS,
  EXCLUDED_GROUPS,
  FILTER_ALL,
  QUOTA_TYPES,
  QUOTA_TYPE_VALUES,
  ENDPOINT_TYPES,
  type QuotaTypeOption,
  type SortOption,
} from '../constants'
import type { PriceMode, PricingModel } from '../types'
import {
  getCurrentTimePricingTiers,
  splitBillingExprAndRequestRules,
  type ParsedTier,
} from './billing-expr'
import { compileBillingExpression } from './billing-expression/parser'
import { visitExpression } from './billing-expression/types'
import {
  getCardExamplePrice,
  getDynamicPricingSummary,
  hasTaskUsageSchema,
  isUnconfiguredTaskUsageModel,
} from './dynamic-price'
import { getDisplayGroupRatio, isTokenBasedModel } from './model-helpers'
import { withBasePricing } from './plugin-pricing'
import { calculateTokenPrice } from './price'

// ----------------------------------------------------------------------------
// Filter Utilities
// ----------------------------------------------------------------------------

/**
 * Filter models by search query
 */
export function filterBySearch(
  models: PricingModel[],
  query: string
): PricingModel[] {
  if (!query) return models

  const lowerQuery = query.toLowerCase()
  return models.filter(
    (m) =>
      m.model_name?.toLowerCase().includes(lowerQuery) ||
      m.description?.toLowerCase().includes(lowerQuery) ||
      getOrdinaryModelTags(m.tags)
        .join(',')
        .toLowerCase()
        .includes(lowerQuery) ||
      m.vendor_name?.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Filter models by vendor
 */
export function filterByVendor(
  models: PricingModel[],
  vendor: string | readonly string[]
): PricingModel[] {
  const selected = new Set(typeof vendor === 'string' ? [vendor] : vendor)
  if (!selected.size || selected.has(FILTER_ALL)) return models
  return models.filter(
    (model) => !!model.vendor_name && selected.has(model.vendor_name)
  )
}

/**
 * Filter models by group
 */
export function filterByGroup(
  models: PricingModel[],
  group: string
): PricingModel[] {
  if (group === FILTER_ALL) return models
  return models.filter((m) => m.enable_groups?.includes(group))
}

/** Pricing category of the active configuration, shared by filters and counts. */
export function getModelQuotaType(
  listedModel: PricingModel
): Exclude<QuotaTypeOption, 'all'> | undefined {
  const model = withBasePricing(listedModel)
  // Task-usage models retain their own category.
  if (hasTaskUsageSchema(model)) return QUOTA_TYPES.TASK

  if (model.billing_mode === 'tiered_expr' && model.billing_expr) {
    const compiled = compileBillingExpression(model.billing_expr)
    if (compiled.status === 'ready') {
      if (!compiled.functions.has('fixed')) return QUOTA_TYPES.TOKEN

      // Only models whose pricing leaves are all fixed count as per-request.
      let hasTokenPricing = false
      visitExpression(compiled.ast, (node) => {
        if (node.kind !== 'call' || node.name !== 'tier') return
        const price = node.args[1]
        if (price.kind !== 'call' || price.name !== 'fixed') {
          hasTokenPricing = true
        }
      })
      return hasTokenPricing ? QUOTA_TYPES.TOKEN : QUOTA_TYPES.REQUEST
    }
  }

  // Preserve legacy classification when the expression cannot be parsed.
  if (model.quota_type === QUOTA_TYPE_VALUES.TOKEN) return QUOTA_TYPES.TOKEN
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
    return QUOTA_TYPES.REQUEST
  }
  return undefined
}

/**
 * Filter models by quota type
 */
export function filterByQuotaType(
  models: PricingModel[],
  quotaType: string
): PricingModel[] {
  if (quotaType === QUOTA_TYPES.ALL) return models
  return models.filter((model) => getModelQuotaType(model) === quotaType)
}

/**
 * Filter models by endpoint type
 */
export function filterByEndpointType(
  models: PricingModel[],
  endpointType: string
): PricingModel[] {
  if (endpointType === ENDPOINT_TYPES.ALL) return models
  return models.filter((m) =>
    m.supported_endpoint_types?.includes(endpointType)
  )
}

type SortPriceKind = 'input' | 'output' | 'request'

const PRICE_SORTS: Partial<
  Record<SortOption, { kind: SortPriceKind; dir: 1 | -1 }>
> = {
  [SORT_OPTIONS.INPUT_PRICE_LOW]: { kind: 'input', dir: 1 },
  [SORT_OPTIONS.INPUT_PRICE_HIGH]: { kind: 'input', dir: -1 },
  [SORT_OPTIONS.OUTPUT_PRICE_LOW]: { kind: 'output', dir: 1 },
  [SORT_OPTIONS.OUTPUT_PRICE_HIGH]: { kind: 'output', dir: -1 },
  [SORT_OPTIONS.REQUEST_PRICE_LOW]: { kind: 'request', dir: 1 },
  [SORT_OPTIONS.REQUEST_PRICE_HIGH]: { kind: 'request', dir: -1 },
}

/**
 * Base USD price shown on the model card: input/output per 1M tokens, request
 * per call (task models use their first usage example). Undefined when the
 * model has no price of that kind.
 */
function getSortPrice(
  listedModel: PricingModel,
  kind: SortPriceKind
): number | undefined {
  const model = withBasePricing(listedModel)
  if (kind === 'request') {
    const example = getCardExamplePrice(model, { tokenUnit: 'M' })
    if (example) return example.total
  }
  const summary = getDynamicPricingSummary(model, { tokenUnit: 'M' })
  if (kind === 'request') {
    if (summary) {
      return summary.entries.find(
        (entry) => entry.field === 'fixedPrice' || entry.field === 'modelPrice'
      )?.value
    }
    return isTokenBasedModel(model) ? undefined : model.model_price
  }
  if (summary) {
    const field = kind === 'input' ? 'inputPrice' : 'outputPrice'
    return summary.entries.find(
      (entry) => entry.field === field && entry.unit === 'token'
    )?.value
  }
  if (!isTokenBasedModel(model) || isUnconfiguredTaskUsageModel(model)) {
    return undefined
  }
  return calculateTokenPrice(model, kind, 1)
}

export type SortModelsOptions = {
  selectedGroup?: string
  priceMode?: PriceMode
}

function getEffectiveCardPrice(
  listedModel: PricingModel,
  options?: SortModelsOptions
): number | undefined {
  const model = withBasePricing(listedModel)
  const ratio =
    options?.priceMode === 'official'
      ? 1
      : getDisplayGroupRatio(model, options?.selectedGroup)
  const summary = getDynamicPricingSummary(model, { tokenUnit: 'M' })

  if (summary && summary.primaryEntries.length > 0) {
    const activeTiers =
      !summary.isTaskUsage && summary.isTimePricing
        ? (getCurrentTimePricingTiers(
            splitBillingExprAndRequestRules(model.billing_expr || '')
              .billingExpr,
            new Date()
          ) ?? summary.tiers)
        : summary.tiers

    let bestRequest = Number.POSITIVE_INFINITY
    for (const tier of activeTiers) {
      if (
        !('unitPrices' in tier) &&
        tier.billingUnit === 'request' &&
        typeof tier.fixedPrice === 'number' &&
        Number.isFinite(tier.fixedPrice) &&
        tier.fixedPrice >= 0 &&
        tier.fixedPrice < bestRequest
      ) {
        bestRequest = tier.fixedPrice
      }
    }
    if (!Number.isFinite(bestRequest)) {
      for (const entry of summary.primaryEntries) {
        if (entry.unit === 'request' || entry.unit === 'image') {
          const candidate = entry.minValue ?? entry.value
          if (
            Number.isFinite(candidate) &&
            candidate >= 0 &&
            candidate < bestRequest
          ) {
            bestRequest = candidate
          }
        }
      }
    }
    if (Number.isFinite(bestRequest)) {
      return bestRequest * ratio
    }

    if (summary.isTaskUsage) {
      const primary = summary.primaryEntries[0]
      const minValue = primary.minValue ?? primary.value
      return Number.isFinite(minValue) && minValue >= 0
        ? minValue * ratio
        : undefined
    }

    let bestInput = Number.POSITIVE_INFINITY
    for (const tier of activeTiers) {
      if (!('unitPrices' in tier) && tier.billingUnit !== 'request') {
        const input = Number((tier as ParsedTier).inputPrice)
        if (Number.isFinite(input) && input >= 0 && input < bestInput) {
          bestInput = input
        }
      }
    }
    if (Number.isFinite(bestInput)) {
      return bestInput * ratio
    }

    const primary = summary.primaryEntries[0]
    const fallbackValue = primary.minValue ?? primary.value
    return Number.isFinite(fallbackValue) && fallbackValue >= 0
      ? fallbackValue * ratio
      : undefined
  }

  if (isUnconfiguredTaskUsageModel(model) || model.price_unconfigured) {
    return undefined
  }

  if (isTokenBasedModel(model)) {
    const inputPrice = calculateTokenPrice(model, 'input', 1)
    return Number.isFinite(inputPrice) && inputPrice >= 0
      ? inputPrice * ratio
      : undefined
  }

  return typeof model.model_price === 'number' &&
    Number.isFinite(model.model_price) &&
    model.model_price >= 0
    ? model.model_price * ratio
    : undefined
}

/**
 * Sort models by specified option
 */
export function sortModels(
  models: PricingModel[],
  sortBy: string,
  options?: SortModelsOptions
): PricingModel[] {
  const sorted = [...models]

  if (sortBy === SORT_OPTIONS.PRICE_ASC || sortBy === SORT_OPTIONS.PRICE_DESC) {
    const direction = sortBy === SORT_OPTIONS.PRICE_ASC ? 1 : -1
    const prices = new Map(
      sorted.map((model) => [model, getEffectiveCardPrice(model, options)])
    )
    sorted.sort((first, second) => {
      const priceA = prices.get(first)
      const priceB = prices.get(second)
      if (priceA === undefined || priceB === undefined) {
        const missingDiff =
          Number(priceA === undefined) - Number(priceB === undefined)
        if (missingDiff !== 0) return missingDiff
      } else if (priceA !== priceB) {
        return direction * (priceA - priceB)
      }
      return (first.model_name || '').localeCompare(second.model_name || '')
    })
    return sorted
  }

  const priceSort = PRICE_SORTS[sortBy as SortOption]
  if (priceSort) {
    // Extracting the price parses the billing expression, so compute once
    const price = new Map(
      sorted.map((m) => [m, getSortPrice(m, priceSort.kind)])
    )
    // Models without this kind of price stay last in both directions
    sorted.sort((a, b) => {
      const priceA = price.get(a)
      const priceB = price.get(b)
      if (priceA === undefined || priceB === undefined) {
        return Number(priceA === undefined) - Number(priceB === undefined)
      }
      return priceSort.dir * (priceA - priceB)
    })
    return sorted
  }

  switch (sortBy) {
    case SORT_OPTIONS.TIME_DESC:
    case SORT_OPTIONS.TIME_ASC: {
      const direction = sortBy === SORT_OPTIONS.TIME_ASC ? 1 : -1
      sorted.sort((first, second) => {
        const timeDiff =
          ((first.created_time ?? 0) - (second.created_time ?? 0)) * direction
        if (timeDiff !== 0) return timeDiff
        const idDiff = ((first.id ?? 0) - (second.id ?? 0)) * direction
        if (idDiff !== 0) return idDiff
        return (first.model_name || '').localeCompare(second.model_name || '')
      })
      break
    }
    case SORT_OPTIONS.NAME:
      sorted.sort((a, b) =>
        (a.model_name || '').localeCompare(b.model_name || '')
      )
      break
    case SORT_OPTIONS.NAME_DESC:
      sorted.sort((a, b) =>
        (b.model_name || '').localeCompare(a.model_name || '')
      )
      break
  }

  return sorted
}

/**
 * Apply all filters and sorting to models
 */
export function filterAndSortModels(
  models: PricingModel[],
  filters: {
    search: string
    vendor: string | readonly string[]
    group: string
    quotaType: string
    endpointType: string
    tag: string
    sortBy: string
    priceMode?: PriceMode
  }
): PricingModel[] {
  let result = filterBySearch(models, filters.search)
  result = filterByVendor(result, filters.vendor)
  result = filterByGroup(result, filters.group)
  result = filterByQuotaType(result, filters.quotaType)
  result = filterByEndpointType(result, filters.endpointType)
  result = filterByTag(result, filters.tag)
  result = sortModels(result, filters.sortBy, {
    selectedGroup: filters.group,
    priceMode: filters.priceMode,
  })

  return result
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(tagsString?: string): string[] {
  if (!tagsString) return []
  return getOrdinaryModelTags(tagsString)
}

/**
 * Extract all unique tags from models
 */
export function extractAllTags(models: PricingModel[]): string[] {
  const tagSet = new Set<string>()

  models.forEach((model) => {
    if (model.tags) {
      const tags = parseTags(model.tags)
      tags.forEach((tag) => {
        tagSet.add(tag.toLowerCase())
      })
    }
  })

  return [...tagSet].sort((a, b) => a.localeCompare(b))
}

/**
 * Filter models by tag
 */
export function filterByTag(
  models: PricingModel[],
  tag: string
): PricingModel[] {
  if (tag === FILTER_ALL) return models

  const tagLower = tag.toLowerCase()
  return models.filter((m) => {
    if (!m.tags) return false
    const modelTags = parseTags(m.tags).map((t) => t.toLowerCase())
    return modelTags.includes(tagLower)
  })
}

export type TaskCapabilityFilter =
  | 'all'
  | 'creative'
  | ModelCapabilityCategory
  | ModelTaskCapability

export function expandTaskFilters(
  filters: readonly TaskCapabilityFilter[]
): ModelCapabilityCategory[] {
  const active = new Set<ModelCapabilityCategory>()
  for (const filter of filters) {
    switch (filter) {
      case 'all':
        break
      case 'creative':
        active.add('image').add('video').add('audio')
        break
      case 'image-to-image':
      case 'text-to-image':
        active.add('image')
        break
      case 'image-to-video':
      case 'text-to-video':
        active.add('video')
        break
      case 'text-to-speech':
      case 'audio-generation':
        active.add('audio')
        break
      case 'speech-to-text':
        active.add('transcription')
        break
      case 'text-generation':
        active.add('text')
        break
      default:
        active.add(filter)
    }
  }
  return MODEL_CAPABILITY_CATEGORIES.filter((category) => active.has(category))
}

export function matchesTaskFilter(
  model: PricingModel,
  task: TaskCapabilityFilter
): boolean {
  if (task === 'all') return true
  const categories = getModelCategories(model)
  return expandTaskFilters([task]).some((category) =>
    categories.includes(category)
  )
}

export function getCatalogFacets(
  models: readonly PricingModel[],
  usableGroups: Record<string, unknown>
) {
  const categories = new Set<ModelCapabilityCategory>()
  const groups = new Set<string>()
  const quotaTypes = new Set<QuotaTypeOption>()
  for (const model of models) {
    for (const category of getModelCategories(model)) categories.add(category)
    for (const group of model.enable_groups ?? []) groups.add(group)
    const quota = getModelQuotaType(model)
    if (quota) quotaTypes.add(quota)
  }
  return {
    categories: MODEL_CAPABILITY_CATEGORIES.filter((category) =>
      categories.has(category)
    ),
    groups: Object.keys(usableGroups).filter(
      (group) => !EXCLUDED_GROUPS.includes(group) && groups.has(group)
    ),
    quotaTypes: [
      QUOTA_TYPES.TOKEN,
      QUOTA_TYPES.REQUEST,
      QUOTA_TYPES.TASK,
    ].filter((quota) => quotaTypes.has(quota)),
  }
}

export type ModelPlaygroundMode = 'chat' | 'image' | 'video' | 'audio'

export function getModelPlaygroundModes(
  model: PricingModel
): ModelPlaygroundMode[] {
  const declared = getConfiguredTaskCapabilities(model.tags)
  const tasks = declared ?? getModelTaskCapabilities(model)
  const modes = new Set<ModelPlaygroundMode>()
  for (const task of tasks) {
    if (task === 'text-generation') modes.add('chat')
    if (task === 'text-to-image' || task === 'image-to-image') {
      modes.add('image')
    }
    if (task === 'text-to-video' || task === 'image-to-video') {
      modes.add('video')
    }
    if (task === 'text-to-speech') modes.add('audio')
  }
  if (
    declared === undefined &&
    !model.input_modalities?.length &&
    !model.supported_endpoint_types?.length
  ) {
    for (const output of model.output_modalities ?? []) {
      if (output === 'text') modes.add('chat')
      if (output === 'image' || output === 'video' || output === 'audio') {
        modes.add(output)
      }
    }
  }
  return [...modes]
}
