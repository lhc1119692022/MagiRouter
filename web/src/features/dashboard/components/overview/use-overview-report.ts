import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'

import { getUserQuotaDates } from '@/features/dashboard/api'
import type { TrendBucket } from '@/features/dashboard/lib/trend'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

export const overviewPeriods = {
  today: {
    label: 'Today',
    title: 'Today’s spending and requests',
    meta: 'Hourly buckets',
    spendLabel: 'Today’s spending',
    requestsLabel: 'Today’s requests',
    tokensLabel: 'Today’s token usage',
    periodBadge: 'TODAY',
    days: 1,
  },
  '7d': {
    label: '7 Days',
    title: 'Spending and requests in the last 7 days',
    meta: 'Daily buckets',
    spendLabel: 'Spending in the last 7 days',
    requestsLabel: 'Requests in the last 7 days',
    tokensLabel: 'Token usage in the last 7 days',
    periodBadge: '7D',
    days: 7,
  },
  '30d': {
    label: '30 days',
    title: 'Spending and requests in the last 30 days',
    meta: 'Three-day buckets',
    spendLabel: 'Spending in the last 30 days',
    requestsLabel: 'Requests in the last 30 days',
    tokensLabel: 'Token usage in the last 30 days',
    periodBadge: '30D',
    days: 30,
  },
  all: {
    label: 'All',
    title: 'Spending and requests over the available period',
    meta: 'Monthly buckets',
    spendLabel: 'Spending over the available period',
    requestsLabel: 'Requests over the available period',
    tokensLabel: 'Token usage over the available period',
    periodBadge: 'ALL',
    days: 0,
  },
} as const

export type OverviewRange = keyof typeof overviewPeriods

export type OverviewModelUsage = {
  quota: number
  count: number
  token: number
}

export type OverviewModelSummary = OverviewModelUsage & {
  name: string
  color: string
}

export type OverviewTrendBucket = TrendBucket & {
  models: ReadonlyMap<string, OverviewModelUsage>
}

export const overviewModelColors = [
  'var(--ink-strong)',
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#ef4444',
] as const

const emptyRows: QuotaDataItem[] = []

export function summarizeOverviewModels(
  rows: QuotaDataItem[]
): OverviewModelSummary[] {
  const perModel = new Map<string, OverviewModelUsage & { name: string }>()
  for (const row of rows) {
    const name = row.model_name?.trim() ?? ''
    const item = perModel.get(name) ?? { name, quota: 0, count: 0, token: 0 }
    item.quota += Number(row.quota) || 0
    item.count += Number(row.count) || 0
    item.token += Number(row.token_used) || 0
    perModel.set(name, item)
  }
  return [...perModel.values()]
    .sort(
      (left, right) =>
        right.quota - left.quota ||
        right.count - left.count ||
        right.token - left.token ||
        left.name.localeCompare(right.name)
    )
    .map((item, index) => ({
      ...item,
      color:
        overviewModelColors[index] ??
        `hsl(${Math.round(((index - overviewModelColors.length) * 137.508 + 25) % 360)} 65% 48%)`,
    }))
}

export function buildOverviewBuckets(
  rows: QuotaDataItem[],
  range: OverviewRange,
  start: number,
  end: number
): OverviewTrendBucket[] {
  const unit = { today: 'hour', '7d': 'day', '30d': 'day', all: 'month' }[
    range
  ] as 'hour' | 'day' | 'month'
  const first =
    range === 'today'
      ? dayjs.unix(start).startOf('day')
      : dayjs.unix(start).startOf(unit)
  const last =
    range === 'today'
      ? first.endOf('day').startOf('hour')
      : dayjs.unix(end).startOf(unit)
  const count = Math.max(1, last.diff(first, unit) + 1)
  const stride = Math.max(range === '30d' ? 3 : 1, Math.ceil(count / 180))
  const buckets = Array.from(
    { length: Math.ceil(count / stride) },
    (_, index) => ({
      startedAt: first.add(index * stride, unit).unix(),
      quota: 0,
      count: 0,
      token: 0,
      models: new Map<string, OverviewModelUsage>(),
    })
  )
  for (const row of rows) {
    const index = Math.floor(
      dayjs.unix(row.created_at).startOf(unit).diff(first, unit) / stride
    )
    const bucket = buckets[index]
    if (!bucket) continue
    const quota = Number(row.quota) || 0
    const countValue = Number(row.count) || 0
    const token = Number(row.token_used) || 0
    bucket.quota += quota
    bucket.count += countValue
    bucket.token += token
    const modelName = row.model_name?.trim() ?? ''
    const existing = bucket.models.get(modelName)
    if (existing) {
      existing.quota += quota
      existing.count += countValue
      existing.token += token
    } else {
      bucket.models.set(modelName, {
        quota,
        count: countValue,
        token,
      })
    }
  }
  return buckets
}

export function useOverviewReport() {
  const [range, setRange] = useState<OverviewRange>('today')
  const userId = useAuthStore((state) => state.auth.user?.id)
  const { status } = useStatus()
  const maxDays = status?.log_max_range_days
  const period = overviewPeriods[range]
  const window = useMemo(() => {
    const now = dayjs()
    const end = now.unix()
    const limit =
      maxDays && maxDays > 0 ? Math.max(0, end - maxDays * 86400) : 0
    const start = period.days
      ? Math.max(
          limit,
          now
            .startOf('day')
            .subtract(period.days - 1, 'day')
            .unix()
        )
      : 0
    return { start, end, limit }
  }, [period.days, maxDays])
  const query = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'report',
      userId,
      range,
      window.start,
      window.end,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: window.start,
          end_timestamp: window.end,
          default_time: range === 'today' ? 'hour' : 'day',
        })
      ).data ?? emptyRows,
    enabled: userId != null,
    staleTime: 60_000,
  })
  const rows = useMemo(
    () =>
      (query.data ?? emptyRows).filter(
        (row) =>
          row.created_at >= (window.start || window.limit) &&
          row.created_at <= window.end
      ),
    [query.data, window]
  )
  const start =
    window.start ||
    window.limit ||
    rows.reduce((first, row) => Math.min(first, row.created_at), window.end)
  const buckets = useMemo(
    () => buildOverviewBuckets(rows, range, start, window.end),
    [range, rows, start, window.end]
  )
  const models = useMemo(() => summarizeOverviewModels(rows), [rows])
  return {
    range,
    setRange,
    query,
    rows,
    buckets,
    models,
    start,
    end: window.end,
    ...period,
  }
}

export type OverviewReport = ReturnType<typeof useOverviewReport>
