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
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowLeftRight,
  Brain,
  CircleArrowRight,
  CircleAlert,
  Crown,
  Database,
  Gauge,
  GitBranch,
  Info,
  KeyRound,
  Plug,
  Radio,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import {
  normalizeTierLabel,
  parseTaskTiersFromExpr,
} from '@/features/pricing/lib/billing-expr'
import {
  formatTaskUsageUnitPrice,
  getTaskUsagePriceUnitLabelKey,
} from '@/features/pricing/lib/dynamic-price'
import { pluginUsageSchema } from '@/features/pricing/lib/plugin-pricing'
import { taskUsageUnitLabel } from '@/features/pricing/lib/task-price-display'
import type { BillingUsageSchema } from '@/features/pricing/types'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import dayjs from '@/lib/dayjs'
import {
  formatLogQuota,
  formatTimestampToDate,
  formatUseTime,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { LOG_TYPE_ALL_VALUE, LOG_TYPE_ENUM } from '../../constants'
import type { UsageLog } from '../../data/schema'
import {
  formatModelName,
  decodeBillingExprB64,
  getTieredBillingSummary,
  hasAnyCacheTokens,
  parseLogOther,
  isViolationFeeLog,
  logTokenName,
  renderAuditContent,
  renderLogContent,
} from '../../lib/format'
import {
  isDisplayableLogType,
  isTimingLogType,
  getLogTypeConfig,
  isPerCallBilling,
} from '../../lib/utils'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'
import { LogCostDisplay } from '../log-cost-display'
import {
  LogsStatusPill,
  type LogsStatusTone,
} from '../logs-editorial-primitives'
import { ModelBadge } from '../model-badge'
import { RequestPluginLogMarker } from '../request-plugin-record'
import {
  useSensitiveVisible,
  useUsageLogsContext,
} from '../usage-logs-provider'
import { TokenBillingTooltipContent } from './token-billing-tooltip'

interface DetailSegment {
  text: string
  muted?: boolean
  danger?: boolean
}

function formatRatioCompact(ratio: number | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '-'
  return ratio % 1 === 0
    ? String(ratio)
    : ratio.toFixed(4).replace(/\.?0+$/, '')
}

function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) return `${Number((value / 1000).toFixed(1))}K`
  return `${Number((value / 1_000_000).toFixed(2))}M`
}

function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatEndpointShort(requestPath?: string): string | null {
  if (!requestPath) return null
  const normalized = requestPath.trim()
  if (!normalized) return null
  const lower = normalized.toLowerCase()
  if (lower.includes('/responses')) return 'Responses'
  if (lower.includes('/messages')) return 'Messages'
  if (lower.includes('/v1beta') || lower.includes('/gemini')) return 'Gemini'
  if (lower.includes('/chat/completions')) return 'Chat'
  if (lower.includes('/embeddings')) return 'Embeddings'
  if (lower.includes('/images')) return 'Images'
  if (lower.includes('/audio')) return 'Audio'
  if (lower.includes('/rerank')) return 'Rerank'
  if (lower.includes('/completions')) return 'Completions'
  const segments = normalized.split('/')
  let segment: string | undefined
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index]) {
      segment = segments[index]
      break
    }
  }
  return segment ? segment.slice(0, 16) : null
}

function formatConversionProtocolShort(protocol?: string): string | null {
  if (!protocol) return null
  const normalized = protocol.trim()
  if (!normalized) return null
  const lower = normalized.toLowerCase()
  if (lower.includes('responses')) return 'Responses'
  if (lower.includes('claude') || lower.includes('messages')) return 'Messages'
  if (lower.includes('gemini')) return 'Gemini'
  if (lower.includes('openai')) return 'Chat'
  return normalized.slice(0, 16)
}

function formatShortLogTime(timestamp: number): string {
  if (!timestamp) return '—'
  return dayjs(timestamp * 1000).format('MM-DD HH:mm:ss')
}

function getLogTypeTagTone(logType: number): string {
  switch (logType) {
    case LOG_TYPE_ENUM.ERROR:
      return 'is-err'
    case LOG_TYPE_ENUM.TOPUP:
      return 'is-ok'
    case LOG_TYPE_ENUM.REFUND:
      return 'is-info'
    default:
      return ''
  }
}

function resolveBillingModeBadge(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): { label: string; tone: LogsStatusTone; title?: string } | null {
  if (log.type === LOG_TYPE_ENUM.ERROR) {
    if (isViolationFeeLog(other)) {
      return { label: t('Violation Fee'), tone: 'err' }
    }
    return { label: t('Free on failure'), tone: 'warn' }
  }
  if (log.type === LOG_TYPE_ENUM.TOPUP) {
    return { label: t('Top-up'), tone: 'muted' }
  }
  if (log.type === LOG_TYPE_ENUM.REFUND) {
    return { label: t('Refund'), tone: 'running' }
  }
  if (!isDisplayableLogType(log.type)) {
    return null
  }
  if (isViolationFeeLog(other)) {
    return { label: t('Violation Fee'), tone: 'err' }
  }
  if (other?.billing_source === 'subscription') {
    let underlying = t('Per-token')
    if (other.billing_mode === 'tiered_expr') {
      underlying = t('Dynamic Pricing')
    } else if (
      isPerCallBilling(other.model_price) ||
      other.billing_unit === 'request'
    ) {
      underlying = t('Per-call')
    }
    return {
      label: t('Subscription'),
      tone: 'running',
      title: `${t('Subscription')} · ${underlying}`,
    }
  }
  if (other?.billing_mode === 'tiered_expr') {
    return {
      label: t('Dynamic Pricing'),
      tone: 'running',
      title: other.matched_tier
        ? `${t('Dynamic Pricing')} · ${other.matched_tier}`
        : t('Dynamic Pricing'),
    }
  }
  if (
    isPerCallBilling(other?.model_price) ||
    other?.billing_unit === 'request'
  ) {
    return { label: t('Per-call'), tone: 'warn' }
  }
  return { label: t('Per-token'), tone: 'success' }
}

function getGroupRatio(other: LogOtherData | null): number | null {
  const userGroupRatio = other?.user_group_ratio
  if (
    userGroupRatio != null &&
    userGroupRatio !== -1 &&
    Number.isFinite(userGroupRatio)
  ) {
    return userGroupRatio
  }

  const groupRatio = other?.group_ratio
  if (groupRatio != null && Number.isFinite(groupRatio) && groupRatio >= 0) {
    return groupRatio
  }

  return null
}

function buildDetailSegments(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  isAdmin: boolean,
  language: string,
  usageSchema?: BillingUsageSchema
): DetailSegment[] {
  const segments = buildTypeDetailSegments(log, other, t, language, usageSchema)
  const adminSegments: DetailSegment[] = []
  // Quota saturation is a rare, admin-only anomaly marker; surface it first
  // and in danger styling so it stands out on the related billing log. The
  // backend already strips admin_info for non-admins; gate on isAdmin too as
  // defense in depth so the marker never leaks if that changes.
  if (isAdmin && other?.admin_info?.quota_saturation) {
    adminSegments.push({ text: t('Quota clamped'), danger: true })
  }
  return [...adminSegments, ...segments]
}

function buildTypeDetailSegments(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  language: string,
  usageSchema?: BillingUsageSchema
): DetailSegment[] {
  // Top-up, audit, and login logs can carry a localized operation descriptor.
  if (log.type === 1 || log.type === 3 || log.type === 7) {
    const text = renderAuditContent(other, t) ?? renderLogContent(other, t)
    return text ? [{ text }] : []
  }

  if (log.type === 6) {
    return [{ text: t('Async task refund') }]
  }

  if (log.type !== 2) return []

  const isViolation = isViolationFeeLog(other)
  if (isViolation) {
    const segments: DetailSegment[] = []
    segments.push({ text: t('Violation Fee'), danger: true })
    if (other?.violation_fee_code) {
      segments.push({
        text: other.violation_fee_code,
        muted: true,
      })
    }
    segments.push({
      text: `${t('Fee')}: ${formatLogQuota(other?.fee_quota ?? log.quota)}`,
      muted: true,
    })
    return segments
  }

  if (!other) return []

  const segments: DetailSegment[] = []

  const priceOpts = { digitsLarge: 4, digitsSmall: 6, abbreviate: false }
  const formatPrice = (price: number) =>
    `${formatBillingCurrencyFromUSD(price, priceOpts)}/M`
  const formatPriceCompact = (price: number) =>
    formatBillingCurrencyFromUSD(price, priceOpts)
  const formatPriceList = (prices: string[], showUnit: boolean) => {
    const text = prices.join(' / ')
    return showUnit ? `${text}/M` : text
  }
  const isTieredExpr = other.billing_mode === 'tiered_expr'
  const tieredSummary = getTieredBillingSummary(other, log.model_name)
  if (isTieredExpr && other.is_task) {
    const tiers = parseTaskTiersFromExpr(
      decodeBillingExprB64(other.expr_b64),
      usageSchema,
      true
    )
    const tier = tiers.find(
      (entry) =>
        Boolean(other.matched_tier) &&
        normalizeTierLabel(entry.label) ===
          normalizeTierLabel(other.matched_tier)
    )
    if (tier) {
      const prices = Object.entries(tier.unitPrices).map(([field, price]) => {
        const definition = usageSchema?.[field]
        const unitKey = getTaskUsagePriceUnitLabelKey(definition?.unit)
        const unitLabel = taskUsageUnitLabel(definition, language, t(unitKey))
        return `${field} ${formatTaskUsageUnitPrice(price, { tokenUnit: 'M' })}/${unitLabel}`
      })
      if (tier.constant > 0) {
        prices.push(
          `${t('Additional charge')} ${formatTaskUsageUnitPrice(tier.constant, { tokenUnit: 'M' })}/${t('request')}`
        )
      }
      segments.push({
        text: `${tier.label || t('Default')} · ${prices.join(' · ')}`,
      })
    } else {
      segments.push({
        text: `${t('Dynamic Pricing')} · ${other.matched_tier || t('Special billing expression')}`,
        muted: true,
      })
    }
  } else if (isTieredExpr) {
    if (tieredSummary) {
      const baseEntries = tieredSummary.priceEntries
        .filter((entry) => ['inputPrice', 'outputPrice'].includes(entry.field))
        .map((entry) => formatPriceCompact(entry.price))
      if (baseEntries.length > 0) {
        const tierLabel = tieredSummary.tier.label || t('Default')
        segments.push({
          text: `${tierLabel} · ${formatPriceList(baseEntries, true)}`,
        })
      }

      const cacheEntries = tieredSummary.priceEntries
        .filter((entry) =>
          [
            'cacheReadPrice',
            'cacheCreatePrice',
            'cacheCreate1hPrice',
            'cacheCreate12hPrice',
          ].includes(entry.field)
        )
        .map((entry) => {
          return `${t(entry.shortLabel)} ${formatPrice(entry.price)}`
        })
      if (cacheEntries.length > 0) {
        segments.push({
          text: cacheEntries.join(' · '),
          muted: true,
        })
      }

      const otherEntries = tieredSummary.priceEntries
        .filter(
          (entry) =>
            ![
              'inputPrice',
              'outputPrice',
              'cacheReadPrice',
              'cacheCreatePrice',
              'cacheCreate1hPrice',
              'cacheCreate12hPrice',
            ].includes(entry.field)
        )
        .map((entry) =>
          entry.unit
            ? `${tieredSummary.tier.label || t('Default')} · ${t(entry.shortLabel)} ${formatPriceCompact(entry.price)}/${t(entry.unit)}`
            : `${t(entry.shortLabel)} ${formatPrice(entry.price)}`
        )
      if (otherEntries.length > 0) {
        segments.push({
          text: otherEntries.join(' · '),
          muted: true,
        })
      }
    } else {
      segments.push({
        text: `${t('Dynamic Pricing')} · ${other.matched_tier || t('Special billing expression')}`,
        muted: true,
      })
    }
  } else {
    const modelPrice = other.model_price
    const isPerCall = isPerCallBilling(modelPrice)
    if (isPerCall && modelPrice != null) {
      segments.push({
        text: `${t('Per-call')} · ${formatBillingCurrencyFromUSD(modelPrice, priceOpts)}`,
      })
    } else if (other.model_ratio != null) {
      const inputPriceUSD = other.model_ratio * 2.0
      const baseEntries = [formatPriceCompact(inputPriceUSD)]
      if (other.completion_ratio != null) {
        baseEntries.push(
          formatPriceCompact(inputPriceUSD * other.completion_ratio)
        )
      }
      segments.push({
        text: `${t('Standard')} · ${formatPriceList(baseEntries, true)}`,
      })

      if (hasAnyCacheTokens(other)) {
        const cacheEntries = [
          other.cache_ratio != null && other.cache_ratio !== 1
            ? formatPriceCompact(inputPriceUSD * other.cache_ratio)
            : null,
          other.cache_creation_ratio != null && other.cache_creation_ratio !== 1
            ? formatPriceCompact(inputPriceUSD * other.cache_creation_ratio)
            : null,
          other.cache_creation_ratio_1h != null &&
          other.cache_creation_ratio_1h !== 0
            ? formatPriceCompact(inputPriceUSD * other.cache_creation_ratio_1h)
            : null,
          other.cache_creation_ratio_12h != null &&
          other.cache_creation_ratio_12h !== 0
            ? formatPriceCompact(inputPriceUSD * other.cache_creation_ratio_12h)
            : null,
        ].filter(Boolean) as string[]

        if (cacheEntries.length > 0) {
          segments.push({
            text: `${t('Cache')} ${formatPriceList(cacheEntries, false)}`,
            muted: true,
          })
        }
      }
    } else {
      const userGroupRatio = other.user_group_ratio
      const groupRatio = other.group_ratio
      const isUserGroup =
        userGroupRatio != null &&
        Number.isFinite(userGroupRatio) &&
        userGroupRatio !== -1
      const effectiveRatio = isUserGroup ? userGroupRatio : groupRatio
      const ratioLabel = isUserGroup
        ? t('User Exclusive Ratio')
        : t('Group Ratio')

      if (effectiveRatio != null && Number.isFinite(effectiveRatio)) {
        segments.push({
          text: `${ratioLabel} ${formatRatioCompact(effectiveRatio)}x`,
        })
      }
    }
  }

  if (other.is_system_prompt_overwritten) {
    segments.push({
      text: t('System Prompt Override'),
      danger: true,
    })
  }

  return segments
}

export function useCommonLogsColumns(
  isAdmin: boolean,
  isRoot: boolean,
  showBillingSource = false
): ColumnDef<UsageLog>[] {
  const { t } = useTranslation()
  const currency = useSystemConfigStore((state) => state.config.currency)
  return useMemo(() => {
    const columns: ColumnDef<UsageLog>[] = [
      {
        accessorKey: 'token_name',
        header: t('Key Name'),
        cell: function KeyNameCell({ row }) {
          const sensitiveVisible = useSensitiveVisible()
          const log = row.original
          const tokenName = isDisplayableLogType(log.type)
            ? logTokenName(log, t)
            : ''
          if (!tokenName) {
            return <span className='text-muted-foreground/50 text-xs'>—</span>
          }
          const displayTokenName = sensitiveVisible ? tokenName : '••••'

          return (
            <TooltipProvider delay={300}>
              <Tooltip>
                <TooltipTrigger
                  render={<span className='logs-metric-line logs-key-line' />}
                >
                  <KeyRound aria-hidden='true' />
                  <span className='truncate'>{displayTokenName}</span>
                </TooltipTrigger>
                {sensitiveVisible && (
                  <TooltipContent side='top' className='max-w-xs break-all'>
                    {tokenName}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )
        },
        meta: { label: t('Key Name') },
        size: 148,
      },
    ]

    if (isAdmin) {
      columns.push(
        {
          id: 'channel',
          header: t('Channel'),
          accessorFn: (row) => row.channel,
          cell: function ChannelCell({ row }) {
            const {
              sensitiveVisible,
              setAffinityTarget,
              setAffinityDialogOpen,
            } = useUsageLogsContext()
            const log = row.original

            if (!isDisplayableLogType(log.type)) return null

            const other = parseLogOther(log.other)
            const affinity = other?.admin_info?.channel_affinity
            const rawUseChannel = other?.admin_info?.use_channel ?? []
            const useChannel = Array.isArray(rawUseChannel)
              ? rawUseChannel.map(String).filter(Boolean)
              : []
            const hasRetryChain = useChannel.length > 1
            const channelChain = hasRetryChain
              ? useChannel.join(' → ')
              : undefined
            const channelDisplay = log.channel_name
              ? `${log.channel_name} #${log.channel}`
              : `#${log.channel}`
            const channelIdDisplay = `#${log.channel}`
            const channelName = sensitiveVisible ? log.channel_name : '••••'
            const multiKeyIndex = other?.admin_info?.multi_key_index
            const showMultiKeyIndex =
              other?.admin_info?.is_multi_key === true &&
              typeof multiKeyIndex === 'number' &&
              Number.isFinite(multiKeyIndex)

            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <div className='flex max-w-[160px] flex-col gap-0.5' />
                    }
                  >
                    <div className='relative inline-flex w-fit items-center gap-1'>
                      <StatusBadge
                        label={channelIdDisplay}
                        autoColor={String(log.channel)}
                        copyText={String(log.channel)}
                        size='sm'
                        showDot={false}
                        className='font-mono'
                      />
                      {showMultiKeyIndex && (
                        <StatusBadge
                          label={String(multiKeyIndex)}
                          size='sm'
                          showDot={false}
                          copyable={false}
                          variant='neutral'
                          className='h-5 min-w-5 justify-center rounded-full px-1 font-mono text-xs'
                          aria-label={`${t('Key')} ${multiKeyIndex}`}
                        />
                      )}
                      {hasRetryChain && (
                        <Popover>
                          <PopoverTrigger
                            render={
                              <button
                                type='button'
                                className='text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none'
                                aria-label={t('Retry Chain')}
                                onClick={(e) => e.stopPropagation()}
                              />
                            }
                          >
                            <GitBranch
                              className='size-3.5 text-amber-500'
                              aria-hidden='true'
                            />
                          </PopoverTrigger>
                          <PopoverContent
                            side='top'
                            align='start'
                            className='w-64 text-xs'
                          >
                            <div className='flex flex-col gap-1'>
                              <p className='font-medium'>{t('Retry Chain')}</p>
                              <p className='text-muted-foreground font-mono break-all'>
                                {channelChain}
                              </p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {affinity && (
                        <button
                          type='button'
                          className='absolute -top-1 -right-1 leading-none text-amber-500'
                          onClick={(e) => {
                            e.stopPropagation()
                            setAffinityTarget({
                              rule_name: affinity.rule_name || '',
                              using_group:
                                affinity.using_group ||
                                affinity.selected_group ||
                                '',
                              key_hint: affinity.key_hint || '',
                              key_fp: affinity.key_fp || '',
                            })
                            setAffinityDialogOpen(true)
                          }}
                        >
                          <Sparkles className='size-3 fill-current' />
                        </button>
                      )}
                    </div>
                    {log.channel_name && (
                      <span className='text-muted-foreground/70 truncate [font-family:var(--font-body)] !text-xs'>
                        {channelName}
                      </span>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className='space-y-1'>
                      <p>
                        {sensitiveVisible ? channelDisplay : channelIdDisplay}
                      </p>
                      {channelChain && (
                        <p className='text-muted-foreground text-xs'>
                          {t('Chain')}: {channelChain}
                        </p>
                      )}
                      {showMultiKeyIndex && (
                        <p className='text-muted-foreground text-xs'>
                          {t('Key')}: {multiKeyIndex}
                        </p>
                      )}
                      {affinity && (
                        <div className='border-t pt-1 text-xs'>
                          <p className='font-medium'>{t('Channel Affinity')}</p>
                          <p>
                            {t('Rule')}: {affinity.rule_name || '-'}
                          </p>
                          <p>
                            {t('Group')}:{' '}
                            {sensitiveVisible
                              ? affinity.using_group ||
                                affinity.selected_group ||
                                '-'
                              : '••••'}
                          </p>
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          },
        },
        {
          id: 'user',
          header: t('User'),
          accessorFn: (row) => row.username,
          cell: function UserCell({ row }) {
            const {
              sensitiveVisible,
              setSelectedUserId,
              setUserInfoDialogOpen,
            } = useUsageLogsContext()
            const log = row.original

            if (!log.username) return null

            return (
              <button
                type='button'
                className='flex items-center gap-1.5 text-left'
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedUserId(log.user_id)
                  setUserInfoDialogOpen(true)
                }}
              >
                <Avatar className='ring-border/60 size-6 ring-1 max-sm:hidden'>
                  <AvatarFallback
                    className={cn(
                      'text-[11px] font-semibold',
                      !sensitiveVisible && 'bg-muted text-muted-foreground'
                    )}
                    style={
                      sensitiveVisible
                        ? getUserAvatarStyle(log.username)
                        : undefined
                    }
                  >
                    {sensitiveVisible
                      ? getUserAvatarFallback(log.username)
                      : '•'}
                  </AvatarFallback>
                </Avatar>
                <TooltipProvider delay={300}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className='text-muted-foreground max-w-[100px] truncate text-sm hover:underline' />
                      }
                    >
                      {sensitiveVisible ? log.username : '••••'}
                    </TooltipTrigger>
                    {sensitiveVisible && log.username.length > 12 && (
                      <TooltipContent side='top'>{log.username}</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </button>
            )
          },
        }
      )
    }

    columns.push(
      {
        accessorKey: 'model_name',
        header: t('Model Name'),
        cell: function ModelCell({ row }) {
          const log = row.original
          if (!isDisplayableLogType(log.type)) return null

          const modelInfo = formatModelName(log)
          const other = parseLogOther(log.other)
          const requestPlugins = other?.request_plugins

          return (
            <div className='logs-model-top'>
              <ModelBadge
                modelName={modelInfo.name}
                actualModel={modelInfo.actualModel}
                responseModel={modelInfo.responseModel}
                compactMismatchIcon
                className='logs-editorial-model-badge'
              />
              {requestPlugins?.length ? (
                <RequestPluginLogMarker items={requestPlugins} compactIcon />
              ) : null}
            </div>
          )
        },
        meta: { mobileTitle: true, label: t('Model Name') },
      },
      {
        id: 'reasoning_effort',
        header: t('Reasoning Effort'),
        cell: ({ row }) => {
          const log = row.original
          if (!isDisplayableLogType(log.type)) return null
          const other = parseLogOther(log.other)
          const reasoningEffort = other?.reasoning_effort?.trim()
          if (!reasoningEffort) {
            return <span className='text-muted-foreground/50 text-xs'>—</span>
          }
          return (
            <span
              className='logs-icon-chip'
              title={`${t('Reasoning Effort')}: ${reasoningEffort}`}
            >
              <Brain aria-hidden='true' />
              <span>{reasoningEffort}</span>
            </span>
          )
        },
        meta: { label: t('Reasoning Effort') },
      },
      {
        id: 'protocol',
        header: t('Protocol'),
        cell: ({ row }) => {
          const log = row.original
          if (!isDisplayableLogType(log.type)) return null
          const other = parseLogOther(log.other)
          const conversionChain = Array.isArray(other?.request_conversion)
            ? other.request_conversion.filter(Boolean)
            : []
          const endpointLabel =
            formatEndpointShort(other?.request_path) ??
            formatConversionProtocolShort(conversionChain[0])
          if (!endpointLabel) {
            return <span className='text-muted-foreground/50 text-xs'>—</span>
          }
          const hasConversion = conversionChain.length > 1
          const title = hasConversion
            ? `${other?.request_path ? `${t('Endpoint')}: ${other.request_path} · ` : ''}${t('Request conversion')}: ${conversionChain.join(' → ')}`
            : `${t('Endpoint')}: ${other?.request_path || endpointLabel}`
          return (
            <span className='logs-icon-chip' title={title}>
              <Plug aria-hidden='true' />
              <span>{endpointLabel}</span>
              {hasConversion && (
                <ArrowLeftRight className='opacity-75' aria-hidden='true' />
              )}
            </span>
          )
        },
        meta: { label: t('Protocol') },
      },
      {
        accessorKey: 'group',
        header: t('Rate Group'),
        cell: function GroupCell({ row }) {
          const sensitiveVisible = useSensitiveVisible()
          const log = row.original
          if (!isDisplayableLogType(log.type)) return null
          const other = parseLogOther(log.other)
          const group = log.group || other?.group || ''
          const groupRatio = getGroupRatio(other)
          const routePolicy = other?.route_policy
          const fallbackFrom = other?.route_fallback_from
          let displayGroup = ''
          if (group) {
            displayGroup = sensitiveVisible ? group : '••••'
          }
          const ratioText =
            groupRatio != null ? `${formatRatioCompact(groupRatio)}x` : ''
          let policyLabel = ''
          if (routePolicy === 'cost_first') {
            policyLabel = t('Cost first')
          } else if (routePolicy === 'stability_first') {
            policyLabel = t('Stability first')
          }
          let groupTitle: string | undefined
          if (sensitiveVisible) {
            groupTitle = policyLabel ? `${group} (${policyLabel})` : group
          }
          if (!displayGroup && !ratioText) {
            return <span className='text-muted-foreground/50 text-xs'>—</span>
          }
          return (
            <div className='logs-group-pair'>
              {displayGroup && (
                <span className='logs-group-name' title={groupTitle}>
                  {displayGroup}
                </span>
              )}
              {ratioText && (
                <span
                  className='logs-icon-chip'
                  title={`${t('Group Ratio')}: ${ratioText}`}
                >
                  {ratioText}
                </span>
              )}
              {fallbackFrom && (
                <span
                  className='logs-icon-chip border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  title={
                    sensitiveVisible
                      ? t('Fallback from {{from}} to {{to}}', {
                          from: fallbackFrom,
                          to: group || '-',
                        })
                      : t('Route fallback')
                  }
                >
                  {t('Fallback')}
                </span>
              )}
            </div>
          )
        },
        meta: { label: t('Rate Group') },
      },
      {
        accessorKey: 'is_stream',
        header: t('Type'),
        cell: ({ row }) => {
          const log = row.original
          const other = parseLogOther(log.other)
          const badge = resolveBillingModeBadge(log, other, t)
          if (!isTimingLogType(log.type)) {
            const config = getLogTypeConfig(log.type)
            const typeLabel = t(config.label)
            return (
              <div className='logs-type-pair'>
                <span
                  className={cn('logs-type-tag', getLogTypeTagTone(log.type))}
                >
                  {typeLabel}
                </span>
                {badge && badge.label !== typeLabel && (
                  <span title={badge.title ?? badge.label}>
                    <LogsStatusPill label={badge.label} tone={badge.tone} />
                  </span>
                )}
              </div>
            )
          }

          let streamLabel = log.is_stream ? t('Stream') : t('Non-stream')
          if (other?.is_task) {
            streamLabel = other.task_sync ? t('Sync') : t('Async')
          }
          const showStreamError =
            log.is_stream &&
            other?.stream_status &&
            other.stream_status.status !== 'ok'

          return (
            <div className='logs-type-pair'>
              <span
                className={cn('logs-icon-chip', showStreamError && 'is-err')}
                title={streamLabel}
              >
                {log.is_stream ? (
                  <Radio aria-hidden='true' />
                ) : (
                  <CircleArrowRight aria-hidden='true' />
                )}
                <span>{streamLabel}</span>
                {showStreamError && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <CircleAlert className='text-destructive size-3' />
                        }
                      />
                      <TooltipContent>
                        <div className='space-y-0.5 text-xs'>
                          <p>
                            {t('Stream Status')}: {t('Error')}
                          </p>
                          <p>{other.stream_status?.end_reason || 'unknown'}</p>
                          {(other.stream_status?.error_count ?? 0) > 0 && (
                            <p>
                              {t('Soft Errors')}:{' '}
                              {other.stream_status?.error_count}
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </span>
              {badge && (
                <span title={badge.title ?? badge.label}>
                  <LogsStatusPill label={badge.label} tone={badge.tone} />
                </span>
              )}
            </div>
          )
        },
        meta: { label: t('Type') },
      },
      {
        accessorKey: 'prompt_tokens',
        header: t('Tokens & Cache'),
        cell: ({ row }) => {
          const log = row.original
          if (!isDisplayableLogType(log.type)) return null

          const other = parseLogOther(log.other)
          const promptTokens = log.prompt_tokens || 0
          const completionTokens = log.completion_tokens || 0
          const cacheReadTokens = other?.cache_tokens || 0
          const cacheWrite5m = other?.cache_creation_tokens_5m || 0
          const cacheWrite1h = other?.cache_creation_tokens_1h || 0
          const cacheWrite12h = other?.cache_creation_tokens_12h || 0
          const hasSplitCache =
            cacheWrite5m > 0 || cacheWrite1h > 0 || cacheWrite12h > 0
          const cacheWriteTokens = hasSplitCache
            ? cacheWrite5m + cacheWrite1h + cacheWrite12h
            : other?.cache_write_tokens || other?.cache_creation_tokens || 0
          let totalInputTokens = Math.max(promptTokens, cacheReadTokens)
          if (other?.input_tokens_total && other.input_tokens_total > 0) {
            totalInputTokens = other.input_tokens_total
          } else if (other?.claude) {
            totalInputTokens = promptTokens + cacheReadTokens + cacheWriteTokens
          }
          const cachePct =
            totalInputTokens > 0
              ? Math.min(
                  100,
                  Math.max(
                    0,
                    Math.round((cacheReadTokens / totalInputTokens) * 100)
                  )
                )
              : 0
          const hasTokens =
            promptTokens > 0 ||
            completionTokens > 0 ||
            cacheReadTokens > 0 ||
            cacheWriteTokens > 0
          let cacheValueText = formatCompactTokenCount(cacheReadTokens)
          if (cacheWriteTokens > 0) {
            cacheValueText =
              cacheReadTokens > 0
                ? `${formatCompactTokenCount(cacheReadTokens)}/+${formatCompactTokenCount(cacheWriteTokens)}`
                : `+${formatCompactTokenCount(cacheWriteTokens)}`
          }

          return (
            <div className='logs-tokens-flat'>
              <span
                className='logs-cache-progress'
                title={`${t('Cache Hit Rate')}: ${cachePct}%`}
              >
                <span className='logs-cache-bar-track' aria-hidden='true'>
                  <span
                    className='logs-cache-bar-fill'
                    style={{ width: `${cachePct}%` }}
                  />
                </span>
                <span className='logs-cache-pct'>{cachePct}%</span>
              </span>
              <span
                className={cn(
                  'logs-tokens-io',
                  !hasTokens && 'text-muted-foreground/60 font-normal'
                )}
                title={
                  hasTokens
                    ? `${promptTokens.toLocaleString()} → ${completionTokens.toLocaleString()}`
                    : undefined
                }
              >
                {hasTokens
                  ? `${formatCompactTokenCount(promptTokens)} → ${formatCompactTokenCount(completionTokens)}`
                  : '—'}
              </span>
              <span
                className='logs-tokens-cache'
                title={`${t('Cache Read')}: ${cacheReadTokens.toLocaleString()}${
                  cacheWriteTokens > 0
                    ? ` · ${t('Cache Write')}: +${cacheWriteTokens.toLocaleString()}`
                    : ''
                }`}
              >
                <Database aria-hidden='true' />
                <span>{cacheValueText}</span>
              </span>
              <TooltipProvider delay={150}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type='button'
                        className='logs-billing-info-trigger'
                        aria-label={t('Billing Details')}
                        onClick={(e) => e.stopPropagation()}
                      />
                    }
                  >
                    <Info className='size-3.5' aria-hidden='true' />
                  </TooltipTrigger>
                  <TooltipContent side='top' className='p-2.5'>
                    <TokenBillingTooltipContent
                      log={log}
                      other={other}
                      cacheReadTokens={cacheReadTokens}
                      cacheWriteTokens={cacheWriteTokens}
                      cacheWrite5m={cacheWrite5m}
                      cacheWrite1h={cacheWrite1h}
                      cacheWrite12h={cacheWrite12h}
                      cachePct={cachePct}
                    />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )
        },
        meta: { label: t('Tokens & Cache') },
      },
      {
        accessorKey: 'quota',
        header: t('This Cost'),
        cell: ({ row }) => {
          const log = row.original
          if (!isDisplayableLogType(log.type)) return null

          const quota = row.getValue('quota') as number
          const other = parseLogOther(log.other)
          return (
            <div className='logs-cost-cell'>
              <LogCostDisplay
                quota={quota}
                other={other}
                showBillingSource={showBillingSource}
              />
            </div>
          )
        },
        meta: { label: t('This Cost') },
      },
      {
        accessorKey: 'use_time',
        header: t('First Token / Throughput'),
        cell: ({ row }) => {
          const log = row.original
          if (!isTimingLogType(log.type)) return null

          const useTime = row.getValue('use_time') as number
          const other = parseLogOther(log.other)
          const ttftMs = other?.frt != null && other.frt > 0 ? other.frt : null
          const ttftLabel = ttftMs != null ? formatLatencyMs(ttftMs) : '—'
          const tokensPerSecond =
            useTime > 0 && log.completion_tokens > 0
              ? log.completion_tokens / useTime
              : null
          const tpsLabel =
            tokensPerSecond != null ? `${Math.round(tokensPerSecond)} t/s` : '—'
          const durationLabel = useTime > 0 ? formatUseTime(useTime) : '—'

          return (
            <div className='logs-timing-flat'>
              <span
                className={cn(
                  'logs-metric-line',
                  ttftMs != null ? 'is-strong' : 'is-muted'
                )}
                title={`${t('First token')}: ${ttftLabel} · ${t('Duration')}: ${durationLabel}`}
              >
                <Zap aria-hidden='true' />
                <span>{ttftLabel}</span>
              </span>
              <span
                className='logs-metric-line is-muted'
                title={`${t('Throughput')}: ${tpsLabel} · ${t('Duration')}: ${durationLabel}`}
              >
                <Gauge aria-hidden='true' />
                <span>{tpsLabel}</span>
              </span>
            </div>
          )
        },
        meta: { label: t('First Token / Throughput') },
      },
      {
        accessorKey: 'content',
        header: t('Details'),
        cell: function DetailsCell({ row }) {
          const { t, i18n } = useTranslation()
          const [dialogOpen, setDialogOpen] = useState(false)
          const log = row.original
          const other = parseLogOther(log.other)

          const pricingData = usePricingData(
            log.type === 2 &&
              other?.is_task === true &&
              other.billing_mode === 'tiered_expr'
          )
          const usageSchema = pluginUsageSchema(
            pricingData.models.find(
              (model) => model.model_name === log.model_name
            ),
            other?.admin_info?.task_plugin?.key
          )
          const segments = buildDetailSegments(
            log,
            other,
            t,
            isAdmin,
            i18n.language,
            usageSchema
          )
          const primary = segments[0]
          const hasMore = segments.length > 1
          let primaryTextClass = 'text-foreground'
          if (primary?.muted) {
            primaryTextClass = 'text-muted-foreground/60'
          } else if (primary?.danger) {
            primaryTextClass = 'text-red-600 dark:text-red-400'
          }
          let detailPreview = (
            <span className='text-muted-foreground/40'>—</span>
          )
          if (primary) {
            detailPreview = (
              <span
                className={cn(
                  'truncate leading-snug group-hover:underline',
                  primaryTextClass
                )}
              >
                {primary.text}
                {hasMore && (
                  <span className='text-muted-foreground/40 ml-0.5'>
                    +{segments.length - 1}
                  </span>
                )}
              </span>
            )
          } else if (log.content) {
            detailPreview = (
              <span className='text-muted-foreground truncate group-hover:underline'>
                {renderLogContent(other, t) ?? log.content}
              </span>
            )
          }

          return (
            <>
              <button
                type='button'
                className='logs-detail-trigger group'
                onClick={() => setDialogOpen(true)}
                title={t('Click to view full details')}
              >
                {detailPreview}
              </button>
              <DetailsDialog
                log={log}
                isAdmin={isAdmin}
                isRoot={isRoot}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
              />
            </>
          )
        },
        size: 180,
        maxSize: 200,
        meta: { label: t('Details') },
      },
      {
        accessorKey: 'created_at',
        header: t('Time'),
        cell: ({ row }) => {
          const timestamp = row.getValue('created_at') as number
          return (
            <span
              className='logs-mono'
              title={formatTimestampToDate(timestamp)}
            >
              {formatShortLogTime(timestamp)}
            </span>
          )
        },
        filterFn: (row, _id, value) => {
          if (!Array.isArray(value) || value.length === 0) return true
          if (value.includes(LOG_TYPE_ALL_VALUE)) return true
          return value.includes(String(row.original.type))
        },
        meta: { label: t('Time') },
      },
      {
        id: 'balance',
        header: t('Balance'),
        cell: ({ row }) => {
          const log = row.original
          const other = parseLogOther(log.other)
          if (
            other?.billing_source === 'subscription' &&
            other.subscription_remain != null &&
            Number.isFinite(other.subscription_remain)
          ) {
            const remainText = formatLogQuota(other.subscription_remain)
            const totalText =
              other.subscription_total != null &&
              Number.isFinite(other.subscription_total)
                ? formatLogQuota(other.subscription_total)
                : null
            return (
              <span
                className='logs-metric-line'
                title={
                  totalText
                    ? `${t('Subscription')}: ${remainText} / ${totalText}`
                    : `${t('Subscription')}: ${remainText}`
                }
              >
                <Crown aria-hidden='true' />
                <span className='logs-mono'>{remainText}</span>
              </span>
            )
          }
          if (
            other?.wallet_remain != null &&
            Number.isFinite(other.wallet_remain)
          ) {
            return (
              <span className='logs-mono'>
                {formatLogQuota(other.wallet_remain)}
              </span>
            )
          }
          return <span className='text-muted-foreground/50 text-xs'>—</span>
        },
        meta: { label: t('Balance') },
      }
    )

    return columns
    // Log formatters read currency settings from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, isAdmin, isRoot, showBillingSource, currency])
}
