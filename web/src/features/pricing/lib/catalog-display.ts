import type { TFunction } from 'i18next'

import {
  CATEGORY_LABEL_KEYS,
  getModelCategories,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'

import { PRICE_MODES, QUOTA_TYPES } from '../constants'
import type { PriceMode, PricingModel, TokenUnit } from '../types'
import {
  getCurrentTimePricingTiers,
  splitBillingExprAndRequestRules,
  type ParsedTier,
} from './billing-expr'
import {
  formatDynamicUnitPrice,
  formatTaskUsageUnitPrice,
  getDynamicPriceUnitLabelKey,
  isUnconfiguredTaskUsageModel,
  type DynamicPriceOptions,
  type DynamicPricingSummary,
} from './dynamic-price'
import { getModelQuotaType, parseTags } from './filters'
import { isTokenBasedModel, type DisplayGroupResolution } from './model-helpers'
import type { HourlyMonitorSlotState } from './monitored-requests'
import { formatPrice, formatRequestPrice } from './price'
import { taskUsageUnitLabel } from './task-price-display'

export const MONITOR_TICK_CLASS: Record<HourlyMonitorSlotState, string> = {
  empty: 'zm-uptime-tick',
  ok: 'zm-uptime-tick is-ok',
  warn: 'zm-uptime-tick is-warn',
  err: 'zm-uptime-tick is-err',
}

export interface CatalogPriceDisplay {
  primary: string
  suffix: string
  tooltip: string
}

export interface CatalogTablePriceRow {
  key: string
  label: string
  value: string
  suffix?: string
  emphasis: 'primary' | 'secondary' | 'muted'
}

export interface CatalogTablePriceDisplay {
  rows?: CatalogTablePriceRow[]
  single?: {
    primary: string
    suffix: string
  }
  tooltip: string
}

export function getCatalogDisplayTags(
  model: PricingModel,
  t: TFunction
): {
  capabilities: ModelCapabilityCategory[]
  remarkTags: string[]
} {
  const capabilities = getModelCategories(model)
  const tags = parseTags(model.tags)
  const capabilityLabels = new Set(
    capabilities.map((capability) =>
      t(CATEGORY_LABEL_KEYS[capability]).trim().toLowerCase()
    )
  )
  const seen = new Set<string>()
  const remarkTags = tags.filter((tag) => {
    const normalized = tag.trim().toLowerCase()
    if (
      !normalized ||
      seen.has(normalized) ||
      capabilityLabels.has(normalized)
    ) {
      return false
    }
    seen.add(normalized)
    return true
  })
  return { capabilities, remarkTags }
}

export function getCatalogQuotaLabel(
  model: PricingModel,
  dynamicSummary: DynamicPricingSummary | null,
  t: TFunction
): string {
  if (dynamicSummary?.isMixedBilling) return t('Per-call / Token')
  const quotaCategory = getModelQuotaType(model)
  if (quotaCategory === QUOTA_TYPES.TASK) return '按任务'
  if (quotaCategory === QUOTA_TYPES.REQUEST) return '按次计费'
  return '按 Token'
}

export interface ResolveCatalogPriceDisplayParams {
  baseModel: PricingModel
  displayGroup: DisplayGroupResolution
  dynamicSummary: DynamicPricingSummary | null
  dynamicPriceOptions: DynamicPriceOptions
  tokenUnit: TokenUnit
  priceMode: PriceMode
  showRechargePrice: boolean
  priceRate: number
  usdExchangeRate: number
  selectedGroup?: string
  language: string
  t: TFunction
}

export function resolveCatalogPriceDisplay(
  params: ResolveCatalogPriceDisplayParams
): CatalogPriceDisplay {
  const {
    baseModel,
    displayGroup,
    dynamicSummary,
    dynamicPriceOptions,
    tokenUnit,
    priceMode,
    showRechargePrice,
    priceRate,
    usdExchangeRate,
    selectedGroup,
    language,
    t,
  } = params
  const isOfficialPrice = priceMode === PRICE_MODES.OFFICIAL
  const isTokenBased = isTokenBasedModel(baseModel)
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const groupPrefix =
    !isOfficialPrice && displayGroup.group
      ? `${displayGroup.group} ×${displayGroup.ratio} · `
      : ''
  const formatSuffix = (unit: string, isStarting: boolean) =>
    !isOfficialPrice && isStarting ? t('/{{unit}}+', { unit }) : `/${unit}`

  if (dynamicSummary && dynamicSummary.primaryEntries.length > 0) {
    const activeTiers =
      !dynamicSummary.isTaskUsage && dynamicSummary.isTimePricing
        ? (getCurrentTimePricingTiers(
            splitBillingExprAndRequestRules(baseModel.billing_expr || '')
              .billingExpr,
            dynamicPriceOptions.now ?? new Date()
          ) ?? dynamicSummary.tiers)
        : dynamicSummary.tiers

    const requestCandidates: Array<{
      price: number
      unit: 'request' | 'image'
    }> = []
    for (const tier of activeTiers) {
      if (
        !('unitPrices' in tier) &&
        tier.billingUnit === 'request' &&
        typeof tier.fixedPrice === 'number' &&
        Number.isFinite(tier.fixedPrice) &&
        tier.fixedPrice >= 0
      ) {
        requestCandidates.push({
          price: tier.fixedPrice,
          unit: tier.imageCount ? 'image' : 'request',
        })
      }
    }
    if (requestCandidates.length === 0) {
      for (const entry of dynamicSummary.primaryEntries) {
        if (entry.unit === 'request' || entry.unit === 'image') {
          const candidate = entry.minValue ?? entry.value
          if (Number.isFinite(candidate) && candidate >= 0) {
            requestCandidates.push({ price: candidate, unit: entry.unit })
          }
        }
      }
    }

    if (requestCandidates.length > 0) {
      const bestRequest = requestCandidates.reduce((best, current) =>
        current.price < best.price ? current : best
      )
      const formatted = formatTaskUsageUnitPrice(
        bestRequest.price,
        dynamicPriceOptions
      )
      const unitLabel = bestRequest.unit === 'image' ? t('image') : t('call')
      const showStarting =
        !displayGroup.isSelectedGroup ||
        Boolean(dynamicSummary.isMixedBilling) ||
        requestCandidates.length > 1 ||
        dynamicSummary.tierCount > 1
      const tokenEntries = dynamicSummary.primaryEntries.filter(
        (entry) => entry.unit === 'token'
      )
      const mixedNote =
        dynamicSummary.isMixedBilling && tokenEntries.length > 0
          ? ` · ${tokenEntries.map((entry) => entry.formatted).join(' / ')} /${tokenUnitLabel}`
          : ''
      return {
        primary: formatted,
        suffix: formatSuffix(unitLabel, showStarting),
        tooltip: `${groupPrefix}${formatted} / ${unitLabel}${mixedNote}`,
      }
    }

    if (dynamicSummary.isTaskUsage) {
      const primary = dynamicSummary.primaryEntries[0]
      const unitKey = getDynamicPriceUnitLabelKey(primary)
      const unitLabel = taskUsageUnitLabel(
        primary,
        language,
        unitKey ? t(unitKey) : tokenUnitLabel
      )
      const minValue = primary.minValue ?? primary.value
      const formatted = formatTaskUsageUnitPrice(minValue, dynamicPriceOptions)
      const showStarting =
        !displayGroup.isSelectedGroup ||
        primary.formattedRange !== undefined ||
        dynamicSummary.tierCount > 1
      return {
        primary: isOfficialPrice
          ? (primary.formattedRange ?? formatted)
          : formatted,
        suffix: formatSuffix(unitLabel, showStarting),
        tooltip: `${groupPrefix}${primary.formattedRange ?? formatted} / ${unitLabel}`,
      }
    }

    const tokenTiers = activeTiers.filter(
      (tier): tier is ParsedTier =>
        !('unitPrices' in tier) && tier.billingUnit !== 'request'
    )
    let bestTokenTier: ParsedTier | undefined
    let bestInputPrice = Number.POSITIVE_INFINITY
    for (const tier of tokenTiers) {
      const input = Number(tier.inputPrice)
      if (Number.isFinite(input) && input >= 0 && input < bestInputPrice) {
        bestInputPrice = input
        bestTokenTier = tier
      }
    }
    if (bestTokenTier && Number.isFinite(bestInputPrice)) {
      const formattedInput = formatDynamicUnitPrice(
        bestInputPrice,
        dynamicPriceOptions
      )
      const output = Number(bestTokenTier.outputPrice)
      const formattedOutput =
        Number.isFinite(output) && output >= 0
          ? formatDynamicUnitPrice(output, dynamicPriceOptions)
          : null
      return {
        primary:
          isOfficialPrice && formattedOutput
            ? `${formattedInput} / ${formattedOutput}`
            : formattedInput,
        suffix: formatSuffix(tokenUnitLabel, true),
        tooltip: formattedOutput
          ? `${groupPrefix}${t('Input')} ${formattedInput} · ${t('Output')} ${formattedOutput} / ${tokenUnitLabel}`
          : `${groupPrefix}${formattedInput} / ${tokenUnitLabel}`,
      }
    }

    const primary = dynamicSummary.primaryEntries[0]
    const unitKey = getDynamicPriceUnitLabelKey(primary)
    const unitLabel = taskUsageUnitLabel(
      primary,
      language,
      unitKey ? t(unitKey) : tokenUnitLabel
    )
    return {
      primary: primary.formatted,
      suffix: formatSuffix(unitLabel, true),
      tooltip: `${groupPrefix}${primary.formattedRange ?? primary.formatted} / ${unitLabel}`,
    }
  }

  if (isUnconfiguredTaskUsageModel(baseModel)) {
    return {
      primary: t('Usage-based'),
      suffix: '',
      tooltip: t('Usage-based billing'),
    }
  }

  if (isTokenBased) {
    const inputPrice = formatPrice(
      baseModel,
      'input',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      true,
      priceMode
    )
    const outputPrice = formatPrice(
      baseModel,
      'output',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      true,
      priceMode
    )
    if (baseModel.price_unconfigured || inputPrice === '-') {
      return {
        primary: '-',
        suffix: '',
        tooltip: t('Unset price'),
      }
    }
    return {
      primary:
        isOfficialPrice && outputPrice !== '-'
          ? `${inputPrice} / ${outputPrice}`
          : inputPrice,
      suffix: formatSuffix(tokenUnitLabel, true),
      tooltip: `${groupPrefix}${t('Input')} ${inputPrice} · ${t('Output')} ${outputPrice} / ${tokenUnitLabel}`,
    }
  }

  const requestPrice = formatRequestPrice(
    baseModel,
    showRechargePrice,
    priceRate,
    usdExchangeRate,
    selectedGroup,
    true,
    priceMode
  )
  if (requestPrice === '-') {
    return {
      primary: '-',
      suffix: '',
      tooltip: t('Unset price'),
    }
  }
  return {
    primary: requestPrice,
    suffix: formatSuffix(t('call'), !displayGroup.isSelectedGroup),
    tooltip: `${groupPrefix}${requestPrice} / ${t('call')}`,
  }
}

export function resolveCatalogTablePriceDisplay(
  params: ResolveCatalogPriceDisplayParams
): CatalogTablePriceDisplay {
  const {
    baseModel,
    displayGroup,
    dynamicSummary,
    dynamicPriceOptions,
    tokenUnit,
    priceMode,
    showRechargePrice,
    priceRate,
    usdExchangeRate,
    selectedGroup,
    t,
  } = params
  const isOfficialPrice = priceMode === PRICE_MODES.OFFICIAL
  const isTokenBased = isTokenBasedModel(baseModel)
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const groupPrefix =
    !isOfficialPrice && displayGroup.group
      ? `${displayGroup.group} ×${displayGroup.ratio} · `
      : ''
  const formatSuffix = (unit: string, isStarting: boolean) =>
    !isOfficialPrice && isStarting ? t('/{{unit}}+', { unit }) : `/${unit}`
  const tokenSuffix = formatSuffix(tokenUnitLabel, true)

  if (dynamicSummary && dynamicSummary.primaryEntries.length > 0) {
    if (dynamicSummary.isTaskUsage) {
      const single = resolveCatalogPriceDisplay(params)
      return {
        single: { primary: single.primary, suffix: single.suffix },
        tooltip: single.tooltip,
      }
    }

    const activeTiers = dynamicSummary.isTimePricing
      ? (getCurrentTimePricingTiers(
          splitBillingExprAndRequestRules(baseModel.billing_expr || '')
            .billingExpr,
          dynamicPriceOptions.now ?? new Date()
        ) ?? dynamicSummary.tiers)
      : dynamicSummary.tiers

    const requestCandidates: Array<{
      price: number
      unit: 'request' | 'image'
    }> = []
    for (const tier of activeTiers) {
      if (
        !('unitPrices' in tier) &&
        tier.billingUnit === 'request' &&
        typeof tier.fixedPrice === 'number' &&
        Number.isFinite(tier.fixedPrice) &&
        tier.fixedPrice >= 0
      ) {
        requestCandidates.push({
          price: tier.fixedPrice,
          unit: tier.imageCount ? 'image' : 'request',
        })
      }
    }
    if (requestCandidates.length === 0) {
      for (const entry of dynamicSummary.primaryEntries) {
        if (entry.unit === 'request' || entry.unit === 'image') {
          const candidate = entry.minValue ?? entry.value
          if (Number.isFinite(candidate) && candidate >= 0) {
            requestCandidates.push({ price: candidate, unit: entry.unit })
          }
        }
      }
    }

    const tokenTiers = activeTiers.filter(
      (tier): tier is ParsedTier =>
        !('unitPrices' in tier) && tier.billingUnit !== 'request'
    )
    let bestTokenTier: ParsedTier | undefined
    let bestInputPrice = Number.POSITIVE_INFINITY
    for (const tier of tokenTiers) {
      const input = Number(tier.inputPrice)
      if (Number.isFinite(input) && input >= 0 && input < bestInputPrice) {
        bestInputPrice = input
        bestTokenTier = tier
      }
    }

    const buildDynamicTokenRows = (
      tier: ParsedTier,
      primaryInput: boolean
    ): { rows: CatalogTablePriceRow[]; summary: string } => {
      const formattedInput = formatDynamicUnitPrice(
        Number(tier.inputPrice),
        dynamicPriceOptions
      )
      const outputVal = Number(tier.outputPrice)
      const formattedOutput =
        Number.isFinite(outputVal) && outputVal >= 0
          ? formatDynamicUnitPrice(outputVal, dynamicPriceOptions)
          : null

      let cacheRaw = Number(tier.cacheReadPrice)
      if (!Number.isFinite(cacheRaw) || cacheRaw < 0) {
        cacheRaw = Number(tier.imageCachePrice)
      }
      if (!Number.isFinite(cacheRaw) || cacheRaw < 0) {
        const cacheEntry = dynamicSummary.entries.find(
          (entry) =>
            entry.field === 'cacheReadPrice' ||
            entry.field === 'imageCachePrice'
        )
        if (cacheEntry) {
          cacheRaw = cacheEntry.minValue ?? cacheEntry.value
        }
      }
      const formattedCache =
        Number.isFinite(cacheRaw) && cacheRaw >= 0
          ? formatDynamicUnitPrice(cacheRaw, dynamicPriceOptions)
          : null

      const rows: CatalogTablePriceRow[] = [
        {
          key: 'input',
          label: t('Input'),
          value: formattedInput,
          suffix: tokenSuffix,
          emphasis: primaryInput ? 'primary' : 'secondary',
        },
        {
          key: 'output',
          label: t('Output'),
          value: formattedOutput ?? '—',
          suffix: formattedOutput ? tokenSuffix : undefined,
          emphasis: formattedOutput ? 'secondary' : 'muted',
        },
        {
          key: 'cache',
          label: t('Cache'),
          value: formattedCache ?? '—',
          suffix: formattedCache ? tokenSuffix : undefined,
          emphasis: formattedCache ? 'secondary' : 'muted',
        },
      ]
      const summary = `${t('Input')} ${formattedInput} · ${t('Output')} ${formattedOutput ?? '—'} · ${t('Cache')} ${formattedCache ?? '—'} / ${tokenUnitLabel}`
      return { rows, summary }
    }

    if (requestCandidates.length > 0 && bestTokenTier) {
      const bestRequest = requestCandidates.reduce((best, current) =>
        current.price < best.price ? current : best
      )
      const formattedRequest = formatTaskUsageUnitPrice(
        bestRequest.price,
        dynamicPriceOptions
      )
      const requestUnitLabel =
        bestRequest.unit === 'image' ? t('image') : t('call')
      const requestSuffix = formatSuffix(requestUnitLabel, true)
      const tokenPart = buildDynamicTokenRows(bestTokenTier, false)
      return {
        rows: [
          {
            key: 'request',
            label: t('Per-request'),
            value: formattedRequest,
            suffix: requestSuffix,
            emphasis: 'primary',
          },
          ...tokenPart.rows,
        ],
        tooltip: `${groupPrefix}${formattedRequest} / ${requestUnitLabel} · ${tokenPart.summary}`,
      }
    }

    if (requestCandidates.length > 0) {
      const single = resolveCatalogPriceDisplay(params)
      return {
        single: { primary: single.primary, suffix: single.suffix },
        tooltip: single.tooltip,
      }
    }

    if (bestTokenTier && Number.isFinite(bestInputPrice)) {
      const tokenPart = buildDynamicTokenRows(bestTokenTier, true)
      return {
        rows: tokenPart.rows,
        tooltip: `${groupPrefix}${tokenPart.summary}`,
      }
    }

    const fallback = resolveCatalogPriceDisplay(params)
    return {
      single: { primary: fallback.primary, suffix: fallback.suffix },
      tooltip: fallback.tooltip,
    }
  }

  if (isUnconfiguredTaskUsageModel(baseModel)) {
    return {
      single: { primary: t('Usage-based'), suffix: '' },
      tooltip: t('Usage-based billing'),
    }
  }

  if (isTokenBased) {
    const inputPrice = formatPrice(
      baseModel,
      'input',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      true,
      priceMode
    )
    if (baseModel.price_unconfigured || inputPrice === '-') {
      return {
        single: { primary: '-', suffix: '' },
        tooltip: t('Unset price'),
      }
    }
    const outputPrice = formatPrice(
      baseModel,
      'output',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      true,
      priceMode
    )
    const cachePrice =
      baseModel.cache_ratio != null
        ? formatPrice(
            baseModel,
            'cache',
            tokenUnit,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            selectedGroup,
            true,
            priceMode
          )
        : '-'

    const hasOutput = outputPrice !== '-'
    const hasCache = cachePrice !== '-'
    return {
      rows: [
        {
          key: 'input',
          label: t('Input'),
          value: inputPrice,
          suffix: tokenSuffix,
          emphasis: 'primary',
        },
        {
          key: 'output',
          label: t('Output'),
          value: hasOutput ? outputPrice : '—',
          suffix: hasOutput ? tokenSuffix : undefined,
          emphasis: hasOutput ? 'secondary' : 'muted',
        },
        {
          key: 'cache',
          label: t('Cache'),
          value: hasCache ? cachePrice : '—',
          suffix: hasCache ? tokenSuffix : undefined,
          emphasis: hasCache ? 'secondary' : 'muted',
        },
      ],
      tooltip: `${groupPrefix}${t('Input')} ${inputPrice} · ${t('Output')} ${hasOutput ? outputPrice : '—'} · ${t('Cache')} ${hasCache ? cachePrice : '—'} / ${tokenUnitLabel}`,
    }
  }

  const requestFallback = resolveCatalogPriceDisplay(params)
  return {
    single: {
      primary: requestFallback.primary,
      suffix: requestFallback.suffix,
    },
    tooltip: requestFallback.tooltip,
  }
}
