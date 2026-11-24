import { useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { ShowcaseMediaType } from '@/features/magirouter-home/lib/showcase-config'
import {
  MAX_PRICING_BANNER_SLIDES,
  PRICING_BANNER_OPTION_KEY,
  isSafeShowcaseMediaUrl,
  parsePricingBannerConfig,
  resolveShowcaseMediaKind,
  serializePricingBannerConfig,
  type PricingBannerSlideConfig,
} from '@/features/pricing/lib/banner-config'

import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type BannerSlideDraft = {
  title: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
  mediaUrl: string
  mediaType: ShowcaseMediaType
  posterUrl: string
}

type BannerFormValues = {
  slides: BannerSlideDraft[]
}

function toDrafts(slides: PricingBannerSlideConfig[]): BannerSlideDraft[] {
  return slides.map((slide) => ({
    title: slide.title,
    subtitle: slide.subtitle ?? '',
    ctaLabel: slide.cta_label ?? '',
    ctaHref: slide.cta_href ?? '',
    mediaUrl: slide.media_url ?? '',
    mediaType: slide.media_type ?? 'auto',
    posterUrl: slide.poster_url ?? '',
  }))
}

function encodeDrafts(drafts: BannerSlideDraft[]) {
  const slides: PricingBannerSlideConfig[] = []
  const errors = drafts.map((draft) => {
    if (!draft.title.trim()) {
      return 'Enter a banner title.'
    }
    if (!isSafeShowcaseMediaUrl(draft.ctaHref)) {
      return 'Enter a relative /path or HTTP(S) button URL.'
    }
    if (!isSafeShowcaseMediaUrl(draft.mediaUrl)) {
      return 'Enter a relative /path or HTTP(S) media URL.'
    }
    if (!isSafeShowcaseMediaUrl(draft.posterUrl)) {
      return 'Enter a relative /path or HTTP(S) poster URL.'
    }
    slides.push({
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || undefined,
      cta_label: draft.ctaLabel.trim() || undefined,
      cta_href: draft.ctaHref.trim() || undefined,
      media_url: draft.mediaUrl.trim() || undefined,
      media_type: draft.mediaType,
      poster_url: draft.posterUrl.trim() || undefined,
    })
    return ''
  })
  const hasErrors = errors.some(Boolean)
  return {
    errors,
    value:
      !hasErrors && drafts.length <= MAX_PRICING_BANNER_SLIDES
        ? serializePricingBannerConfig(slides)
        : undefined,
  }
}

export function PricingBannerSection({ value }: { value: string }) {
  const { t } = useTranslation()
  const initialSlides = useMemo(() => parsePricingBannerConfig(value), [value])
  return (
    <SettingsSection title={t('Model Square Banner')}>
      <PricingBannerEditor key={value} initialSlides={initialSlides} />
    </SettingsSection>
  )
}

function PricingBannerEditor({
  initialSlides,
}: {
  initialSlides: PricingBannerSlideConfig[]
}) {
  const { t } = useTranslation()
  const save = useUpdateOption()
  const form = useForm<BannerFormValues>({
    defaultValues: { slides: toDrafts(initialSlides) },
  })
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'slides',
  })
  const watchedSlides = useWatch({ control: form.control, name: 'slides' })
  const encoded = useMemo(
    () => encodeDrafts(watchedSlides ?? []),
    [watchedSlides]
  )
  const canSave =
    encoded.value !== undefined && form.formState.isDirty && !save.isPending

  const handlePublish = form.handleSubmit((changes) => {
    const result = encodeDrafts(changes.slides)
    if (result.value === undefined || !canSave) return
    save.mutate(
      { key: PRICING_BANNER_OPTION_KEY, value: result.value },
      { onSuccess: () => form.reset(changes) }
    )
  })

  const handleAddSlide = () => {
    if (fields.length >= MAX_PRICING_BANNER_SLIDES) return
    append({
      title: '',
      subtitle: '',
      ctaLabel: '立即体验',
      ctaHref: '/playground',
      mediaUrl: '',
      mediaType: 'auto',
      posterUrl: '',
    })
  }

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
            'Configure carousel slides and adaptive image/video backgrounds for the top banner on Model Square. Leave empty to use built-in dynamic slides.'
          )}
        </p>
        <p className='text-xs'>
          {t(
            'Recommended media ratio: 8:1 ultra-wide strip (e.g. 2400×300 or 1920×240) with abstract gradients, textures, or subtle motion loops.'
          )}
        </p>
      </div>

      <fieldset disabled={save.isPending} className='grid min-w-0 gap-4'>
        {fields.length === 0 && (
          <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
            {t(
              'No custom banner slides configured yet. Model Square currently shows built-in dynamic slides.'
            )}
          </div>
        )}

        {fields.map((field, index) => {
          const current = watchedSlides?.[index]
          const mediaKind = resolveShowcaseMediaKind(
            current?.mediaUrl,
            current?.mediaType
          )
          const rowError = encoded.errors[index]
          return (
            <fieldset
              key={field.id}
              className='grid min-w-0 gap-3 rounded-xl border p-4'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <legend className='text-sm font-semibold'>
                  {t('Slide {{index}}', { index: index + 1 })}
                </legend>
                <div className='flex items-center gap-1.5'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    {t('Move up')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    {t('Move down')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => remove(index)}
                  >
                    {t('Delete')}
                  </Button>
                </div>
              </div>

              {mediaKind && current?.mediaUrl && (
                <div className='relative aspect-[8/1] w-full overflow-hidden rounded-lg border bg-black/85'>
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

              <div className='grid gap-3 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor={`banner-${field.id}-title`}>
                    {t('Headline')}
                  </FieldLabel>
                  <Input
                    id={`banner-${field.id}-title`}
                    placeholder='旗舰模型限时低倍率特惠'
                    {...form.register(`slides.${index}.title`)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`banner-${field.id}-cta-label`}>
                    {t('Button label')}
                  </FieldLabel>
                  <Input
                    id={`banner-${field.id}-cta-label`}
                    placeholder='立即体验'
                    {...form.register(`slides.${index}.ctaLabel`)}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`banner-${field.id}-subtitle`}>
                  {t('Description')}
                </FieldLabel>
                <Textarea
                  id={`banner-${field.id}-subtitle`}
                  rows={2}
                  placeholder='一把 API 密钥统一调用全球旗舰语言、图片与视频模型。'
                  {...form.register(`slides.${index}.subtitle`)}
                />
              </Field>

              <div className='grid gap-3 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor={`banner-${field.id}-cta-href`}>
                    {t('Button destination URL')}
                  </FieldLabel>
                  <Input
                    id={`banner-${field.id}-cta-href`}
                    placeholder='/playground'
                    {...form.register(`slides.${index}.ctaHref`)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`banner-${field.id}-poster`}>
                    {t('Video poster URL (optional)')}
                  </FieldLabel>
                  <Input
                    id={`banner-${field.id}-poster`}
                    placeholder='https://cdn.example.com/banner-poster.webp'
                    {...form.register(`slides.${index}.posterUrl`)}
                  />
                </Field>
              </div>

              <div className='grid gap-3 sm:grid-cols-3'>
                <Field className='sm:col-span-2'>
                  <FieldLabel htmlFor={`banner-${field.id}-media`}>
                    {t('Background media URL (image or video)')}
                  </FieldLabel>
                  <Input
                    id={`banner-${field.id}-media`}
                    placeholder='https://cdn.example.com/banner-bg.webp'
                    {...form.register(`slides.${index}.mediaUrl`)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`banner-${field.id}-type`}>
                    {t('Media type')}
                  </FieldLabel>
                  <NativeSelect
                    id={`banner-${field.id}-type`}
                    {...form.register(`slides.${index}.mediaType`)}
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

              {rowError && (
                <p role='alert' className='text-destructive text-xs'>
                  {t(rowError)}
                </p>
              )}
            </fieldset>
          )
        })}

        <div>
          <Button
            type='button'
            variant='outline'
            disabled={fields.length >= MAX_PRICING_BANNER_SLIDES}
            onClick={handleAddSlide}
          >
            {t('Add banner slide')}
          </Button>
        </div>
      </fieldset>
    </>
  )
}
