import { EXCLUDED_GROUPS } from '@/features/pricing/constants'
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

export function findCatalogQuote(
  models: PricingModel[],
  usable: Record<string, unknown>,
  ratios: Record<string, number>
): CatalogQuote | undefined {
  let selected: CatalogQuote | undefined
  for (const model of models) {
    if (
      !isTokenBasedModel(model) ||
      model.billing_mode === 'tiered_expr' ||
      model.billing_expr ||
      model.billing_plugin_variants?.length ||
      model.billing_usage_schema ||
      !Number.isFinite(model.model_ratio) ||
      model.model_ratio < 0
    ) {
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
