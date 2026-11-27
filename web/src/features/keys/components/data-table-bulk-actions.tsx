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
import type { Table } from '@tanstack/react-table'
import { Copy, Loader2 } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { handleServerError } from '@/lib/handle-server-error'

import { updateApiKeyStatus } from '../api'
import { API_KEY_STATUS, ERROR_MESSAGES } from '../constants'
import type { ApiKey } from '../types'
import { ApiKeysMultiDeleteDialog } from './api-keys-multi-delete-dialog'
import { useApiKeys } from './api-keys-provider'

type DataTableBulkActionsProps<TData> = {
  table: Table<TData>
}

export function DataTableBulkActions<TData>({
  table,
}: DataTableBulkActionsProps<TData>) {
  const { t } = useTranslation()
  const { resolveRealKeysBatch, triggerRefresh } = useApiKeys()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null)
  const selectedRows = table.getFilteredSelectedRowModel().rows

  const handleBatchCopy = useCallback(async () => {
    if (selectedRows.length === 0) return

    setIsCopying(true)
    try {
      const ids = selectedRows.map((row) => (row.original as ApiKey).id)
      const keysMap = await resolveRealKeysBatch(ids)

      const lines: string[] = []
      for (const row of selectedRows) {
        const apiKey = row.original as ApiKey
        const realKey = keysMap[apiKey.id]
        if (realKey) {
          lines.push(`${apiKey.name}\t${realKey}`)
        }
      }

      if (lines.length > 0) {
        const ok = await copyToClipboard(lines.join('\n'))
        if (ok) {
          toast.success(t('Copied {{count}} key(s)', { count: lines.length }))
        } else {
          toast.error(t('Failed to copy keys'))
        }
      }
    } catch {
      toast.error(t('Failed to copy keys'))
    } finally {
      setIsCopying(false)
    }
  }, [selectedRows, resolveRealKeysBatch, t])

  const handleBatchStatus = useCallback(
    async (nextStatus: number) => {
      const targets = selectedRows
        .map((row) => row.original as ApiKey)
        .filter(
          (item) =>
            item.status === API_KEY_STATUS.ENABLED ||
            item.status === API_KEY_STATUS.DISABLED
        )
        .filter((item) => item.status !== nextStatus)

      if (targets.length === 0) return

      setUpdatingStatus(nextStatus)
      try {
        let successCount = 0
        for (const item of targets) {
          const result = await updateApiKeyStatus(item.id, nextStatus)
          if (result.success) {
            successCount++
          } else {
            handleServerError(result, t(ERROR_MESSAGES.STATUS_UPDATE_FAILED))
            break
          }
        }
        if (successCount > 0) {
          toast.success(
            nextStatus === API_KEY_STATUS.ENABLED
              ? t('Enabled {{count}} API key(s)', { count: successCount })
              : t('Disabled {{count}} API key(s)', { count: successCount })
          )
          table.resetRowSelection()
          triggerRefresh()
        }
      } catch (error) {
        handleServerError(error, t(ERROR_MESSAGES.UNEXPECTED))
      } finally {
        setUpdatingStatus(null)
      }
    },
    [selectedRows, table, triggerRefresh, t]
  )

  if (selectedRows.length === 0) {
    return (
      <ApiKeysMultiDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        table={table}
      />
    )
  }

  const isBusy = isCopying || updatingStatus !== null

  return (
    <>
      <div
        className='keys-bulk-bar'
        role='region'
        aria-label={t('{{count}} key(s) selected', {
          count: selectedRows.length,
        })}
      >
        <span className='tabular-nums'>
          {t('{{count}} key(s) selected', { count: selectedRows.length })}
        </span>
        <div className='keys-bulk-actions'>
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-white'
            onClick={() => void handleBatchStatus(API_KEY_STATUS.ENABLED)}
            disabled={isBusy}
          >
            {updatingStatus === API_KEY_STATUS.ENABLED && (
              <Loader2 className='size-3 animate-spin' aria-hidden='true' />
            )}
            {t('Batch Enable')}
          </button>
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-white'
            onClick={() => void handleBatchStatus(API_KEY_STATUS.DISABLED)}
            disabled={isBusy}
          >
            {updatingStatus === API_KEY_STATUS.DISABLED && (
              <Loader2 className='size-3 animate-spin' aria-hidden='true' />
            )}
            {t('Batch Disable')}
          </button>
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-white'
            onClick={handleBatchCopy}
            disabled={isBusy}
          >
            {isCopying ? (
              <Loader2 className='size-3 animate-spin' aria-hidden='true' />
            ) : (
              <Copy className='size-3' aria-hidden='true' />
            )}
            {t('Copy selected keys')}
          </button>
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-white keys-bulk-delete-btn'
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isBusy}
          >
            {t('Batch Delete')}
          </button>
          <button
            type='button'
            className='el-btn el-btn-xs el-btn-ghost'
            onClick={() => table.resetRowSelection()}
            disabled={isBusy}
          >
            {t('Clear selection')}
          </button>
        </div>
      </div>

      <ApiKeysMultiDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        table={table}
      />
    </>
  )
}
