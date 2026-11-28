import { GripVertical, Image as ImageIcon, Link2, X } from 'lucide-react'
import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ImageReferenceItem {
  id: string
  url: string
  name?: string
}

interface ImageReferenceSlotsProps {
  references: readonly ImageReferenceItem[]
  maxReferences: number
  layerDecomposition?: boolean
  disabled?: boolean
  onAddUrl: (url: string, name?: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onRemove: (index: number) => void
}

function extractReferenceDisplayName(item: ImageReferenceItem): string {
  if (item.name?.trim()) return item.name.trim()
  if (item.url.startsWith('data:image/')) {
    const mimeMatch = /^data:image\/([a-z0-9+.-]+);/i.exec(item.url)
    const ext = mimeMatch?.[1]?.toLowerCase() ?? 'image'
    return `image.${ext}`
  }
  const cleaned = item.url.split('?')[0] || item.url
  const parts = cleaned.split('/').filter(Boolean)
  return parts.at(-1) || cleaned
}

function normalizeImageDataUrl(raw: string): string {
  return raw.replace(
    /^data:image\/([A-Za-z0-9+.-]+);base64,/i,
    (_match, ext: string) => `data:image/${ext.toLowerCase()};base64,`
  )
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      'load',
      () => {
        if (typeof reader.result === 'string') {
          resolve(normalizeImageDataUrl(reader.result))
          return
        }
        reject(new Error('Unsupported file result'))
      },
      { once: true }
    )
    reader.addEventListener(
      'error',
      () => reject(reader.error ?? new Error('Read failed')),
      { once: true }
    )
    reader.readAsDataURL(file)
  })
}

export function ImageReferenceSlots(props: ImageReferenceSlotsProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlInputOpen, setUrlInputOpen] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const canAddMore = props.references.length < props.maxReferences
  const canReorder = props.references.length > 1 && !props.disabled

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || props.disabled) return
    setUploadError(null)
    const remaining = Math.max(0, props.maxReferences - props.references.length)
    const accepted = [...files]
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, remaining)
    if (accepted.length === 0) {
      setUploadError(t('Please select a valid image file.'))
      return
    }
    for (const file of accepted) {
      try {
        const dataUrl = await readImageFileAsDataUrl(file)
        props.onAddUrl(dataUrl, file.name)
      } catch {
        setUploadError(t('Failed to read the selected image file.'))
      }
    }
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(event.target.files)
    event.target.value = ''
  }

  const handleSubmitUrl = () => {
    const cleaned = urlDraft.trim()
    if (!cleaned || !canAddMore || props.disabled) return
    setUploadError(null)
    props.onAddUrl(cleaned)
    setUrlDraft('')
    setUrlInputOpen(false)
  }

  const handleUrlKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmitUrl()
    } else if (event.key === 'Escape') {
      setUrlInputOpen(false)
      setUrlDraft('')
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (draggedIndex !== null || !canAddMore || props.disabled) return
    void handleFiles(event.dataTransfer.files)
  }

  const handleItemDragStart = (
    event: DragEvent<HTMLDivElement>,
    index: number
  ) => {
    if (!canReorder) return
    setDraggedIndex(index)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
    }
  }

  const handleItemDragOver = (
    event: DragEvent<HTMLDivElement>,
    index: number
  ) => {
    if (!canReorder) return
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    if (dropTargetIndex !== index) {
      setDropTargetIndex(index)
    }
  }

  const handleItemDrop = (
    event: DragEvent<HTMLDivElement>,
    targetIndex: number
  ) => {
    if (!canReorder) return
    event.preventDefault()
    const rawTransfer = event.dataTransfer?.getData('text/plain')
    const parsedTransfer =
      rawTransfer && /^\d+$/.test(rawTransfer.trim())
        ? Number(rawTransfer.trim())
        : null
    const fromIndex = draggedIndex ?? parsedTransfer
    setDraggedIndex(null)
    setDropTargetIndex(null)
    if (
      fromIndex === null ||
      !Number.isInteger(fromIndex) ||
      fromIndex < 0 ||
      fromIndex >= props.references.length ||
      fromIndex === targetIndex
    ) {
      return
    }
    props.onReorder(fromIndex, targetIndex)
  }

  const handleItemDragEnd = () => {
    setDraggedIndex(null)
    setDropTargetIndex(null)
  }

  const handleReorderKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (!canReorder) return
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault()
      props.onReorder(index, index - 1)
    } else if (
      event.key === 'ArrowDown' &&
      index < props.references.length - 1
    ) {
      event.preventDefault()
      props.onReorder(index, index + 1)
    }
  }

  return (
    <div className='pg-field pg-ref-section'>
      <div className='pg-field-head'>
        <span className='pg-upload-lead'>
          <span className='pg-field-label'>{t('Reference images')}</span>
          <span
            className='pg-upload-info'
            title={t(
              'Upload local images or paste image URLs. Drag the handle to reorder multiple references.'
            )}
          >
            ?
          </span>
        </span>
        <span className='pg-char-count tabular-nums'>
          {props.references.length} / {props.maxReferences}
        </span>
      </div>

      <div className='pg-ref-slot-list'>
        {props.references.map((entry, index) => {
          const displayName = extractReferenceDisplayName(entry)
          return (
            <div
              key={entry.id}
              className={cn(
                'pg-ref-slot is-filled',
                draggedIndex === index && 'is-dragging-item',
                dropTargetIndex === index &&
                  draggedIndex !== index &&
                  'is-drop-target'
              )}
              data-testid='pg-ref-slot-filled'
              draggable={canReorder}
              onDragStart={(event) => handleItemDragStart(event, index)}
              onDragOver={(event) => handleItemDragOver(event, index)}
              onDragLeave={() => {
                if (dropTargetIndex === index) setDropTargetIndex(null)
              }}
              onDrop={(event) => handleItemDrop(event, index)}
              onDragEnd={handleItemDragEnd}
            >
              {props.references.length > 1 && (
                <button
                  type='button'
                  className='pg-ref-slot-handle'
                  data-testid='pg-ref-drag-handle'
                  disabled={props.disabled}
                  aria-label={t('Reorder reference image {{index}}', {
                    index: index + 1,
                  })}
                  title={t('Drag to reorder (or press Arrow Up / Down)')}
                  onKeyDown={(event) => handleReorderKeyDown(event, index)}
                >
                  <GripVertical size={14} aria-hidden='true' />
                </button>
              )}
              <div className='pg-ref-slot-thumb'>
                <img
                  src={entry.url}
                  alt={displayName}
                  className='pg-ref-slot-img'
                  draggable={false}
                />
                <span className='pg-ref-slot-idx'>#{index + 1}</span>
              </div>
              <span
                className='pg-ref-slot-label'
                title={entry.name || entry.url}
              >
                {displayName}
              </span>
              <div className='pg-ref-slot-actions'>
                <button
                  type='button'
                  className='pg-asset-chip-x'
                  disabled={props.disabled}
                  aria-label={t('Remove reference image')}
                  onClick={() => props.onRemove(index)}
                >
                  <X size={12} aria-hidden='true' />
                </button>
              </div>
            </div>
          )
        })}

        {canAddMore && (
          <div
            className={cn('pg-ref-slot is-empty', isDragging && 'is-dragging')}
            data-testid='pg-ref-slot-empty'
            onDragOver={(event) => {
              if (draggedIndex !== null) return
              event.preventDefault()
              if (!props.disabled) setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type='file'
              accept='image/*'
              multiple={props.maxReferences - props.references.length > 1}
              className='sr-only'
              tabIndex={-1}
              aria-label={t('Upload reference image')}
              disabled={props.disabled}
              onChange={handleFileInputChange}
            />
            <button
              type='button'
              className='pg-ref-slot-thumb is-trigger'
              disabled={props.disabled}
              aria-label={t('Add reference image')}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon size={18} aria-hidden='true' />
            </button>

            {urlInputOpen ? (
              <div className='pg-ref-slot-url-form'>
                <Input
                  type='url'
                  value={urlDraft}
                  disabled={props.disabled}
                  placeholder={t('Paste image URL and press Enter')}
                  aria-label={t('Reference image URL')}
                  className='pg-ref-slot-url-input'
                  onChange={(event) => setUrlDraft(event.target.value)}
                  onKeyDown={handleUrlKeyDown}
                />
                <Button
                  type='button'
                  size='xs'
                  variant='default'
                  disabled={props.disabled || !urlDraft.trim()}
                  onClick={handleSubmitUrl}
                >
                  {t('Add')}
                </Button>
              </div>
            ) : (
              <>
                <span className='pg-ref-slot-placeholder'>
                  {t('Add reference image')}
                </span>
                <div className='pg-ref-slot-actions'>
                  <button
                    type='button'
                    className='pg-ref-slot-link-btn'
                    disabled={props.disabled}
                    title={t('Add image URL')}
                    aria-label={t('Add image URL')}
                    onClick={() => setUrlInputOpen(true)}
                  >
                    <Link2 size={13} aria-hidden='true' />
                  </button>
                  <Button
                    type='button'
                    variant='outline'
                    size='xs'
                    className='pg-ref-slot-select-btn'
                    disabled={props.disabled}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('Select')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {uploadError && (
        <p className='pg-field-error' role='alert'>
          {uploadError}
        </p>
      )}

      {props.layerDecomposition && props.references.length !== 1 && (
        <p className='pg-field-hint' role='status'>
          {t('Layer decomposition requires exactly 1 reference image.')}
        </p>
      )}
    </div>
  )
}
