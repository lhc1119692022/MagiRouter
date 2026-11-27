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
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  DataTableRow,
  useDataTable,
} from '@/components/data-table'
import {
  getAdminPlans,
  getSelfSubscriptionFull,
} from '@/features/subscriptions/api'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { formatQuota } from '@/lib/format'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  DEFAULT_LOGS_DATA,
  LOG_TYPE_ALL_VALUE,
  LOG_TYPE_ENUM,
} from '../constants'
import type { UsageLog } from '../data/schema'
import { shouldShowBillingSource } from '../lib/billing-source'
import { useColumnsByCategory } from '../lib/columns'
import { parseLogOther } from '../lib/format'
import { useHorizontalScrollPeek } from '../lib/horizontal-peek'
import { fetchLogsByCategory } from '../lib/utils'

import '../logs-editorial.css'
import type { LogCategory, MidjourneyLog, TaskLog } from '../types'
import { CommonLogsFilterBar } from './common-logs-filter-bar'
import { CommonLogsStats } from './common-logs-stats'
import { LogsStatStrip, type LogsStatItem } from './logs-editorial-primitives'
import { TaskLogsFilterBar } from './task-logs-filter-bar'
import { UsageLogsMobileList } from './usage-logs-mobile-card'
import { useLogsViewScope, type LogsViewAccess } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

const logTypeRowTint: Record<number, string> = {
  [LOG_TYPE_ENUM.ERROR]: 'bg-rose-50/40 dark:bg-rose-950/20',
  [LOG_TYPE_ENUM.REFUND]: 'bg-blue-50/30 dark:bg-blue-950/15',
}

// Warning tint for logs where a quota conversion saturated (admin-only marker).
// Takes precedence over the per-type tint since it flags a billing anomaly.
const quotaSaturationRowTint = 'bg-amber-50/60 dark:bg-amber-950/25'

function getColumnVisibilityStorageKey(
  logCategory: LogCategory,
  viewAccess: LogsViewAccess
): string {
  return `usage-logs:${logCategory}:${viewAccess}:column-visibility`
}

function deserializeLogTypeFilter(value: unknown): unknown[] {
  let values: unknown[] = []
  if (Array.isArray(value)) {
    values = value
  } else if (value) {
    values = [value]
  }
  return values.filter((item) => String(item) !== LOG_TYPE_ALL_VALUE)
}

interface UsageLogsTableProps {
  logCategory: LogCategory
}

export function UsageLogsTable({ logCategory }: UsageLogsTableProps) {
  const { t } = useTranslation()
  const getColumnClassName = useCallback(
    () => (logCategory === 'common' ? 'py-2' : 'py-3.5'),
    [logCategory]
  )
  const {
    isAdminView: isAdmin,
    isRootView: isRoot,
    viewAccess,
  } = useLogsViewScope()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const searchParams = route.useSearch()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const { data: showBillingSource = false } = useQuery({
    queryKey: ['usage-log-billing-source', isAdmin, userId],
    enabled: logCategory === 'common' && userId != null,
    queryFn: async () => {
      if (isAdmin) {
        const plansResult = await getAdminPlans()
        return shouldShowBillingSource({
          isAdmin,
          plans: plansResult.success ? plansResult.data : undefined,
          subscriptions: undefined,
        })
      }

      const selfResult = await getSelfSubscriptionFull()
      return shouldShowBillingSource({
        isAdmin,
        plans: undefined,
        subscriptions: selfResult.success
          ? selfResult.data?.subscriptions
          : undefined,
      })
    },
  })

  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 20 : 100 },
    globalFilter: { enabled: false },
    columnFilters: [
      {
        columnId: 'created_at',
        searchKey: 'type',
        type: 'array' as const,
        deserialize: deserializeLogTypeFilter,
      },
      { columnId: 'model_name', searchKey: 'model', type: 'string' as const },
      { columnId: 'token_name', searchKey: 'token', type: 'string' as const },
      { columnId: 'group', searchKey: 'group', type: 'string' as const },
      ...(isAdmin
        ? [
            {
              columnId: 'channel',
              searchKey: 'channel',
              type: 'string' as const,
            },
            {
              columnId: 'username',
              searchKey: 'username',
              type: 'string' as const,
            },
          ]
        : []),
    ],
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'logs',
      logCategory,
      viewAccess,
      pagination.pageIndex + 1,
      pagination.pageSize,
      columnFilters,
      searchParams,
      t,
    ],
    queryFn: async () => {
      const result = await fetchLogsByCategory({
        logCategory,
        isAdmin,
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        searchParams,
        columnFilters,
      })

      if (!result?.success) {
        throw createServerError(result, t('Failed to load logs'))
      }

      return result.data || DEFAULT_LOGS_DATA
    },
    placeholderData: (previousData, previousQuery) => {
      if (
        previousQuery?.queryKey[1] === logCategory &&
        previousQuery.queryKey[2] === viewAccess
      ) {
        return previousData
      }
      return undefined
    },
  })

  const logs = data?.items ?? EMPTY_LOG_ITEMS
  const columns = useColumnsByCategory(
    logCategory,
    isAdmin,
    isRoot,
    showBillingSource
  )
  const isLoadingData = isLoading || (isFetching && !data)

  const { table } = useDataTable({
    data: logs as Record<string, unknown>[],
    columns: columns as ColumnDef<Record<string, unknown>>[],
    columnFilters,
    columnVisibilityStorageKey: getColumnVisibilityStorageKey(
      logCategory,
      viewAccess
    ),
    pagination,
    enableRowSelection: false,
    onPaginationChange,
    onColumnFiltersChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  const isCommon = logCategory === 'common'
  const totalCount = data?.total || 0
  const commonLogsCardRef = useRef<HTMLDivElement | null>(null)
  const visibleColumnIdsKey = table
    .getVisibleLeafColumns()
    .map((column) => column.id)
    .join(',')
  useHorizontalScrollPeek(
    commonLogsCardRef,
    `${visibleColumnIdsKey}|${logs.length}|${isLoadingData ? 'loading' : 'ready'}`,
    isCommon && !isMobile
  )

  const taskStatItems = useMemo<LogsStatItem[]>(() => {
    if (isCommon) return []

    const pageLogs = logs as Array<TaskLog | MidjourneyLog>
    const pageSize = pageLogs.length
    let doneCount = 0
    let activeCount = 0
    let failedCount = 0

    for (const item of pageLogs) {
      const normalizedStatus = (item.status ?? '').toUpperCase()
      if (normalizedStatus === 'SUCCESS') {
        doneCount += 1
      } else if (normalizedStatus === 'FAILURE') {
        failedCount += 1
      } else if (
        normalizedStatus === 'IN_PROGRESS' ||
        normalizedStatus === 'QUEUED' ||
        normalizedStatus === 'SUBMITTED' ||
        normalizedStatus === 'NOT_START' ||
        normalizedStatus === 'MODAL'
      ) {
        activeCount += 1
      }
    }

    const failureRate =
      pageSize > 0 ? Math.round((failedCount / pageSize) * 100) : 0

    if (logCategory === 'task') {
      const taskItems = logs as TaskLog[]
      let totalQuota = 0
      let billedCount = 0
      for (const item of taskItems) {
        if (typeof item.quota === 'number' && item.quota > 0) {
          totalQuota += item.quota
          billedCount += 1
        }
      }

      return [
        {
          label: t('Matching Tasks'),
          value: String(totalCount),
          sub: t('Completed {{count}} on page', { count: doneCount }),
        },
        {
          label: t('In Progress / Queued'),
          value: String(activeCount),
          sub: t('Active on page'),
          tone: activeCount > 0 ? 'warn' : 'default',
        },
        {
          label: t('Page Task Spend'),
          value: formatQuota(totalQuota),
          sub: t('{{count}} billed tasks', { count: billedCount }),
        },
        {
          label: t('Failed Tasks'),
          value: String(failedCount),
          sub:
            failedCount > 0
              ? t('{{rate}}% of page', { rate: failureRate })
              : t('No failures on page'),
          tone: failedCount > 0 ? 'err' : 'default',
        },
      ]
    }

    const drawingItems = logs as MidjourneyLog[]
    let durationSumSec = 0
    let durationCount = 0
    for (const item of drawingItems) {
      if (
        item.submit_time &&
        item.finish_time &&
        item.finish_time > item.submit_time
      ) {
        durationSumSec += (item.finish_time - item.submit_time) / 1000
        durationCount += 1
      }
    }
    const avgDurationLabel =
      durationCount > 0
        ? `${(durationSumSec / durationCount).toFixed(1)}s`
        : '—'

    return [
      {
        label: t('Matching Tasks'),
        value: String(totalCount),
        sub: t('Completed {{count}} on page', { count: doneCount }),
      },
      {
        label: t('In Progress / Queued'),
        value: String(activeCount),
        sub: t('Active on page'),
        tone: activeCount > 0 ? 'warn' : 'default',
      },
      {
        label: t('Avg Duration'),
        value: avgDurationLabel,
        sub: t('Completed on page'),
      },
      {
        label: t('Failed Tasks'),
        value: String(failedCount),
        sub:
          failedCount > 0
            ? t('{{rate}}% of page', { rate: failureRate })
            : t('No failures on page'),
        tone: failedCount > 0 ? 'err' : 'default',
      },
    ]
  }, [isCommon, logCategory, logs, t, totalCount])

  if (!isCommon) {
    return (
      <div className='logs-editorial-page'>
        <LogsStatStrip items={taskStatItems} />
        <div className='logs-editorial-card'>
          <DataTablePage
            table={table}
            columns={columns as ColumnDef<Record<string, unknown>>[]}
            isLoading={isLoadingData}
            isFetching={isFetching}
            emptyTitle={t('No Logs Found')}
            emptyDescription={t(
              'No usage logs available. Logs will appear here once API calls are made.'
            )}
            skeletonKeyPrefix='usage-log-skeleton'
            applyHeaderSize
            fixedHeight={false}
            paginationInFooter={false}
            className='logs-editorial-table-page'
            tableClassName='logs-editorial-table-wrap'
            paginationClassName='logs-editorial-pagination'
            mobile={
              <div className='logs-editorial-mobile-body'>
                <UsageLogsMobileList
                  table={table}
                  isLoading={isLoadingData}
                  logCategory={logCategory}
                />
              </div>
            }
            toolbar={
              <TaskLogsFilterBar
                table={table}
                logCategory={logCategory}
                totalCount={totalCount}
              />
            }
            renderRow={(row) => (
              <DataTableRow
                key={row.id}
                row={row}
                className='transition-colors'
                getColumnClassName={getColumnClassName}
                cellRenderColumns={table.options.columns}
              />
            )}
          />
        </div>
      </div>
    )
  }

  return (
    <div className='logs-editorial-page'>
      {!isMobile && (
        <CommonLogsStats
          variant='strip'
          totalCount={totalCount}
          logs={logs as UsageLog[]}
        />
      )}
      <div ref={commonLogsCardRef} className='logs-editorial-card'>
        <DataTablePage
          table={table}
          compactPagination={isMobile}
          columns={columns as ColumnDef<Record<string, unknown>>[]}
          isLoading={isLoadingData}
          isFetching={isFetching}
          emptyTitle={t('No Logs Found')}
          emptyDescription={t(
            'No usage logs available. Logs will appear here once API calls are made.'
          )}
          skeletonKeyPrefix='usage-log-skeleton'
          applyHeaderSize
          fixedHeight={false}
          paginationInFooter={false}
          className='logs-editorial-table-page'
          tableClassName='logs-editorial-table-wrap'
          paginationClassName='logs-editorial-pagination'
          mobile={
            <div className='logs-editorial-mobile-body'>
              <UsageLogsMobileList
                table={table}
                isLoading={isLoadingData}
                logCategory={logCategory}
              />
            </div>
          }
          toolbar={<CommonLogsFilterBar table={table} editorial />}
          renderRow={(row) => {
            const logType = (row.original as Record<string, unknown>).type as
              | number
              | undefined
            let tintClass =
              logType != null ? (logTypeRowTint[logType] ?? '') : ''
            if (isAdmin) {
              const other = parseLogOther(
                ((row.original as Record<string, unknown>).other as string) ??
                  ''
              )
              if (other?.admin_info?.quota_saturation) {
                tintClass = quotaSaturationRowTint
              }
            }

            return (
              <DataTableRow
                key={row.id}
                row={row}
                className={cn('transition-colors', tintClass)}
                getColumnClassName={getColumnClassName}
                cellRenderColumns={table.options.columns}
              />
            )
          }}
        />
      </div>
    </div>
  )
}
const EMPTY_LOG_ITEMS: unknown[] = []
