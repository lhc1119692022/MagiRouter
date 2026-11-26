import {
  MODEL_CAPABILITY_CATEGORIES,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'

import { QUOTA_TYPES, type QuotaTypeOption } from '../constants'
import type { PricingVendor } from '../types'

export const PRICING_FILTER_ORDER_OPTION_KEY =
  'console_setting.pricing_filter_order'

export type PricingQuotaFacet = Exclude<QuotaTypeOption, 'all'>

export interface PricingFilterOrderConfig {
  vendors: string[]
  groups: string[]
  capabilities: ModelCapabilityCategory[]
  quota_types: PricingQuotaFacet[]
}

const VALID_CAPABILITIES = new Set<string>(MODEL_CAPABILITY_CATEGORIES)
const VALID_QUOTA_TYPES = new Set<string>([
  QUOTA_TYPES.TOKEN,
  QUOTA_TYPES.REQUEST,
  QUOTA_TYPES.TASK,
])

export const EMPTY_PRICING_FILTER_ORDER: PricingFilterOrderConfig = {
  vendors: [],
  groups: [],
  capabilities: [],
  quota_types: [],
}

function normalizeOrderList(
  raw: unknown,
  allowed?: ReadonlySet<string>
): string[] {
  if (!Array.isArray(raw)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    if (allowed && !allowed.has(trimmed)) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export function parsePricingFilterOrderConfig(
  raw: unknown
): PricingFilterOrderConfig {
  let source: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed || trimmed === '{}') {
      return { ...EMPTY_PRICING_FILTER_ORDER }
    }
    try {
      source = JSON.parse(trimmed)
    } catch {
      return { ...EMPTY_PRICING_FILTER_ORDER }
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { ...EMPTY_PRICING_FILTER_ORDER }
  }
  const record = source as Record<string, unknown>
  return {
    vendors: normalizeOrderList(record.vendors),
    groups: normalizeOrderList(record.groups),
    capabilities: normalizeOrderList(
      record.capabilities,
      VALID_CAPABILITIES
    ) as ModelCapabilityCategory[],
    quota_types: normalizeOrderList(
      record.quota_types,
      VALID_QUOTA_TYPES
    ) as PricingQuotaFacet[],
  }
}

export function serializePricingFilterOrderConfig(
  config: PricingFilterOrderConfig
): string {
  const payload: Partial<PricingFilterOrderConfig> = {}
  const vendors = normalizeOrderList(config.vendors)
  const groups = normalizeOrderList(config.groups)
  const capabilities = normalizeOrderList(
    config.capabilities,
    VALID_CAPABILITIES
  ) as ModelCapabilityCategory[]
  const quotaTypes = normalizeOrderList(
    config.quota_types,
    VALID_QUOTA_TYPES
  ) as PricingQuotaFacet[]

  if (vendors.length > 0) payload.vendors = vendors
  if (groups.length > 0) payload.groups = groups
  if (capabilities.length > 0) payload.capabilities = capabilities
  if (quotaTypes.length > 0) payload.quota_types = quotaTypes
  return JSON.stringify(payload)
}

export function compareVendorNamesDefault(
  left: Pick<PricingVendor, 'name' | 'id'>,
  right: Pick<PricingVendor, 'name' | 'id'>
): number {
  const insensitive = left.name.localeCompare(right.name, 'en', {
    sensitivity: 'base',
    numeric: true,
  })
  if (insensitive !== 0) return insensitive
  const exact = left.name.localeCompare(right.name, 'en', { numeric: true })
  if (exact !== 0) return exact
  return left.id - right.id
}

export function sortCatalogVendors(
  vendors: readonly PricingVendor[],
  manualOrder?: readonly string[]
): PricingVendor[] {
  if (vendors.length <= 1) return [...vendors]
  const exactRank = new Map<string, number>()
  const lowerRank = new Map<string, number>()
  for (const [index, entry] of (manualOrder ?? []).entries()) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    if (!exactRank.has(trimmed)) exactRank.set(trimmed, index)
    const lower = trimmed.toLowerCase()
    if (!lowerRank.has(lower)) lowerRank.set(lower, index)
  }

  const resolveRank = (name: string): number => {
    const exact = exactRank.get(name)
    if (exact !== undefined) return exact
    const lower = lowerRank.get(name.toLowerCase())
    if (lower !== undefined) return lower
    return Number.POSITIVE_INFINITY
  }

  return [...vendors].sort((left, right) => {
    const rankLeft = resolveRank(left.name)
    const rankRight = resolveRank(right.name)
    if (rankLeft !== rankRight) return rankLeft - rankRight
    return compareVendorNamesDefault(left, right)
  })
}

export function applyManualOrder<T extends string>(
  defaultOrderedItems: readonly T[],
  manualOrder?: readonly string[]
): T[] {
  if (defaultOrderedItems.length <= 1 || !manualOrder?.length) {
    return [...defaultOrderedItems]
  }
  const rankMap = new Map<string, number>()
  for (const [index, entry] of manualOrder.entries()) {
    const trimmed = entry.trim()
    if (trimmed && !rankMap.has(trimmed)) {
      rankMap.set(trimmed, index)
    }
  }
  const defaultIndex = new Map<T, number>()
  for (const [index, item] of defaultOrderedItems.entries()) {
    defaultIndex.set(item, index)
  }
  return [...defaultOrderedItems].sort((left, right) => {
    const rankLeft = rankMap.get(left) ?? Number.POSITIVE_INFINITY
    const rankRight = rankMap.get(right) ?? Number.POSITIVE_INFINITY
    if (rankLeft !== rankRight) return rankLeft - rankRight
    return (defaultIndex.get(left) ?? 0) - (defaultIndex.get(right) ?? 0)
  })
}
