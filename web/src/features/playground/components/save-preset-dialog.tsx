import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import {
  createCreationPreset,
  type CreationPreset,
} from '@/features/creation/presets'
import { CreationPresetForm } from '@/features/system-settings/content/creation-preset-form'
import { markServerErrorHandled } from '@/lib/handle-server-error'
import { getServerErrorMessage } from '@/lib/server-error-message'

export function SavePresetDialog(props: {
  item: CreationPreset
  onClose: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const save = useMutation({
    mutationFn: createCreationPreset,
    retry: false,
    meta: { errorToast: false },
    onError: markServerErrorHandled,
    onSuccess: (item) => {
      void client.invalidateQueries({ queryKey: ['creation-presets'] })
      void client.invalidateQueries({ queryKey: ['system-options'] })
      toast.success(item.published ? t('Preset published') : t('Draft saved'))
      props.onClose()
    },
  })
  return (
    <Dialog
      open
      title={t('Save as preset')}
      description={t(
        'Save the current model, prompt and parameters. Conversation history, reference materials and billing details are not included.'
      )}
      onOpenChange={(open) => {
        if (!open && !save.isPending) props.onClose()
      }}
      showCloseButton={!save.isPending}
    >
      <CreationPresetForm
        item={props.item}
        capture
        pending={save.isPending}
        onChange={(item) => {
          if (!save.isPending) save.mutate(item)
        }}
        onCancel={props.onClose}
      />
      {save.isError && (
        <p role='alert' className='text-destructive mt-2 text-sm'>
          {getServerErrorMessage(save.error, t('Failed to save preset'))}
        </p>
      )}
    </Dialog>
  )
}
