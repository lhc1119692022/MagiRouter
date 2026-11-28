import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { batchUpdateModels } from '../../api'
import {
  normalizeEndpointKeyList,
  validateBatchEndpointsInput,
  type EndpointsActionMode,
} from '../../lib'
import type {
  BatchEndpointsMode,
  BatchUpdateModelsRequest,
  Model,
} from '../../types'
import { invalidateVendorData } from '../../vendor-api'
import { BatchEndpointsSection } from '../batch-endpoints-section'

export function ModelBatchEndpointsDialog(props: {
  models: Model[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<BatchEndpointsMode>('append')
  const [endpointsValue, setEndpointsValue] = useState('')
  const [removeKeys, setRemoveKeys] = useState<string[]>([])

  const modelIds = useMemo(
    () => props.models.filter((item) => item.id > 0).map((item) => item.id),
    [props.models]
  )
  const channelModels = useMemo(
    () =>
      props.models
        .filter((item) => item.id <= 0)
        .map((item) => item.model_name),
    [props.models]
  )

  const validation = useMemo(
    () => validateBatchEndpointsInput(mode, endpointsValue, removeKeys),
    [mode, endpointsValue, removeKeys]
  )
  const canSubmit = props.models.length > 0 && validation.valid

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: BatchUpdateModelsRequest = {
        model_ids: modelIds,
        channel_models: channelModels,
        endpoints_mode: mode,
      }
      if (mode === 'append' || mode === 'replace') {
        payload.endpoints = endpointsValue.trim()
      } else if (mode === 'remove') {
        payload.endpoint_keys = normalizeEndpointKeyList(removeKeys)
      }
      return requireServerSuccess(await batchUpdateModels(payload))
    },
    onSuccess: async (res) => {
      const updated = res.data?.updated_count ?? 0
      const created = res.data?.created_count ?? 0
      if (created > 0 && updated > 0) {
        toast.success(
          t('Updated {{updated}} models and created metadata for {{created}}', {
            updated,
            created,
          })
        )
      } else if (created > 0) {
        toast.success(
          t('Created metadata for {{count}} models', { count: created })
        )
      } else {
        toast.success(t('Updated {{count}} models', { count: updated }))
      }
      await invalidateVendorData(queryClient)
      props.onOpenChange(false)
      props.onSuccess()
    },
    onError: (error) => {
      handleServerError(error, t('Failed to batch update model endpoints'))
    },
  })

  const handleModeChange = (nextMode: EndpointsActionMode) => {
    if (nextMode === 'unchanged') return
    setMode(nextMode)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!mutation.isPending) props.onOpenChange(open)
      }}
      title={t('Batch manage model endpoints')}
      description={t(
        'Update custom endpoint configurations for {{count}} selected models at once.',
        { count: props.models.length }
      )}
      contentClassName='sm:max-w-3xl'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={mutation.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('Saving...') : t('Apply to selected')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        {channelModels.length > 0 && (
          <Alert>
            <AlertDescription className='text-xs'>
              {t(
                '{{count}} selected channel models do not have metadata yet and will be initialized automatically.',
                { count: channelModels.length }
              )}
            </AlertDescription>
          </Alert>
        )}

        <BatchEndpointsSection
          models={props.models}
          mode={mode}
          onModeChange={handleModeChange}
          endpointsValue={endpointsValue}
          onEndpointsValueChange={setEndpointsValue}
          removeKeys={removeKeys}
          onRemoveKeysChange={setRemoveKeys}
          allowUnchanged={false}
          disabled={mutation.isPending}
          open={props.open}
        />
      </div>
    </Dialog>
  )
}
