import { useQuery } from '@tanstack/react-query'
import { nanoid } from 'nanoid'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TagInput } from '@/components/tag-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  creationPresetList,
  creationPresetTags,
  mediaLabels,
  presetCoverUrl,
  type CreationPreset,
  type StudioMode,
} from '@/features/creation/presets'
import { SceneArt } from '@/features/creation/scene-art'
import { getUserModels } from '@/features/playground/api'
import { cn } from '@/lib/utils'

import { PresetParameterSummary } from './preset-parameter-summary'

export function CreationPresetForm(props: {
  item?: CreationPreset
  capture?: boolean
  pending?: boolean
  onChange: (item: CreationPreset) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const modelList = useId()
  const tagsId = useId()
  const models = useQuery({
    queryKey: ['creation-preset-editor-models'],
    queryFn: () => getUserModels(''),
    enabled: !props.capture,
  })
  const [title, setTitle] = useState(props.item?.title ?? '')
  const [mode, setMode] = useState<StudioMode>(props.item?.mode ?? 'image')
  const [model, setModel] = useState(props.item?.model ?? '')
  const [prompt, setPrompt] = useState(props.item?.prompt ?? '')
  const [category, setCategory] = useState(props.item?.category ?? '')
  const [tags, setTags] = useState(props.item?.tags ?? [])
  const invalidTags = !creationPresetTags.safeParse(tags).success
  const [description, setDescription] = useState(props.item?.description ?? '')
  const [cover, setCover] = useState(props.item?.cover_url ?? '')
  const [featured, setFeatured] = useState(props.item?.featured ?? false)
  const [published, setPublished] = useState(
    props.item ? props.item.published !== false : false
  )
  const invalidCover =
    !!cover.trim() && !presetCoverUrl.safeParse(cover.trim()).success
  const [parameters, setParameters] = useState(
    JSON.stringify(props.item?.parameters ?? {}, null, 2)
  )
  let preview: CreationPreset | undefined
  try {
    const parsed = creationPresetList.safeParse([
      {
        ...props.item,
        id: props.item?.id ?? 'new',
        title,
        mode,
        model,
        prompt,
        category,
        tags: tags.length ? tags : undefined,
        description,
        cover_url: cover.trim() || undefined,
        featured,
        published,
        parameters: JSON.parse(parameters),
      },
    ])
    if (parsed.success) preview = parsed.data[0]
  } catch {
    preview = undefined
  }
  let submitLabel = t('Apply')
  if (props.capture) {
    submitLabel = published ? t('Publish preset') : t('Save draft')
  }
  if (props.pending) submitLabel = t('Saving...')
  return (
    <form
      className={cn('grid gap-3', !props.capture && 'rounded-md border p-4')}
      onSubmit={(event) => {
        event.preventDefault()
        if (preview && !props.pending) {
          props.onChange({
            ...preview,
            id: props.item?.id ?? `preset-${nanoid()}`,
          })
        }
      }}
    >
      <fieldset disabled={props.pending} className='grid min-w-0 gap-3'>
        {props.capture && props.item && (
          <PresetParameterSummary item={props.item} />
        )}
        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='grid gap-1 text-sm'>
            {t('Name')}
            <Input
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {!props.capture && (
            <>
              <label className='grid gap-1 text-sm'>
                {t('Mode')}
                <NativeSelect
                  value={mode}
                  onChange={(event) => {
                    setMode(event.target.value as StudioMode)
                    setParameters('{}')
                  }}
                >
                  {(Object.keys(mediaLabels) as StudioMode[]).map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {t(mediaLabels[value])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label className='grid gap-1 text-sm'>
                {t('Model')}
                <Input
                  required
                  list={modelList}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </label>
              <datalist id={modelList}>
                {models.data?.map((option) => (
                  <option key={option.value} value={option.value} />
                ))}
              </datalist>
            </>
          )}
          <label className='grid gap-1 text-sm'>
            {t('Category')}
            <Input
              maxLength={80}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>
        </div>
        <Field data-invalid={invalidTags}>
          <FieldLabel htmlFor={tagsId}>{t('Tags')}</FieldLabel>
          <TagInput
            id={tagsId}
            value={tags}
            onChange={setTags}
            disabled={props.pending}
            aria-invalid={invalidTags}
            aria-describedby={invalidTags ? `${tagsId}-hint` : undefined}
            placeholder={t('Press Enter or comma to add tags')}
          />
          {invalidTags && (
            <FieldDescription id={`${tagsId}-hint`} role='alert'>
              {t(
                'Use up to 12 different tags, with at most 32 characters each.'
              )}
            </FieldDescription>
          )}
        </Field>
        <label className='grid gap-1 text-sm'>
          {t('Description')}
          <Textarea
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className='grid gap-1 text-sm'>
          {t('Cover image URL')}
          <Input
            type='url'
            value={cover}
            maxLength={2048}
            aria-invalid={invalidCover}
            placeholder='https://…'
            onChange={(event) => setCover(event.target.value)}
          />
        </label>
        <p
          className='text-muted-foreground text-xs'
          role={invalidCover ? 'alert' : undefined}
        >
          {t(
            'Use a public HTTPS image URL without credentials, or leave it blank for the default 4:3 cover.'
          )}
        </p>
        <figure className='flex items-center gap-3'>
          <div className='aspect-[4/3] w-28 overflow-hidden rounded-md border [&>*]:size-full [&>*]:object-cover'>
            <SceneArt
              scene={{
                id: props.item?.id ?? 'new',
                mode,
                cover_url: invalidCover ? undefined : cover.trim(),
              }}
            />
          </div>
          <figcaption className='text-muted-foreground text-xs'>
            {t('Cover preview')}
          </figcaption>
        </figure>
        <label className='grid gap-1 text-sm'>
          {t('Prompt')}
          <Textarea
            required
            maxLength={8000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        {!props.capture && (
          <label className='grid gap-1 text-sm'>
            {t('Parameters')} (JSON)
            <Textarea
              className='font-mono'
              value={parameters}
              onChange={(event) => setParameters(event.target.value)}
            />
          </label>
        )}
        <div className='flex flex-wrap gap-x-5 gap-y-3'>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox checked={published} onCheckedChange={setPublished} />
            {t('Published')}
          </label>
          <label className='flex items-center gap-2 text-sm'>
            <Checkbox checked={featured} onCheckedChange={setFeatured} />
            {t('Show in Featured inspiration')}
          </label>
        </div>
        {!preview &&
          !invalidCover &&
          !invalidTags &&
          title.trim() &&
          model.trim() &&
          prompt.trim() && (
            <p className='text-destructive text-xs' role='alert'>
              {t('Invalid creation preset configuration.')}
            </p>
          )}
        <div className='flex gap-2'>
          <Button
            type='submit'
            variant={props.capture ? 'default' : 'secondary'}
            disabled={!preview || props.pending}
          >
            {submitLabel}
          </Button>
          <Button type='button' variant='ghost' onClick={props.onCancel}>
            {t('Cancel')}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
