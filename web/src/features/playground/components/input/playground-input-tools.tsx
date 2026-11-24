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
import { PaperclipIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInputButton,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type PlaygroundInputToolsProps = {
  acceptsChatImages: boolean
  onImageCountChange?: (count: number) => void
  disabled?: boolean
  hasMessages?: boolean
  onClearMessages?: () => void
}

export function PlaygroundInputTools({
  acceptsChatImages,
  onImageCountChange,
  disabled,
  hasMessages = false,
  onClearMessages,
}: PlaygroundInputToolsProps) {
  const { t } = useTranslation()
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const attachments = usePromptInputAttachments()
  useEffect(() => {
    onImageCountChange?.(attachments.files.length)
    return () => onImageCountChange?.(0)
  }, [attachments.files.length, onImageCountChange])

  const handleClearMessages = () => {
    onClearMessages?.()
    setClearConfirmOpen(false)
    toast.success(t('Conversation cleared'))
  }

  const showClear = hasMessages && Boolean(onClearMessages)
  if (!acceptsChatImages && !showClear) {
    return null
  }

  return (
    <>
      <PromptInputTools>
        {acceptsChatImages && (
          <Tooltip>
            <TooltipTrigger
              render={
                <PromptInputButton
                  aria-label={t('Upload photo')}
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
              <p>{t('Upload photo')} · JPEG, PNG, WebP · 2 × 4 MiB</p>
            </TooltipContent>
          </Tooltip>
        )}

        {showClear && (
          <Tooltip>
            <TooltipTrigger
              render={
                <PromptInputButton
                  aria-label={t('Clear chat history')}
                  className='pg-composer-icon-btn text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-medium'
                  disabled={disabled}
                  onClick={() => setClearConfirmOpen(true)}
                  variant='ghost'
                >
                  <Trash2Icon size={15} />
                </PromptInputButton>
              }
            />
            <TooltipContent>
              <p>{t('Clear chat history')}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </PromptInputTools>

      <ConfirmDialog
        destructive
        desc={t(
          'All playground messages saved in this browser will be removed. This cannot be undone.'
        )}
        confirmText={t('Clear')}
        handleConfirm={handleClearMessages}
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={t('Clear chat history?')}
      />
    </>
  )
}
