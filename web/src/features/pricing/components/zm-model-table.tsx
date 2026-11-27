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
  resolveCatalogTablePriceDisplay,
} from '../lib/catalog-display'
import { getDynamicPricingSummary } from '../lib/dynamic-price'
import { resolveDisplayGroup } from '../lib/model-helpers'
import {
  buildHourlyMonitorSlots,
  isMeasuredRate,
  type MonitoringWindow,
} from '../lib/monitored-requests'
import { withBasePricing } from '../lib/plugin-pricing'
import type { PriceMode, PricingModel, TokenUnit } from '../types'

export interface ZmModelTableProps {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  priceMode?: PriceMode
  selectedGroup?: string
}

interface ZmModelTableRowProps {
  model: PricingModel
  onModelClick: (modelName: string) => void
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  priceMode: PriceMode
  selectedGroup?: string
  scopedMonitoringGroup?: string
  perf?: PerfModelSummary
  monitoringWindow?: MonitoringWindow
  windowLabel: string
  monitoringStatus: 'pending' | 'success' | 'error'
}

const ZmModelTableRow = memo(function ZmModelTableRow(
  props: ZmModelTableRowProps
) {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState(false)
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(props.model.billing_expr)

  const baseModel = useMemo(() => withBasePricing(props.model), [props.model])
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
      resolveCatalogTablePriceDisplay({
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

  const { capabilities, remarkTags } = useMemo(
    () => getCatalogDisplayTags(props.model, t),
    [props.model, t]
  )

  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 15) : null
  const vendorIconKey = props.model.vendor_icon || props.model.icon
  const vendorIcon = vendorIconKey ? getLobeIcon(vendorIconKey, 15) : null
  const initialLetter = (
    props.model.vendor_name ||
    props.model.model_name ||
    '?'
  )
    .charAt(0)
    .toUpperCase()

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
          : undefined,
        undefined,
        hasMeasuredRate ? successRate : undefined
      ),
    [
      hasMeasuredRate,
      props.monitoringStatus,
      props.monitoringWindow,
      samples,
      successRate,
    ]
  )
  const hasSampledTicks = monitorSlots.some((slot) => slot.state !== 'empty')
  let statusText = t('Not monitored')
  if (props.monitoringStatus === 'pending') statusText = t('Loading...')
  if (props.monitoringStatus === 'error') {
    statusText = t('Monitoring unavailable')
  }
  const bestGroupName = props.perf?.best_group
  let scopeHint = t('Best group')
  if (props.scopedMonitoringGroup) {
    scopeHint = props.scopedMonitoringGroup
  } else if (bestGroupName) {
    scopeHint = `${t('Best group')}: ${bestGroupName}`
  }
  const monitoringHint = [
    scopeHint,
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

  return (
    <tr
      className='zm-table-row'
      onClick={() => props.onModelClick(props.model.model_name)}
    >
      <td>
        <div className='zm-table-model-cell'>
          <span className='zm-table-icon-box' aria-hidden='true'>
            {modelIcon || (
              <span className='text-[11px] font-semibold'>{initialLetter}</span>
            )}
          </span>
          <span className='zm-table-model-name' title={props.model.model_name}>
            {props.model.model_name}
          </span>
          <button
            type='button'
            className='zm-copy-name-btn zm-table-copy-btn'
            title='复制模型名称'
            aria-label={`复制 ${props.model.model_name}`}
            onClick={handleCopyName}
          >
            {copied ? (
              <Check className='size-3.5 text-emerald-600' />
            ) : (
              <Copy className='size-3.5' />
            )}
          </button>
        </div>
      </td>

      <td>
        <div className='zm-table-uptime' title={monitoringHint}>
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
          <span
            className={
              hasMeasuredRate
                ? 'zm-table-uptime-val tabular-nums'
                : 'zm-table-uptime-val is-muted tabular-nums'
            }
          >
            {hasMeasuredRate && isMeasuredRate(successRate)
              ? formatUptimePct(successRate)
              : statusText}
          </span>
        </div>
      </td>

      <td>
        <span className='zm-table-type-pill'>{quotaLabel}</span>
      </td>

      <td>
        {priceDisplay.rows ? (
          <div
            className='zm-table-price-stack tabular-nums'
            title={priceDisplay.tooltip}
          >
            {priceDisplay.rows.map((row) => {
              let valueClass = 'zm-table-price-main'
              if (row.emphasis === 'secondary') {
                valueClass = 'zm-table-price-sub'
              } else if (row.emphasis === 'muted') {
                valueClass = 'zm-table-price-muted'
              }
              return (
                <div key={row.key} className='zm-table-price-row'>
                  <span className='zm-table-price-label'>{row.label}</span>
                  <span className='zm-table-price-amount'>
                    <span className={valueClass}>{row.value}</span>
                    {row.suffix && (
                      <span className='zm-table-price-unit'>{row.suffix}</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <span
            className='zm-table-price tabular-nums'
            title={priceDisplay.tooltip}
          >
            <strong className='zm-table-price-main'>
              {priceDisplay.single?.primary ?? '-'}
            </strong>
            {priceDisplay.single?.suffix && (
              <span className='zm-table-price-unit'>
                {priceDisplay.single.suffix}
              </span>
            )}
          </span>
        )}
      </td>

      <td>
        {props.model.vendor_name ? (
          <span className='zm-table-vendor'>
            {vendorIcon && (
              <span className='zm-table-vendor-icon' aria-hidden='true'>
                {vendorIcon}
              </span>
            )}
            <span>{props.model.vendor_name}</span>
          </span>
        ) : (
          <span className='zm-table-empty-cell'>—</span>
        )}
      </td>

      <td>
        {capabilities.length > 0 || remarkTags.length > 0 ? (
          <div className='zm-table-tags'>
            {capabilities.map((capability) => (
              <span key={capability} className='zm-cap-tag'>
                {t(CATEGORY_LABEL_KEYS[capability])}
              </span>
            ))}
            {remarkTags.map((tag) => (
              <span key={tag} className='zm-cap-tag is-configurable'>
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <span className='zm-table-empty-cell'>—</span>
        )}
      </td>
    </tr>
  )
})

export const ZmModelTable = memo(function ZmModelTable(
  props: ZmModelTableProps
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

  const {
    perfMap,
    monitoringWindow,
    windowLabel,
    monitoringStatus,
    scopedGroup,
  } = useCatalogPerfMetrics(props.models.length > 0, props.selectedGroup)

  return (
    <div className='flex flex-col gap-5'>
      <div className='el-table-wrap'>
        <table className='el-table zm-catalog-table'>
          <thead>
            <tr>
              <th scope='col'>{t('Model')}</th>
              <th scope='col'>{t('Availability')}</th>
              <th scope='col'>{t('Type')}</th>
              <th scope='col'>{t('Price')}</th>
              <th scope='col'>{t('Manufacturer')}</th>
              <th scope='col'>{t('Tags')}</th>
            </tr>
          </thead>
          <tbody>
            {pagedModels.map((model) => (
              <ZmModelTableRow
                key={model.id ?? model.model_name}
                model={model}
                tokenUnit={tokenUnit}
                priceRate={priceRate}
                usdExchangeRate={usdExchangeRate}
                showRechargePrice={showRechargePrice}
                priceMode={priceMode}
                selectedGroup={props.selectedGroup}
                scopedMonitoringGroup={scopedGroup}
                perf={perfMap.get(model.model_name || '')}
                monitoringWindow={monitoringWindow}
                windowLabel={windowLabel}
                monitoringStatus={monitoringStatus}
                onModelClick={props.onModelClick}
              />
            ))}
          </tbody>
        </table>
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
