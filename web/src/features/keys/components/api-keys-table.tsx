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
import { flexRender, type Table as TanstackTable } from '@tanstack/react-table'
import { Database, KeyRound, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DISABLED_ROW_DESKTOP,
  DISABLED_ROW_MOBILE,
  DataTablePage,
  DataTableViewOptions,
  useDebouncedColumnFilter,
  useDataTable,
} from '@/components/data-table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { getUserGroups } from '@/lib/api'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getApiKeys, searchApiKeys } from '../api'
import {
  API_KEY_STATUS,
  API_KEY_STATUS_OPTIONS,
  API_KEY_STATUSES,
  ERROR_MESSAGES,
} from '../constants'
import type { ApiKey } from '../types'
import { ApiAddressesBar } from './api-addresses-bar'
import { ApiKeyQuotaCell } from './api-key-quota-cell'
import { ApiKeyActivityCell } from './api-key-timestamp-cell'
import {
  ApiKeyCell,
  ModelLimitsCell,
  IpRestrictionsCell,
} from './api-keys-cells'
import { useApiKeysColumns } from './api-keys-columns'
import { useApiKeys } from './api-keys-provider'
import { DataTableBulkActions } from './data-table-bulk-actions'
import { DataTableRowActions } from './data-table-row-actions'

const route = getRouteApi('/_authenticated/keys/')
const API_KEYS_COLUMN_VISIBILITY_STORAGE_KEY = 'api-keys:column-visibility'
const EMPTY_API_KEYS: ApiKey[] = []
const API_KEYS_MOBILE_SKELETON_IDS = Array.from(
  { length: 5 },
  (_, index) => `api-key-mobile-skeleton-${index + 1}`
)

function isDisabledApiKeyRow(apiKey: ApiKey) {
  return apiKey.status !== API_KEY_STATUS.ENABLED
}

function getMobileStatusTagClassName(status: number): string {
  if (status === API_KEY_STATUS.ENABLED) return 'key-status-tag is-enabled'
  if (status === API_KEY_STATUS.DISABLED) return 'key-status-tag is-disabled'
  if (status === API_KEY_STATUS.EXPIRED) return 'key-status-tag is-expired'
  return 'key-status-tag is-exhausted'
}

function ApiKeysMobileSkeleton() {
  return (
    <div className='min-w-0 space-y-3'>
      {API_KEYS_MOBILE_SKELETON_IDS.map((id) => (
        <div key={id} className='keys-mobile-card space-y-2'>
          <div className='flex items-center justify-between'>
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-5 w-16 rounded-md' />
          </div>
          <div className='flex items-center justify-between gap-3'>
            <Skeleton className='h-7 w-44' />
            <Skeleton className='h-8 w-16' />
          </div>
          <Skeleton className='h-3 w-28' />
        </div>
      ))}
    </div>
  )
}

function ApiKeysMobileList({
  table,
  isLoading,
  now,
}: {
  table: TanstackTable<ApiKey>
  isLoading: boolean
  now: number
}) {
  const { t } = useTranslation()
  const rows = table.getRowModel().rows

  if (isLoading) return <ApiKeysMobileSkeleton />

  if (!rows.length) {
    return (
      <div className='py-8'>
        <Empty className='border-none p-0'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Database className='size-6' />
            </EmptyMedia>
            <EmptyTitle>{t('No API Keys Found')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'No API keys available. Create your first API key to get started.'
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className='min-w-0 space-y-3'>
      {rows.map((row) => {
        const apiKey = row.original
        const statusConfig = API_KEY_STATUSES[apiKey.status]
        const groupCell = row
          .getAllCells()
          .find((cell) => cell.column.id === 'group')
        const expiryCell = row
          .getAllCells()
          .find((cell) => cell.column.id === 'expired_time')

        return (
          <div
            key={row.id}
            className={cn(
              'keys-mobile-card min-w-0 space-y-2 text-xs leading-4',
              isDisabledApiKeyRow(apiKey) && DISABLED_ROW_MOBILE
            )}
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='text-sm leading-5 font-semibold break-words'>
                  {apiKey.name}
                </div>
              </div>
              {statusConfig && (
                <span
                  className={cn(
                    getMobileStatusTagClassName(apiKey.status),
                    'shrink-0'
                  )}
                >
                  <span className='key-status-dot' aria-hidden='true' />
                  <span>{t(statusConfig.label)}</span>
                </span>
              )}
            </div>

            <div className='flex min-w-0 items-center justify-between gap-2'>
              <div className='min-w-0 flex-1 [&_button:first-child]:max-w-full [&_button:first-child]:truncate [&_button:first-child]:px-0'>
                <ApiKeyCell apiKey={apiKey} />
              </div>
              <DataTableRowActions row={row} />
            </div>

            <div className='min-w-0 space-y-3 py-1'>
              <div className='min-w-0'>
                {groupCell &&
                  flexRender(
                    groupCell.column.columnDef.cell,
                    groupCell.getContext()
                  )}
              </div>
              <ApiKeyQuotaCell apiKey={apiKey} now={now} variant='card' />
            </div>

            <div className='flex flex-wrap items-center gap-x-5 gap-y-1'>
              <ModelLimitsCell apiKey={apiKey} detailsTrigger='click' />
              <IpRestrictionsCell apiKey={apiKey} detailsTrigger='click' />
            </div>

            <div className='grid grid-cols-3 items-start gap-3 border-t pt-2'>
              <div className='col-span-2 min-w-0'>
                <ApiKeyActivityCell
                  apiKey={apiKey}
                  now={now}
                  layout='columns'
                />
              </div>
              <div className='min-w-0 space-y-1 [&_[data-slot=status-badge]]:text-xs [&_[data-slot=status-badge]]:font-normal'>
                <div className='text-muted-foreground'>{t('Expires')}</div>
                {expiryCell &&
                  flexRender(
                    expiryCell.column.columnDef.cell,
                    expiryCell.getContext()
                  )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ApiKeysTable() {
  const { t } = useTranslation()
  const { refreshTrigger, setTotalKeysCount } = useApiKeys()
  const [now, setNow] = useState(() => Date.now())
  const columns = useApiKeysColumns(now)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 30_000)

    return () => window.clearInterval(intervalId)
  }, [])

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: '_tokenSearch', searchKey: 'token', type: 'string' },
    ],
  })

  const {
    value: tokenFilter,
    inputValue: tokenFilterInput,
    setInputValue: setTokenFilterInput,
  } = useDebouncedColumnFilter({
    columnFilters,
    columnId: '_tokenSearch',
    onColumnFiltersChange,
  })

  const [nameSearchInput, setNameSearchInput] = useState(globalFilter ?? '')
  const nameSearchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setNameSearchInput(globalFilter ?? '')
  }, [globalFilter])

  useEffect(() => {
    return () => clearTimeout(nameSearchDebounceRef.current)
  }, [])

  const handleNameSearchChange = (value: string) => {
    setNameSearchInput(value)
    clearTimeout(nameSearchDebounceRef.current)
    nameSearchDebounceRef.current = setTimeout(() => {
      onGlobalFilterChange?.(value)
    }, 500)
  }

  const { data: userGroupsResponse } = useQuery({
    queryKey: ['user-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
    staleTime: 0,
  })

  const shouldSearch = Boolean(globalFilter?.trim() || tokenFilter.trim())

  // Fetch data with React Query
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'keys',
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      tokenFilter,
      refreshTrigger,
    ],
    queryFn: async () => {
      const result = shouldSearch
        ? await searchApiKeys({
            keyword: globalFilter,
            token: tokenFilter,
            p: pagination.pageIndex + 1,
            size: pagination.pageSize,
          })
        : await getApiKeys({
            p: pagination.pageIndex + 1,
            size: pagination.pageSize,
          })

      if (!result.success) {
        throw createServerError(
          result,
          t(
            shouldSearch
              ? ERROR_MESSAGES.SEARCH_FAILED
              : ERROR_MESSAGES.LOAD_FAILED
          )
        )
      }

      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const apiKeys = data?.items ?? EMPTY_API_KEYS

  useEffect(() => {
    if (!shouldSearch && data !== undefined) {
      setTotalKeysCount(data.total)
    }
  }, [data, shouldSearch, setTotalKeysCount])

  const groupFilterOptions = useMemo(() => {
    const seen = new Set<string>()
    if (userGroupsResponse?.success && userGroupsResponse.data) {
      for (const group of Object.keys(userGroupsResponse.data)) {
        if (group) seen.add(group)
      }
    }
    for (const item of apiKeys) {
      if (item.group) seen.add(item.group)
    }
    return [...seen]
  }, [userGroupsResponse, apiKeys])

  const groupSelectItems = useMemo(
    () => [
      { value: 'all', label: t('All Groups') },
      ...groupFilterOptions.map((group) => ({
        value: group,
        label: group === 'auto' ? t('Auto') : group,
      })),
    ],
    [groupFilterOptions, t]
  )

  const { table } = useDataTable({
    data: apiKeys,
    columns,
    enableRowSelection: true,
    columnFilters,
    columnVisibilityStorageKey: API_KEYS_COLUMN_VISIBILITY_STORAGE_KEY,
    globalFilter,
    pagination,
    globalFilterFn: () => true,
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    manualPagination: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  const columnVisibility = table.getState().columnVisibility
  useEffect(() => {
    // Restore the dates hidden by the previous default when adopting the combined time column.
    if (
      columnVisibility.activity_time === undefined &&
      columnVisibility.created_time === false &&
      columnVisibility.accessed_time === false &&
      columnVisibility.expired_time === false
    ) {
      table.setColumnVisibility((previous) => ({
        ...previous,
        activity_time: true,
        expired_time: true,
      }))
    }
  }, [columnVisibility, table])

  const statusColumn = table.getColumn('status')
  const activeStatusValues =
    (statusColumn?.getFilterValue() as string[] | undefined) ?? []
  const activeStatus = activeStatusValues[0] ?? 'all'

  const groupColumn = table.getColumn('group')
  const activeGroup =
    (groupColumn?.getFilterValue() as string | undefined) || 'all'

  const hasActiveFilters = Boolean(
    nameSearchInput.trim() ||
    tokenFilterInput.trim() ||
    activeStatus !== 'all' ||
    activeGroup !== 'all'
  )

  const handleResetFilters = () => {
    clearTimeout(nameSearchDebounceRef.current)
    setNameSearchInput('')
    onGlobalFilterChange?.('')
    setTokenFilterInput('')
    table.resetColumnFilters()
  }

  const editorialToolbar = (
    <div className='keys-editorial-toolbar'>
      <div className='keys-editorial-toolbar-left'>
        <div className='keys-editorial-search-wrap'>
          <span className='keys-editorial-search-icon' aria-hidden='true'>
            <Search className='size-3.5' />
          </span>
          <input
            type='search'
            className='keys-editorial-search-input'
            placeholder={t('Filter by name...')}
            aria-label={t('Filter by name...')}
            value={nameSearchInput}
            onChange={(event) => handleNameSearchChange(event.target.value)}
          />
        </div>

        <div className='keys-editorial-search-wrap'>
          <span className='keys-editorial-search-icon' aria-hidden='true'>
            <KeyRound className='size-3.5' />
          </span>
          <input
            type='search'
            className='keys-editorial-search-input keys-editorial-search-input-key'
            placeholder={t('Filter by API key...')}
            aria-label={t('Filter by API key...')}
            value={tokenFilterInput}
            onChange={(event) => setTokenFilterInput(event.target.value)}
          />
        </div>

        <div
          className='keys-status-pills'
          role='group'
          aria-label={t('Filter by status')}
        >
          <button
            type='button'
            className={cn(
              'keys-status-pill',
              activeStatus === 'all' && 'is-active'
            )}
            onClick={() => statusColumn?.setFilterValue(undefined)}
          >
            {t('All')}
          </button>
          {API_KEY_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type='button'
              className={cn(
                'keys-status-pill',
                activeStatus === option.value && 'is-active'
              )}
              onClick={() =>
                statusColumn?.setFilterValue(
                  activeStatus === option.value ? undefined : [option.value]
                )
              }
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </div>

      <div className='keys-editorial-toolbar-right'>
        {groupFilterOptions.length > 0 && (
          <Select
            items={groupSelectItems}
            value={activeGroup}
            onValueChange={(value) => {
              if (!value || value === 'all') {
                groupColumn?.setFilterValue(undefined)
              } else {
                groupColumn?.setFilterValue(value)
              }
            }}
          >
            <SelectTrigger
              aria-label={t('Filter by group')}
              className='keys-group-filter-trigger'
            >
              <SelectValue placeholder={t('All Groups')} />
            </SelectTrigger>
            <SelectContent align='end'>
              {groupSelectItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-ghost'
            onClick={handleResetFilters}
          >
            {t('Reset')}
          </button>
        )}

        <div className='keys-editorial-view-wrap hidden sm:block'>
          <DataTableViewOptions table={table} />
        </div>
      </div>
    </div>
  )

  return (
    <div className='keys-editorial-page'>
      <ApiAddressesBar />
      <div className='keys-editorial-card'>
        <DataTablePage
          table={table}
          columns={columns}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyTitle={t('No API Keys Found')}
          emptyDescription={t(
            'No API keys available. Create your first API key to get started.'
          )}
          skeletonKeyPrefix='api-keys-skeleton'
          applyHeaderSize
          fixedHeight={false}
          paginationInFooter={false}
          className='keys-editorial-table-page'
          tableClassName='keys-editorial-table-wrap'
          paginationClassName='keys-editorial-pagination'
          toolbar={editorialToolbar}
          beforeTable={<DataTableBulkActions table={table} />}
          mobile={
            <div className='keys-editorial-mobile-body'>
              <ApiKeysMobileList
                table={table}
                isLoading={isLoading}
                now={now}
              />
            </div>
          }
          getRowClassName={(row) =>
            isDisabledApiKeyRow(row.original) ? DISABLED_ROW_DESKTOP : undefined
          }
        />
      </div>
    </div>
  )
}
