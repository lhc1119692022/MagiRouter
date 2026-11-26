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
import { useQueryClient, useIsFetching, useQuery } from '@tanstack/react-query'
import { useNavigate, getRouteApi } from '@tanstack/react-router'
import type { Table } from '@tanstack/react-table'
import {
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableViewOptions } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getGroups } from '@/features/users/api'
import { useMediaQuery } from '@/hooks'
import { getUserGroups } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  LOG_TYPE_ALL_VALUE,
  LOG_TYPE_ENUM,
  LOG_TYPE_FILTERS,
} from '../constants'
import { buildSearchParams } from '../lib/filter'
import { getDefaultTimeRange } from '../lib/utils'
import type { CommonLogFilters } from '../types'
import { CommonLogsStats } from './common-logs-stats'
import { CompactDateTimeRangePicker } from './compact-date-time-range-picker'
import { ExportLogsDialog } from './dialogs/export-logs-dialog'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from './logs-filter-toolbar'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

type LogTypeValue = (typeof LOG_TYPE_FILTERS)[number]['value']
const logTypeValueSet = new Set<string>(
  LOG_TYPE_FILTERS.map((type) => type.value)
)

type CommonLogDraft = {
  sourceKey: string
  filters: CommonLogFilters
  logType: LogTypeValue
}

function isLogTypeValue(value: string): value is LogTypeValue {
  return logTypeValueSet.has(value)
}

function getLogTypeValue(value: unknown): LogTypeValue {
  return Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === 'string' &&
    isLogTypeValue(value[0])
    ? value[0]
    : LOG_TYPE_ALL_VALUE
}

function buildSearchSourceKey(values: {
  startTime?: unknown
  endTime?: unknown
  channel?: unknown
  model?: unknown
  token?: unknown
  group?: unknown
  username?: unknown
  requestId?: unknown
  upstreamRequestId?: unknown
  type?: unknown
}) {
  return [
    values.startTime,
    values.endTime,
    values.channel,
    values.model,
    values.token,
    values.group,
    values.username,
    values.requestId,
    values.upstreamRequestId,
    Array.isArray(values.type) ? values.type.join(',') : values.type,
  ]
    .map((value) => String(value ?? ''))
    .join('\u001f')
}

interface CommonLogsFilterBarProps<TData> {
  table: Table<TData>
  editorial?: boolean
}

export function CommonLogsFilterBar<TData>(
  props: CommonLogsFilterBarProps<TData>
) {
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchParams = route.useSearch()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const { sensitiveVisible, setSensitiveVisible } = useUsageLogsContext()
  const fetchingLogs = useIsFetching({ queryKey: ['logs'] })
  const { data: adminGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => requireServerSuccess(await getGroups()),
    enabled: isAdmin,
  })
  const { data: userGroups } = useQuery({
    queryKey: ['user-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
    enabled: !isAdmin,
  })
  const groupOptions = useMemo(() => {
    const groups = isAdmin
      ? (adminGroups?.data ?? [])
      : Object.keys(userGroups?.data ?? {})
    return groups
      .filter((group) => group !== 'auto')
      .map((group) => ({ label: group, value: group }))
  }, [isAdmin, adminGroups, userGroups])

  const searchState = useMemo<CommonLogDraft>(() => {
    const { start, end } = getDefaultTimeRange()
    const sourceValues = {
      startTime: searchParams.startTime,
      endTime: searchParams.endTime,
      channel: searchParams.channel,
      model: searchParams.model,
      token: searchParams.token,
      group: searchParams.group,
      username: searchParams.username,
      requestId: searchParams.requestId,
      upstreamRequestId: searchParams.upstreamRequestId,
      type: searchParams.type,
    }
    const filters: CommonLogFilters = {
      startTime: searchParams.startTime
        ? new Date(searchParams.startTime)
        : start,
      endTime: searchParams.endTime ? new Date(searchParams.endTime) : end,
      channel: searchParams.channel || undefined,
      model: searchParams.model || undefined,
      token: searchParams.token || undefined,
      group: searchParams.group || undefined,
      username: searchParams.username || undefined,
      requestId: searchParams.requestId || undefined,
      upstreamRequestId: searchParams.upstreamRequestId || undefined,
    }
    return {
      sourceKey: buildSearchSourceKey(sourceValues),
      filters,
      logType: getLogTypeValue(searchParams.type),
    }
  }, [
    searchParams.startTime,
    searchParams.endTime,
    searchParams.channel,
    searchParams.model,
    searchParams.token,
    searchParams.group,
    searchParams.username,
    searchParams.requestId,
    searchParams.upstreamRequestId,
    searchParams.type,
  ])
  const [draft, setDraft] = useState<CommonLogDraft>(() => searchState)
  const activeDraft =
    draft.sourceKey === searchState.sourceKey ? draft : searchState
  const filters = activeDraft.filters
  const logType = activeDraft.logType

  const handleChange = useCallback(
    (field: keyof CommonLogFilters, value: Date | string | undefined) => {
      setDraft((current) => {
        const base =
          current.sourceKey === searchState.sourceKey ? current : searchState
        return {
          sourceKey: searchState.sourceKey,
          filters: { ...base.filters, [field]: value },
          logType: base.logType,
        }
      })
    },
    [searchState]
  )

  const handleApply = useCallback(
    (
      nextFilters: CommonLogFilters = filters,
      nextLogType: LogTypeValue = logType
    ) => {
      const filterParams = buildSearchParams(nextFilters, 'common')
      navigate({
        to: '/usage-logs/$section',
        params: { section: 'common' },
        search: {
          ...filterParams,
          type: [nextLogType],
          page: 1,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      queryClient.invalidateQueries({ queryKey: ['usage-logs-stats'] })
    },
    [filters, logType, navigate, queryClient]
  )

  const handleReset = useCallback(() => {
    const { start, end } = getDefaultTimeRange()
    const resetFilters: CommonLogFilters = { startTime: start, endTime: end }
    const resetSearch = {
      type: [LOG_TYPE_ALL_VALUE],
      startTime: start.getTime(),
      endTime: end.getTime(),
    }
    setDraft({
      sourceKey: buildSearchSourceKey(resetSearch),
      filters: resetFilters,
      logType: LOG_TYPE_ALL_VALUE,
    })

    navigate({
      to: '/usage-logs/$section',
      params: { section: 'common' },
      search: {
        page: 1,
        ...resetSearch,
      },
    })
    queryClient.invalidateQueries({ queryKey: ['logs'] })
    queryClient.invalidateQueries({ queryKey: ['usage-logs-stats'] })
  }, [navigate, queryClient])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleApply()
    },
    [handleApply]
  )

  const hasExpandedFilters =
    !!filters.token ||
    (isAdmin && !!filters.username) ||
    (isAdmin && !!filters.channel) ||
    !!filters.requestId ||
    (isAdmin && !!filters.upstreamRequestId)

  const hasTypeFilter = logType !== LOG_TYPE_ALL_VALUE
  const hasAdditionalFilters =
    !!filters.model || !!filters.group || hasTypeFilter || hasExpandedFilters

  const expandedFilterCount = [
    filters.token,
    isAdmin ? filters.username : undefined,
    isAdmin ? filters.channel : undefined,
    filters.requestId,
    isAdmin ? filters.upstreamRequestId : undefined,
  ].filter(Boolean).length
  const [advancedOpen, setAdvancedOpen] = useState(hasExpandedFilters)
  const sensitiveInputClass = sensitiveVisible
    ? undefined
    : '[-webkit-text-security:disc]'
  const logTypeItems = useMemo(
    () =>
      LOG_TYPE_FILTERS.map((type) => ({
        value: type.value,
        label: t(type.label),
        deprecated: type.deprecated,
      })),
    [t]
  )
  const selectedLogType = logTypeItems.find((type) => type.value === logType)
  const deprecatedTypeDescription = t(
    'Only used to find historical logs. New records are available in Audit Logs.'
  )

  const statsBar = <CommonLogsStats />
  const sensitiveToggle = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='ghost'
            size='icon'
            onClick={() => setSensitiveVisible(!sensitiveVisible)}
            aria-label={sensitiveVisible ? t('Hide') : t('Show')}
            className='text-muted-foreground hover:text-foreground size-7 max-sm:size-11'
          />
        }
      >
        {sensitiveVisible ? <Eye /> : <EyeOff />}
      </TooltipTrigger>
      <TooltipContent>
        {sensitiveVisible ? t('Hide') : t('Show')}
      </TooltipContent>
    </Tooltip>
  )

  const dateRangeFilter = (
    <LogsFilterField wide>
      <CompactDateTimeRangePicker
        start={filters.startTime}
        end={filters.endTime}
        onChange={({ start, end }) => {
          handleChange('startTime', start)
          handleChange('endTime', end)
          if (isMobile) {
            handleApply({ ...filters, startTime: start, endTime: end })
          }
        }}
      />
    </LogsFilterField>
  )
  const modelFilter = (
    <LogsFilterField>
      <LogsFilterInput
        placeholder={t('Model Name')}
        value={filters.model || ''}
        onChange={(e) => handleChange('model', e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </LogsFilterField>
  )
  const groupFilter = (
    <LogsFilterField className={sensitiveInputClass}>
      <Combobox
        options={groupOptions}
        allowCustomValue
        aria-label={t('Group')}
        emptyText={t('No group found.')}
        placeholder={t('Group')}
        className='h-8 min-w-0 text-sm leading-5'
        popupClassName={sensitiveInputClass}
        value={filters.group || ''}
        onValueChange={(value) => handleChange('group', value ?? '')}
        onKeyDown={handleKeyDown}
      />
    </LogsFilterField>
  )
  const typeFilter = (
    <LogsFilterField>
      <Select
        items={logTypeItems}
        value={logType}
        onValueChange={(value) => {
          const nextLogType =
            value !== null && isLogTypeValue(value) ? value : LOG_TYPE_ALL_VALUE
          setDraft((current) => {
            const base =
              current.sourceKey === searchState.sourceKey
                ? current
                : searchState
            return {
              sourceKey: searchState.sourceKey,
              filters: base.filters,
              logType: nextLogType,
            }
          })
        }}
      >
        <SelectTrigger
          aria-label={t('Type')}
          aria-description={
            selectedLogType?.deprecated ? deprecatedTypeDescription : undefined
          }
        >
          <SelectValue className='min-w-0'>
            <span className='truncate'>
              {selectedLogType?.label ?? t('All Types')}
            </span>
            {selectedLogType?.deprecated && (
              <Badge
                variant='secondary'
                className='h-4 px-1.5 text-[10px] font-normal'
                title={deprecatedTypeDescription}
              >
                {t('Deprecated')}
              </Badge>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          className='max-w-[calc(100vw-2rem)] min-w-52'
        >
          <SelectGroup>
            {LOG_TYPE_FILTERS.map((type) => (
              <SelectItem
                key={type.value}
                value={type.value}
                className='[&_[data-slot=select-item-text]]:items-center'
                aria-description={
                  type.deprecated ? deprecatedTypeDescription : undefined
                }
              >
                {t(type.label)}
                {type.deprecated && (
                  <Badge
                    variant='secondary'
                    className='h-4 px-1.5 text-[10px] font-normal'
                    title={deprecatedTypeDescription}
                  >
                    {t('Deprecated')}
                  </Badge>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </LogsFilterField>
  )
  const advancedFilters = (
    <>
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Token Name')}
          className={sensitiveInputClass}
          value={filters.token || ''}
          onChange={(e) => handleChange('token', e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      {isAdmin && (
        <LogsFilterField>
          <LogsFilterInput
            placeholder={t('Username')}
            className={sensitiveInputClass}
            value={filters.username || ''}
            onChange={(e) => handleChange('username', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </LogsFilterField>
      )}
      {isAdmin && (
        <LogsFilterField>
          <LogsFilterInput
            placeholder={t('Channel ID')}
            value={filters.channel || ''}
            onChange={(e) => handleChange('channel', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </LogsFilterField>
      )}
      <LogsFilterField>
        <LogsFilterInput
          placeholder={t('Request ID')}
          value={filters.requestId || ''}
          onChange={(e) => handleChange('requestId', e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </LogsFilterField>
      {isAdmin && (
        <LogsFilterField>
          <LogsFilterInput
            placeholder={t('Upstream Request ID')}
            value={filters.upstreamRequestId || ''}
            onChange={(e) => handleChange('upstreamRequestId', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </LogsFilterField>
      )}
    </>
  )

  const quickLogTypePills = useMemo(
    () => [
      { value: LOG_TYPE_ALL_VALUE as LogTypeValue, label: t('All') },
      { value: String(LOG_TYPE_ENUM.CONSUME) as LogTypeValue, label: t('Consume') },
      { value: String(LOG_TYPE_ENUM.ERROR) as LogTypeValue, label: t('Error') },
    ],
    [t]
  )

  const handleQuickLogType = useCallback(
    (nextType: LogTypeValue) => {
      setDraft((current) => {
        const base =
          current.sourceKey === searchState.sourceKey ? current : searchState
        return {
          sourceKey: searchState.sourceKey,
          filters: base.filters,
          logType: nextType,
        }
      })
      handleApply(filters, nextType)
    },
    [filters, handleApply, searchState]
  )

  if (props.editorial && !isMobile) {
    return (
      <div className='logs-editorial-toolbar'>
        <div className='logs-editorial-toolbar-main'>
          <div className='logs-editorial-toolbar-left'>
            <div className='catalog-search-wrap'>
              <span className='catalog-search-icon' aria-hidden='true'>
                <Search className='size-3.5' />
              </span>
              <input
                type='search'
                className='logs-editorial-search-input'
                placeholder={t('Model Name')}
                aria-label={t('Model Name')}
                value={filters.model || ''}
                onChange={(e) => handleChange('model', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div
              className='keys-status-pills'
              role='group'
              aria-label={t('Filter by log type')}
            >
              {quickLogTypePills.map((pill) => (
                <button
                  key={pill.value}
                  type='button'
                  className={cn(
                    'keys-status-pill',
                    logType === pill.value && 'is-active'
                  )}
                  aria-pressed={logType === pill.value}
                  onClick={() => handleQuickLogType(pill.value)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
          <div className='logs-editorial-toolbar-right'>
            <div className='logs-editorial-date-wrap'>
              <CompactDateTimeRangePicker
                start={filters.startTime}
                end={filters.endTime}
                onChange={({ start, end }) => {
                  handleChange('startTime', start)
                  handleChange('endTime', end)
                }}
              />
            </div>
            <div className={cn('w-[114px] min-w-0', sensitiveInputClass)}>
              <Combobox
                options={groupOptions}
                allowCustomValue
                aria-label={t('Group')}
                emptyText={t('No group found.')}
                placeholder={t('Group')}
                className='h-[34px] min-w-0 rounded-full text-xs leading-5'
                popupClassName={sensitiveInputClass}
                value={filters.group || ''}
                onValueChange={(value) => handleChange('group', value ?? '')}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className='w-[104px] min-w-0'>
              <Select
                items={logTypeItems}
                value={logType}
                onValueChange={(value) => {
                  const nextLogType =
                    value !== null && isLogTypeValue(value)
                      ? value
                      : LOG_TYPE_ALL_VALUE
                  setDraft((current) => {
                    const base =
                      current.sourceKey === searchState.sourceKey
                        ? current
                        : searchState
                    return {
                      sourceKey: searchState.sourceKey,
                      filters: base.filters,
                      logType: nextLogType,
                    }
                  })
                }}
              >
                <SelectTrigger
                  aria-label={t('Type')}
                  aria-description={
                    selectedLogType?.deprecated
                      ? deprecatedTypeDescription
                      : undefined
                  }
                  className='w-full'
                >
                  <SelectValue className='min-w-0'>
                    <span className='truncate'>
                      {selectedLogType?.label ?? t('All Types')}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className='max-w-[calc(100vw-2rem)] min-w-52'
                >
                  <SelectGroup>
                    {LOG_TYPE_FILTERS.map((type) => (
                      <SelectItem
                        key={type.value}
                        value={type.value}
                        className='[&_[data-slot=select-item-text]]:items-center'
                        aria-description={
                          type.deprecated
                            ? deprecatedTypeDescription
                            : undefined
                        }
                      >
                        {t(type.label)}
                        {type.deprecated && (
                          <Badge
                            variant='secondary'
                            className='h-4 px-1.5 text-[10px] font-normal'
                            title={deprecatedTypeDescription}
                          >
                            {t('Deprecated')}
                          </Badge>
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              className='h-[34px] gap-1 rounded-full px-2.5 text-xs'
            >
              <span>{advancedOpen ? t('Collapse') : t('Expand')}</span>
              {expandedFilterCount > 0 && (
                <Badge className='size-4 justify-center p-0 text-[10px]'>
                  {expandedFilterCount}
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  'size-3.5 transition-transform duration-200',
                  advancedOpen && 'rotate-180'
                )}
              />
            </Button>
            {sensitiveToggle}
            {hasAdditionalFilters && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={handleReset}
                className='h-[34px] gap-1 rounded-full px-2.5 text-xs'
              >
                <RotateCcw className='size-3.5' />
                {t('Reset')}
              </Button>
            )}
            <Button
              type='button'
              size='sm'
              onClick={() => handleApply()}
              disabled={fetchingLogs > 0}
              aria-busy={fetchingLogs > 0}
              className='h-[34px] rounded-full px-3.5 text-xs'
            >
              {fetchingLogs > 0 ? (
                <Loader2 className='size-3.5 animate-spin' />
              ) : null}
              {t('Search')}
            </Button>
            <div className='logs-editorial-view-wrap'>
              <DataTableViewOptions table={props.table} />
            </div>
          </div>
        </div>
        {advancedOpen && (
          <div className='logs-editorial-toolbar-advanced'>
            {advancedFilters}
          </div>
        )}
      </div>
    )
  }

  return (
    <LogsFilterToolbar
      table={props.table}
      compactMobile
      className={props.editorial ? 'logs-editorial-mobile-toolbar' : undefined}
      stats={statsBar}
      actionStart={sensitiveToggle}
      actionEnd={<ExportLogsDialog />}
      primaryFilters={
        <>
          {dateRangeFilter}
          {modelFilter}
          {groupFilter}
          {typeFilter}
        </>
      }
      advancedFilters={advancedFilters}
      mobilePinnedFilters={dateRangeFilter}
      mobileFilters={
        <>
          {modelFilter}
          {groupFilter}
          {typeFilter}
          {advancedFilters}
        </>
      }
      mobileFilterCount={
        [filters.model, filters.group, hasTypeFilter].filter(Boolean).length +
        expandedFilterCount
      }
      hasAdvancedActiveFilters={hasExpandedFilters}
      advancedFilterCount={expandedFilterCount}
      hasActiveFilters={hasAdditionalFilters}
      onSearch={() => handleApply()}
      searchLoading={fetchingLogs > 0}
      onReset={handleReset}
    />
  )
}
