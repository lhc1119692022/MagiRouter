import { ImageIcon, Trash2, Upload } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { isValidWeChatQRCodeValue } from './utils'

const MAX_QRCODE_FILE_BYTES = 512 * 1024
const ALLOWED_QRCODE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

interface WeChatQRCodeFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  invalid?: boolean
}

export function WeChatQRCodeField(props: WeChatQRCodeFieldProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const trimmedValue = props.value.trim()
  const isUploadedDataUrl = /^data:image\//i.test(trimmedValue)
  const showPreview =
    trimmedValue.length > 0 && isValidWeChatQRCodeValue(trimmedValue)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!ALLOWED_QRCODE_MIME_TYPES.has(file.type.toLowerCase())) {
      toast.error(t('Please upload a PNG, JPG, WebP, or GIF image'))
      event.target.value = ''
      return
    }

    if (file.size > MAX_QRCODE_FILE_BYTES) {
      toast.error(t('QR code image must be 512 KB or smaller'))
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        props.onChange(reader.result)
      }
    })
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        {isUploadedDataUrl ? (
          <div className='bg-muted/40 flex flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm'>
            <ImageIcon className='text-muted-foreground h-4 w-4 shrink-0' />
            <span className='truncate'>
              {t('Local WeChat QR code image uploaded')}
            </span>
          </div>
        ) : (
          <Input
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            disabled={props.disabled}
            aria-invalid={props.invalid}
            placeholder={t(
              'Paste QR code image URL (https://...) or upload a local image'
            )}
          />
        )}
        <div className='flex shrink-0 gap-2'>
          <input
            ref={fileInputRef}
            type='file'
            accept='image/png,image/jpeg,image/webp,image/gif'
            onChange={handleFileChange}
            className='hidden'
          />
          <Button
            type='button'
            variant='outline'
            disabled={props.disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className='mr-1.5 h-4 w-4' />
            {isUploadedDataUrl ? t('Replace image') : t('Upload QR code')}
          </Button>
          {trimmedValue.length > 0 && (
            <Button
              type='button'
              variant='outline'
              disabled={props.disabled}
              onClick={() => props.onChange('')}
              aria-label={t('Remove QR code')}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          )}
        </div>
      </div>

      {showPreview && (
        <div className='flex items-center gap-3'>
          <div className='inline-flex rounded-lg border bg-white p-2 shadow-xs'>
            <img
              src={trimmedValue}
              alt={t('WeChat QR code preview')}
              className='h-28 w-28 object-contain'
            />
          </div>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Preview of the QR code displayed when a user exceeds the daily top-up limit.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
