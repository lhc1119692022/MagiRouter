import type { PricingModel } from '../types'

export const GROUP_BILLING_EXPR_KEY = 'billing_setting.group_billing_expr'

export function isValidBillingGroupName(group: string): boolean {
  const trimmed = group.trim()
  if (!trimmed || trimmed !== group) return false
  if (trimmed === 'auto' || trimmed === 'all') return false
  return !trimmed.includes('::')
}

export function groupBillingExprKey(group: string, model: string): string {
  return `${group}::${model}`
}

export function splitGroupBillingExprKey(key: string): [string, string] | null {
  const separator = key.indexOf('::')
  if (separator < 1) return null
  const group = key.slice(0, separator)
  const model = key.slice(separator + 2)
  if (!isValidBillingGroupName(group) || !model.trim()) return null
  return [group, model]
}

export function groupExpressionsEqual(
  left: Record<string, string> = {},
  right: Record<string, string> = {}
): boolean {
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && left[key] === right[key])
  )
}

export function getGroupBillingExpr(
  model: Pick<PricingModel, 'group_billing_exprs'> | null | undefined,
  group: string | undefined
): string | undefined {
  if (!model?.group_billing_exprs || !group) return undefined
  const expr = model.group_billing_exprs[group]
  return typeof expr === 'string' && expr.trim() ? expr : undefined
}

export function hasGroupBillingOverrides(
  model: Pick<PricingModel, 'group_billing_exprs'> | null | undefined,
  groups?: readonly string[]
): boolean {
  const map = model?.group_billing_exprs
  if (!map) return false
  if (groups) {
    return groups.some((group) => Boolean(map[group]?.trim()))
  }
  return Object.values(map).some((expr) => Boolean(expr?.trim()))
}

export function withGroupPricing(
  model: PricingModel,
  group: string | undefined
): PricingModel {
  const expr = getGroupBillingExpr(model, group)
  if (!expr) return model
  return {
    ...model,
    quota_type: 0,
    billing_mode: 'tiered_expr',
    billing_expr: expr,
    billing_usage_schema: undefined,
    billing_usage_examples: undefined,
    billing_plugin_variants: undefined,
    ordinary_pricing: undefined,
  }
}
