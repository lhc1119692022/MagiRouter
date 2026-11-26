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
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useNavigate, getRouteApi } from '@tanstack/react-router'
import type { Table } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

import { TASK_STATUS } from '../constants'
import { buildSearchParams } from '../lib/filter'
import { getDefaultTimeRange } from '../lib/utils'
import type { DrawingLogFilters, LogCategory, TaskLogFilters } from '../types'
import { CompactDateTimeRangePicker } from './compact-date-time-range-picker'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from './logs-filter-toolbar'
import { useLogsViewScope } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

type TaskLikeLogCategory = Extract<LogCategory, 'drawing' | 'task'>
type TaskLogsFilters = DrawingLogFilters | TaskLogFilters

interface TaskLogsFilterBarProps<TData> {
  table: Table<TData>
  logCategory: TaskLikeLogCategory
  totalCount?: number
}

const TASK_STATUS_FILTER_OPTIONS = [
  { value: '', labelKey: 'All' },
  { value: TASK_STATUS.SUCCESS, labelKey: 'Success' },
  { value: TASK_STATUS.IN_PROGRESS, labelKey: 'In Progress' },
  { value: TASK_STATUS.QUEUED, labelKey: 'Queued' },
  { value: TASK_STATUS.FAILURE, labelKey: 'Failed' },
] as const

function getFilterValue(
  filters: TaskLogsFilters,
  logCategory: TaskLikeLogCategory
): string {
  if (logCategory === 'drawing') {
    return (filters as DrawingLogFilters).mjId || ''
  }
  return (filters as TaskLogFilters).taskId || ''
}

function setFilterValue(
  filters: TaskLogsFilters,
  logCategory: TaskLikeLogCategory,
  value: string
): TaskLogsFilters {
  if (logCategory === 'drawing') {
    return { ...filters, mjId: value }
  }
  return { ...filters, taskId: value }
}

export function TaskLogsFilterBar<TData>(props: TaskLogsFilterBarProps<TData>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchParams = route.useSearch()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const fetchingLogs = useIsFetching({ queryKey: ['logs'] })

  const [filters, setFilters] = useState<TaskLogsFilters>(() => {
    const { start, end } = getDefaultTimeRange()
    return { startTime: start, endTime: end }
  })

  useEffect(() => {
    const { start, end } = getDefaultTimeRange()
    const baseFilters = {
      startTime: searchParams.startTime
        ? new Date(searchParams.startTime)
        : start,
      endTime: searchParams.endTime ? new Date(searchParams.endTime) : end,
      ...(searchParams.channel
        ? { channel: String(searchParams.channel) }
        : {}),
    }
    const next: TaskLogsFilters =
      props.logCategory === 'drawing'
        ? {
            ...baseFilters,
            ...(searchParams.filter ? { mjId: searchParams.filter } : {}),
          }
        : {
            ...baseFilters,
            ...(searchParams.filter ? { taskId: searchParams.filter } : {}),
            ...(searchParams.status ? { status: searchParams.status } : {}),
          }

    setFilters(next)
  }, [
    props.logCategory,
    searchParams.startTime,
    searchParams.endTime,
    searchParams.channel,
    searchParams.filter,
    searchParams.status,
  ])

  const handleChange = useCallback(
    (field: keyof TaskLogsFilters, value: Date | string | undefined) => {
      setFilters((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  const handleApply = useCallback(() => {
    const filterParams = buildSearchParams(filters, props.logCategory)
    navigate({
      to: '/usage-logs/$section',
      params: { section: props.logCategory },
      search: {
        ...filterParams,
        page: 1,
      },
    })
    queryClient.invalidateQueries({ queryKey: ['logs'] })
  }, [filters, navigate, props.logCategory, queryClient])

  const handleReset = useCallback(() => {
    const { start, end } = getDefaultTimeRange()
    const resetFilters: TaskLogsFilters = { startTime: start, endTime: end }
    setFilters(resetFilters)

    navigate({
      to: '/usage-logs/$section',
      params: { section: props.logCategory },
      search: {
        page: 1,
        startTime: start.getTime(),
        endTime: end.getTime(),
      },
    })
    queryClient.invalidateQueries({ queryKey: ['logs'] })
  }, [navigate, props.logCategory, queryClient])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleApply()
    },
    [handleApply]
  )

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilters((prev) => setFilterValue(prev, props.logCategory, value))
    },
    [props.logCategory]
  )

  const handleStatusQuickSelect = useCallback(
    (nextStatus: string) => {
      const nextFilters: TaskLogFilters = {
        ...(filters as TaskLogFilters),
        status: nextStatus || undefined,
      }
      setFilters(nextFilters)
      const filterParams = buildSearchParams(nextFilters, props.logCategory)
      navigate({
        to: '/usage-logs/$section',
        params: { section: props.logCategory },
        search: {
          ...filterParams,
          page: 1,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    },
    [filters, navigate, props.logCategory, queryClient]
  )

  const filterValue = getFilterValue(filters, props.logCategory)
  const activeStatus =
    props.logCategory === 'task'
      ? ((filters as TaskLogFilters).status ?? '')
      : ''
  const placeholder =
    props.logCategory === 'drawing'
      ? t('Filter by MjProxy task ID')
      : t('Filter by task ID')
  const hasAdditionalFilters =
    !!filterValue || !!filters.channel || !!activeStatus
  const dateRangeFilter = (
    <LogsFilterField wide>
      <CompactDateTimeRangePicker
        start={filters.startTime}
        end={filters.endTime}
        onChange={({ start, end }) => {
          handleChange('startTime', start)
          handleChange('endTime', end)
        }}
      />
    </LogsFilterField>
  )
  const taskIdFilter = (
    <LogsFilterField>
      <LogsFilterInput
        aria-label={t('Task ID')}
        placeholder={placeholder}
        value={filterValue}
        onChange={(e) => handleFilterChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </LogsFilterField>
  )
  const statusComboboxFilter =
    props.logCategory === 'task' ? (
      <LogsFilterField>
        <Combobox
          options={TASK_STATUS_FILTER_OPTIONS.map((option) => ({
            value: option.value || 'all',
            label: option.value === '' ? t('All statuses') : t(option.labelKey),
          }))}
          value={activeStatus || 'all'}
          onValueChange={(value) => {
            if (value !== null) {
              handleStatusQuickSelect(value === 'all' ? '' : value)
            }
          }}
          aria-label={t('Status')}
          className='w-full'
        />
      </LogsFilterField>
    ) : null
  const channelFilter = isAdmin ? (
    <LogsFilterField>
      <LogsFilterInput
        placeholder={t('Channel ID')}
        value={filters.channel || ''}
        onChange={(e) => handleChange('channel', e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </LogsFilterField>
  ) : null

  const editorialQuickSearch = (
    <>
      <div className='catalog-search-wrap'>
        <span className='catalog-search-icon' aria-hidden='true'>
          <Search className='size-3.5' />
        </span>
        <input
          type='search'
          aria-label={t('Task ID')}
          className='logs-editorial-search-input'
          placeholder={placeholder}
          value={filterValue}
          onChange={(e) => handleFilterChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {props.logCategory === 'task' && (
        <div
          className='keys-status-pills'
          role='group'
          aria-label={t('Filter by task status')}
        >
          {TASK_STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value || 'all'}
              type='button'
              className={cn(
                'keys-status-pill',
                activeStatus === option.value && 'is-active'
              )}
              onClick={() => handleStatusQuickSelect(option.value)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      )}
    </>
  )

  return (
    <LogsFilterToolbar
      table={props.table}
      variant='editorial'
      editorialTopLeft={editorialQuickSearch}
      editorialTopRight={
        props.totalCount !== undefined ? (
          <span className='console-head-meta tabular-nums'>
            {t('{{count}} records', { count: props.totalCount })}
          </span>
        ) : undefined
      }
      primaryFilters={
        <>
          {dateRangeFilter}
          {channelFilter}
        </>
      }
      mobilePinnedFilters={dateRangeFilter}
      mobileFilters={
        <>
          {taskIdFilter}
          {statusComboboxFilter}
          {channelFilter}
        </>
      }
      mobileFilterCount={
        [filterValue, filters.channel, activeStatus].filter(Boolean).length
      }
      hasActiveFilters={hasAdditionalFilters}
      onSearch={handleApply}
      searchLoading={fetchingLogs > 0}
      onReset={handleReset}
    />
  )
}
