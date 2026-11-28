import { ArrowLeft, ArrowRight, Link2, Trash2, Upload } from 'lucide-react'
import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MAX_NOTICE_IMAGES,
  MAX_NOTICE_IMAGE_DATA_URL_LENGTH,
  isValidNoticeImageSource,
} from '@/lib/published-notices'

const MAX_RAW_UPLOAD_BYTES = 10 * 1024 * 1024
const DIRECT_DATA_URL_BYTES = 512 * 1024
const MAX_COMPRESSED_EDGE = 1600
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('invalid_image_result'))
      }
    })
    reader.addEventListener('error', () => {
      reject(new Error('image_read_failed'))
    })
    reader.readAsDataURL(file)
  })
}

function compressRasterImage(
  file: File,
  fallbackDataUrl: string
): Promise<string> {
  if (
    typeof document === 'undefined' ||
    typeof Image === 'undefined' ||
    file.type.toLowerCase() === 'image/gif'
  ) {
    return Promise.resolve(fallbackDataUrl)
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', () => {
      const sourceWidth = image.naturalWidth || image.width
      const sourceHeight = image.naturalHeight || image.height
      if (!sourceWidth || !sourceHeight) {
        resolve(fallbackDataUrl)
        return
      }
      const scale = Math.min(
        1,
        MAX_COMPRESSED_EDGE / Math.max(sourceWidth, sourceHeight)
      )
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(fallbackDataUrl)
        return
      }
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

      const mimeCandidates = ['image/webp', 'image/jpeg']
      const qualities = [0.86, 0.76, 0.66, 0.56]
      for (const mime of mimeCandidates) {
        for (const quality of qualities) {
          try {
            const encoded = canvas.toDataURL(mime, quality)
            if (
              encoded.startsWith(`data:${mime};base64,`) &&
              encoded.length <= MAX_NOTICE_IMAGE_DATA_URL_LENGTH
            ) {
              resolve(encoded)
              return
            }
          } catch {
            break
          }
        }
      }
      resolve(fallbackDataUrl)
    })
    image.addEventListener('error', () => resolve(fallbackDataUrl))
    image.src = fallbackDataUrl
  })
}

interface AnnouncementImagesFieldProps {
  value: string[]
  onChange: (images: string[]) => void
  disabled?: boolean
}

export function AnnouncementImagesField({
  value,
  onChange,
  disabled,
}: AnnouncementImagesFieldProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [processing, setProcessing] = useState(false)

  const remainingSlots = MAX_NOTICE_IMAGES - value.length
  const canAddMore = remainingSlots > 0 && !disabled && !processing

  const processFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return
    if (remainingSlots <= 0) {
      toast.error(
        t('You can add up to {{max}} images per announcement', {
          max: MAX_NOTICE_IMAGES,
        })
      )
      return
    }

    const selected = fileList.slice(0, remainingSlots)
    if (fileList.length > remainingSlots) {
      toast.info(
        t('Only the first {{count}} images were added (max {{max}})', {
          count: remainingSlots,
          max: MAX_NOTICE_IMAGES,
        })
      )
    }

    setProcessing(true)
    try {
      const added: string[] = []
      for (const file of selected) {
        if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
          toast.error(t('Please upload a PNG, JPG, WebP, or GIF image'))
          continue
        }
        if (file.size > MAX_RAW_UPLOAD_BYTES) {
          toast.error(t('Image file is too large to process'))
          continue
        }
        const rawDataUrl = await readFileAsDataUrl(file)
        const finalDataUrl =
          file.size <= DIRECT_DATA_URL_BYTES &&
          rawDataUrl.length <= MAX_NOTICE_IMAGE_DATA_URL_LENGTH
            ? rawDataUrl
            : await compressRasterImage(file, rawDataUrl)

        if (!isValidNoticeImageSource(finalDataUrl)) {
          toast.error(t('Image must be 512 KB or smaller after compression'))
          continue
        }
        added.push(finalDataUrl)
      }
      if (added.length > 0) {
        onChange([...value, ...added].slice(0, MAX_NOTICE_IMAGES))
      }
    } catch {
      toast.error(t('Failed to read image file'))
    } finally {
      setProcessing(false)
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    void processFiles(files)
  }

  const handleAddUrl = () => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    if (remainingSlots <= 0) {
      toast.error(
        t('You can add up to {{max}} images per announcement', {
          max: MAX_NOTICE_IMAGES,
        })
      )
      return
    }
    if (!isValidNoticeImageSource(trimmed)) {
      toast.error(
        t('Please enter a valid image URL (https://..., http://..., or /path)')
      )
      return
    }
    onChange([...value, trimmed])
    setUrlInput('')
  }

  const handleUrlKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleAddUrl()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedFiles = [...(event.clipboardData.files ?? [])].filter((file) =>
      file.type.startsWith('image/')
    )
    if (pastedFiles.length > 0) {
      event.preventDefault()
      void processFiles(pastedFiles)
    }
  }

  const handleRemove = (index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleMove = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= value.length) return
    const next = [...value]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onChange(next)
  }

  const seenSources = new Map<string, number>()
  const keyedImages = value.map((src, index) => {
    const count = (seenSources.get(src) ?? 0) + 1
    seenSources.set(src, count)
    return { src, index, key: `${src}#${count}` }
  })

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Input
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          onKeyDown={handleUrlKeyDown}
          onPaste={handlePaste}
          disabled={!canAddMore}
          placeholder={t(
            'Paste image URL (https://... or /path) or paste a screenshot'
          )}
          aria-label={t('Announcement image URL')}
        />
        <div className='flex shrink-0 gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!canAddMore || !urlInput.trim()}
            onClick={handleAddUrl}
          >
            <Link2 className='mr-1.5 h-4 w-4' aria-hidden='true' />
            {t('Add image link')}
          </Button>
          <input
            ref={fileInputRef}
            type='file'
            accept='image/png,image/jpeg,image/webp,image/gif'
            multiple
            onChange={handleFileChange}
            className='hidden'
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!canAddMore}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className='mr-1.5 h-4 w-4' aria-hidden='true' />
            {processing ? t('Processing...') : t('Upload image')}
          </Button>
        </div>
      </div>

      {keyedImages.length > 0 && (
        <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-4'>
          {keyedImages.map(({ src, index, key }) => (
            <div
              key={key}
              className='bg-muted/30 flex flex-col overflow-hidden rounded-lg border'
            >
              <div className='bg-background/60 flex h-24 items-center justify-center overflow-hidden p-1'>
                <img
                  src={src}
                  alt={t('Announcement image {{index}}', { index: index + 1 })}
                  className='h-full w-full rounded object-contain'
                />
              </div>
              <div className='flex items-center justify-between gap-1 border-t px-1.5 py-1'>
                <div className='flex items-center gap-0.5'>
                  {value.length > 1 && (
                    <>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-xs'
                        disabled={disabled || index === 0}
                        onClick={() => handleMove(index, index - 1)}
                        aria-label={t('Move image left')}
                      >
                        <ArrowLeft className='h-3.5 w-3.5' aria-hidden='true' />
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-xs'
                        disabled={disabled || index === value.length - 1}
                        onClick={() => handleMove(index, index + 1)}
                        aria-label={t('Move image right')}
                      >
                        <ArrowRight
                          className='h-3.5 w-3.5'
                          aria-hidden='true'
                        />
                      </Button>
                    </>
                  )}
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-xs'
                  disabled={disabled}
                  onClick={() => handleRemove(index)}
                  aria-label={t('Remove image {{index}}', {
                    index: index + 1,
                  })}
                >
                  <Trash2 className='h-3.5 w-3.5' aria-hidden='true' />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
