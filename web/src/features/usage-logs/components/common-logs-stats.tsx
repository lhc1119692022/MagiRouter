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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import {
  formatCompactNumber,
  formatLogQuota,
  formatNumber,
  formatTokens,
} from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { getLogStats, getUserLogStats } from '../api'
import { DEFAULT_LOG_STATS, LOG_TYPE_ENUM } from '../constants'
import type { UsageLog } from '../data/schema'
import { parseLogOther } from '../lib/format'
import { buildApiParams } from '../lib/utils'
import { LogsStatStrip, type LogsStatItem } from './logs-editorial-primitives'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

function formatRatePerSecond(
  perMinute: number,
  locale?: string
): string {
  const rate = perMinute / 60
  if (!Number.isFinite(rate) || rate <= 0) return '0'
  if (rate < 0.01) return '<0.01'
  if (rate < 10) return Number(rate.toFixed(2)).toString()
  if (rate < 1000) return Number(rate.toFixed(1)).toString()
  return formatCompactNumber(rate, locale)
}

function formatLatencyCompact(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatMetricCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) return `${Number((value / 1000).toFixed(1))}K`
  return `${Number((value / 1_000_000).toFixed(2))}M`
}

function StatBadge(props: {
  label: string
  value: string | number
  accent: string
}) {
  return (
    <span className='border-border/60 bg-muted/25 inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-xs shadow-xs'>
      <span className={cn('h-3.5 w-0.5 rounded-full', props.accent)} />
      <span className='text-muted-foreground'>{props.label}</span>
      <span className='text-foreground/85 font-mono font-semibold tabular-nums'>
        {props.value}
      </span>
    </span>
  )
}

export interface CommonLogsStatsProps {
  variant?: 'badges' | 'strip'
  totalCount?: number
  logs?: UsageLog[]
}

export function CommonLogsStats(props: CommonLogsStatsProps = {}) {
  const { variant = 'badges', totalCount, logs } = props
  const { t, i18n } = useTranslation()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const searchParams = route.useSearch()
  const { sensitiveVisible } = useUsageLogsContext()
  const userQuota = useAuthStore((state) => state.auth.user?.quota)
  const locale = toIntlLocale(i18n.language)

  const { data: stats, isLoading } = useQuery({
    queryKey: ['usage-logs-stats', isAdmin, searchParams],
    queryFn: async () => {
      const params = buildApiParams({
        page: 1,
        pageSize: 1,
        searchParams,
        columnFilters: [],
        isAdmin,
      })

      const result = isAdmin
        ? requireServerSuccess(await getLogStats(params))
        : requireServerSuccess(await getUserLogStats(params))

      return result.success
        ? result.data || DEFAULT_LOG_STATS
        : DEFAULT_LOG_STATS
    },
    placeholderData: (previousData) => previousData,
  })

  const pageSummary = useMemo(() => {
    if (!logs || logs.length === 0) {
      return { promptTokens: 0, completionTokens: 0, avgTtftMs: null as number | null }
    }
    let promptTokens = 0
    let completionTokens = 0
    let ttftSum = 0
    let ttftCount = 0
    for (const item of logs) {
      if (item.type !== LOG_TYPE_ENUM.CONSUME) continue
      promptTokens += item.prompt_tokens || 0
      completionTokens += item.completion_tokens || 0
      const other = parseLogOther(item.other)
      if (other?.frt != null && other.frt > 0) {
        ttftSum += other.frt
        ttftCount += 1
      }
    }
    return {
      promptTokens,
      completionTokens,
      avgTtftMs: ttftCount > 0 ? ttftSum / ttftCount : null,
    }
  }, [logs])

  if (isLoading) {
    if (variant === 'strip') {
      return (
        <div className='logs-stat-strip'>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className='logs-stat-cell'>
              <Skeleton className='h-3.5 w-20 rounded' />
              <Skeleton className='mt-1 h-6 w-28 rounded' />
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className='flex items-center gap-2'>
        <Skeleton className='h-7 w-[150px] rounded-md' />
        <Skeleton className='h-7 w-[100px] rounded-md' />
        <Skeleton className='h-7 w-[120px] rounded-md' />
      </div>
    )
  }

  const rpm = stats?.rpm || 0
  const tpm = stats?.tpm || 0
  const rpsDisplay = formatRatePerSecond(rpm, locale)
  const tpsDisplay = formatRatePerSecond(tpm, locale)

  if (variant === 'strip') {
    const avgTtftLabel =
      pageSummary.avgTtftMs != null
        ? formatLatencyCompact(pageSummary.avgTtftMs)
        : null
    let balanceValue = '••••'
    if (sensitiveVisible) {
      balanceValue = userQuota != null ? formatLogQuota(userQuota) : '—'
    }
    const items: LogsStatItem[] = [
      {
        label: t('Usage'),
        value: sensitiveVisible ? formatLogQuota(stats?.quota || 0) : '••••',
        sub:
          totalCount != null
            ? t('{{count}} records', {
                count: totalCount.toLocaleString(locale),
              })
            : undefined,
      },
      {
        label: 'RPM / RPS',
        value: formatNumber(rpm, locale),
        sub: `RPS ${rpsDisplay}`,
      },
      {
        label: 'TPM / TPS',
        value: tpm >= 1000 ? formatMetricCompact(tpm) : formatNumber(tpm, locale),
        sub: `TPS ${tpsDisplay}`,
      },
      !isAdmin
        ? {
            label: t('Current Balance'),
            value: balanceValue,
            sub: avgTtftLabel
              ? t('Avg TTFT {{value}}', { value: avgTtftLabel })
              : t('Synced with account'),
          }
        : {
            label: t('Tokens (Page)'),
            value:
              pageSummary.promptTokens > 0 || pageSummary.completionTokens > 0
                ? `${formatTokens(pageSummary.promptTokens)} / ${formatTokens(pageSummary.completionTokens)}`
                : '0 / 0',
            sub: avgTtftLabel
              ? t('Avg TTFT {{value}}', { value: avgTtftLabel })
              : undefined,
          },
    ]
    return <LogsStatStrip items={items} />
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <StatBadge
        label={t('Usage')}
        value={sensitiveVisible ? formatLogQuota(stats?.quota || 0) : '••••'}
        accent='bg-sky-500/70'
      />
      <StatBadge
        label='RPM / RPS'
        value={`${formatNumber(rpm, locale)} (${rpsDisplay}/s)`}
        accent='bg-rose-500/65'
      />
      <StatBadge
        label='TPM / TPS'
        value={`${tpm >= 1000 ? formatMetricCompact(tpm) : formatNumber(tpm, locale)} (${tpsDisplay}/s)`}
        accent='bg-slate-400/70'
      />
    </div>
  )
}
