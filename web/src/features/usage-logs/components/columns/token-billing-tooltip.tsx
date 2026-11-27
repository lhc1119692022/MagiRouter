import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatLogQuota, formatNumber } from '@/lib/format'

import type { UsageLog } from '../../data/schema'
import { getTieredBillingSummary, hasToolSurcharge } from '../../lib/format'
import { isPerCallBilling } from '../../lib/utils'
import type { LogOtherData } from '../../types'

function formatRatio(ratio: number | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '-'
  return ratio % 1 === 0
    ? String(ratio)
    : ratio.toFixed(4).replace(/\.?0+$/, '')
}

export function TokenBillingTooltipContent(props: {
  log: UsageLog
  other: LogOtherData | null
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheWrite12h: number
  cachePct: number
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const log = props.log
  const other = props.other
  const priceOpts = { digitsLarge: 4, digitsSmall: 6, abbreviate: false }
  const tieredSummary = other
    ? getTieredBillingSummary(other, log.model_name)
    : null

  const userGroupRatio = other?.user_group_ratio
  const hasUserGroupRatio =
    userGroupRatio != null &&
    Number.isFinite(userGroupRatio) &&
    userGroupRatio !== -1
  const effectiveGroupRatio = hasUserGroupRatio
    ? userGroupRatio
    : other?.group_ratio

  const rows: Array<{ label: string; value: string }> = [
    {
      label: t('Prompt Tokens'),
      value: formatNumber(log.prompt_tokens, locale),
    },
    {
      label: t('Completion Tokens'),
      value: formatNumber(log.completion_tokens, locale),
    },
  ]

  if (props.cacheReadTokens > 0 || props.cachePct > 0) {
    rows.push({
      label: t('Cache Read'),
      value: `${formatNumber(props.cacheReadTokens, locale)} (${props.cachePct}%)`,
    })
  }
  if (props.cacheWriteTokens > 0) {
    const splitParts: string[] = []
    if (props.cacheWrite5m > 0) {
      splitParts.push(`5m: ${formatNumber(props.cacheWrite5m, locale)}`)
    }
    if (props.cacheWrite1h > 0) {
      splitParts.push(`1h: ${formatNumber(props.cacheWrite1h, locale)}`)
    }
    if (props.cacheWrite12h > 0) {
      splitParts.push(`12h: ${formatNumber(props.cacheWrite12h, locale)}`)
    }
    rows.push({
      label: t('Cache Write'),
      value:
        splitParts.length > 0
          ? `${formatNumber(props.cacheWriteTokens, locale)} (${splitParts.join(', ')})`
          : formatNumber(props.cacheWriteTokens, locale),
    })
  }

  if (other?.audio_input && other.audio_input > 0) {
    rows.push({
      label: t('Audio Input'),
      value: formatNumber(other.audio_input, locale),
    })
  }
  if (other?.audio_output && other.audio_output > 0) {
    rows.push({
      label: t('Audio Output'),
      value: formatNumber(other.audio_output, locale),
    })
  }
  if (other?.image_count && other.image_count > 0) {
    rows.push({
      label: t('Images'),
      value: formatNumber(other.image_count, locale),
    })
  }

  const pricingRows: Array<{ label: string; value: string }> = []
  if (other?.billing_mode === 'tiered_expr') {
    if (other.matched_tier) {
      pricingRows.push({
        label: t('Matched Tier'),
        value: other.matched_tier,
      })
    }
    if (tieredSummary) {
      for (const entry of tieredSummary.priceEntries.slice(0, 4)) {
        pricingRows.push({
          label: t(entry.shortLabel),
          value: entry.unit
            ? `${formatBillingCurrencyFromUSD(entry.price, priceOpts)}/${t(entry.unit)}`
            : `${formatBillingCurrencyFromUSD(entry.price, priceOpts)}/M`,
        })
      }
    } else if (other.fixed_price != null && Number.isFinite(other.fixed_price)) {
      pricingRows.push({
        label: t('Fixed price'),
        value: formatBillingCurrencyFromUSD(other.fixed_price, priceOpts),
      })
    }
  } else if (other && isPerCallBilling(other.model_price) && other.model_price != null) {
    pricingRows.push({
      label: t('Fixed price'),
      value: `${formatBillingCurrencyFromUSD(other.model_price, priceOpts)}/${t('request')}`,
    })
  } else if (other?.model_ratio != null && Number.isFinite(other.model_ratio)) {
    const inputPriceUSD = other.model_ratio * 2.0
    pricingRows.push({
      label: t('Input price'),
      value: `${formatBillingCurrencyFromUSD(inputPriceUSD, priceOpts)}/M`,
    })
    if (
      other.completion_ratio != null &&
      Number.isFinite(other.completion_ratio)
    ) {
      pricingRows.push({
        label: t('Output price'),
        value: `${formatBillingCurrencyFromUSD(inputPriceUSD * other.completion_ratio, priceOpts)}/M`,
      })
    }
    if (other.cache_ratio != null && Number.isFinite(other.cache_ratio)) {
      pricingRows.push({
        label: t('Cache Read'),
        value: `${formatBillingCurrencyFromUSD(inputPriceUSD * other.cache_ratio, priceOpts)}/M`,
      })
    }
    if (
      other.cache_creation_ratio != null &&
      Number.isFinite(other.cache_creation_ratio) &&
      other.cache_creation_ratio > 0
    ) {
      pricingRows.push({
        label: t('Cache Write'),
        value: `${formatBillingCurrencyFromUSD(inputPriceUSD * other.cache_creation_ratio, priceOpts)}/M`,
      })
    }
  }

  if (effectiveGroupRatio != null && Number.isFinite(effectiveGroupRatio)) {
    pricingRows.push({
      label: hasUserGroupRatio
        ? t('User Exclusive Ratio')
        : t('Group Ratio'),
      value: `${formatRatio(effectiveGroupRatio)}x`,
    })
  }

  if (other?.billing_source === 'subscription') {
    pricingRows.push({
      label: t('Billing Source'),
      value: other.subscription_plan_title || t('Subscription'),
    })
  }

  if (hasToolSurcharge(other)) {
    pricingRows.push({
      label: t('Tool Surcharge'),
      value: t('Included'),
    })
  }

  const finalQuota =
    other?.billing_source === 'subscription'
      ? (other.subscription_consumed ?? log.quota)
      : log.quota

  return (
    <div className='min-w-56 space-y-2 py-0.5 text-xs'>
      <div className='font-medium'>{t('Billing Details')}</div>
      <div className='space-y-1'>
        {rows.map((row) => (
          <div
            key={row.label}
            className='flex items-center justify-between gap-4'
          >
            <span className='opacity-75'>{row.label}</span>
            <span className='font-mono tabular-nums'>{row.value}</span>
          </div>
        ))}
      </div>
      {pricingRows.length > 0 && (
        <div className='space-y-1 border-t border-current/15 pt-1.5'>
          {pricingRows.map((row) => (
            <div
              key={`${row.label}:${row.value}`}
              className='flex items-center justify-between gap-4'
            >
              <span className='opacity-75'>{row.label}</span>
              <span className='font-mono tabular-nums'>{row.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className='flex items-center justify-between gap-4 border-t border-current/15 pt-1.5 font-medium'>
        <span>{t('This Cost')}</span>
        <span className='font-mono tabular-nums'>
          {formatLogQuota(finalQuota)}
        </span>
      </div>
    </div>
  )
}
