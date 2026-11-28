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
import { PaperclipIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PromptInputButton,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { CHAT_ATTACHMENT_LIMIT, classifyAttachmentFile } from '../../lib'
import type { MessageAttachment } from '../../types'

type PlaygroundInputToolsProps = {
  acceptsAttachments: boolean
  onAttachmentsChange?: (attachments: MessageAttachment[]) => void
  onImageCountChange?: (count: number) => void
  disabled?: boolean
}

export function PlaygroundInputTools({
  acceptsAttachments,
  onAttachmentsChange,
  onImageCountChange,
  disabled,
}: PlaygroundInputToolsProps) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()
  const lastSignatureRef = useRef('')
  const filesSignature = attachments.files
    .map((file) => `${file.id}:${file.filename ?? ''}:${file.mediaType ?? ''}`)
    .join('|')

  useEffect(() => {
    if (lastSignatureRef.current === filesSignature) {
      return
    }
    lastSignatureRef.current = filesSignature
    onImageCountChange?.(attachments.files.length)
    if (onAttachmentsChange) {
      const summary: MessageAttachment[] = attachments.files.map(
        (file, index) => {
          const classified = classifyAttachmentFile({
            filename: file.filename,
            mediaType: file.mediaType,
          })
          const kind = classified?.kind ?? 'text'
          const mediaType =
            classified?.mediaType ?? (file.mediaType || 'text/plain')
          return {
            name: file.filename?.trim() || `attachment-${index + 1}`,
            mediaType,
            kind,
          }
        }
      )
      onAttachmentsChange(summary)
    }
  }, [
    attachments.files,
    filesSignature,
    onAttachmentsChange,
    onImageCountChange,
  ])

  useEffect(
    () => () => {
      if (lastSignatureRef.current !== '') {
        lastSignatureRef.current = ''
        onImageCountChange?.(0)
        onAttachmentsChange?.([])
      }
    },
    [onAttachmentsChange, onImageCountChange]
  )

  if (!acceptsAttachments) {
    return null
  }

  return (
    <PromptInputTools>
      <Tooltip>
        <TooltipTrigger
          render={
            <PromptInputButton
              aria-label={t('Attach images or files')}
              className='pg-composer-icon-btn text-muted-foreground hover:text-foreground hover:bg-muted/70 font-medium'
              disabled={disabled}
              onClick={attachments.openFileDialog}
              variant='ghost'
            />
          }
        >
          <PaperclipIcon size={15} />
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {t('Attach images or files')} · {t('Images, PDF, Text/Code')} ·{' '}
            {CHAT_ATTACHMENT_LIMIT} × 10 MiB
          </p>
        </TooltipContent>
      </Tooltip>
    </PromptInputTools>
  )
}
