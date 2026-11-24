import { useId, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_SHOWCASE_TABS,
  HOME_SHOWCASE_OPTION_KEY,
  SHOWCASE_CAPABILITY_KEYS,
  isSafeShowcaseMediaUrl,
  parseHomeShowcaseConfig,
  resolveShowcaseMediaKind,
  serializeHomeShowcaseConfig,
  type CapabilityKey,
  type HomeShowcaseConfig,
  type ShowcaseMediaType,
} from '@/features/magirouter-home/lib/showcase-config'
import { usePricingData } from '@/features/pricing/hooks'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type ShowcaseTabDraft = {
  title: string
  description: string
  mediaUrl: string
  mediaType: ShowcaseMediaType
  posterUrl: string
  modelsText: string
  exploreLabel: string
}

type ShowcaseFormValues = Record<CapabilityKey, ShowcaseTabDraft>

const TAB_LABEL_KEYS: Record<CapabilityKey, string> = {
  text: 'Language Models',
  image: 'Image Generation',
  video: 'Video Generation',
  audio: 'Audio',
}

function toFormValues(config: HomeShowcaseConfig): ShowcaseFormValues {
  return {
    text: buildTabDraft(config.text),
    image: buildTabDraft(config.image),
    video: buildTabDraft(config.video),
    audio: buildTabDraft(config.audio),
  }
}

function buildTabDraft(
  item?: HomeShowcaseConfig[CapabilityKey]
): ShowcaseTabDraft {
  return {
    title: item?.title ?? '',
    description: item?.description ?? '',
    mediaUrl: item?.media_url ?? '',
    mediaType: item?.media_type ?? 'auto',
    posterUrl: item?.poster_url ?? '',
    modelsText: (item?.models ?? []).join(', '),
    exploreLabel: item?.explore_label ?? '',
  }
}

function parseModelsInput(text: string): string[] {
  return text
    .split(/[\n,，]+/)
    .map((entry) => entry.trim())
    .filter((entry, idx, arr) => Boolean(entry) && arr.indexOf(entry) === idx)
}

function encodeDrafts(values: ShowcaseFormValues) {
  const config: HomeShowcaseConfig = {}
  const errors: Partial<Record<CapabilityKey, string>> = {}

  for (const key of SHOWCASE_CAPABILITY_KEYS) {
    const draft = values[key]
    if (!isSafeShowcaseMediaUrl(draft.mediaUrl)) {
      errors[key] = 'Enter a relative /path or HTTP(S) media URL.'
      continue
    }
    if (!isSafeShowcaseMediaUrl(draft.posterUrl)) {
      errors[key] = 'Enter a relative /path or HTTP(S) poster URL.'
      continue
    }
    const models = parseModelsInput(draft.modelsText)
    if (models.length > 8) {
      errors[key] = 'Specify at most 8 models per tab.'
      continue
    }
    config[key] = {
      title: draft.title.trim() || undefined,
      description: draft.description.trim() || undefined,
      media_url: draft.mediaUrl.trim() || undefined,
      media_type: draft.mediaType,
      poster_url: draft.posterUrl.trim() || undefined,
      models: models.length > 0 ? models : undefined,
      explore_label: draft.exploreLabel.trim() || undefined,
    }
  }

  const hasErrors = Object.keys(errors).length > 0
  return {
    errors,
    value: hasErrors ? undefined : serializeHomeShowcaseConfig(config),
  }
}

export function HomeShowcaseSection({ value }: { value: string }) {
  const { t } = useTranslation()
  const initialConfig = useMemo(() => parseHomeShowcaseConfig(value), [value])
  return (
    <SettingsSection title={t('Home Showcase Media')}>
      <HomeShowcaseEditor key={value} initialConfig={initialConfig} />
    </SettingsSection>
  )
}

function HomeShowcaseEditor({
  initialConfig,
}: {
  initialConfig: HomeShowcaseConfig
}) {
  const { t } = useTranslation()
  const catalog = usePricingData()
  const datalistId = useId()
  const save = useUpdateOption()
  const form = useForm<ShowcaseFormValues>({
    defaultValues: toFormValues(initialConfig),
  })
  const watched = useWatch({ control: form.control }) as ShowcaseFormValues
  const encoded = useMemo(() => encodeDrafts(watched), [watched])
  const modelNames = useMemo(
    () => [...new Set(catalog.models.map((item) => item.model_name))],
    [catalog.models]
  )

  const canSave =
    Boolean(encoded.value) && form.formState.isDirty && !save.isPending

  const handlePublish = form.handleSubmit((changes) => {
    const result = encodeDrafts(changes)
    if (!result.value || !canSave) return
    save.mutate(
      { key: HOME_SHOWCASE_OPTION_KEY, value: result.value },
      { onSuccess: () => form.reset(changes) }
    )
  })

  return (
    <>
      <SettingsPageFormActions
        isSaving={save.isPending}
        isSaveDisabled={!canSave}
        onSave={() => void handlePublish()}
      />
      <div className='text-muted-foreground grid gap-1 text-sm'>
        <p>
          {t(
            'Configure background images or videos, left-side copy, and featured Playground models for each homepage showcase tab. Leave fields blank to use defaults.'
          )}
        </p>
        <p className='text-xs'>
          {t(
            'Recommended media ratio: 21:9 wide (e.g. 2560×1080 or 1920×800); if using 16:9 (1920×1080), place the key visual on the right half with 15%–20% top/bottom safe margins.'
          )}
        </p>
      </div>
      <datalist id={datalistId}>
        {modelNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <fieldset disabled={save.isPending} className='grid min-w-0 gap-5'>
        {SHOWCASE_CAPABILITY_KEYS.map((key) => {
          const defaults = DEFAULT_SHOWCASE_TABS[key]
          const current = watched[key]
          const mediaKind = resolveShowcaseMediaKind(
            current?.mediaUrl,
            current?.mediaType
          )
          const tabError = encoded.errors[key]
          return (
            <fieldset
              key={key}
              className='grid min-w-0 gap-4 rounded-xl border p-4'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <legend className='text-sm font-semibold'>
                    {t(TAB_LABEL_KEYS[key])}
                  </legend>
                  <p className='text-muted-foreground text-xs'>
                    {defaults.eyebrow}
                  </p>
                </div>
                {mediaKind && current?.mediaUrl && (
                  <div className='h-14 w-24 overflow-hidden rounded-lg border bg-black/80'>
                    {mediaKind === 'video' ? (
                      <video
                        src={current.mediaUrl}
                        poster={current.posterUrl || undefined}
                        muted
                        loop
                        playsInline
                        className='h-full w-full object-cover'
                      />
                    ) : (
                      <img
                        src={current.mediaUrl}
                        alt=''
                        className='h-full w-full object-cover'
                      />
                    )}
                  </div>
                )}
              </div>

              <div className='grid gap-3 sm:grid-cols-3'>
                <Field className='sm:col-span-2'>
                  <FieldLabel htmlFor={`showcase-${key}-media`}>
                    {t('Background media URL (image or video)')}
                  </FieldLabel>
                  <Input
                    id={`showcase-${key}-media`}
                    placeholder='https://cdn.example.com/showcase.mp4'
                    {...form.register(`${key}.mediaUrl`)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`showcase-${key}-type`}>
                    {t('Media type')}
                  </FieldLabel>
                  <NativeSelect
                    id={`showcase-${key}-type`}
                    {...form.register(`${key}.mediaType`)}
                  >
                    <NativeSelectOption value='auto'>
                      {t('Auto detect')}
                    </NativeSelectOption>
                    <NativeSelectOption value='image'>
                      {t('Image')}
                    </NativeSelectOption>
                    <NativeSelectOption value='video'>
                      {t('Video')}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor={`showcase-${key}-poster`}>
                    {t('Video poster URL (optional)')}
                  </FieldLabel>
                  <Input
                    id={`showcase-${key}-poster`}
                    placeholder='https://cdn.example.com/poster.webp'
                    {...form.register(`${key}.posterUrl`)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`showcase-${key}-models`}>
                    {t('Featured Playground models (comma-separated)')}
                  </FieldLabel>
                  <Input
                    id={`showcase-${key}-models`}
                    list={datalistId}
                    placeholder={defaults.preferredModels
                      .slice(0, 3)
                      .join(', ')}
                    {...form.register(`${key}.modelsText`)}
                  />
                </Field>
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor={`showcase-${key}-title`}>
                    {t('Headline')}
                  </FieldLabel>
                  <Input
                    id={`showcase-${key}-title`}
                    placeholder={defaults.title}
                    {...form.register(`${key}.title`)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`showcase-${key}-explore`}>
                    {t('Explore link label')}
                  </FieldLabel>
                  <Input
                    id={`showcase-${key}-explore`}
                    placeholder='探索全部'
                    {...form.register(`${key}.exploreLabel`)}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`showcase-${key}-desc`}>
                  {t('Description')}
                </FieldLabel>
                <Textarea
                  id={`showcase-${key}-desc`}
                  rows={2}
                  placeholder={defaults.description}
                  {...form.register(`${key}.description`)}
                />
              </Field>

              {tabError && (
                <p role='alert' className='text-destructive text-xs'>
                  {t(tabError)}
                </p>
              )}
            </fieldset>
          )
        })}
      </fieldset>
    </>
  )
}
