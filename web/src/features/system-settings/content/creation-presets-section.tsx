import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  creationPresetList,
  creationPresetOption,
  type CreationPreset,
} from '@/features/creation/presets'
import { ROLE } from '@/lib/roles'
import { getServerErrorStatus } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { CreationPresetForm } from './creation-preset-form'
import { formatJsonForEditor } from './utils'

export function CreationPresetsSection(props: { value: string }) {
  const { t } = useTranslation()
  const canCapture = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const queryClient = useQueryClient()
  const [base, setBase] = useState(props.value)
  const saved = formatJsonForEditor(base, '[]')
  const [draft, setDraft] = useState(saved)
  const [editing, setEditing] = useState<number | null>(null)
  const save = useUpdateOption()
  let value: string | undefined
  let detail = ''
  let items: CreationPreset[] = []
  try {
    const parsed = creationPresetList.safeParse(JSON.parse(draft))
    if (parsed.success) {
      items = parsed.data
      value = JSON.stringify(items)
    } else detail = parsed.error.issues[0]?.path.join('.') ?? ''
  } catch {
    value = undefined
  }
  const dirty = draft !== saved || editing !== null
  const committed =
    save.isSuccess &&
    save.variables?.value === value &&
    save.variables.previous_value === base
  const stale =
    props.value !== base && dirty && !(committed && editing === null)
  const conflict =
    stale || (save.isError && getServerErrorStatus(save.error) === 409)
  useEffect(() => {
    if (props.value !== base && !stale) {
      setBase(props.value)
      setDraft(formatJsonForEditor(props.value, '[]'))
    }
  }, [base, props.value, stale])
  if (!props.value) {
    return (
      <SettingsSection title={t('Playground presets')}>
        <p role='status'>
          {t('This server does not support publishing creation presets.')}
        </p>
      </SettingsSection>
    )
  }
  return (
    <SettingsSection title={t('Playground presets')}>
      <SettingsPageFormActions
        isSaving={save.isPending}
        isSaveDisabled={
          !value || draft === saved || editing !== null || conflict
        }
        onSave={() => {
          if (value && editing === null && !conflict) {
            save.mutate(
              { key: creationPresetOption, previous_value: base, value },
              {
                onError: (error) => {
                  if (getServerErrorStatus(error) === 409) {
                    void queryClient.invalidateQueries({
                      queryKey: ['system-options'],
                    })
                  }
                },
              }
            )
          }
        }}
      />
      {conflict && (
        <div role='alert' className='flex flex-wrap items-center gap-2 text-sm'>
          {t('Creation presets have changed. Reload the list before saving.')}
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => {
              setEditing(null)
              setBase(props.value)
              setDraft(formatJsonForEditor(props.value, '[]'))
              save.reset()
            }}
          >
            {t('Discard changes')}
          </Button>
        </div>
      )}
      <p className='text-muted-foreground text-sm'>
        {t(
          'Only published presets appear in the creation center and Playground. Drafts remain private after saving.'
        )}
      </p>
      {canCapture && (
        <Button
          variant='outline'
          size='sm'
          className='w-fit'
          render={<Link to='/playground' search={{ editPreset: true }} />}
        >
          {t('Create a preset in Playground')}
        </Button>
      )}
      <Tabs defaultValue='visual' onValueChange={() => setEditing(null)}>
        <TabsList>
          <TabsTrigger value='visual'>{t('Visual')}</TabsTrigger>
          <TabsTrigger value='json'>{t('JSON')}</TabsTrigger>
        </TabsList>
        <TabsContent value='visual' className='grid gap-3'>
          {value && !items.length && (
            <p>{t('No creation presets have been published.')}</p>
          )}
          {items.map((item, index) => (
            <div
              key={item.id}
              className='flex flex-wrap items-center gap-3 border-b py-2'
            >
              <strong className='min-w-0 flex-1'>{item.title}</strong>
              <Badge
                variant={item.published === false ? 'outline' : 'secondary'}
              >
                {item.published === false ? t('Draft') : t('Published')}
              </Badge>
              <code>{item.model}</code>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setEditing(index)}
              >
                {t('Edit')}
              </Button>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  setEditing(null)
                  setDraft(
                    JSON.stringify(
                      items.filter((entry) => entry.id !== item.id),
                      null,
                      2
                    )
                  )
                }}
              >
                {t('Delete')}
              </Button>
            </div>
          ))}
          {editing === null ? (
            <Button
              variant='outline'
              className='w-fit'
              disabled={!value || items.length >= 100}
              onClick={() => setEditing(-1)}
            >
              {t('Add preset')}
            </Button>
          ) : (
            <CreationPresetForm
              key={editing}
              item={items[editing]}
              onCancel={() => setEditing(null)}
              onChange={(item) => {
                const updated = [...items]
                if (editing === -1) updated.push(item)
                else updated[editing] = item
                setDraft(JSON.stringify(updated, null, 2))
                setEditing(null)
              }}
            />
          )}
        </TabsContent>
        <TabsContent value='json' className='grid gap-3'>
          <p className='text-sm'>
            <code>
              id · title · mode (chat | image | video | audio) · model · prompt
            </code>
          </p>
          <p className='text-muted-foreground text-xs'>
            <code>
              description? · category? · tags? · cover_url? · featured? ·
              published? · parameters?
            </code>
          </p>
          <dl className='text-muted-foreground grid gap-1 text-xs'>
            {Object.entries({
              chat: 'temperature · top_p · max_tokens',
              image:
                'imageTask · imageSize · quality · imageFormat · imageCount',
              video:
                'videoTask · resolution · aspectRatio · duration · nativeAudio · cameraFixed',
              audio: 'voice · audioFormat · speed · instructions',
            }).map(([mode, keys]) => (
              <div key={mode}>
                <dt className='inline font-medium'>{mode}: </dt>
                <dd className='inline font-mono'>{keys}</dd>
              </div>
            ))}
          </dl>
          <JsonCodeEditor
            ariaLabel={t('Playground presets')}
            value={draft}
            onChange={setDraft}
            aria-invalid={!value}
            heightClassName='h-80 min-h-80 max-h-80'
          />
        </TabsContent>
      </Tabs>
      {!value && (
        <p role='alert'>
          {t('Invalid creation preset configuration.')}
          {detail && ` (${detail})`}
        </p>
      )}
    </SettingsSection>
  )
}
