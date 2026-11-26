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
import { isAxiosError } from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import dayjs from '@/lib/dayjs'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import {
  LogsStatStrip,
  type LogsStatItem,
} from '../../components/logs-editorial-primitives'

import '../../logs-editorial.css'
import { getAuditLogs, type AuditFilters, type AuditLog } from '../api'
import { buildAuditDetails } from '../lib/audit-details'
import { useAuditLogColumns } from './audit-log-columns'
import { AuditLogFilterBar } from './audit-log-filter-bar'

const EMPTY_LOGS: AuditLog[] = []

export interface AuditExportState {
  count: number
  exportCsv: (() => void) | null
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function AuditLogViewer(props: {
  scope: 'all' | 'self'
  accessOnly?: boolean
  currentTokenRef?: string
  // The token scope the viewer opens with and returns to on reset.
  defaultTokenScope?: 'all' | 'current'
  onAccessDenied?: () => Promise<void>
  onExportStateChange?: (state: AuditExportState) => void
}) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const [filters, setFilters] = useState<AuditFilters>({ p: 1, page_size: 20 })
  const defaultTokenScope = props.defaultTokenScope ?? 'all'
  const [tokenScope, setTokenScope] = useState<string>(defaultTokenScope)
  const params = { ...filters }
  if (props.accessOnly) params.category = 'access_token'
  if (tokenScope === 'current') params.token_ref = props.currentTokenRef
  if (tokenScope === 'historical') {
    params.exclude_token_ref = props.currentTokenRef
  }
  const canQuery =
    tokenScope === 'all' ||
    (props.currentTokenRef !== undefined &&
      (tokenScope === 'historical' || !!props.currentTokenRef))
  const invalidRange =
    filters.start_timestamp !== undefined &&
    filters.end_timestamp !== undefined &&
    filters.start_timestamp > filters.end_timestamp
  const query = useQuery({
    queryKey: ['audit', userId, props.scope, params],
    queryFn: async () =>
      requireServerSuccess(await getAuditLogs(props.scope, params)),
    enabled: canQuery && !invalidRange,
    retry: false,
  })
  const accessDenied =
    props.scope === 'all' &&
    isAxiosError(query.error) &&
    query.error.response?.status === 403
  const onAccessDenied = props.onAccessDenied
  useEffect(() => {
    if (accessDenied) void onAccessDenied?.()
  }, [accessDenied, onAccessDenied])
  const items =
    canQuery && !query.isError ? (query.data?.items ?? EMPTY_LOGS) : EMPTY_LOGS
  const totalCount = query.isError ? 0 : (query.data?.total ?? 0)

  const exportCsv = useCallback(() => {
    if (!items.length) return
    const headers = [
      t('Time'),
      t('Username'),
      t('Category'),
      t('Event'),
      'IP',
      t('Method'),
      t('Route'),
      'HTTP',
      t('Result'),
      t('Request ID'),
    ]
    const rows = items.map((entry) => {
      const detail = buildAuditDetails(entry, t)
      const eventText = [detail.summary, detail.operation?.description]
        .filter(Boolean)
        .join(' · ')
      return [
        dayjs.unix(entry.created_at).format('YYYY-MM-DD HH:mm:ss'),
        entry.username,
        entry.category,
        eventText,
        entry.ip,
        entry.method,
        entry.route,
        entry.status || '',
        entry.success ? t('Success') : t('Failed'),
        entry.request_id,
      ]
        .map(escapeCsvCell)
        .join(',')
    })
    const csvContent = `\uFEFF${[headers.map(escapeCsvCell).join(','), ...rows].join('\r\n')}`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-logs-${dayjs().format('YYYYMMDD-HHmmss')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [items, t])

  const onExportStateChange = props.onExportStateChange
  useEffect(() => {
    if (!onExportStateChange) return
    onExportStateChange({
      count: items.length,
      exportCsv: items.length > 0 ? exportCsv : null,
    })
  }, [exportCsv, items.length, onExportStateChange])

  const auditStatItems = useMemo<LogsStatItem[]>(() => {
    if (props.accessOnly) return []
    let accessTokenCount = 0
    let securityCount = 0
    let failedCount = 0
    for (const item of items) {
      if (item.category === 'access_token') accessTokenCount += 1
      if (item.category === 'security' || item.category === 'login') {
        securityCount += 1
      }
      if (!item.success) failedCount += 1
    }
    return [
      {
        label: t('Matching Events'),
        value: String(totalCount),
        sub: props.scope === 'all' ? t('All accounts') : t('Personal scope'),
      },
      {
        label: t('Access Token Calls'),
        value: String(accessTokenCount),
        sub: t('Current page'),
      },
      {
        label: t('Security & Login'),
        value: String(securityCount),
        sub: t('Login & security events'),
      },
      {
        label: t('Failed / Blocked'),
        value: String(failedCount),
        sub:
          failedCount > 0 ? t('Needs attention') : t('All succeeded on page'),
        tone: failedCount > 0 ? 'warn' : 'default',
      },
    ]
  }, [items, props.accessOnly, props.scope, t, totalCount])

  const columns = useAuditLogColumns(props.accessOnly)
  const { table } = useDataTable({
    columns,
    data: items,
    getRowId: (entry) => entry.event_id,
    totalCount,
    pagination: { pageIndex: filters.p - 1, pageSize: filters.page_size },
    onPaginationChange: (updater) => {
      if (query.isFetching || query.isError || invalidRange || !canQuery) {
        return
      }
      setFilters((previous) => {
        const current = {
          pageIndex: previous.p - 1,
          pageSize: previous.page_size,
        }
        const next = typeof updater === 'function' ? updater(current) : updater
        return {
          ...previous,
          p: next.pageSize === previous.page_size ? next.pageIndex + 1 : 1,
          page_size: next.pageSize,
        }
      })
    },
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })
  const update = (patch: Partial<AuditFilters>) =>
    setFilters((previous) => ({ ...previous, ...patch, p: 1 }))

  const alertsNode = (
    <>
      {invalidRange && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('End time must be after start time')}
          </AlertDescription>
        </Alert>
      )}
      {query.isError && (
        <Alert variant='destructive'>
          <AlertDescription className='flex items-center justify-between gap-2'>
            <span>{t('Failed to load audit records')}</span>
            <Button
              size='sm'
              variant='outline'
              onClick={() => void query.refetch()}
            >
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </>
  )

  if (!props.accessOnly) {
    return (
      <div className='logs-editorial-page'>
        <LogsStatStrip items={auditStatItems} />
        <div className='logs-editorial-card'>
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={query.isPending && canQuery && !invalidRange}
            isFetching={query.isFetching}
            emptyTitle={
              query.isError
                ? t('Failed to load audit records')
                : t('No records')
            }
            fixedHeight={false}
            paginationInFooter={false}
            className='logs-editorial-table-page'
            tableClassName='logs-editorial-table-wrap'
            paginationClassName='logs-editorial-pagination'
            applyHeaderSize
            getColumnClassName={() => 'py-2.5'}
            toolbar={
              <div className='shrink-0'>
                <AuditLogFilterBar
                  table={table}
                  filters={filters}
                  onChange={update}
                  scope={props.scope}
                  editorial
                  totalCount={totalCount}
                  tokenScope={tokenScope}
                  defaultTokenScope={defaultTokenScope}
                  currentTokenRef={props.currentTokenRef}
                  onTokenScopeChange={(value) => {
                    setTokenScope(value)
                    update({})
                  }}
                  isFetching={query.isFetching}
                  onSearch={() => {
                    if (!invalidRange && canQuery) void query.refetch()
                  }}
                  onReset={() => {
                    setTokenScope(defaultTokenScope)
                    setFilters({ p: 1, page_size: filters.page_size })
                  }}
                />
                {(invalidRange || query.isError) && (
                  <div className='space-y-2 px-4 py-3'>{alertsNode}</div>
                )}
              </div>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={query.isPending && canQuery && !invalidRange}
        isFetching={query.isFetching}
        emptyTitle={
          query.isError ? t('Failed to load audit records') : t('No records')
        }
        hideMobile={props.accessOnly}
        paginationInFooter={!props.accessOnly}
        className='h-auto min-h-0 flex-1'
        applyHeaderSize
        getColumnClassName={() => 'py-2'}
        tableClassName='[&_[data-slot=table]]:text-[13px] [&_[data-slot=table]_td]:text-[13px] [&_[data-slot=table]_td_*]:text-[13px] [&_[data-slot=table]_th]:text-[13px] [&_[data-slot=table]_th_*]:text-[13px]'
        toolbar={
          <div className='shrink-0 space-y-2'>
            <AuditLogFilterBar
              table={table}
              filters={filters}
              onChange={update}
              scope={props.scope}
              accessOnly={props.accessOnly}
              tokenScope={tokenScope}
              defaultTokenScope={defaultTokenScope}
              currentTokenRef={props.currentTokenRef}
              onTokenScopeChange={(value) => {
                setTokenScope(value)
                update({})
              }}
              isFetching={query.isFetching}
              onSearch={() => {
                if (!invalidRange && canQuery) void query.refetch()
              }}
              onReset={() => {
                setTokenScope(defaultTokenScope)
                setFilters({ p: 1, page_size: filters.page_size })
              }}
            />
            {alertsNode}
          </div>
        }
      />
    </div>
  )
}
