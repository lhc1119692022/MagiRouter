import type { ModelPricingEntry } from '@/features/model-pricing/api'
import { hasValue } from '@/features/system-settings/models/model-pricing-core'
import { getConfiguredModelCategories } from '@/lib/model-task-capabilities'

import type { Model } from '../types'

export type ModelHealthSeverity = 'warning' | 'info'

export type ModelHealthIssueCode =
  | 'missing_metadata'
  | 'missing_pricing'
  | 'default_pricing_unconfirmed'
  | 'legacy_pricing_conflict'
  | 'deprecated_pricing_mode'
  | 'missing_vendor'
  | 'no_available_channel'
  | 'partial_channel_match'
  | 'auto_capability_labels'
  | 'missing_description'

export interface ModelHealthIssue {
  code: ModelHealthIssueCode
  severity: ModelHealthSeverity
  titleKey: string
  descriptionKey: string
  action: 'metadata' | 'pricing'
}

export interface ModelHealthReport {
  issues: ModelHealthIssue[]
  warningCount: number
  infoCount: number
  needsConfirmation: boolean
}

function hasPricingValues(
  values: ModelPricingEntry['configured'] | undefined
): boolean {
  if (!values) return false
  if (values['billing_setting.billing_mode'] === 'tiered_expr') {
    return (
      typeof values['billing_setting.billing_expr'] === 'string' &&
      Boolean(values['billing_setting.billing_expr'].trim())
    )
  }
  if (
    values['billing_setting.plugin_billing_expr'] &&
    Object.keys(values['billing_setting.plugin_billing_expr']).length > 0
  ) {
    return true
  }
  if (
    values['billing_setting.group_billing_expr'] &&
    Object.keys(values['billing_setting.group_billing_expr']).length > 0
  ) {
    return true
  }
  const numericKeys = [
    'ModelPrice',
    'ModelRatio',
    'CompletionRatio',
    'CacheRatio',
    'CreateCacheRatio',
    'ImageRatio',
    'AudioRatio',
    'AudioCompletionRatio',
  ] as const
  return numericKeys.some(
    (key) => typeof values[key] === 'number' && Number.isFinite(values[key])
  )
}

function hasLegacyPricingConflict(
  values: ModelPricingEntry['configured'] | undefined
): boolean {
  if (!values) return false
  const hasFixed =
    typeof values.ModelPrice === 'number' &&
    Number.isFinite(values.ModelPrice) &&
    hasValue(String(values.ModelPrice))
  if (!hasFixed) return false
  const ratioKeys = [
    'ModelRatio',
    'CompletionRatio',
    'CacheRatio',
    'CreateCacheRatio',
    'ImageRatio',
    'AudioRatio',
    'AudioCompletionRatio',
  ] as const
  return ratioKeys.some(
    (key) => typeof values[key] === 'number' && Number.isFinite(values[key])
  )
}

export function evaluateModelHealth(
  model: Model,
  pricingEntry: ModelPricingEntry | undefined,
  options: { canPrice: boolean; pricingLoaded: boolean }
): ModelHealthReport {
  const issues: ModelHealthIssue[] = []

  if (model.id <= 0) {
    issues.push({
      code: 'missing_metadata',
      severity: 'warning',
      titleKey: 'Metadata not created',
      descriptionKey:
        'This model only comes from channel config and has no metadata record yet.',
      action: 'metadata',
    })
  }

  if (options.canPrice && options.pricingLoaded && model.name_rule === 0) {
    const hasConfigured = hasPricingValues(pricingEntry?.configured)
    const hasEffective = hasPricingValues(pricingEntry?.effective)
    const isExpressionMode =
      pricingEntry?.effective['billing_setting.billing_mode'] === 'tiered_expr'

    if (!hasEffective) {
      issues.push({
        code: 'missing_pricing',
        severity: 'warning',
        titleKey: 'No pricing configured',
        descriptionKey:
          'No effective pricing rule was found. Please verify before exposing this model.',
        action: 'pricing',
      })
    } else if (!hasConfigured) {
      issues.push({
        code: 'default_pricing_unconfirmed',
        severity: 'warning',
        titleKey: 'Using built-in default pricing',
        descriptionKey:
          'Pricing relies on system defaults and may differ from current upstream rates. Please confirm.',
        action: 'pricing',
      })
    } else if (hasLegacyPricingConflict(pricingEntry?.configured)) {
      issues.push({
        code: 'legacy_pricing_conflict',
        severity: 'warning',
        titleKey: 'Conflicting pricing fields',
        descriptionKey:
          'Both fixed-price and token-ratio settings exist. Open pricing to confirm the active billing mode.',
        action: 'pricing',
      })
    } else if (!isExpressionMode) {
      issues.push({
        code: 'deprecated_pricing_mode',
        severity: 'info',
        titleKey: 'Legacy pricing mode',
        descriptionKey:
          'This model uses legacy pricing. Review and convert to expression pricing when convenient.',
        action: 'pricing',
      })
    }
  }

  if (model.id > 0 && !model.vendor_id) {
    issues.push({
      code: 'missing_vendor',
      severity: 'warning',
      titleKey: 'No vendor assigned',
      descriptionKey:
        'Assign a vendor so users can filter and recognize this model in the model square.',
      action: 'metadata',
    })
  }

  if (model.square_state === 'unavailable') {
    issues.push({
      code: 'no_available_channel',
      severity: 'warning',
      titleKey: 'No available channel',
      descriptionKey:
        'No enabled channel currently serves this model, so it will not appear in the model square.',
      action: 'metadata',
    })
  } else if (model.square_state === 'partial') {
    issues.push({
      code: 'partial_channel_match',
      severity: 'info',
      titleKey: 'Partially available',
      descriptionKey:
        'Only some models matched by this rule have active channels or visible policies.',
      action: 'metadata',
    })
  }

  if (model.id > 0 && getConfiguredModelCategories(model.tags) === undefined) {
    issues.push({
      code: 'auto_capability_labels',
      severity: 'info',
      titleKey: 'Auto-inferred capability labels',
      descriptionKey:
        'Capability labels are inferred automatically and may be inaccurate. Confirm them manually if needed.',
      action: 'metadata',
    })
  }

  if (model.id > 0 && !model.description?.trim()) {
    issues.push({
      code: 'missing_description',
      severity: 'info',
      titleKey: 'Missing description',
      descriptionKey:
        'Adding a brief model description helps users understand its strengths and context.',
      action: 'metadata',
    })
  }

  let warningCount = 0
  let infoCount = 0
  for (const issue of issues) {
    if (issue.severity === 'warning') warningCount += 1
    else infoCount += 1
  }

  return {
    issues,
    warningCount,
    infoCount,
    needsConfirmation: warningCount > 0 || infoCount > 0,
  }
}
