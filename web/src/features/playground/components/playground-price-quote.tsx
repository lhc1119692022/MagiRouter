import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
} from '@/features/pricing/lib/dynamic-price'
import { officialPrice } from '@/features/pricing/lib/official-price'
import { calculateTokenPrice } from '@/features/pricing/lib/price'
import { taskUsageUnitLabel } from '@/features/pricing/lib/task-price-display'
import type { PricingModel } from '@/features/pricing/types'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotedAmount } from '@/lib/currency'

import type { GroupOption } from '../types'

export function PlaygroundOfficialPrice(props: {
  price?: PricingModel['official_price']
}) {
  const { t, i18n } = useTranslation()
  const result = officialPrice.safeParse(props.price)
  if (!result.success) {
    return <span className='pg-compare-missing'>{t('Not provided')}</span>
  }
  const price = result.data
  const numbers = {
    locale: toIntlLocale(i18n.resolvedLanguage || i18n.language),
    digitsLarge: 4,
    digitsSmall: 8,
    abbreviate: false,
  }
  const values: string[] = []
  if (price.input_usd_per_million !== undefined) {
    values.push(
      `${t('Input')} ${formatQuotedAmount(price.input_usd_per_million, 'USD', numbers)} / ${t('1M token')}`
    )
  }
  if (price.output_usd_per_million !== undefined) {
    values.push(
      `${t('Output')} ${formatQuotedAmount(price.output_usd_per_million, 'USD', numbers)} / ${t('1M token')}`
    )
  }
  if (price.usd_per_request !== undefined) {
    values.push(
      `${formatQuotedAmount(price.usd_per_request, 'USD', numbers)} / ${t('request')}`
    )
  }
  return (
    <a
      className='pg-compare-authority'
      href={price.source_url}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={`${t('Official list price')}: ${values.join(', ')}`}
    >
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </a>
  )
}

type QuoteLine = {
  key: string
  label: string
  unit: string
  platformUSD: number
  listUSD?: number
}

function validAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function PlaygroundPriceQuote(props: {
  model?: PricingModel
  group: string
  groups: GroupOption[]
  compact?: boolean
  minimal?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const { model, group, compact = false, minimal = false } = props
  const renderFallback = (label: string) => {
    if (minimal) {
      return (
        <span
          className='pg-price-minimal is-muted'
          aria-label={t('Reference price')}
          title={label}
        >
          <Coins
            size={14}
            className='pg-price-minimal-icon'
            aria-hidden='true'
          />
          <span className='pg-price-minimal-value'>{label}</span>
        </span>
      )
    }
    if (compact) {
      return (
        <span
          className='pg-price-compact'
          aria-label={t('Reference price')}
          title={label}
        >
          {label}
        </span>
      )
    }
    return <span>{label}</span>
  }
  const multiplier = props.groups.find(
    (option) => option.value === group
  )?.ratio
  const exchange = status?.usd_exchange_rate
  if (group === 'auto') {
    return renderFallback(t('Determined by the routed group'))
  }
  if (
    !model ||
    model.price_unconfigured ||
    !validAmount(multiplier) ||
    !model.enable_groups.some((name) => name === group || name === 'all')
  ) {
    return renderFallback(t('Unset price'))
  }
  if (!validAmount(exchange) || exchange === 0) {
    return renderFallback(t('CNY exchange rate unavailable'))
  }
  if (isUnconfiguredTaskUsageModel(model)) {
    return renderFallback(t('Not configured'))
  }
  const list = officialPrice.safeParse(model.official_price).data
  const source = list?.source_url
  const numbers = {
    locale: toIntlLocale(i18n.resolvedLanguage || i18n.language),
    digitsLarge: 4,
    digitsSmall: 8,
    abbreviate: false,
  }
  const tokenUnit = t('1M token')
  const lines: QuoteLine[] = []
  if (
    model.billing_mode === 'tiered_expr' ||
    model.billing_plugin_variants?.length
  ) {
    const summary = getDynamicPricingSummary(model, { tokenUnit: 'M' })
    if (
      !summary ||
      summary.isSpecialExpression ||
      summary.hasRequestRules ||
      summary.isTimePricing ||
      summary.tierCount !== 1 ||
      model.billing_plugin_variants?.length
    ) {
      return renderFallback(t('Tiered pricing'))
    }
    for (const entry of summary.primaryEntries.slice(0, 3)) {
      const unit = getDynamicPriceUnitLabelKey(entry)
      let listUSD: number | undefined
      if (entry.unit === 'token' && entry.field === 'inputPrice') {
        listUSD = list?.input_usd_per_million
      }
      if (entry.unit === 'token' && entry.field === 'outputPrice') {
        listUSD = list?.output_usd_per_million
      }
      if (entry.unit === 'request' && entry.field === 'modelPrice') {
        listUSD = list?.usd_per_request
      }
      lines.push({
        key: entry.key,
        label:
          entry.labelKind === 'schema' ? entry.shortLabel : t(entry.shortLabel),
        unit: taskUsageUnitLabel(
          entry,
          i18n.language,
          unit ? t(unit) : tokenUnit
        ),
        platformUSD: entry.value * multiplier,
        listUSD,
      })
    }
  } else if (model.quota_type === 1 && validAmount(model.model_price)) {
    lines.push({
      key: 'request',
      label: t('Per-request'),
      unit: t('request'),
      platformUSD: model.model_price * multiplier,
      listUSD: list?.usd_per_request,
    })
  } else if (model.quota_type === 0 && validAmount(model.model_ratio)) {
    lines.push({
      key: 'input',
      label: t('Input'),
      unit: tokenUnit,
      platformUSD: calculateTokenPrice(model, 'input', multiplier),
      listUSD: list?.input_usd_per_million,
    })
    if (validAmount(model.completion_ratio)) {
      lines.push({
        key: 'output',
        label: t('Output'),
        unit: tokenUnit,
        platformUSD: calculateTokenPrice(model, 'output', multiplier),
        listUSD: list?.output_usd_per_million,
      })
    }
  }
  const quotes = lines.filter(
    (line) =>
      validAmount(line.platformUSD) && validAmount(line.platformUSD * exchange)
  )
  if (!quotes.length) return renderFallback(t('Unset price'))
  const hasList = Boolean(
    source && quotes.some((line) => validAmount(line.listUSD))
  )
  if (compact || minimal) {
    const sharedUnit = quotes.every((line) => line.unit === quotes[0].unit)
      ? quotes[0].unit
      : null
    const formattedLines = quotes.map((line) => ({
      ...line,
      platformCNY: formatQuotedAmount(
        line.platformUSD * exchange,
        'CNY',
        numbers
      ),
      listedUSD:
        source && validAmount(line.listUSD)
          ? formatQuotedAmount(line.listUSD, 'USD', numbers)
          : undefined,
    }))
    const platformTitle = `${t('Platform price')} · CNY: ${formattedLines
      .map((line) => `${line.label} ${line.platformCNY} / ${line.unit}`)
      .join(' · ')}`
    const listParts = formattedLines
      .filter((line) => line.listedUSD)
      .map((line) => `${line.label} ${line.listedUSD} / ${line.unit}`)
    const tooltip = hasList
      ? `${platformTitle} | ${t('Publisher list price')}: ${listParts.join(' · ')}`
      : `${platformTitle} | ${t('No published list price')}`
    if (minimal) {
      const minimalValue =
        formattedLines.length === 1
          ? formattedLines[0].platformCNY
          : formattedLines.map((line) => line.platformCNY).join(' / ')
      return (
        <span
          className='pg-price-minimal tabular-nums'
          aria-label={t('Reference price')}
          title={tooltip}
        >
          <Coins
            size={14}
            className='pg-price-minimal-icon'
            aria-hidden='true'
          />
          <span className='pg-price-minimal-value'>{minimalValue}</span>
        </span>
      )
    }
    let summaryText: string
    if (
      sharedUnit &&
      formattedLines.length === 1 &&
      formattedLines[0].key === 'request'
    ) {
      summaryText = `${formattedLines[0].platformCNY} / ${sharedUnit}`
    } else if (sharedUnit) {
      summaryText = `${formattedLines.map((line) => `${line.label} ${line.platformCNY}`).join(' · ')} / ${sharedUnit}`
    } else {
      summaryText = formattedLines
        .map((line) => `${line.label} ${line.platformCNY} / ${line.unit}`)
        .join(' · ')
    }
    return (
      <span
        className='pg-price-compact tabular-nums'
        aria-label={t('Reference price')}
        title={tooltip}
      >
        {summaryText}
      </span>
    )
  }
  return (
    <div
      className='flex min-w-0 flex-col gap-1 text-xs tabular-nums'
      aria-label={t('Reference price')}
    >
      <div className='text-muted-foreground flex flex-wrap items-baseline gap-x-2'>
        <span>{t('Platform price')} · CNY</span>
        {hasList ? (
          <a
            href={source}
            target='_blank'
            rel='noopener noreferrer'
            className='underline underline-offset-2'
          >
            {t('Publisher list price')}
          </a>
        ) : (
          <span>{t('No published list price')}</span>
        )}
      </div>
      <div className='flex flex-wrap gap-x-4 gap-y-1'>
        {quotes.map((line) => {
          const listed =
            source && validAmount(line.listUSD)
              ? formatQuotedAmount(line.listUSD, 'USD', numbers)
              : undefined
          return (
            <span key={line.key} className='inline-flex items-baseline gap-1'>
              <span>{line.label}</span>
              {listed &&
                (validAmount(line.listUSD) &&
                line.listUSD > line.platformUSD ? (
                  <del
                    className='text-muted-foreground'
                    title={t('Publisher list price')}
                  >
                    {listed}
                  </del>
                ) : (
                  <span
                    className='text-muted-foreground'
                    title={t('Publisher list price')}
                  >
                    {listed}
                  </span>
                ))}
              <strong>
                {formatQuotedAmount(
                  line.platformUSD * exchange,
                  'CNY',
                  numbers
                )}
              </strong>
              <span className='text-muted-foreground'>/ {line.unit}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
