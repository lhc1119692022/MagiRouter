import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatUptimePct } from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { formatTimestampToDate } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import { CATEGORY_LABEL_KEYS } from '@/lib/model-task-capabilities'
import { useSystemConfigStore } from '@/stores/system-config-store'

import {
  DEFAULT_PRICING_PAGE_SIZE,
  DEFAULT_TOKEN_UNIT,
  PRICE_MODES,
} from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import { useCatalogPerfMetrics } from '../hooks/use-catalog-perf-metrics'
import {
  getCatalogDisplayTags,
  getCatalogQuotaLabel,
  MONITOR_TICK_CLASS,
  resolveCatalogPriceDisplay,
} from '../lib/catalog-display'
import { getDynamicPricingSummary } from '../lib/dynamic-price'
import { getModelPlaygroundModes } from '../lib/filters'
import { resolveDisplayGroup } from '../lib/model-helpers'
import {
  buildHourlyMonitorSlots,
  isMeasuredRate,
  type MonitoringWindow,
} from '../lib/monitored-requests'
import { withBasePricing } from '../lib/plugin-pricing'
import type { PriceMode, PricingModel, TokenUnit } from '../types'

export interface ZmModelCardGridProps {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  priceMode?: PriceMode
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
  priceMode: PriceMode
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
  const { capabilities, remarkTags } = useMemo(
    () => getCatalogDisplayTags(props.model, t),
    [props.model, t]
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

  const displayGroup = useMemo(
    () => resolveDisplayGroup(baseModel, props.selectedGroup),
    [baseModel, props.selectedGroup]
  )
  const isOfficialPrice = props.priceMode === PRICE_MODES.OFFICIAL

  const dynamicPriceOptions = useMemo(
    () => ({
      groupRatioMultiplier: isOfficialPrice ? 1 : displayGroup.ratio,
      now: billingTime === undefined ? undefined : new Date(billingTime),
      tokenUnit: props.tokenUnit,
      priceMode: props.priceMode,
      showRechargePrice: props.showRechargePrice,
      priceRate: props.priceRate,
      usdExchangeRate: props.usdExchangeRate,
    }),
    [
      isOfficialPrice,
      displayGroup.ratio,
      billingTime,
      props.tokenUnit,
      props.priceMode,
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

  const priceDisplay = useMemo(
    () =>
      resolveCatalogPriceDisplay({
        baseModel,
        displayGroup,
        dynamicSummary,
        dynamicPriceOptions,
        tokenUnit: props.tokenUnit,
        priceMode: props.priceMode,
        showRechargePrice: props.showRechargePrice,
        priceRate: props.priceRate,
        usdExchangeRate: props.usdExchangeRate,
        selectedGroup: props.selectedGroup,
        language: i18n.language,
        t,
      }),
    [
      baseModel,
      displayGroup,
      dynamicSummary,
      dynamicPriceOptions,
      props.tokenUnit,
      props.priceMode,
      props.showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.selectedGroup,
      i18n.language,
      t,
    ]
  )

  const quotaLabel = useMemo(
    () => getCatalogQuotaLabel(props.model, dynamicSummary, t),
    [props.model, dynamicSummary, t]
  )

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
        {remarkTags.map((tag) => (
          <span
            key={tag}
            className='zm-cap-tag is-configurable'
            title={t('Model Tags')}
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
              {t('Create', { context: 'playground' })}
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
          {priceDisplay.suffix && (
            <span className='zm-card-price-unit'>{priceDisplay.suffix}</span>
          )}
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
  const priceMode = props.priceMode ?? PRICE_MODES.YOURS

  const totalPages = Math.max(1, Math.ceil(props.models.length / pageSize))
  const currentPage = Math.min(page, totalPages)

  const pagedModels = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return props.models.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, props.models])

  const { perfMap, monitoringWindow, windowLabel, monitoringStatus } =
    useCatalogPerfMetrics(props.models.length > 0)

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
            priceMode={priceMode}
            selectedGroup={props.selectedGroup}
            perf={perfMap.get(model.model_name || '')}
            monitoringWindow={monitoringWindow}
            windowLabel={windowLabel}
            monitoringStatus={monitoringStatus}
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
