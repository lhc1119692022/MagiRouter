import { EXCLUDED_GROUPS } from '@/features/pricing/constants'
import { getDynamicPricingSummary } from '@/features/pricing/lib/dynamic-price'
import { isTokenBasedModel } from '@/features/pricing/lib/model-helpers'
import { calculateTokenPrice } from '@/features/pricing/lib/price'
import type { PricingModel } from '@/features/pricing/types'

export interface CatalogQuote {
  modelName: string
  group: string
  groupRatio: number
  baseUsd: number
  inputUsd: number
}

export interface BillingCompareGroup {
  name: string
  desc: string
  ratio: number
  modelCount: number
}

export interface BillingCompareRow {
  model: PricingModel
  modelName: string
  iconKey?: string
  yourInputUsd: number
  yourOutputUsd: number
  yourCacheUsd: number | null
  officialInputUsd: number
  officialOutputUsd: number
  officialCacheUsd: number | null
  usesPublisherOfficialPrice: boolean
  officialSourceUrl?: string
  savingsPercent: number | null
}

export interface BillingComparisonData {
  groups: BillingCompareGroup[]
  rowsByGroup: Record<string, BillingCompareRow[]>
}

const FEATURED_MODEL_PATTERNS = [
  /claude-opus/i,
  /claude-sonnet/i,
  /gpt-6|gpt-5/i,
  /gemini-4|gemini-3|gemini-2\.5/i,
  /deepseek/i,
  /qwen/i,
  /grok/i,
]

function isEligibleTokenModel(model: PricingModel): boolean {
  return (
    isTokenBasedModel(model) &&
    !model.price_unconfigured &&
    model.billing_mode !== 'tiered_expr' &&
    !model.billing_expr &&
    !model.billing_plugin_variants?.length &&
    !model.billing_usage_schema &&
    typeof model.model_ratio === 'number' &&
    Number.isFinite(model.model_ratio) &&
    model.model_ratio >= 0
  )
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

interface BaseTokenPrices {
  inputUsd: number
  outputUsd: number
  cacheUsd: number | null
}

function resolveBaseTokenPrices(model: PricingModel): BaseTokenPrices | null {
  if (
    !isTokenBasedModel(model) ||
    model.price_unconfigured ||
    model.billing_plugin_variants?.length ||
    model.billing_usage_schema
  ) {
    return null
  }

  if (model.billing_mode === 'tiered_expr' || model.billing_expr) {
    if (!model.billing_expr) return null
    const summary = getDynamicPricingSummary(model, {
      tokenUnit: 'M',
      groupRatioMultiplier: 1,
    })
    if (
      !summary ||
      summary.isSpecialExpression ||
      summary.hasRequestRules ||
      summary.isTimePricing ||
      summary.tierCount !== 1
    ) {
      return null
    }
    const inputEntry = summary.entries.find(
      (entry) => entry.unit === 'token' && entry.field === 'inputPrice'
    )
    const outputEntry = summary.entries.find(
      (entry) => entry.unit === 'token' && entry.field === 'outputPrice'
    )
    const cacheEntry = summary.entries.find(
      (entry) => entry.unit === 'token' && entry.field === 'cacheReadPrice'
    )
    if (!inputEntry || !isFiniteNonNegative(inputEntry.value)) {
      return null
    }
    return {
      inputUsd: inputEntry.value,
      outputUsd:
        outputEntry && isFiniteNonNegative(outputEntry.value)
          ? outputEntry.value
          : 0,
      cacheUsd:
        cacheEntry && isFiniteNonNegative(cacheEntry.value)
          ? cacheEntry.value
          : null,
    }
  }

  if (!isFiniteNonNegative(model.model_ratio)) {
    return null
  }
  const inputUsd = calculateTokenPrice(model, 'input', 1)
  if (!isFiniteNonNegative(inputUsd)) return null
  const outputUsd = calculateTokenPrice(model, 'output', 1)
  const cacheUsd = calculateTokenPrice(model, 'cache', 1)
  return {
    inputUsd,
    outputUsd: isFiniteNonNegative(outputUsd) ? outputUsd : 0,
    cacheUsd: isFiniteNonNegative(cacheUsd) ? cacheUsd : null,
  }
}

function pickGroupDisplayModels(
  models: PricingModel[],
  limit = 6
): PricingModel[] {
  if (models.length <= limit) return models
  const picked: PricingModel[] = []
  const add = (candidate?: PricingModel) => {
    if (
      candidate &&
      !picked.some((item) => item.model_name === candidate.model_name)
    ) {
      picked.push(candidate)
    }
  }

  // Prioritize models with explicit official publisher prices first
  for (const model of models) {
    if (picked.length >= limit) break
    if (isFiniteNonNegative(model.official_price?.input_usd_per_million)) {
      add(model)
    }
  }

  // Next, prefer recognizable flagship models across vendors
  for (const pattern of FEATURED_MODEL_PATTERNS) {
    if (picked.length >= limit) break
    const match = models.find(
      (item) =>
        pattern.test(item.model_name) &&
        !picked.some((existing) => existing.model_name === item.model_name)
    )
    add(match)
  }

  for (const model of models) {
    if (picked.length >= limit) break
    add(model)
  }

  return picked.slice(0, limit)
}

export function buildBillingComparisonData(
  models: PricingModel[],
  usable: Record<string, { desc?: string; ratio?: number } | unknown>,
  ratios: Record<string, number>,
  limitPerGroup = 4
): BillingComparisonData {
  const basePricesByModel = new Map<string, BaseTokenPrices>()
  const eligibleModels: PricingModel[] = []
  for (const model of models) {
    const basePrices = resolveBaseTokenPrices(model)
    if (!basePrices) continue
    basePricesByModel.set(model.model_name, basePrices)
    eligibleModels.push(model)
  }
  const groupBuckets = new Map<string, PricingModel[]>()
  const resolvedRatios = new Map<string, number>()

  for (const model of eligibleModels) {
    const basePrices = basePricesByModel.get(model.model_name)
    if (!basePrices) continue
    for (const group of model.enable_groups ?? []) {
      if (EXCLUDED_GROUPS.includes(group) || !Object.hasOwn(usable, group)) {
        continue
      }
      const hasExplicitRatio = Object.hasOwn(ratios, group)
      const ratio = hasExplicitRatio ? ratios[group] : 1
      if (!isFiniteNonNegative(ratio)) {
        continue
      }
      const inputUsd = basePrices.inputUsd * ratio
      if (!Number.isFinite(inputUsd)) continue
      const bucket = groupBuckets.get(group) ?? []
      bucket.push(model)
      groupBuckets.set(group, bucket)
      resolvedRatios.set(group, ratio)
    }
  }

  const groups: BillingCompareGroup[] = [...groupBuckets.entries()]
    .map(([name, groupModels]) => {
      const meta = usable[name]
      const desc =
        meta &&
        typeof meta === 'object' &&
        'desc' in meta &&
        typeof meta.desc === 'string'
          ? meta.desc.trim()
          : ''
      return {
        name,
        desc,
        ratio: resolvedRatios.get(name) ?? 1,
        modelCount: groupModels.length,
      }
    })
    .sort((a, b) => a.ratio - b.ratio || a.name.localeCompare(b.name, 'en'))

  const rowsByGroup: Record<string, BillingCompareRow[]> = {}

  for (const group of groups) {
    const candidates = pickGroupDisplayModels(
      groupBuckets.get(group.name) ?? [],
      limitPerGroup
    )
    rowsByGroup[group.name] = candidates.map((model) => {
      const basePrices = basePricesByModel.get(model.model_name)
      const baseInputUsd = basePrices?.inputUsd ?? 0
      const baseOutputUsd = basePrices?.outputUsd ?? 0
      const officialCacheUsd = basePrices?.cacheUsd ?? null

      const yourInputUsd = baseInputUsd * group.ratio
      const yourOutputUsd = baseOutputUsd * group.ratio
      const yourCacheUsd =
        officialCacheUsd !== null ? officialCacheUsd * group.ratio : null

      const pubInput = model.official_price?.input_usd_per_million
      const pubOutput = model.official_price?.output_usd_per_million
      const usesPublisherOfficialPrice = isFiniteNonNegative(pubInput)
      const officialInputUsd = usesPublisherOfficialPrice
        ? pubInput
        : baseInputUsd
      const officialOutputUsd = isFiniteNonNegative(pubOutput)
        ? pubOutput
        : baseOutputUsd

      let savingsPercent: number | null = null
      if (officialInputUsd > 0 && yourInputUsd < officialInputUsd) {
        const pct = Math.round(
          ((officialInputUsd - yourInputUsd) / officialInputUsd) * 100
        )
        if (pct > 0) savingsPercent = pct
      }

      return {
        model,
        modelName: model.model_name,
        iconKey: model.icon || model.vendor_icon || model.vendor_name,
        yourInputUsd,
        yourOutputUsd: isFiniteNonNegative(yourOutputUsd) ? yourOutputUsd : 0,
        yourCacheUsd,
        officialInputUsd,
        officialOutputUsd: isFiniteNonNegative(officialOutputUsd)
          ? officialOutputUsd
          : 0,
        officialCacheUsd,
        usesPublisherOfficialPrice,
        officialSourceUrl: model.official_price?.source_url,
        savingsPercent,
      }
    })
  }

  return { groups, rowsByGroup }
}

export function findCatalogQuote(
  models: PricingModel[],
  usable: Record<string, unknown>,
  ratios: Record<string, number>
): CatalogQuote | undefined {
  let selected: CatalogQuote | undefined
  for (const model of models) {
    if (!isEligibleTokenModel(model)) {
      continue
    }
    const baseUsd = calculateTokenPrice(model, 'input', 1)
    for (const group of model.enable_groups ?? []) {
      const ratio = ratios[group]
      if (
        EXCLUDED_GROUPS.includes(group) ||
        !Object.hasOwn(usable, group) ||
        !Object.hasOwn(ratios, group) ||
        !Number.isFinite(ratio) ||
        ratio < 0
      ) {
        continue
      }
      const inputUsd = baseUsd * ratio
      if (!Number.isFinite(baseUsd) || !Number.isFinite(inputUsd)) continue
      if (!selected || ratio < selected.groupRatio) {
        selected = {
          modelName: model.model_name,
          group,
          groupRatio: ratio,
          baseUsd,
          inputUsd,
        }
      }
    }
  }
  return selected
}
