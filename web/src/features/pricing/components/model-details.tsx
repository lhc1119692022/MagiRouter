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
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/react-router'
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  Check,
  Code2,
  DatabaseZap,
  FileText,
  Gauge,
  HeartPulse,
  Layers,
  Maximize2,
  Sparkles,
  Tag,
  Timer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StaticDataTable } from '@/components/data-table'
import { sideDrawerContentClassName } from '@/components/drawer-layout'
import { GroupBadge } from '@/components/group-badge'
import { PublicLayout } from '@/components/layout'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  formatCacheHitRate,
  formatLatency,
  formatThroughputDisplay,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type {
  PerformanceGroup,
  PerformanceMetricsData,
} from '@/features/performance-metrics/types'
import { PluginIcon } from '@/features/task-plugins/components/plugin-icon'
import { formatTimestampToDate } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import { useModelMonitoring } from '../hooks/use-model-monitoring'
import { usePricingData } from '../hooks/use-pricing-data'
import {
  formatTaskUsageUnitPrice,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  getDynamicPricingTiers,
  getTaskUsageQuantityUnitLabelKey,
  isDynamicPricingModel,
  isUnconfiguredTaskUsageModel,
  type DynamicPriceEntry,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import type { SupportedParameter } from '../lib/mock-stats'
import { getAvailableGroups, isTokenBasedModel } from '../lib/model-helpers'
import {
  buildHourlyMonitorSlots,
  isMeasuredRate,
  monitoringWindowLabel,
  type HourlyMonitorSlotState,
} from '../lib/monitored-requests'
import { withOrdinaryPricing, withPluginPricing } from '../lib/plugin-pricing'
import { formatFixedPrice, formatGroupPrice } from '../lib/price'
import {
  evaluateTaskUsageExamples,
  getTaskEnumFields,
  getTaskNumberFields,
} from '../lib/task-expr'
import { getTaskPricingDisplayTiers } from '../lib/task-matrix-display'
import {
  hasSimpleTaskPricing,
  pricingDisplayFallbackKey,
  taskPriceLabel,
  taskUsageUnitLabel,
} from '../lib/task-price-display'
import type {
  ModelCapability,
  PriceType,
  PricingModel,
  TokenUnit,
} from '../types'
import { DynamicPricingBreakdown } from './dynamic-pricing-breakdown'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelDetailsApi } from './model-details-api'
import { ModelDetailsPerformance } from './model-details-performance'

// ----------------------------------------------------------------------------
// Constants & formatting helpers
// ----------------------------------------------------------------------------

const CAPABILITY_LABEL_KEYS: Record<ModelCapability, string> = {
  function_calling: 'Function calling',
  streaming: 'Streaming',
  vision: 'Vision',
  json_mode: 'JSON mode',
  structured_output: 'Structured output',
  reasoning: 'Reasoning',
  tools: 'Tools',
  system_prompt: 'System prompt',
  web_search: 'Web search',
  code_interpreter: 'Code interpreter',
  caching: 'Prompt caching',
  embeddings: 'Embeddings',
}

const MODALITY_LABEL_KEYS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
}

const TOKEN_FORMAT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
})

const MODEL_DETAILS_SKELETON_KEYS = ['first', 'second', 'third', 'fourth']
const BASE_RATIO_KEY = '__base__'
const ORDINARY_PRICING_TAB = '__model__'

const TAB_VALUES = ['overview', 'api'] as const
type TabValue = (typeof TAB_VALUES)[number]

const TAB_META: Record<
  TabValue,
  { icon: React.ComponentType<{ className?: string }>; labelKey: string }
> = {
  overview: { icon: Gauge, labelKey: 'Pricing & Performance' },
  api: { icon: Code2, labelKey: 'API & Docs' },
}

function formatCatalogTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return ''
  if (tokens >= 1_000_000) {
    return `${TOKEN_FORMAT.format(tokens / 1_000_000)}M`
  }
  if (tokens >= 1_000) {
    return `${TOKEN_FORMAT.format(tokens / 1_000)}K`
  }
  return TOKEN_FORMAT.format(tokens)
}

function formatCatalogYearMonth(value?: string): string {
  if (!value) return ''
  const [yearStr, monthStr] = value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short' })
}

function normalizeCatalogItems(items?: readonly string[]): string[] {
  if (!items) return []
  return items.filter((item) => item.trim().length > 0)
}

function resolveModelDocId(model: PricingModel): string {
  const endpoints = new Set(
    normalizeCatalogItems(model.supported_endpoint_types).map((item) =>
      item.toLowerCase()
    )
  )
  const outputs = new Set(
    normalizeCatalogItems(model.output_modalities).map((item) =>
      item.toLowerCase()
    )
  )
  if (
    outputs.has('image') ||
    outputs.has('video') ||
    outputs.has('audio') ||
    endpoints.has('image-generation') ||
    endpoints.has('video') ||
    endpoints.has('kling') ||
    endpoints.has('suno') ||
    endpoints.has('vidu') ||
    endpoints.has('runway') ||
    endpoints.has('luma') ||
    endpoints.has('midjourney') ||
    endpoints.has('mj')
  ) {
    return 'task-media-ops'
  }
  if (endpoints.has('openai-response')) return 'proto-responses'
  if (endpoints.has('anthropic')) return 'proto-anthropic'
  if (endpoints.has('gemini')) return 'proto-gemini'
  if (endpoints.has('openai')) return 'proto-chat'
  return 'quickstart'
}

// ----------------------------------------------------------------------------
// Shared small UI pieces
// ----------------------------------------------------------------------------

function SectionTitle(props: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'text-muted-foreground text-[11px] font-semibold tracking-wider uppercase',
        props.className
      )}
    >
      {props.children}
    </h2>
  )
}

function DynamicPriceEntryLabel(props: { entry: DynamicPriceEntry }) {
  const { t, i18n } = useTranslation()
  if (props.entry.labelKind === 'schema') {
    return (
      <span className='break-words whitespace-normal'>
        {taskPriceLabel(
          props.entry.description,
          props.entry.shortLabel,
          i18n.language
        )}
      </span>
    )
  }
  return t(props.entry.shortLabel)
}

function ModalityLabels(props: { items: string[] }) {
  const { t } = useTranslation()
  if (props.items.length === 0) return null

  return (
    <span className='inline-flex items-center gap-1 align-middle'>
      {props.items.map((item) => (
        <span key={item} className='font-medium'>
          {t(MODALITY_LABEL_KEYS[item] ?? item)}
        </span>
      ))}
    </span>
  )
}

function UnconfiguredTaskPricingNotice(props: { model: PricingModel }) {
  const { t, i18n } = useTranslation()
  const numberFields = getTaskNumberFields(props.model.billing_usage_schema)
  const enumFields = getTaskEnumFields(props.model.billing_usage_schema)

  return (
    <div className='bg-muted/20 flex flex-col gap-2.5 rounded-lg border p-3'>
      <p className='text-muted-foreground text-xs leading-relaxed sm:text-sm'>
        {t(
          'This model is billed by usage, but the administrator has not configured its pricing yet.'
        )}
      </p>
      {numberFields.length + enumFields.length > 0 ? (
        <dl className='grid gap-1.5 sm:grid-cols-2'>
          {numberFields.map(([field, definition]) => (
            <div
              key={field}
              className='flex items-baseline justify-between gap-3'
            >
              <dt className='text-xs font-medium'>
                {taskPriceLabel(definition.description, field, i18n.language)}
              </dt>
              <dd className='text-muted-foreground text-xs'>
                {taskUsageUnitLabel(
                  definition,
                  i18n.language,
                  t(getTaskUsageQuantityUnitLabelKey(definition.unit))
                )}
              </dd>
            </div>
          ))}
          {enumFields.map(([field, definition]) => (
            <div
              key={field}
              className='flex items-baseline justify-between gap-3'
            >
              <dt className='text-xs font-medium'>
                <code>{field}</code>
              </dt>
              <dd className='text-muted-foreground text-right text-xs'>
                {(definition.enum ?? []).join(', ')}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Model header (first glance: identity, specs, and direct docs shortcut)
// ----------------------------------------------------------------------------

function ModelHeader(props: {
  model: PricingModel
  monitoringData?: PerformanceMetricsData['data'] | null
  onOpenDocs?: (docId: string) => void
}) {
  const { t } = useTranslation()
  const router = useRouter({ warn: false }) as
    | ReturnType<typeof useRouter>
    | undefined
  const model = props.model
  const modelIconKey = model.icon || model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 22) : null
  const description = model.description || model.vendor_description || null
  const docId = resolveModelDocId(model)
  const docHref = `/docs?doc=${encodeURIComponent(docId)}`

  const summaryRate = props.monitoringData?.summary?.success_rate
  const hasMeasuredStatus = isMeasuredRate(summaryRate)

  const inputModalities = normalizeCatalogItems(model.input_modalities)
  const outputModalities = normalizeCatalogItems(model.output_modalities)
  const contextLength = model.context_length ?? 0
  const maxOutput = model.max_output_tokens ?? 0
  const knowledgeCutoff = formatCatalogYearMonth(model.knowledge_cutoff)
  const releaseDate = formatCatalogYearMonth(model.release_date)

  const specChips: {
    key: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: React.ReactNode
  }[] = []

  if (contextLength > 0) {
    specChips.push({
      key: 'context',
      icon: Layers,
      label: t('Context'),
      value: formatCatalogTokenCount(contextLength),
    })
  }
  if (maxOutput > 0) {
    specChips.push({
      key: 'max-output',
      icon: Maximize2,
      label: t('Max output'),
      value: formatCatalogTokenCount(maxOutput),
    })
  }
  if (inputModalities.length > 0 || outputModalities.length > 0) {
    specChips.push({
      key: 'modalities',
      icon: FileText,
      label: t('Modalities'),
      value: (
        <span className='inline-flex items-center gap-1'>
          <ModalityLabels items={inputModalities} />
          {inputModalities.length > 0 && outputModalities.length > 0 && (
            <span className='text-muted-foreground/50'>→</span>
          )}
          <ModalityLabels items={outputModalities} />
        </span>
      ),
    })
  }
  if (model.parameter_count) {
    specChips.push({
      key: 'params',
      icon: Sparkles,
      label: t('Parameters'),
      value: model.parameter_count,
    })
  }
  if (knowledgeCutoff) {
    specChips.push({
      key: 'knowledge',
      icon: Sparkles,
      label: t('Knowledge cutoff'),
      value: knowledgeCutoff,
    })
  }
  if (releaseDate) {
    specChips.push({
      key: 'release',
      icon: CalendarClock,
      label: t('Released'),
      value: releaseDate,
    })
  }

  const handleOpenDocsClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return
    }
    if (props.onOpenDocs) {
      event.preventDefault()
      props.onOpenDocs(docId)
      return
    }
    if (router?.navigate) {
      event.preventDefault()
      void router.navigate({ to: '/docs', search: { doc: docId } })
    }
  }

  return (
    <header className='border-border/70 border-b pb-3.5'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          {modelIcon && (
            <div className='bg-muted/40 border-border/70 flex size-10 shrink-0 items-center justify-center rounded-xl border'>
              {modelIcon}
            </div>
          )}
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5'>
              <h1 className='text-foreground font-mono text-lg font-bold tracking-tight break-all sm:text-xl'>
                {model.model_name}
              </h1>
              <CopyButton
                value={model.model_name || ''}
                className='size-6 shrink-0'
                iconClassName='size-3'
                tooltip={t('Copy model name')}
                successTooltip={t('Copied!')}
                aria-label={t('Copy model name')}
              />
            </div>
            <div className='mt-1 flex flex-wrap items-center gap-1.5 text-xs'>
              {model.vendor_name && (
                <span className='text-foreground/80 font-medium'>
                  {model.vendor_name}
                </span>
              )}
              {model.vendor_name && (
                <span className='text-muted-foreground/30'>·</span>
              )}
              <ModelBillingModeBadge model={model} />
              {hasMeasuredStatus && summaryRate !== undefined && (
                <>
                  <span className='text-muted-foreground/30'>·</span>
                  <span className='inline-flex items-center gap-1 font-mono text-[11px] font-medium tabular-nums'>
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        getSuccessRateDotClass(summaryRate)
                      )}
                    />
                    <span className={getSuccessRateTextClass(summaryRate)}>
                      {formatUptimePct(summaryRate)}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <a
          href={docHref}
          onClick={handleOpenDocsClick}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs font-medium'
          )}
        >
          <BookOpen className='size-3.5' />
          <span>{t('Calling docs')}</span>
          <ArrowUpRight className='text-muted-foreground size-3' />
        </a>
      </div>

      {description && (
        <p className='text-muted-foreground mt-2.5 text-[13px] leading-relaxed'>
          {description}
        </p>
      )}

      {specChips.length > 0 && (
        <div className='mt-2.5 flex flex-wrap items-center gap-1.5'>
          {specChips.map((chip) => {
            const Icon = chip.icon
            return (
              <span
                key={chip.key}
                className='bg-muted/45 border-border/60 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]'
              >
                <Icon className='text-muted-foreground/70 size-3 shrink-0' />
                <span className='text-muted-foreground shrink-0'>
                  {chip.label}
                </span>
                <span className='text-foreground truncate font-mono font-medium tabular-nums'>
                  {chip.value}
                </span>
              </span>
            )
          })}
        </div>
      )}
    </header>
  )
}

// ----------------------------------------------------------------------------
// Compact real-time monitoring summary bar
// ----------------------------------------------------------------------------

function OverviewMetricCell(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  const Icon = props.icon
  return (
    <div className='flex min-w-0 flex-col gap-0.5 px-3 py-2'>
      <div className='text-muted-foreground flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase'>
        <Icon className='text-muted-foreground/70 size-3 shrink-0' />
        <span className='truncate'>{props.label}</span>
      </div>
      <div
        className={cn(
          'text-foreground truncate font-mono text-sm font-semibold tabular-nums',
          props.valueClassName
        )}
      >
        {props.value}
      </div>
    </div>
  )
}

function OverviewSummaryGrid(props: {
  monitoringData?: PerformanceMetricsData['data'] | null
  isPending: boolean
  isError: boolean
}) {
  const { t } = useTranslation()
  const summary = props.monitoringData?.summary

  if (!summary) {
    let statusText = t('Not monitored')
    if (props.isPending) statusText = t('Loading...')
    if (props.isError) statusText = t('Monitoring unavailable')
    return (
      <p className='text-muted-foreground text-xs'>
        {t('Monitored relay requests')} · {statusText}
      </p>
    )
  }

  const successRate = isMeasuredRate(summary.success_rate)
    ? summary.success_rate
    : Number.NaN
  const avgTps = summary.avg_tps ?? 0
  const avgLatency = summary.avg_latency_ms ?? 0
  const isTpsInsufficient = Boolean(summary.tps_insufficient) && avgTps <= 0
  const throughputValue = formatThroughputDisplay(avgTps, {
    insufficient: summary.tps_insufficient,
    insufficientLabel: t('Insufficient samples'),
  })

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-[11px]'>
        {t('All visible groups')} · {t('Monitored relay requests')}{' '}
        {monitoringWindowLabel(props.monitoringData ?? undefined)}
      </p>
      <div className='bg-muted/35 divide-border/50 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl sm:grid-cols-4 sm:divide-y-0'>
        <OverviewMetricCell
          icon={HeartPulse}
          label={t('Availability')}
          value={formatUptimePct(successRate)}
          valueClassName={getSuccessRateTextClass(successRate)}
        />
        <OverviewMetricCell
          icon={Timer}
          label={t('Latency')}
          value={formatLatency(avgLatency)}
        />
        <OverviewMetricCell
          icon={Gauge}
          label={t('Throughput')}
          value={throughputValue}
          valueClassName={
            isTpsInsufficient
              ? 'text-muted-foreground font-sans text-xs font-normal'
              : undefined
          }
        />
        <OverviewMetricCell
          icon={DatabaseZap}
          label={t('Cache hit rate')}
          value={formatCacheHitRate(summary.cache_hit_rate)}
        />
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Auto group chain hint
// ----------------------------------------------------------------------------

function AutoGroupChain(props: { model: PricingModel; autoGroups: string[] }) {
  const { t } = useTranslation()
  const modelEnableGroups = Array.isArray(props.model.enable_groups)
    ? props.model.enable_groups
    : []
  const autoChain = props.autoGroups.filter((group) =>
    modelEnableGroups.includes(group)
  )

  if (autoChain.length === 0) return null

  return (
    <div className='text-muted-foreground flex flex-wrap items-center gap-1 text-[11px]'>
      <span className='font-medium'>{t('Auto Group Chain')}</span>
      <span className='text-muted-foreground/40'>→</span>
      {autoChain.map((group, idx) => (
        <span key={group} className='flex items-center gap-1'>
          <GroupBadge group={group} size='sm' />
          {idx < autoChain.length - 1 && (
            <span className='text-muted-foreground/40'>→</span>
          )}
        </span>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Compact base price strip (used for non-tiered / simple models)
// ----------------------------------------------------------------------------

function CompactBasePriceStrip(props: {
  model: PricingModel
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice: boolean
}) {
  const { t, i18n } = useTranslation()
  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'
  const baseGroupKey = '_base'
  const baseGroupRatioMap = { [baseGroupKey]: 1 }
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(props.model.billing_expr)

  const dynamicSummary = useMemo(
    () =>
      getDynamicPricingSummary(props.model, {
        now: billingTime === undefined ? undefined : new Date(billingTime),
        tokenUnit: props.tokenUnit,
        showRechargePrice: props.showRechargePrice,
        priceRate: props.priceRate,
        usdExchangeRate: props.usdExchangeRate,
        groupRatioMultiplier: 1,
        digitsLarge: 2,
      }),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.model,
      props.tokenUnit,
      props.showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      billingTime,
      currency,
    ]
  )

  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      return (
        <div className='rounded-lg border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/10'>
          <div className='text-xs font-medium text-amber-800 dark:text-amber-200'>
            {t('Special billing expression')}
          </div>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              pricingDisplayFallbackKey(
                dynamicSummary.rawExpression,
                props.model.billing_usage_schema
              )
            )}
          </p>
          <div className='mt-2'>
            <div className='text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase'>
              {t('Raw expression')}
            </div>
            <code className='text-muted-foreground bg-background/80 block max-h-24 overflow-auto rounded-md border px-2 py-1 font-mono text-xs break-all'>
              {dynamicSummary.rawExpression}
            </code>
          </div>
        </div>
      )
    }

    const primaryEntries = dynamicSummary.primaryEntries
    const secondaryEntries = dynamicSummary.secondaryEntries
    const hasAnyEntries =
      primaryEntries.length > 0 || secondaryEntries.length > 0
    const showDynamicCacheFallback =
      !dynamicSummary.isTaskUsage &&
      isTokenBased &&
      secondaryEntries.length === 0
    const baseUnitLabel = dynamicSummary.isTaskUsage
      ? t('Prices shown per usage unit')
      : t('Prices shown per {{unit}} tokens', { unit: tokenUnitLabel })

    return (
      <div className='bg-muted/40 space-y-2 rounded-xl px-3.5 py-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-foreground inline-flex items-center gap-1.5 text-xs font-semibold'>
              <Tag className='text-primary size-3.5 shrink-0' />
              {t('Official base pricing')}
            </span>
            <span className='bg-foreground/10 text-foreground rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold'>
              1x
            </span>
            <span className='text-muted-foreground text-[11px]'>
              {t('Reference rate before group multiplier')}
            </span>
          </div>
          <span className='text-muted-foreground text-[11px]'>
            {dynamicSummary.providerCount
              ? `${t('{{count}} providers', { count: dynamicSummary.providerCount })}${
                  dynamicSummary.hasUnconfiguredProviders
                    ? ` · ${t('Not configured for some providers')}`
                    : ''
                }`
              : baseUnitLabel}
          </span>
        </div>

        <div className='space-y-1.5'>
          {hasAnyEntries ? (
            <>
              {primaryEntries.length > 0 && (
                <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1'>
                  {primaryEntries.map((entry) => {
                    const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
                    const unitLabel = taskUsageUnitLabel(
                      entry,
                      i18n.language,
                      unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
                    )
                    return (
                      <span
                        key={entry.key}
                        className='inline-flex items-baseline gap-1.5 text-xs'
                      >
                        <span className='text-muted-foreground font-medium'>
                          <DynamicPriceEntryLabel entry={entry} />
                        </span>
                        <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
                          {entry.formattedRange ?? entry.formatted}
                        </span>
                        <span className='text-muted-foreground/65 text-[11px]'>
                          / {unitLabel}
                        </span>
                      </span>
                    )
                  })}
                </div>
              )}
              {(secondaryEntries.length > 0 || showDynamicCacheFallback) && (
                <div className='flex flex-wrap items-baseline gap-x-3.5 gap-y-1 text-[11px]'>
                  {secondaryEntries.map((entry) => {
                    const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
                    const unitLabel = taskUsageUnitLabel(
                      entry,
                      i18n.language,
                      unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
                    )
                    return (
                      <span
                        key={entry.key}
                        className='inline-flex items-baseline gap-1'
                      >
                        <span className='text-muted-foreground'>
                          <DynamicPriceEntryLabel entry={entry} />
                        </span>
                        <span className='text-foreground/85 font-mono font-medium tabular-nums'>
                          {entry.formattedRange ?? entry.formatted}
                        </span>
                        <span className='text-muted-foreground/60 text-[10px]'>
                          / {unitLabel}
                        </span>
                      </span>
                    )
                  })}
                  {showDynamicCacheFallback && (
                    <span className='inline-flex items-baseline gap-1'>
                      <span className='text-muted-foreground'>
                        {t('Cache')}
                      </span>
                      <span className='text-muted-foreground font-mono tabular-nums'>
                        —
                      </span>
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <span className='text-muted-foreground text-xs'>
              {dynamicSummary.hasUnconfiguredProviders
                ? t('Not configured')
                : t('Dynamic Pricing')}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (isUnconfiguredTaskUsageModel(props.model)) {
    return null
  }

  if (!isTokenBased) {
    return (
      <div className='bg-muted/40 space-y-2 rounded-xl px-3.5 py-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-foreground inline-flex items-center gap-1.5 text-xs font-semibold'>
              <Tag className='text-primary size-3.5 shrink-0' />
              {t('Official base pricing')}
            </span>
            <span className='bg-foreground/10 text-foreground rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold'>
              1x
            </span>
            <span className='text-muted-foreground text-[11px]'>
              {t('Reference rate before group multiplier')}
            </span>
          </div>
        </div>
        <div className='flex items-baseline gap-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Per request')}
          </span>
          <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
            {formatFixedPrice(
              props.model,
              baseGroupKey,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              baseGroupRatioMap
            )}
          </span>
        </div>
      </div>
    )
  }

  const secondaryPriceCandidates: {
    label: string
    type: PriceType
    available: boolean
  }[] = [
    {
      label: t('Cache write'),
      type: 'create_cache',
      available: props.model.create_cache_ratio != null,
    },
    {
      label: t('Image input'),
      type: 'image',
      available: props.model.image_ratio != null,
    },
    {
      label: t('Audio input'),
      type: 'audio_input',
      available: props.model.audio_ratio != null,
    },
    {
      label: t('Audio output'),
      type: 'audio_output',
      available:
        props.model.audio_ratio != null &&
        props.model.audio_completion_ratio != null,
    },
  ]
  const secondaryPriceTypes = secondaryPriceCandidates.filter(
    (item) => item.available
  )

  const renderBasePrice = (type: PriceType) =>
    formatGroupPrice(
      props.model,
      baseGroupKey,
      type,
      props.tokenUnit,
      props.showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      baseGroupRatioMap
    )

  return (
    <div className='bg-muted/40 space-y-2 rounded-xl px-3.5 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-foreground inline-flex items-center gap-1.5 text-xs font-semibold'>
            <Tag className='text-primary size-3.5 shrink-0' />
            {t('Official base pricing')}
          </span>
          <span className='bg-foreground/10 text-foreground rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold'>
            1x
          </span>
          <span className='text-muted-foreground text-[11px]'>
            {t('Reference rate before group multiplier')}
          </span>
        </div>
        <span className='text-muted-foreground text-[11px]'>
          {t('Prices shown per {{unit}} tokens', { unit: tokenUnitLabel })}
        </span>
      </div>

      <div className='space-y-1.5'>
        <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs'>
          <span className='inline-flex items-baseline gap-1.5'>
            <span className='text-muted-foreground font-medium'>
              {t('Input')}
            </span>
            <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
              {renderBasePrice('input')}
            </span>
          </span>
          <span className='inline-flex items-baseline gap-1.5'>
            <span className='text-muted-foreground font-medium'>
              {t('Output')}
            </span>
            <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
              {renderBasePrice('output')}
            </span>
          </span>
          <span className='inline-flex items-baseline gap-1.5'>
            <span className='text-muted-foreground font-medium'>
              {t('Cache')}
            </span>
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                props.model.cache_ratio != null
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {props.model.cache_ratio != null ? renderBasePrice('cache') : '—'}
            </span>
          </span>
        </div>

        {secondaryPriceTypes.length > 0 && (
          <div className='flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px]'>
            {secondaryPriceTypes.map((item) => (
              <span
                key={item.type}
                className='inline-flex items-baseline gap-1'
              >
                <span className='text-muted-foreground'>{item.label}</span>
                <span className='text-foreground/85 font-mono font-medium tabular-nums'>
                  {renderBasePrice(item.type)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Per-group live performance micro-strip (fused into every group card)
// ----------------------------------------------------------------------------

const GROUP_AVAILABILITY_TICK_CLASS: Record<HourlyMonitorSlotState, string> = {
  ok: 'h-full flex-1 rounded-[1.5px] bg-emerald-500',
  good: 'h-full flex-1 rounded-[1.5px] bg-emerald-300',
  warn: 'h-full flex-1 rounded-[1.5px] bg-amber-500',
  err: 'h-full flex-1 rounded-[1.5px] bg-red-500',
  empty: 'h-full flex-1 rounded-[1.5px] bg-foreground/12 dark:bg-white/15',
}

function GroupPerfStrip(props: {
  perf?: PerformanceGroup
  monitoringData?: PerformanceMetricsData['data'] | null
}) {
  const { t } = useTranslation()
  const perf = props.perf
  const successRate = isMeasuredRate(perf?.success_rate)
    ? perf.success_rate
    : Number.NaN
  const hasSuccess = Number.isFinite(successRate)
  const monitorSlots = useMemo(
    () =>
      buildHourlyMonitorSlots(
        perf?.series,
        props.monitoringData ?? undefined,
        24,
        hasSuccess ? successRate : undefined
      ),
    [hasSuccess, perf, props.monitoringData, successRate]
  )
  const hasSampledTicks = monitorSlots.some((slot) => slot.state !== 'empty')
  const latencyDisplay = perf ? formatLatency(perf.avg_latency_ms) : '—'
  const ttftDisplay =
    perf && perf.avg_ttft_ms > 0 ? formatLatency(perf.avg_ttft_ms) : null
  const isThroughputInsufficient =
    Boolean(perf?.tps_insufficient) && !(perf && perf.avg_tps > 0)
  const throughputDisplay = perf
    ? formatThroughputDisplay(perf.avg_tps, {
        insufficient: perf.tps_insufficient,
        insufficientLabel: t('Insufficient samples'),
      })
    : '—'
  const cacheDisplay = formatCacheHitRate(perf?.cache_hit_rate)

  return (
    <div className='border-border/45 mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2.5 text-[11px] sm:grid-cols-[minmax(158px,1.55fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'>
      <div className='col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1'>
        <span className='text-muted-foreground/80 truncate text-[10px]'>
          {t('Availability')}
        </span>
        <div className='flex items-center gap-2'>
          <div
            className='flex h-3 w-[88px] shrink-0 items-center gap-[1.5px]'
            role='img'
            aria-label={
              hasSampledTicks
                ? t('Sampled request success rates')
                : t('Not monitored')
            }
          >
            {monitorSlots.map((slot) => {
              const tickTitle =
                slot.state !== 'empty' && slot.ts != null && slot.rate != null
                  ? `${formatTimestampToDate(slot.ts)} · ${formatUptimePct(slot.rate)}`
                  : undefined
              return (
                <span
                  key={slot.key}
                  className={GROUP_AVAILABILITY_TICK_CLASS[slot.state]}
                  data-state={slot.state}
                  title={tickTitle}
                />
              )
            })}
          </div>
          <span
            className={cn(
              'font-mono text-xs font-semibold whitespace-nowrap tabular-nums',
              hasSuccess
                ? getSuccessRateTextClass(successRate)
                : 'text-muted-foreground'
            )}
          >
            {hasSuccess ? formatUptimePct(successRate) : '—'}
          </span>
        </div>
      </div>

      <div className='flex min-w-0 flex-col gap-1'>
        <span className='text-muted-foreground/80 truncate text-[10px]'>
          {t('Latency')}
        </span>
        <span className='text-foreground truncate font-mono text-xs font-medium tabular-nums'>
          {latencyDisplay}
          {ttftDisplay && (
            <span className='text-muted-foreground/75 ml-1 text-[10px] font-normal'>
              (TTFT {ttftDisplay})
            </span>
          )}
        </span>
      </div>

      <div className='flex min-w-0 flex-col gap-1'>
        <span className='text-muted-foreground/80 truncate text-[10px]'>
          {t('Throughput')}
        </span>
        <span
          className={cn(
            'truncate text-xs tabular-nums',
            isThroughputInsufficient
              ? 'text-muted-foreground font-normal'
              : 'text-foreground font-mono font-medium'
          )}
        >
          {throughputDisplay}
        </span>
      </div>

      <div className='flex min-w-0 flex-col gap-1'>
        <span className='text-muted-foreground/80 truncate text-[10px]'>
          {t('Cache hit rate')}
        </span>
        <span className='text-foreground truncate font-mono text-xs font-medium tabular-nums'>
          {cacheDisplay}
        </span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Unified pricing + per-group fused cards (no duplicate dynamic sections)
// ----------------------------------------------------------------------------

type UnifiedPricingSectionProps = {
  model: PricingModel
  groupRatio: Record<string, number>
  usableGroup: Record<string, { desc: string; ratio: number }>
  autoGroups: string[]
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
  monitoringData?: PerformanceMetricsData['data'] | null
  perfByGroup: Map<string, PerformanceGroup>
}

function GroupPricingVariantsWrapper(props: UnifiedPricingSectionProps) {
  const { t } = useTranslation()
  const variants = props.model.billing_plugin_variants
  if (!variants?.length) {
    return <UnifiedProviderPricingSection {...props} />
  }
  const ordinary = props.model.ordinary_pricing
  return (
    <Tabs
      key={props.model.model_name}
      defaultValue={ordinary ? ORDINARY_PRICING_TAB : variants[0].plugin_key}
      className='gap-3'
    >
      <TabsList
        aria-label={t('Provider')}
        className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'
      >
        {ordinary && (
          <TabsTrigger value={ORDINARY_PRICING_TAB}>
            {t('Default price')}
          </TabsTrigger>
        )}
        {variants.map((variant) => (
          <TabsTrigger
            key={variant.plugin_key}
            value={variant.plugin_key}
            className='max-w-full min-w-0'
          >
            <PluginIcon
              plugin={{
                key: variant.plugin_key,
                name: variant.plugin_name,
                icon: variant.icon,
              }}
              size={16}
            />
            <span className='truncate' title={variant.plugin_name}>
              {variant.plugin_name}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {ordinary && (
        <TabsContent value={ORDINARY_PRICING_TAB} className='outline-none'>
          <UnifiedProviderPricingSection
            {...props}
            model={withOrdinaryPricing(props.model)}
          />
        </TabsContent>
      )}
      {variants.map((variant) => (
        <TabsContent
          key={variant.plugin_key}
          value={variant.plugin_key}
          className='outline-none'
        >
          {variant.billing_expr || variant.billing_mode === 'ratio' ? (
            <UnifiedProviderPricingSection
              {...props}
              model={withPluginPricing(props.model, variant)}
            />
          ) : (
            <UnconfiguredTaskPricingNotice
              model={withPluginPricing(props.model, variant)}
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function UnifiedProviderPricingSection(props: UnifiedPricingSectionProps) {
  const { t, i18n } = useTranslation()
  const showRechargePrice = props.showRechargePrice ?? false
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(props.model.billing_expr)

  const availableGroups = useMemo(
    () => getAvailableGroups(props.model, props.usableGroup || {}),
    [props.model, props.usableGroup]
  )

  const [selectedTierGroup, setSelectedTierGroup] = useState<string>(
    () => availableGroups[0] ?? BASE_RATIO_KEY
  )

  const effectiveTierGroup =
    selectedTierGroup === BASE_RATIO_KEY ||
    availableGroups.includes(selectedTierGroup)
      ? selectedTierGroup
      : (availableGroups[0] ?? BASE_RATIO_KEY)

  const activeTierRatio =
    effectiveTierGroup === BASE_RATIO_KEY
      ? 1
      : props.groupRatio[effectiveTierGroup] || 1

  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'
  const simpleTaskPricing = hasSimpleTaskPricing(props.model)
  const isDynamic = isDynamicPricingModel(props.model)
  const dynamicTiers = useMemo(
    () => (isDynamic ? getDynamicPricingTiers(props.model) : []),
    [isDynamic, props.model]
  )
  const taskTiers = useMemo(
    () =>
      getTaskPricingDisplayTiers(
        props.model.billing_expr,
        props.model.billing_usage_schema
      ),
    [props.model.billing_expr, props.model.billing_usage_schema]
  )

  const activeBaseDynamicSummary = useMemo(
    () =>
      isDynamic
        ? getDynamicPricingSummary(props.model, {
            now: billingTime === undefined ? undefined : new Date(billingTime),
            tokenUnit: props.tokenUnit,
            showRechargePrice,
            priceRate: props.priceRate,
            usdExchangeRate: props.usdExchangeRate,
            groupRatioMultiplier: 1,
            digitsLarge: 2,
          })
        : null,
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isDynamic,
      props.model,
      billingTime,
      props.tokenUnit,
      showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      currency,
    ]
  )

  const hasConditionalOrMultiTier =
    dynamicTiers.length > 1 ||
    Boolean(activeBaseDynamicSummary?.hasRequestRules) ||
    Boolean(activeBaseDynamicSummary?.isSpecialExpression) ||
    dynamicTiers.some((tier) =>
      'unitPrices' in tier
        ? tier.conditions.length > 0
        : Boolean(tier.conditionText) || tier.conditions.length > 0
    )

  const showUnifiedTierTable =
    isDynamic &&
    !simpleTaskPricing &&
    hasConditionalOrMultiTier &&
    (dynamicTiers.length > 0 || Boolean(props.model.billing_expr))

  const showCompactBaseStrip =
    !(showUnifiedTierTable && activeBaseDynamicSummary?.isSpecialExpression) &&
    (!props.model.billing_usage_schema ||
      simpleTaskPricing ||
      taskTiers.length === 0 ||
      isDynamic)

  const extraPriceTypes = useMemo(() => {
    const types: { label: string; type: PriceType }[] = []
    if (props.model.create_cache_ratio != null) {
      types.push({ label: t('Cache write'), type: 'create_cache' })
    }
    if (props.model.image_ratio != null) {
      types.push({ label: t('Image'), type: 'image' })
    }
    if (props.model.audio_ratio != null) {
      types.push({ label: t('Audio'), type: 'audio_input' })
    }
    return types
  }, [props.model, t])

  const usageExampleRows = useMemo(
    () =>
      evaluateTaskUsageExamples(
        props.model.billing_expr,
        props.model.billing_usage_schema,
        props.model.billing_usage_examples
      ),
    [
      props.model.billing_expr,
      props.model.billing_usage_schema,
      props.model.billing_usage_examples,
    ]
  )

  const dynamicSummariesByGroup = useMemo(() => {
    if (!isDynamic) {
      return new Map<string, ReturnType<typeof getDynamicPricingSummary>>()
    }
    return new Map(
      availableGroups.map((group) => {
        const ratio = props.groupRatio[group] || 1
        return [
          group,
          getDynamicPricingSummary(props.model, {
            now: billingTime === undefined ? undefined : new Date(billingTime),
            tokenUnit: props.tokenUnit,
            showRechargePrice,
            priceRate: props.priceRate,
            usdExchangeRate: props.usdExchangeRate,
            groupRatioMultiplier: ratio,
            digitsLarge: 2,
          }),
        ] as const
      })
    )
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDynamic,
    availableGroups,
    props.groupRatio,
    props.model,
    billingTime,
    props.tokenUnit,
    showRechargePrice,
    props.priceRate,
    props.usdExchangeRate,
    currency,
  ])

  if (isUnconfiguredTaskUsageModel(props.model)) {
    return (
      <div className='space-y-3'>
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <UnconfiguredTaskPricingNotice model={props.model} />
      </div>
    )
  }

  const renderGroupPrice = (group: string, type: PriceType) =>
    formatGroupPrice(
      props.model,
      group,
      type,
      props.tokenUnit,
      showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.groupRatio
    )
  const renderFixedGroupPrice = (group: string) =>
    formatFixedPrice(
      props.model,
      group,
      showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.groupRatio
    )

  const renderGroupPriceSlots = (
    group: string
  ): { primary: React.ReactNode; secondary?: React.ReactNode } => {
    const groupDynamicSummary = dynamicSummariesByGroup.get(group)
    if (isDynamic && groupDynamicSummary) {
      if (groupDynamicSummary.isSpecialExpression) {
        return {
          primary: (
            <span className='text-muted-foreground text-xs'>
              {t('Special billing expression')}
            </span>
          ),
        }
      }
      const primaryEntries = groupDynamicSummary.primaryEntries
      const secondaryEntries = groupDynamicSummary.secondaryEntries
      const showDynamicCacheFallback =
        !groupDynamicSummary.isTaskUsage &&
        isTokenBased &&
        secondaryEntries.length === 0
      return {
        primary: primaryEntries.map((entry) => {
          const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
          const unitLabel = taskUsageUnitLabel(
            entry,
            i18n.language,
            unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
          )
          return (
            <span
              key={entry.key}
              className='inline-flex items-baseline gap-1 text-xs'
            >
              <span className='text-muted-foreground'>
                <DynamicPriceEntryLabel entry={entry} />
              </span>
              <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
                {entry.formattedRange ?? entry.formatted}
              </span>
              <span className='text-muted-foreground/60 text-[11px]'>
                / {unitLabel}
              </span>
            </span>
          )
        }),
        secondary:
          secondaryEntries.length > 0 || showDynamicCacheFallback ? (
            <>
              {secondaryEntries.map((entry) => {
                const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
                const unitLabel = taskUsageUnitLabel(
                  entry,
                  i18n.language,
                  unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
                )
                return (
                  <span
                    key={entry.key}
                    className='inline-flex items-baseline gap-1'
                  >
                    <span className='text-muted-foreground/85'>
                      <DynamicPriceEntryLabel entry={entry} />
                    </span>
                    <span className='text-foreground/85 font-mono font-medium tabular-nums'>
                      {entry.formattedRange ?? entry.formatted}
                    </span>
                    <span className='text-muted-foreground/55 text-[10px]'>
                      / {unitLabel}
                    </span>
                  </span>
                )
              })}
              {showDynamicCacheFallback && (
                <span className='inline-flex items-baseline gap-1'>
                  <span className='text-muted-foreground/85'>{t('Cache')}</span>
                  <span className='text-muted-foreground font-mono tabular-nums'>
                    —
                  </span>
                </span>
              )}
            </>
          ) : undefined,
      }
    }
    if (isTokenBased) {
      const hasCache = props.model.cache_ratio != null
      return {
        primary: (
          <>
            <span className='inline-flex items-baseline gap-1 text-xs'>
              <span className='text-muted-foreground'>{t('Input')}</span>
              <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
                {renderGroupPrice(group, 'input')}
              </span>
            </span>
            <span className='inline-flex items-baseline gap-1 text-xs'>
              <span className='text-muted-foreground'>{t('Output')}</span>
              <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
                {renderGroupPrice(group, 'output')}
              </span>
            </span>
            <span className='inline-flex items-baseline gap-1 text-xs'>
              <span className='text-muted-foreground'>{t('Cache')}</span>
              <span
                className={cn(
                  'font-mono text-sm font-semibold tabular-nums',
                  hasCache ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {hasCache ? renderGroupPrice(group, 'cache') : '—'}
              </span>
            </span>
          </>
        ),
        secondary:
          extraPriceTypes.length > 0
            ? extraPriceTypes.map((extra) => (
                <span
                  key={extra.type}
                  className='inline-flex items-baseline gap-1'
                >
                  <span className='text-muted-foreground/80'>
                    {extra.label}
                  </span>
                  <span className='text-foreground/85 font-mono font-medium tabular-nums'>
                    {renderGroupPrice(group, extra.type)}
                  </span>
                </span>
              ))
            : undefined,
      }
    }
    return {
      primary: (
        <span className='text-foreground font-mono text-sm font-semibold tabular-nums'>
          {renderFixedGroupPrice(group)}
        </span>
      ),
    }
  }

  return (
    <div className='space-y-4'>
      <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />

      {showCompactBaseStrip && (
        <CompactBasePriceStrip
          model={props.model}
          priceRate={props.priceRate}
          usdExchangeRate={props.usdExchangeRate}
          tokenUnit={props.tokenUnit}
          showRechargePrice={showRechargePrice}
        />
      )}

      {showUnifiedTierTable &&
        (() => {
          const tierUnitHint = dynamicTiers.some(
            (tier) => 'unitPrices' in tier || tier.billingUnit === 'request'
          )
            ? t('Prices shown per usage unit')
            : t('Prices shown per {{unit}} tokens', {
                unit: tokenUnitLabel,
              })
          const isViewingBase = effectiveTierGroup === BASE_RATIO_KEY
          return (
            <div className='border-border/80 bg-card/60 overflow-hidden rounded-xl border'>
              <div className='bg-muted/30 border-border/60 space-y-2.5 border-b px-3.5 py-2.5'>
                <div className='flex flex-wrap items-baseline justify-between gap-2'>
                  <span className='text-foreground text-xs font-semibold'>
                    {t('Tiered pricing')}
                  </span>
                  {availableGroups.length > 0 && (
                    <span className='text-muted-foreground text-[11px]'>
                      {t('Select group to preview actual price')}
                    </span>
                  )}
                </div>

                {availableGroups.length > 0 && (
                  <div
                    className='flex flex-wrap items-center gap-1.5'
                    role='group'
                    aria-label={t('Select group to preview actual price')}
                  >
                    <button
                      type='button'
                      onClick={() => setSelectedTierGroup(BASE_RATIO_KEY)}
                      aria-pressed={isViewingBase}
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all',
                        isViewingBase
                          ? 'border-primary bg-primary text-primary-foreground font-medium shadow-xs'
                          : 'border-border bg-background text-foreground/85 hover:border-primary/60 hover:bg-accent hover:text-foreground shadow-2xs'
                      )}
                    >
                      {isViewingBase && <Check className='size-3 shrink-0' />}
                      <span>{t('Official Base')}</span>
                      <span
                        className={cn(
                          'rounded px-1 py-0.5 font-mono text-[10px] leading-none',
                          isViewingBase
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        1x
                      </span>
                    </button>
                    {availableGroups.map((group) => {
                      const ratio = props.groupRatio[group] || 1
                      const active = effectiveTierGroup === group
                      return (
                        <button
                          key={group}
                          type='button'
                          onClick={() => setSelectedTierGroup(group)}
                          aria-pressed={active}
                          className={cn(
                            'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all',
                            active
                              ? 'border-primary bg-primary text-primary-foreground font-medium shadow-xs'
                              : 'border-border bg-background text-foreground/85 hover:border-primary/60 hover:bg-accent hover:text-foreground shadow-2xs'
                          )}
                        >
                          {active && <Check className='size-3 shrink-0' />}
                          <span>{group}</span>
                          <span
                            className={cn(
                              'rounded px-1 py-0.5 font-mono text-[10px] leading-none',
                              active
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {ratio}x
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2 text-xs',
                  isViewingBase
                    ? 'bg-muted/20 border-border/60'
                    : 'bg-primary/[0.06] border-primary/15'
                )}
              >
                <div className='flex flex-wrap items-center gap-2'>
                  {isViewingBase ? (
                    <span className='text-foreground font-semibold'>
                      {t('Showing official base pricing (1x)')}
                    </span>
                  ) : (
                    <>
                      <span className='text-primary font-semibold'>
                        {t('Actual usage price for selected group')}
                      </span>
                      <GroupBadge group={effectiveTierGroup} size='sm' />
                      <span className='bg-background/90 border-border/70 text-foreground rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium'>
                        {t('Base × {{ratio}}', { ratio: activeTierRatio })}
                      </span>
                    </>
                  )}
                </div>
                <span className='text-muted-foreground text-[11px]'>
                  {tierUnitHint}
                </span>
              </div>

              <div className='p-2.5'>
                <DynamicPricingBreakdown
                  hideHeader
                  compact
                  unitInHeader
                  tableOnly
                  modelName={props.model.model_name}
                  billingExpr={props.model.billing_expr}
                  usageSchema={props.model.billing_usage_schema}
                  taskPriceOptions={{
                    tokenUnit: props.tokenUnit,
                    showRechargePrice,
                    priceRate: props.priceRate,
                    usdExchangeRate: props.usdExchangeRate,
                    groupRatioMultiplier: activeTierRatio,
                    digitsLarge: 2,
                  }}
                />
              </div>
            </div>
          )
        })()}

      {usageExampleRows.length > 0 && (
        <div className='border-border/70 bg-background/60 overflow-hidden rounded-xl border'>
          <div className='text-muted-foreground bg-muted/30 border-border/60 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase'>
            <span>{t('Price examples')}</span>
            <span className='font-mono normal-case'>
              {effectiveTierGroup === BASE_RATIO_KEY
                ? `${t('Official Base')} · 1x`
                : `${effectiveTierGroup} · ${activeTierRatio}x`}
            </span>
          </div>
          <StaticDataTable
            className='rounded-none border-0'
            tableClassName='text-xs'
            headerRowClassName='hover:bg-transparent'
            data={usageExampleRows}
            getRowKey={(row) => `${effectiveTierGroup}-${row.label}`}
            columns={[
              {
                id: 'spec',
                header: t('Spec'),
                className: 'text-muted-foreground h-8 py-1.5 font-medium',
                cellClassName: 'text-muted-foreground py-2',
                cell: (row) => row.label,
              },
              {
                id: 'price',
                header: t('Example price'),
                className:
                  'text-muted-foreground h-8 py-1.5 text-right font-medium',
                cellClassName: 'py-2 text-right font-mono font-medium',
                cell: (row) =>
                  `≈ ${formatTaskUsageUnitPrice(row.total, {
                    tokenUnit: props.tokenUnit,
                    showRechargePrice,
                    priceRate: props.priceRate,
                    usdExchangeRate: props.usdExchangeRate,
                    groupRatioMultiplier: activeTierRatio,
                  })}`,
              },
            ]}
          />
          <p className='text-muted-foreground/60 px-3 pb-2 text-[10px]'>
            {t('Approximate prices for common specs.')}
          </p>
        </div>
      )}

      {availableGroups.length > 0 && (
        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <SectionTitle>{t('Pricing by Group')}</SectionTitle>
            {isTokenBased && !showUnifiedTierTable && (
              <span className='text-muted-foreground/70 text-[10px]'>
                {t('Prices shown per {{unit}} tokens', {
                  unit: tokenUnitLabel,
                })}
              </span>
            )}
          </div>

          <div className='space-y-2.5'>
            {availableGroups.map((group) => {
              const ratio = props.groupRatio[group] || 1
              const perf = props.perfByGroup.get(group)
              const isSelectedForTiers =
                showUnifiedTierTable && effectiveTierGroup === group
              const groupPrices = renderGroupPriceSlots(group)

              return (
                <div
                  key={group}
                  onClick={
                    showUnifiedTierTable
                      ? () => setSelectedTierGroup(group)
                      : undefined
                  }
                  className={cn(
                    'bg-card border-border/70 rounded-xl border px-3.5 py-3 transition-colors',
                    showUnifiedTierTable &&
                      'hover:border-primary/40 cursor-pointer',
                    isSelectedForTiers && 'border-primary/60 bg-primary/[0.02]'
                  )}
                >
                  <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <GroupBadge group={group} size='sm' />
                      <span className='bg-muted/70 text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium'>
                        {ratio}x
                      </span>
                      {isSelectedForTiers && (
                        <span className='bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium'>
                          {t('Selected')}
                        </span>
                      )}
                    </div>

                    <div className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5'>
                      {groupPrices.primary}
                    </div>
                  </div>

                  {groupPrices.secondary && (
                    <div className='mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]'>
                      {groupPrices.secondary}
                    </div>
                  )}

                  <GroupPerfStrip
                    perf={perf}
                    monitoringData={props.monitoringData}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Compact capabilities, endpoints, and tags footer
// ----------------------------------------------------------------------------

function ModelCapabilitiesFooter(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const capabilities = normalizeCatalogItems(props.model.capabilities)
  const endpoints = normalizeCatalogItems(props.model.supported_endpoint_types)
  const tags = parseTags(props.model.tags)

  if (
    capabilities.length === 0 &&
    endpoints.length === 0 &&
    tags.length === 0
  ) {
    return null
  }

  return (
    <section className='border-border/60 space-y-3 border-t pt-4'>
      {capabilities.length > 0 && (
        <div className='space-y-1.5'>
          <SectionTitle>{t('Capabilities')}</SectionTitle>
          <div className='flex flex-wrap gap-1.5'>
            {capabilities.map((capability) => (
              <span
                key={capability}
                className='bg-muted text-foreground/80 rounded-md px-2 py-0.5 text-xs font-medium'
              >
                {t(
                  CAPABILITY_LABEL_KEYS[capability as ModelCapability] ??
                    capability
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {endpoints.length > 0 && (
        <div className='space-y-1.5'>
          <SectionTitle>{t('Endpoints')}</SectionTitle>
          <div className='flex flex-wrap gap-1.5'>
            {endpoints.map((endpoint) => (
              <span
                key={endpoint}
                className='bg-muted/70 text-muted-foreground rounded-md px-2 py-0.5 font-mono text-[11px]'
              >
                {endpoint}
              </span>
            ))}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div className='space-y-1.5'>
          <SectionTitle>{t('Tags')}</SectionTitle>
          <div className='flex flex-wrap gap-1.5'>
            {tags.map((tag) => (
              <span
                key={tag}
                className='bg-muted/60 text-muted-foreground rounded-md px-2 py-0.5 text-[11px]'
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------
// Main content (2-panel layout: Pricing & Performance + API & Docs)
// ----------------------------------------------------------------------------

export interface ModelDetailsContentProps {
  chatParameters?: SupportedParameter[]
  hideEstimates?: boolean
  model: PricingModel
  groupRatio: Record<string, number>
  usableGroup: Record<string, { desc: string; ratio: number }>
  endpointMap: Record<string, { path?: string; method?: string }>
  autoGroups: string[]
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
  onOpenDocs?: (docId: string) => void
}

export function ModelDetailsContent(props: ModelDetailsContentProps) {
  const { t } = useTranslation()
  const showRechargePrice = props.showRechargePrice ?? false
  const metricsQuery = useModelMonitoring(props.model.model_name)
  const monitoringData = metricsQuery.data
  const [overviewView, setOverviewView] = useState<'routes' | 'trends'>(
    'routes'
  )

  const perfByGroup = useMemo(
    () =>
      new Map((monitoringData?.groups ?? []).map((perf) => [perf.group, perf])),
    [monitoringData]
  )

  const hasTrendCharts =
    Boolean(monitoringData?.summary) ||
    (monitoringData?.groups?.length ?? 0) > 0

  return (
    <div className='@container/details space-y-4'>
      <ModelHeader
        model={props.model}
        monitoringData={monitoringData}
        onOpenDocs={props.onOpenDocs}
      />

      <Tabs defaultValue='overview' className='gap-4'>
        <TabsList className='bg-muted/60 grid w-full grid-cols-2 gap-1 rounded-lg p-1 group-data-horizontal/tabs:h-auto'>
          {TAB_VALUES.map((value) => {
            const Icon = TAB_META[value].icon
            return (
              <TabsTrigger
                key={value}
                value={value}
                className='h-8 min-w-0 gap-1.5 rounded-md px-3 text-xs sm:text-sm'
              >
                <Icon className='size-3.5 shrink-0' />
                <span className='truncate'>{t(TAB_META[value].labelKey)}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value='overview' className='space-y-5 outline-none'>
          <OverviewSummaryGrid
            monitoringData={monitoringData}
            isPending={metricsQuery.isPending}
            isError={metricsQuery.isError}
          />

          <section className='space-y-3.5'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <SectionTitle>{t('Pricing & Routes')}</SectionTitle>
              {hasTrendCharts && (
                <div
                  className='bg-muted/70 inline-flex items-center gap-0.5 rounded-lg p-0.5'
                  role='group'
                  aria-label={t('Pricing & Performance')}
                >
                  <button
                    type='button'
                    onClick={() => setOverviewView('routes')}
                    aria-pressed={overviewView === 'routes'}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      overviewView === 'routes'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Layers className='size-3' />
                    {t('Group routes')}
                  </button>
                  <button
                    type='button'
                    onClick={() => setOverviewView('trends')}
                    aria-pressed={overviewView === 'trends'}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      overviewView === 'trends'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Activity className='size-3' />
                    {t('24h trends')}
                  </button>
                </div>
              )}
            </div>

            {overviewView === 'trends' && hasTrendCharts ? (
              <ModelDetailsPerformance model={props.model} mode='trends' />
            ) : (
              <GroupPricingVariantsWrapper
                model={props.model}
                groupRatio={props.groupRatio}
                usableGroup={props.usableGroup}
                autoGroups={props.autoGroups}
                priceRate={props.priceRate}
                usdExchangeRate={props.usdExchangeRate}
                tokenUnit={props.tokenUnit}
                showRechargePrice={showRechargePrice}
                monitoringData={monitoringData}
                perfByGroup={perfByGroup}
              />
            )}
          </section>

          <ModelCapabilitiesFooter model={props.model} />
        </TabsContent>

        <TabsContent value='api' className='outline-none'>
          <ModelDetailsApi
            chatParameters={props.chatParameters}
            model={props.model}
            endpointMap={props.endpointMap}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Drawer & page wrappers
// ----------------------------------------------------------------------------

export interface ModelDetailsDrawerProps extends ModelDetailsContentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelDetailsDrawer(props: ModelDetailsDrawerProps) {
  const { t } = useTranslation()
  const router = useRouter({ warn: false }) as
    | ReturnType<typeof useRouter>
    | undefined
  const { open, onOpenChange, onOpenDocs, ...contentProps } = props

  const handleOpenDocs = (docId: string) => {
    onOpenChange(false)
    if (onOpenDocs) {
      onOpenDocs(docId)
      return
    }
    if (router?.navigate) {
      void router.navigate({ to: '/docs', search: { doc: docId } })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className={sideDrawerContentClassName('sm:max-w-xl lg:max-w-[680px]')}
      >
        <SheetHeader className='sr-only'>
          <SheetTitle>{props.model.model_name}</SheetTitle>
          <SheetDescription>{t('Model details')}</SheetDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto px-5 pt-10 pb-6 sm:px-6'>
          <ModelDetailsContent {...contentProps} onOpenDocs={handleOpenDocs} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ModelDetails() {
  const { t } = useTranslation()
  const { modelId } = useParams({ from: '/pricing/$modelId/' })
  const search = useSearch({ from: '/pricing/$modelId/' })
  const navigate = useNavigate()

  const {
    models,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const tokenUnit: TokenUnit =
    search.tokenUnit === 'K' ? 'K' : DEFAULT_TOKEN_UNIT

  const model = useMemo(() => {
    if (!models || !modelId) return null
    return models.find((m) => m.model_name === modelId) || null
  }, [models, modelId])

  const handleBack = () => {
    navigate({ to: '/pricing', search })
  }

  const handleOpenDocs = (docId: string) => {
    void navigate({ to: '/docs', search: { doc: docId } })
  }

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-3xl px-4 sm:px-6'>
          <Skeleton className='mb-4 h-5 w-16' />
          <div className='space-y-2'>
            <Skeleton className='h-7 w-64' />
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-4 w-full max-w-md' />
          </div>
          <div className='mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {MODEL_DETAILS_SKELETON_KEYS.map((key) => (
              <Skeleton key={`metric-${key}`} className='h-14 w-full' />
            ))}
          </div>
          <div className='mt-6 space-y-3'>
            {MODEL_DETAILS_SKELETON_KEYS.map((key) => (
              <Skeleton key={`section-${key}`} className='h-24 w-full' />
            ))}
          </div>
        </div>
      </PublicLayout>
    )
  }

  if (!model) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-2xl px-4 text-center sm:px-6'>
          <h2 className='mb-1 text-base font-semibold'>
            {t('Model not found')}
          </h2>
          <p className='text-muted-foreground mb-4 text-sm'>
            {t("The model you're looking for doesn't exist.")}
          </p>
          <Button onClick={handleBack} variant='outline' size='sm'>
            {t('Back to Models')}
          </Button>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-3xl px-4 sm:px-6'>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleBack}
          className='text-muted-foreground hover:text-foreground mb-4 h-auto gap-1 px-0 py-1 text-xs'
        >
          <ArrowLeft className='size-3.5' />
          {t('Back')}
        </Button>

        <ModelDetailsContent
          model={model}
          groupRatio={groupRatio || {}}
          usableGroup={usableGroup || {}}
          autoGroups={autoGroups || []}
          priceRate={priceRate ?? 1}
          usdExchangeRate={usdExchangeRate ?? 1}
          tokenUnit={tokenUnit}
          showRechargePrice={search.rechargePrice ?? false}
          endpointMap={
            (endpointMap as Record<
              string,
              { path?: string; method?: string }
            >) || {}
          }
          onOpenDocs={handleOpenDocs}
        />
      </div>
    </PublicLayout>
  )
}
