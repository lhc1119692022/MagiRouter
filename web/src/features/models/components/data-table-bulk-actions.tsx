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
import { useQueryClient } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import {
  ArrowUpDown,
  Building2,
  Copy,
  DollarSign,
  Eye,
  EyeOff,
  Plug,
  SlidersHorizontal,
  Trash2,
  Unlink,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCanEditModelPricing } from '@/features/model-pricing/api'
import { copyToClipboard } from '@/lib/copy-to-clipboard'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { handleBatchSetModelVisibility } from '../lib'
import type { Model } from '../types'
import type { VendorOperation } from '../vendor-api'
import { ModelBatchEndpointsDialog } from './dialogs/model-batch-endpoints-dialog'
import { ModelBatchManageDialog } from './dialogs/model-batch-manage-dialog'
import { ModelBatchPricingDialog } from './dialogs/model-batch-pricing-dialog'
import { ModelDeleteDialog } from './dialogs/model-delete-dialog'
import { VendorOperationDialog } from './dialogs/vendor-operation-dialog'
import { useModels } from './models-provider'

interface DataTableBulkActionsProps<TData> {
  table: Table<TData>
}

export function DataTableBulkActions<TData>({
  table,
}: DataTableBulkActionsProps<TData>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { setOpen, setBatchOrderModels } = useModels()
  const canPrice = useCanEditModelPricing()
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const [vendorOperation, setVendorOperation] =
    useState<VendorOperation | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBatchManage, setShowBatchManage] = useState(false)
  const [showBatchEndpoints, setShowBatchEndpoints] = useState(false)
  const [showBatchPricing, setShowBatchPricing] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedIds = selectedRows.reduce<number[]>((ids, row) => {
    const id = (row.original as Model).id

    if (typeof id === 'number' && id > 0) {
      ids.push(id)
    }

    return ids
  }, [])

  const hasMissingMetadata = selectedRows.some(
    (row) => !(row.original as Model).id
  )

  const selectedModels = selectedRows.map((row) => row.original as Model)
  const exactSelectedModels = selectedModels.filter(
    (model) => model.name_rule === 0
  )

  const handleClearSelection = () => {
    table.resetRowSelection()
  }

  const handleEnableAll = () => {
    void handleBatchSetModelVisibility(
      selectedModels,
      1,
      queryClient,
      handleClearSelection
    )
  }

  const handleDisableAll = () => {
    void handleBatchSetModelVisibility(
      selectedModels,
      0,
      queryClient,
      handleClearSelection
    )
  }

  const handleOpenBatchOrder = () => {
    setBatchOrderModels(selectedModels.map((model) => model.model_name))
    setOpen('model-square-order')
  }

  const handleCopyNames = async () => {
    const names = selectedModels.map((m) => m.model_name).join(',')
    const success = await copyToClipboard(names)
    if (success) {
      toast.success(t('Model names copied to clipboard'))
    } else {
      toast.error(t('Failed to copy model names'))
    }
  }

  return (
    <>
      {vendorOperation && (
        <VendorOperationDialog
          selection={vendorOperation}
          onClose={() => setVendorOperation(null)}
          onSuccess={handleClearSelection}
        />
      )}
      <BulkActionsToolbar table={table} entityName='model'>
        <Button
          variant='default'
          size='sm'
          className='h-8 gap-1.5 px-2.5 text-xs'
          onClick={() => setShowBatchManage(true)}
        >
          <SlidersHorizontal className='size-3.5' aria-hidden='true' />
          <span>{t('Batch manage')}</span>
        </Button>

        <Button
          variant='outline'
          size='sm'
          className='h-8 gap-1.5 px-2.5 text-xs'
          title={t('Batch endpoints')}
          aria-label={t('Batch endpoints')}
          onClick={() => setShowBatchEndpoints(true)}
        >
          <Plug className='size-3.5' aria-hidden='true' />
          <span className='hidden sm:inline'>{t('Batch endpoints')}</span>
        </Button>

        {canPrice && exactSelectedModels.length > 0 && (
          <Button
            variant='outline'
            size='sm'
            className='h-8 gap-1.5 px-2.5 text-xs'
            onClick={() => setShowBatchPricing(true)}
          >
            <DollarSign className='size-3.5' aria-hidden='true' />
            <span className='hidden sm:inline'>{t('Copy pricing')}</span>
          </Button>
        )}

        {isRoot && (
          <Button
            variant='outline'
            size='sm'
            className='h-8 gap-1.5 px-2.5 text-xs'
            onClick={handleOpenBatchOrder}
          >
            <ArrowUpDown className='size-3.5' aria-hidden='true' />
            <span className='hidden sm:inline'>{t('Batch sort')}</span>
          </Button>
        )}

        <Button
          variant='outline'
          size='icon'
          className='size-8'
          title={t('Change vendor')}
          aria-label={t('Change vendor')}
          onClick={() => {
            if (hasMissingMetadata) {
              setShowBatchManage(true)
            } else {
              setVendorOperation({ action: 'assign', model_ids: selectedIds })
            }
          }}
        >
          <Building2 />
        </Button>
        <Button
          variant='outline'
          size='icon'
          className='size-8'
          title={t('Clear vendor')}
          aria-label={t('Clear vendor')}
          onClick={() => {
            if (hasMissingMetadata) {
              setShowBatchManage(true)
            } else {
              setVendorOperation({
                action: 'assign',
                model_ids: selectedIds,
                target_vendor_id: 0,
              })
            }
          }}
        >
          <Unlink />
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleEnableAll}
                className='size-8'
                aria-label={t('Show selected models in model square')}
                title={t('Show selected models in model square')}
              />
            }
          >
            <Eye />
            <span className='sr-only'>
              {t('Show selected models in model square')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Show selected models in model square')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleDisableAll}
                className='size-8'
                aria-label={t('Hide selected models from model square')}
                title={t('Hide selected models from model square')}
              />
            }
          >
            <EyeOff />
            <span className='sr-only'>
              {t('Hide selected models from model square')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Hide selected models from model square')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={handleCopyNames}
                className='size-8'
                aria-label={t('Copy model names')}
                title={t('Copy model names')}
              />
            }
          >
            <Copy />
            <span className='sr-only'>{t('Copy model names')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Copy model names')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='destructive'
                size='icon'
                onClick={() => setShowDeleteConfirm(true)}
                className='size-8'
                aria-label={t('Delete selected models')}
                title={t('Delete selected models')}
              />
            }
          >
            <Trash2 />
            <span className='sr-only'>{t('Delete selected models')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Delete selected models')}</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      {showBatchManage && (
        <ModelBatchManageDialog
          models={selectedModels}
          open={showBatchManage}
          onOpenChange={setShowBatchManage}
          onSuccess={handleClearSelection}
        />
      )}

      {showBatchEndpoints && (
        <ModelBatchEndpointsDialog
          models={selectedModels}
          open={showBatchEndpoints}
          onOpenChange={setShowBatchEndpoints}
          onSuccess={handleClearSelection}
        />
      )}

      {showBatchPricing && (
        <ModelBatchPricingDialog
          models={selectedModels}
          open={showBatchPricing}
          onOpenChange={setShowBatchPricing}
          onSuccess={handleClearSelection}
        />
      )}

      {showDeleteConfirm && (
        <ModelDeleteDialog
          models={selectedModels}
          onClose={() => setShowDeleteConfirm(false)}
          onSuccess={handleClearSelection}
        />
      )}
    </>
  )
}
