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
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { AnnouncementImages } from '@/components/announcement-images'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import {
  MAX_NOTICE_IMAGES,
  isValidNoticeImageSource,
  parseNoticeImagesOption,
} from '@/lib/published-notices'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { AnnouncementImagesField } from '../content/announcement-images-field'
import { useUpdateOption } from '../hooks/use-update-option'

const noticeSchema = z.object({
  Notice: z.string().optional(),
  NoticeImages: z
    .array(
      z
        .string()
        .refine(isValidNoticeImageSource, 'Invalid announcement image source')
    )
    .max(MAX_NOTICE_IMAGES),
})

type NoticeFormValues = z.infer<typeof noticeSchema>

type NoticeSectionProps = {
  defaultValue: string
  defaultImages?: string
}

export function NoticeSection({
  defaultValue,
  defaultImages = '[]',
}: NoticeSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [previewMode, setPreviewMode] = useState(false)
  const initialImages = useMemo(
    () => parseNoticeImagesOption(defaultImages),
    [defaultImages]
  )
  const initialImagesSerialized = useMemo(
    () => JSON.stringify(initialImages),
    [initialImages]
  )
  const form = useForm<NoticeFormValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      Notice: defaultValue ?? '',
      NoticeImages: initialImages,
    },
  })
  const watchedImages = form.watch('NoticeImages')

  useEffect(() => {
    form.reset({
      Notice: defaultValue ?? '',
      NoticeImages: initialImages,
    })
  }, [defaultValue, initialImages, form])

  const onSubmit = async (values: NoticeFormValues) => {
    const normalized = values.Notice ?? ''
    const normalizedImages = JSON.stringify(values.NoticeImages)
    const updates: Array<{ key: string; value: string }> = []
    if (normalizedImages !== initialImagesSerialized) {
      updates.push({
        key: 'NoticeImages',
        value: normalizedImages,
      })
    }
    if (normalized !== (defaultValue ?? '')) {
      updates.push({
        key: 'Notice',
        value: normalized,
      })
    }
    if (updates.length === 0) {
      return
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
  }

  return (
    <SettingsSection title={t('System Notice')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save notice'
          />
          <FormField
            control={form.control}
            name='Notice'
            render={({ field }) => (
              <FormItem>
                <div className='flex items-center justify-between gap-2'>
                  <FormLabel>{t('Announcement content')}</FormLabel>
                  <Button
                    type='button'
                    variant='ghost'
                    size='xs'
                    onClick={() => setPreviewMode((prev) => !prev)}
                  >
                    {previewMode ? (
                      <>
                        <Pencil
                          className='mr-1 h-3.5 w-3.5'
                          aria-hidden='true'
                        />
                        {t('Edit')}
                      </>
                    ) : (
                      <>
                        <Eye className='mr-1 h-3.5 w-3.5' aria-hidden='true' />
                        {t('Preview')}
                      </>
                    )}
                  </Button>
                </div>
                {previewMode ? (
                  <div className='bg-muted/20 min-h-32 space-y-3 rounded-lg border p-3 text-sm'>
                    {field.value?.trim() ? (
                      <RichContent breaks content={field.value} />
                    ) : (
                      <p className='text-muted-foreground text-xs'>
                        {t('No text content entered')}
                      </p>
                    )}
                    <AnnouncementImages images={watchedImages} />
                  </div>
                ) : (
                  <FormControl>
                    <Textarea
                      rows={8}
                      placeholder={t(
                        'Planned maintenance on Friday at 22:00 UTC...'
                      )}
                      {...field}
                    />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='NoticeImages'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Images (Optional)')}</FormLabel>
                <FormControl>
                  <AnnouncementImagesField
                    value={field.value}
                    onChange={field.onChange}
                    disabled={updateOption.isPending}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Up to {{max}} images. Supports PNG, JPG, WebP, GIF uploads or image URLs.',
                    { max: MAX_NOTICE_IMAGES }
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
