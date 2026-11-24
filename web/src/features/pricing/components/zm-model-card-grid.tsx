import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { formatUptimePct } from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { formatTimestampToDate } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import {
  getModelCategories,
  CATEGORY_LABEL_KEYS,
} from '@/lib/model-task-capabilities'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  DEFAULT_PRICING_PAGE_SIZE,
  DEFAULT_TOKEN_UNIT,
  QUOTA_TYPES,
} from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
} from '../lib/dynamic-price'
import {
  getModelQuotaType,
  getModelPlaygroundModes,
  parseTags,
} from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import {
  buildHourlyMonitorSlots,
  type HourlyMonitorSlotState,
  isMeasuredRate,
  monitoringWindowLabel,
  type MonitoringWindow,
  observedRequestSamples,
} from '../lib/monitored-requests'
import { withBasePricing } from '../lib/plugin-pricing'
import { formatPrice, formatRequestPrice } from '../lib/price'
import { taskUsageUnitLabel } from '../lib/task-price-display'
import type { PricingModel, TokenUnit } from '../types'

const MONITOR_TICK_CLASS: Record<HourlyMonitorSlotState, string> = {
  empty: 'zm-uptime-tick',
  ok: 'zm-uptime-tick is-ok',
  warn: 'zm-uptime-tick is-warn',
  err: 'zm-uptime-tick is-err',
}

export interface ZmModelCardGridProps {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  onResetFilters?: () => void
}

interface ZmModelCardItemProps {
  model: PricingModel
  onModelClick: (modelName: string) => void
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  selectedGroup?: string
  perf?: PerfModelSummary
  monitoringWindow?: MonitoringWindow
  windowLabel: string
  monitoringStatus: 'pending' | 'success' | 'error'
}

const ZmModelCardItem = memo(function ZmModelCardItem(
  props: ZmModelCardItemProps
) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(props.model.billing_expr)

  const baseModel = useMemo(() => withBasePricing(props.model), [props.model])
  const isTokenBased = isTokenBasedModel(baseModel)
  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'
  const tags = useMemo(() => parseTags(props.model.tags), [props.model.tags])
  const capabilities = useMemo(
    () => getModelCategories(props.model),
    [props.model]
  )
  const quotaCategory = useMemo(
    () => getModelQuotaType(props.model),
    [props.model]
  )

  const iconKey = props.model.icon || props.model.vendor_icon
  const vendorIcon = iconKey ? getLobeIcon(iconKey, 18) : null
  const initialLetter = (
    props.model.vendor_name ||
    props.model.model_name ||
    '?'
  )
    .charAt(0)
    .toUpperCase()

  const dynamicPriceOptions = useMemo(
    () => ({
      groupRatio: getDynamicDisplayGroupRatio(baseModel, props.selectedGroup),
      now: billingTime === undefined ? undefined : new Date(billingTime),
      tokenUnit: props.tokenUnit,
      showRechargePrice: props.showRechargePrice,
      priceRate: props.priceRate,
      usdExchangeRate: props.usdExchangeRate,
    }),
    [
      baseModel,
      props.selectedGroup,
      billingTime,
      props.tokenUnit,
      props.showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
    ]
  )

  const dynamicSummary = useMemo(
    () => getDynamicPricingSummary(baseModel, dynamicPriceOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseModel, dynamicPriceOptions, currency]
  )

  const priceDisplay = (() => {
    if (dynamicSummary && dynamicSummary.primaryEntries.length > 0) {
      const primary = dynamicSummary.primaryEntries[0]
      const secondary = dynamicSummary.primaryEntries[1]
      const unitKey = getDynamicPriceUnitLabelKey(primary)
      const unitLabel = taskUsageUnitLabel(
        primary,
        i18n.language,
        unitKey ? t(unitKey) : tokenUnitLabel
      )
      if (secondary && !dynamicSummary.isTaskUsage) {
        return {
          primary: `${primary.formattedRange ?? primary.formatted} / ${secondary.formattedRange ?? secondary.formatted}`,
          suffix: `/${unitLabel}`,
          tooltip: `${primary.formatted} 输入 · ${secondary.formatted} 输出 / ${unitLabel}`,
        }
      }
      return {
        primary: primary.formattedRange ?? primary.formatted,
        suffix: `/${unitLabel}`,
        tooltip: `${primary.formattedRange ?? primary.formatted} / ${unitLabel}`,
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
        props.tokenUnit,
        props.showRechargePrice,
        props.priceRate,
        props.usdExchangeRate,
        props.selectedGroup
      )
      const outputPrice = formatPrice(
        baseModel,
        'output',
        props.tokenUnit,
        props.showRechargePrice,
        props.priceRate,
        props.usdExchangeRate,
        props.selectedGroup
      )
      return {
        primary: `${inputPrice} / ${outputPrice}`,
        suffix: `/${tokenUnitLabel}`,
        tooltip: `输入 ${inputPrice} · 输出 ${outputPrice} / ${tokenUnitLabel} tokens`,
      }
    }

    const requestPrice = formatRequestPrice(
      baseModel,
      props.showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.selectedGroup
    )
    return {
      primary: requestPrice,
      suffix: `/${t('request')}`,
      tooltip: `${requestPrice} / ${t('request')}`,
    }
  })()

  const quotaLabel = useMemo(() => {
    if (quotaCategory === QUOTA_TYPES.TASK) return '按任务'
    if (quotaCategory === QUOTA_TYPES.REQUEST) return '按次计费'
    return '按 Token'
  }, [quotaCategory])

  const successRate = props.perf?.success_rate
  const samples = props.perf?.recent_success_series
  const hasMeasuredRate =
    props.monitoringStatus === 'success' && isMeasuredRate(successRate)
  const monitorSlots = useMemo(
    () =>
      buildHourlyMonitorSlots(
        props.monitoringStatus === 'success' ? samples : undefined,
        props.monitoringStatus === 'success'
          ? props.monitoringWindow
          : undefined
      ),
    [props.monitoringStatus, props.monitoringWindow, samples]
  )
  const hasSampledTicks = monitorSlots.some((slot) => slot.state !== 'empty')
  const hasMetrics = hasMeasuredRate || hasSampledTicks
  let statusText = t('Not monitored')
  if (props.monitoringStatus === 'pending') statusText = t('Loading...')
  if (props.monitoringStatus === 'error') {
    statusText = t('Monitoring unavailable')
  }
  const monitoringHint = [
    t('All visible groups'),
    t(
      'Success rate excludes business rejections and includes the current partial hour.'
    ),
    props.windowLabel,
  ]
    .filter(Boolean)
    .join(' · ')

  const handleCopyName = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation()
      try {
        await navigator.clipboard.writeText(props.model.model_name)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      } catch {
        // ignore clipboard permission errors
      }
    },
    [props.model.model_name]
  )

  const handleOpenPlayground = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      const [mode] = getModelPlaygroundModes(props.model)
      if (!mode) return
      void navigate({
        to: '/playground',
        search: { mode, model: props.model.model_name },
      })
    },
    [navigate, props.model]
  )

  const remarkText =
    props.model.description?.trim() ||
    (props.model.enable_groups?.length
      ? `可用分组：${props.model.enable_groups.slice(0, 3).join(' · ')}`
      : '')

  return (
    <article
      className='zm-model-card'
      onClick={() => props.onModelClick(props.model.model_name)}
    >
      <svg
        className='zm-card-pattern'
        viewBox='0 0 230 190'
        fill='none'
        aria-hidden='true'
      >
        <circle cx='185' cy='45' r='56' stroke='currentColor' strokeWidth='1' />
        <circle
          cx='185'
          cy='45'
          r='92'
          stroke='currentColor'
          strokeWidth='0.8'
        />
        <circle
          cx='185'
          cy='45'
          r='128'
          stroke='currentColor'
          strokeWidth='0.6'
        />
      </svg>

      <div className='zm-card-top'>
        <div className='zm-vendor-slot'>
          <span
            className='zm-vendor-icon-box'
            title={props.model.vendor_name || props.model.model_name}
            aria-label={props.model.vendor_name || props.model.model_name}
          >
            {vendorIcon || (
              <span className='text-xs font-semibold'>{initialLetter}</span>
            )}
          </span>
        </div>

        <div className='zm-uptime-strip' title={monitoringHint}>
          <div className='zm-uptime-meta tabular-nums'>
            <span className='zm-uptime-time'>
              {hasMetrics ? t('All visible groups') : t('Success rate')}
            </span>
            <span
              className={
                hasMeasuredRate ? 'zm-uptime-pct' : 'zm-uptime-pct is-muted'
              }
            >
              {hasMeasuredRate && isMeasuredRate(successRate)
                ? formatUptimePct(successRate)
                : statusText}
            </span>
          </div>
          <div
            className='zm-uptime-ticks'
            role={hasSampledTicks ? 'img' : undefined}
            aria-label={
              hasSampledTicks ? t('Sampled request success rates') : undefined
            }
            aria-hidden={hasSampledTicks ? undefined : true}
          >
            {monitorSlots.map((slot) => {
              const tickTitle =
                slot.state !== 'empty' && slot.ts != null && slot.rate != null
                  ? `${formatTimestampToDate(slot.ts)} · ${formatUptimePct(slot.rate)}`
                  : undefined

              return (
                <span
                  key={slot.key}
                  className={MONITOR_TICK_CLASS[slot.state]}
                  data-state={slot.state}
                  title={tickTitle}
                />
              )
            })}
          </div>
        </div>
      </div>

      <div className='zm-title-row'>
        <h2 className='zm-model-name' title={props.model.model_name}>
          {props.model.model_name}
        </h2>
        <button
          type='button'
          className='zm-copy-name-btn'
          title='复制模型名称'
          aria-label={`复制 ${props.model.model_name}`}
          onClick={handleCopyName}
        >
          {copied ? (
            <Check className='size-3.5' />
          ) : (
            <Copy className='size-3.5' />
          )}
        </button>
      </div>

      <div className='zm-tags-row'>
        {capabilities.map((capability) => (
          <span key={capability} className='zm-cap-tag'>
            {t(CATEGORY_LABEL_KEYS[capability])}
          </span>
        ))}
        {tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className='zm-cap-tag is-configurable'
            title='模型标签'
          >
            {tag}
          </span>
        ))}
      </div>

      <div className='zm-hover-zone'>
        {remarkText && (
          <p className='zm-card-remark' title={remarkText}>
            {remarkText}
          </p>
        )}
        <div className='zm-hover-actions'>
          <button
            type='button'
            className='zm-action-btn is-secondary'
            onClick={(event) => {
              event.stopPropagation()
              props.onModelClick(props.model.model_name)
            }}
          >
            详情
          </button>
          {getModelPlaygroundModes(props.model).length > 0 && (
            <button
              type='button'
              className='zm-action-btn is-primary'
              onClick={handleOpenPlayground}
            >
              {t('Create')}
            </button>
          )}
        </div>
      </div>

      <div className='zm-card-footer'>
        <span
          className='zm-card-price tabular-nums'
          title={priceDisplay.tooltip}
        >
          <strong>{priceDisplay.primary}</strong>
          {priceDisplay.suffix && <span> {priceDisplay.suffix}</span>}
        </span>
        <span className='zm-card-meta-pill' title={`计费方式：${quotaLabel}`}>
          {quotaLabel}
        </span>
      </div>
    </article>
  )
})

export const ZmModelCardGrid = memo(function ZmModelCardGrid(
  props: ZmModelCardGridProps
) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const pageSize = DEFAULT_PRICING_PAGE_SIZE
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1
  const showRechargePrice = props.showRechargePrice ?? false

  const totalPages = Math.max(1, Math.ceil(props.models.length / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pagedModels = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return props.models.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, props.models])

  const viewer = useAuthStore((state) => state.auth.user)
  const perfQuery = useQuery({
    queryKey: ['catalog-monitored-requests', 24, viewer?.id, viewer?.group],
    queryFn: async () => requireServerSuccess(await getPerfMetricsSummary(24)),
    enabled: props.models.length > 0,
    staleTime: 60 * 1000,
    retry: false,
  })

  const perfMap = useMemo(() => {
    const result = perfQuery.data?.data
    const map = new Map<string, PerfModelSummary>()
    for (const model of result?.models ?? []) {
      map.set(model.model_name, {
        ...model,
        recent_success_series: observedRequestSamples(
          model.recent_success_series,
          result
        ),
      })
    }
    return map
  }, [perfQuery.data])
  const monitoringWindow = useMemo<MonitoringWindow | undefined>(() => {
    const result = perfQuery.data?.data
    if (!result) return undefined
    return {
      window_start: result.window_start,
      window_end: result.window_end,
    }
  }, [perfQuery.data])
  const windowLabel = monitoringWindowLabel(perfQuery.data?.data)

  if (props.models.length === 0) {
    return (
      <div className='sr-empty-state'>
        <div
          style={{
            fontSize: '15px',
            fontWeight: 500,
            color: 'var(--ink-strong)',
          }}
        >
          没有找到匹配的模型
        </div>
        <p className='el-body-sm' style={{ marginTop: '6px' }}>
          可以尝试清除搜索关键字，或重置厂商、能力、分组与定价筛选。
        </p>
        {props.onResetFilters && (
          <button
            type='button'
            className='el-btn el-btn-sm el-btn-primary'
            style={{ marginTop: '14px' }}
            onClick={props.onResetFilters}
          >
            重置筛选条件
          </button>
        )}
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-5'>
      <div className='sr-model-grid'>
        {pagedModels.map((model) => (
          <ZmModelCardItem
            key={model.id ?? model.model_name}
            model={model}
            tokenUnit={tokenUnit}
            priceRate={priceRate}
            usdExchangeRate={usdExchangeRate}
            showRechargePrice={showRechargePrice}
            selectedGroup={props.selectedGroup}
            perf={perfMap.get(model.model_name || '')}
            monitoringWindow={monitoringWindow}
            windowLabel={windowLabel}
            monitoringStatus={perfQuery.status}
            onModelClick={props.onModelClick}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className='mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ring-color)] pt-4 text-sm'>
          <span className='el-body-sm tabular-nums'>
            {t('Page {{current}} of {{total}}', {
              current: currentPage,
              total: totalPages,
            })}
          </span>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              className='el-btn el-btn-xs el-btn-white'
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className='size-3.5' />
              <span>{t('Previous')}</span>
            </button>
            <button
              type='button'
              className='el-btn el-btn-xs el-btn-white'
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={currentPage >= totalPages}
            >
              <span>{t('Next')}</span>
              <ChevronRight className='size-3.5' />
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
