import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { extractNoticeImages } from '@/lib/published-notices'
import { cn } from '@/lib/utils'

interface AnnouncementImagePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  images: string[]
  activeIndex: number
  onSelectIndex: (index: number) => void
}

export function AnnouncementImagePreviewDialog({
  open,
  onOpenChange,
  images,
  activeIndex,
  onSelectIndex,
}: AnnouncementImagePreviewDialogProps) {
  const { t } = useTranslation()
  const safeIndex =
    images.length > 0
      ? Math.min(Math.max(activeIndex, 0), images.length - 1)
      : 0
  const currentImage = images[safeIndex]

  if (!currentImage) {
    return null
  }

  const hasMultiple = images.length > 1

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Image preview')}
      description={
        hasMultiple ? `${safeIndex + 1} / ${images.length}` : undefined
      }
      contentClassName='sm:max-w-3xl'
      contentHeight='auto'
      bodyClassName='space-y-3'
      footer={
        hasMultiple ? (
          <div className='flex w-full items-center justify-between gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() =>
                onSelectIndex((safeIndex - 1 + images.length) % images.length)
              }
            >
              <ChevronLeft className='mr-1 h-4 w-4' aria-hidden='true' />
              {t('Previous image')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => onSelectIndex((safeIndex + 1) % images.length)}
            >
              {t('Next image')}
              <ChevronRight className='ml-1 h-4 w-4' aria-hidden='true' />
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className='bg-muted/30 flex items-center justify-center overflow-hidden rounded-lg border p-2'>
        <img
          src={currentImage}
          alt={t('Announcement image {{index}}', { index: safeIndex + 1 })}
          className='max-h-[70vh] w-auto max-w-full rounded object-contain'
        />
      </div>
    </Dialog>
  )
}

interface AnnouncementImagesProps {
  images?: unknown
  variant?: 'default' | 'compact' | 'expanded'
  className?: string
  onPreviewImage?: (images: string[], index: number) => void
}

export function AnnouncementImages({
  images,
  variant = 'default',
  className,
  onPreviewImage,
}: AnnouncementImagesProps) {
  const { t } = useTranslation()
  const safeImages = useMemo(() => extractNoticeImages(images), [images])
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  if (safeImages.length === 0) {
    return null
  }

  const handleOpenPreview = (index: number) => {
    if (onPreviewImage) {
      onPreviewImage(safeImages, index)
      return
    }
    setPreviewIndex(index)
  }

  const isCompact = variant === 'compact'
  const isExpanded = variant === 'expanded'
  const isSingle = safeImages.length === 1
  let containerClass = 'grid grid-cols-2 gap-2.5'
  let buttonSizeClass = 'aspect-[16/10] w-full'
  let imageFitClass = 'h-full w-full object-cover'
  if (isExpanded) {
    containerClass = 'flex flex-col gap-2'
    buttonSizeClass = 'block w-full p-0'
    imageFitClass = 'block h-auto w-full object-contain'
  } else if (isCompact) {
    containerClass = 'flex flex-wrap gap-2'
    buttonSizeClass = 'h-16 w-24 shrink-0'
  } else if (isSingle) {
    containerClass = 'flex flex-col gap-2'
    buttonSizeClass = 'w-full max-w-xl'
    imageFitClass = 'max-h-80 w-full object-contain'
  }

  const seenSources = new Map<string, number>()
  const keyedImages = safeImages.map((src, index) => {
    const count = (seenSources.get(src) ?? 0) + 1
    seenSources.set(src, count)
    return { src, index, key: `${src}#${count}` }
  })

  return (
    <>
      <div className={cn(containerClass, className)}>
        {keyedImages.map(({ src, index, key }) => (
          <button
            key={key}
            type='button'
            aria-label={t('Preview announcement image {{index}}', {
              index: index + 1,
            })}
            onClick={(event) => {
              event.stopPropagation()
              handleOpenPreview(index)
            }}
            className={cn(
              'bg-muted/30 hover:border-foreground/30 focus-visible:ring-ring group relative overflow-hidden rounded-lg border text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
              buttonSizeClass
            )}
          >
            <img
              src={src}
              alt={t('Announcement image {{index}}', { index: index + 1 })}
              loading='lazy'
              className={cn(
                'transition-transform duration-200 group-hover:scale-[1.02]',
                imageFitClass
              )}
            />
          </button>
        ))}
      </div>

      {!onPreviewImage && (
        <AnnouncementImagePreviewDialog
          open={previewIndex !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewIndex(null)
          }}
          images={safeImages}
          activeIndex={previewIndex ?? 0}
          onSelectIndex={setPreviewIndex}
        />
      )}
    </>
  )
}
