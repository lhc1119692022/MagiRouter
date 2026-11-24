import { nanoid } from 'nanoid'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { CreationPreset, StudioMode } from '@/features/creation/presets'

type WorkspaceSnapshot = {
  [Mode in StudioMode]: Pick<
    Extract<CreationPreset, { mode: Mode }>,
    'mode' | 'model' | 'prompt' | 'parameters'
  >
}[StudioMode]

const SavePresetDialog = lazy(async () => ({
  default: (await import('./save-preset-dialog')).SavePresetDialog,
}))

export function SavePresetAction(props: {
  capture: () => WorkspaceSnapshot | null
  available: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<CreationPreset | null>(null)
  return (
    <>
      <Button
        type='button'
        size='xs'
        variant='outline'
        className={props.className}
        aria-haspopup='dialog'
        disabled={!props.available}
        title={
          !props.available
            ? t('This model is not available for this preset.')
            : undefined
        }
        onClick={() => {
          const snapshot = props.capture()
          if (snapshot) {
            setDraft({
              ...snapshot,
              id: `preset-${nanoid()}`,
              title: '',
              published: false,
            })
          }
        }}
      >
        {t('Save as preset')}
      </Button>
      {draft && (
        <Suspense fallback={<span role='status'>{t('Loading')}</span>}>
          <SavePresetDialog item={draft} onClose={() => setDraft(null)} />
        </Suspense>
      )}
    </>
  )
}
