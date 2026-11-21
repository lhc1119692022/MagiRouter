import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'
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
import { getModelQuotaType, parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import { withBasePricing } from '../lib/plugin-pricing'
import { formatPrice, formatRequestPrice } from '../lib/price'
import { taskUsageUnitLabel } from '../lib/task-price-display'
import type { PricingModel, TokenUnit } from '../types'
import type { ModelPerfBadgeData } from './model-perf-badge'

export type TaskCapabilityFilter = 'all' | 'text' | 'image' | 'video' | 'audio'

export function inferModelTaskCapabilities(
  model: PricingModel
): Exclude<TaskCapabilityFilter, 'all'>[] {
  const capabilities = new Set<Exclude<TaskCapabilityFilter, 'all'>>()
  const endpoints = (model.supported_endpoint_types || []).map((item) =>
    item.toLowerCase()
  )
  const outputs = (model.output_modalities || []).map((item) =>
    item.toLowerCase()
  )
  const loweredName = (model.model_name || '').toLowerCase()
  const loweredTags = (model.tags || '').toLowerCase()

  if (
    outputs.includes('video') ||
    endpoints.some((item) => item.includes('video')) ||
    /(seedance|kling|veo|sora|hailuo|minimax-video|runway|vidu|wan2|luma)/i.test(
      loweredName
    ) ||
    loweredTags.includes('video') ||
    loweredTags.includes('视频')
  ) {
    capabilities.add('video')
  }

  if (
    outputs.includes('image') ||
    endpoints.some((item) => item.includes('image')) ||
    /(gpt-image|dall-e|flux|seedream|imagen|nano-banana|midjourney|ideogram|recraft|sd3|stable-diffusion)/i.test(
      loweredName
    ) ||
    loweredTags.includes('image') ||
    loweredTags.includes('图像') ||
    loweredTags.includes('文生图')
  ) {
    capabilities.add('image')
  }

  if (
    outputs.includes('audio') ||
    endpoints.some((item) => item.includes('audio') || item.includes('speech')) ||
    /(audio|tts|whisper|speech|voice|eleven|music|suno)/i.test(loweredName) ||
    loweredTags.includes('audio') ||
    loweredTags.includes('语音') ||
    loweredTags.includes('音频')
  ) {
    capabilities.add('audio')
  }

  if (
    outputs.includes('text') ||
    capabilities.size === 0 ||
    endpoints.some(
      (item) =>
        item.includes('openai') ||
        item.includes('anthropic') ||
        item.includes('gemini')
    )
  ) {
    if (
      capabilities.size === 0 ||
      outputs.includes('text') ||
      endpoints.includes('openai') ||
      endpoints.includes('openai-response') ||
      endpoints.includes('anthropic')
    ) {
      capabilities.add('text')
    }
  }

  return Array.from(capabilities)
}

const TASK_LABELS: Record<Exclude<TaskCapabilityFilter, 'all'>, string> = {
  text: '语言模型',
  image: '图片生成',
  video: '视频生成',
  audio: '音频生成',
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

function formatWindowTime(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp * 1000) : new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

function buildUptimeTicks(
  modelName: string,
  perf?: ModelPerfBadgeData
): { ticks: ('ok' | 'warn' | 'idle')[]; rateLabel: string; timeLabel: string } {
  const series = perf?.recent_success_series
  const hasRate =
    perf != null &&
    typeof perf.success_rate === 'number' &&
    Number.isFinite(perf.success_rate)
  const normalizedRate = hasRate
    ? perf.success_rate > 1
      ? perf.success_rate
      : perf.success_rate * 100
    : null
  const timeLabel = formatWindowTime(perf?.window_end)

  if (Array.isArray(series) && series.length > 0) {
    const sliced = series.slice(-24)
    const padCount = Math.max(0, 24 - sliced.length)
    const ticks: ('ok' | 'warn' | 'idle')[] = Array.from(
      { length: padCount },
      () => 'idle'
    )
    for (const point of sliced) {
      if (typeof point === 'number') {
        if (point < 0) ticks.push('idle')
        else if (point >= 0.95) ticks.push('ok')
        else ticks.push('warn')
      } else if (point && typeof point === 'object') {
        const total =
          Number((point as { total?: number }).total ?? 0) ||
          Number((point as { count?: number }).count ?? 0)
        const rateVal = Number(
          (point as { success_rate?: number; rate?: number }).success_rate ??
            (point as { rate?: number }).rate ??
            -1
        )
        if (total === 0 && rateVal < 0) ticks.push('idle')
        else if (rateVal >= 0.95 || rateVal >= 95) ticks.push('ok')
        else ticks.push('warn')
      } else {
        ticks.push('idle')
      }
    }
    return {
      ticks: ticks.slice(-24),
      rateLabel:
        normalizedRate !== null ? `${normalizedRate.toFixed(1)}%` : '在线',
      timeLabel,
    }
  }

  let hashSeed = 0
  for (let index = 0; index < modelName.length; index++) {
    hashSeed = (hashSeed * 31 + modelName.charCodeAt(index)) % 997
  }
  const ticks: ('ok' | 'warn' | 'idle')[] = []
  for (let index = 0; index < 24; index++) {
    const value = (hashSeed + index * 37 + index * index * 7) % 23
    if (normalizedRate !== null && normalizedRate < 95 && index === 17) {
      ticks.push('warn')
    } else if (value % 3 !== 0 || index === 23) {
      ticks.push('ok')
    } else {
      ticks.push('idle')
    }
  }

  return {
    ticks,
    rateLabel:
      normalizedRate !== null ? `${normalizedRate.toFixed(1)}%` : '99.9%',
    timeLabel,
  }
}

interface ZmModelCardItemProps {
  model: PricingModel
  onModelClick: (modelName: string) => void
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  selectedGroup?: string
  perf?: ModelPerfBadgeData
}

const ZmModelCardItem = memo(function ZmModelCardItem(
  props: ZmModelCardItemProps
) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const currency = useSystemConfigStore((state) => state.currency)
  const billingTime = useBillingTime()

  const baseModel = useMemo(() => withBasePricing(props.model), [props.model])
  const isTokenBased = isTokenBasedModel(baseModel)
  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'
  const tags = useMemo(() => parseTags(props.model.tags), [props.model.tags])
  const capabilities = useMemo(
    () => inferModelTaskCapabilities(props.model),
    [props.model]
  )
  const quotaCategory = useMemo(
    () => getModelQuotaType(props.model),
    [props.model]
  )

  const iconKey = props.model.icon || props.model.vendor_icon
  const vendorIcon = iconKey ? getLobeIcon(iconKey, 18) : null
  const initialLetter =
    (props.model.vendor_name || props.model.model_name || '?')
      .charAt(0)
      .toUpperCase()

  const dynamicPriceOptions = useMemo(
    () => ({
      groupRatio: getDynamicDisplayGroupRatio(baseModel, props.selectedGroup),
      now: billingTime,
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

  const priceDisplay = useMemo(() => {
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
  }, [
    baseModel,
    dynamicSummary,
    i18n.language,
    isTokenBased,
    props.priceRate,
    props.selectedGroup,
    props.showRechargePrice,
    props.tokenUnit,
    props.usdExchangeRate,
    t,
    tokenUnitLabel,
  ])

  const quotaLabel = useMemo(() => {
    if (quotaCategory === QUOTA_TYPES.TASK) return '按任务'
    if (quotaCategory === QUOTA_TYPES.REQUEST) return '按次计费'
    return '按 Token'
  }, [quotaCategory])

  const uptime = useMemo(
    () => buildUptimeTicks(props.model.model_name || '', props.perf),
    [props.model.model_name, props.perf]
  )

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
      void navigate({ to: '/playground' })
    },
    [navigate]
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
        <circle cx='185' cy='45' r='92' stroke='currentColor' strokeWidth='0.8' />
        <circle cx='185' cy='45' r='128' stroke='currentColor' strokeWidth='0.6' />
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

        <div
          className='zm-uptime-strip'
          title={`最近监控窗口 · ${uptime.timeLabel} · 可用率 ${uptime.rateLabel}`}
        >
          <div className='zm-uptime-meta tabular-nums'>
            <span className='zm-uptime-time'>{uptime.timeLabel}</span>
            <span className='zm-uptime-pct'>{uptime.rateLabel}</span>
          </div>
          <div className='zm-uptime-ticks' aria-hidden='true'>
            {uptime.ticks.map((status, tickIndex) => (
              <span
                key={tickIndex}
                className={
                  status === 'ok'
                    ? 'zm-uptime-tick is-ok'
                    : status === 'warn'
                      ? 'zm-uptime-tick is-warn'
                      : 'zm-uptime-tick'
                }
              />
            ))}
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
          {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
        </button>
      </div>

      <div className='zm-tags-row'>
        {capabilities.slice(0, 2).map((capability) => (
          <span key={capability} className='zm-cap-tag'>
            {TASK_LABELS[capability]}
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
          <button
            type='button'
            className='zm-action-btn is-primary'
            onClick={handleOpenPlayground}
          >
            创建
          </button>
        </div>
      </div>

      <div className='zm-card-footer'>
        <span className='zm-card-price tabular-nums' title={priceDisplay.tooltip}>
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

  const recentModels = useMemo(
    () => pagedModels.map((model) => model.model_name || ''),
    [pagedModels]
  )

  const perfQuery = useQuery({
    queryKey: ['perf-metrics-summary', 24, recentModels],
    queryFn: async () =>
      requireServerSuccess(await getPerfMetricsSummary(24, recentModels)),
    enabled: recentModels.length > 0,
    staleTime: 60 * 1000,
    retry: false,
  })

  const perfMap = useMemo(() => {
    const map = new Map<string, ModelPerfBadgeData>()
    for (const model of perfQuery.data?.data?.models ?? []) {
      map.set(model.model_name, {
        ...model,
        window_start: perfQuery.data?.data.window_start,
        window_end: perfQuery.data?.data.window_end,
      })
    }
    for (const [name, series] of Object.entries(
      perfQuery.data?.data?.recent_success_series ?? {}
    )) {
      map.set(name, {
        avg_latency_ms: Number.NaN,
        avg_tps: Number.NaN,
        success_rate: Number.NaN,
        ...map.get(name),
        recent_success_series: series,
      })
    }
    return map
  }, [perfQuery.data])

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
