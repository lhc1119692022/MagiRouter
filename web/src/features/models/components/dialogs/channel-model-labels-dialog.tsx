import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  encodeModelCategoryTags,
  getConfiguredModelCategories,
  getOrdinaryModelTags,
  type ModelCapabilityCategory,
} from '@/lib/model-task-capabilities'
import {
  getServerErrorMessage,
  requireServerSuccess,
} from '@/lib/server-error-message'

import { createModel, getChannelModelMetadata, updateModel } from '../../api'
import { modelsQueryKeys } from '../../lib/query-keys'
import { ModelTaskCapabilityField } from '../model-task-capability-field'

export function ChannelModelLabelsDialog(props: {
  modelName: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const metadata = useQuery({
    queryKey: [...modelsQueryKeys.all, 'channel-labels', props.modelName],
    queryFn: () => getChannelModelMetadata(props.modelName),
    retry: false,
  })
  const [draft, setDraft] = useState<{
    recordId?: number
    original?: ModelCapabilityCategory[]
    categories?: ModelCapabilityCategory[]
  } | null>(null)
  const original = getConfiguredModelCategories(metadata.data?.tags)
  const categories = draft ? draft.categories : original
  const dirty = JSON.stringify(original) !== JSON.stringify(categories)
  const save = useMutation({
    meta: { errorToast: false },
    mutationFn: async () => {
      const latest = await getChannelModelMetadata(props.modelName)
      if (
        !draft ||
        draft.recordId !== latest?.id ||
        JSON.stringify(draft.original) !==
          JSON.stringify(getConfiguredModelCategories(latest?.tags))
      ) {
        throw new Error(
          t('Model labels have changed. Reopen the editor before saving.')
        )
      }
      const tags = encodeModelCategoryTags(
        getOrdinaryModelTags(latest?.tags),
        categories,
        latest?.tags
      )
      if ([...tags].length > 255) {
        throw new Error(
          t(
            'Tags and task capabilities exceed 255 characters. Shorten the tags before saving.'
          )
        )
      }
      const fields = {
        model_name: props.modelName,
        name_rule: 0,
        tags,
        status: latest?.status ?? 1,
        sync_official: latest?.sync_official ?? 1,
        vendor_id: latest?.vendor_id ?? 0,
        description: latest?.description ?? '',
        icon: latest?.icon ?? '',
        endpoints: latest?.endpoints ?? '',
      }
      return requireServerSuccess(
        latest?.name_rule === 0
          ? await updateModel({ ...fields, id: latest.id })
          : await createModel(fields)
      )
    },
    onSuccess: () => {
      props.onClose()
      void client.invalidateQueries({ queryKey: modelsQueryKeys.all })
      void client.invalidateQueries({ queryKey: ['pricing'] })
      toast.success(t('Model metadata saved'))
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) props.onClose()
      }}
      title={t('Edit capability labels for {{model}}', {
        model: props.modelName,
      })}
      description={t(
        'Labels apply to this model across all channels and are saved separately from this channel.'
      )}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={save.isPending}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            disabled={!dirty || !metadata.isSuccess || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t('Saving...') : t('Save labels')}
          </Button>
        </>
      }
    >
      {metadata.isPending && <LoadingState />}
      {metadata.isError && (
        <ErrorState
          description={t(getServerErrorMessage(metadata.error))}
          onRetry={() => void metadata.refetch()}
        />
      )}
      {metadata.isSuccess && (
        <ModelTaskCapabilityField
          value={categories}
          onChange={(value) =>
            setDraft((previous) => ({
              ...(previous ?? { recordId: metadata.data?.id, original }),
              categories: value,
            }))
          }
        />
      )}
      {save.isError && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(getServerErrorMessage(save.error))}
          </AlertDescription>
        </Alert>
      )}
    </Dialog>
  )
}
