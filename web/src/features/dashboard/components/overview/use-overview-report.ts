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
const emptyRows: QuotaDataItem[] = []

function overviewBuckets(
  rows: QuotaDataItem[],
  range: OverviewRange,
  start: number,
  end: number
): TrendBucket[] {
  const unit = { today: 'hour', '7d': 'day', '30d': 'day', all: 'month' }[
    range
  ] as 'hour' | 'day' | 'month'
  const first = dayjs.unix(start).startOf(unit)
  const count = Math.max(1, dayjs.unix(end).startOf(unit).diff(first, unit) + 1)
  const stride = Math.max(range === '30d' ? 3 : 1, Math.ceil(count / 180))
  const buckets = Array.from(
    { length: Math.ceil(count / stride) },
    (_, index) => ({
      startedAt: first.add(index * stride, unit).unix(),
      quota: 0,
      count: 0,
      token: 0,
    })
  )
  for (const row of rows) {
    const index = Math.floor(
      dayjs.unix(row.created_at).startOf(unit).diff(first, unit) / stride
    )
    const bucket = buckets[index]
    if (!bucket) continue
    bucket.quota += Number(row.quota) || 0
    bucket.count += Number(row.count) || 0
    bucket.token += Number(row.token_used) || 0
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
    () => overviewBuckets(rows, range, start, window.end),
    [range, rows, start, window.end]
  )
  return {
    range,
    setRange,
    query,
    rows,
    buckets,
    start,
    end: window.end,
    ...period,
  }
}

export type OverviewReport = ReturnType<typeof useOverviewReport>
