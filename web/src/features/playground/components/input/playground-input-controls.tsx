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
import { SendIcon, SquareIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { Combobox } from '@/components/ui/combobox'

import { getInputControlState } from '../../lib'
import type { GroupOption, ModelOption } from '../../types'

type PlaygroundInputControlsProps = {
  allowSubmit: boolean
  disabled?: boolean
  groups: GroupOption[]
  isGenerating?: boolean
  isModelLoading?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  onStop?: () => void
  text: string
  tools: ReactNode
  priceQuote?: ReactNode
  showModelSelector?: boolean
}

export function PlaygroundInputControls({
  allowSubmit,
  disabled,
  groups,
  isGenerating,
  isModelLoading = false,
  models,
  modelValue,
  onModelChange,
  onStop,
  text,
  tools,
  priceQuote,
  showModelSelector = true,
}: PlaygroundInputControlsProps) {
  const { t } = useTranslation()
  const { canSubmit, shouldShowStop } = getInputControlState({
    disabled,
    groups,
    hasStopHandler: Boolean(onStop),
    isGenerating,
    isModelLoading,
    models,
    text,
  })

  const renderSubmitButton = () =>
    shouldShowStop ? (
      <PromptInputButton
        className='pg-composer-stop-btn border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15 font-medium'
        onClick={onStop}
        variant='secondary'
      >
        <SquareIcon className='fill-current' size={13} />
        <span className='hidden sm:inline'>{t('Stop')}</span>
        <span className='sr-only sm:hidden'>{t('Stop')}</span>
      </PromptInputButton>
    ) : (
      <PromptInputButton
        className='pg-composer-send-btn'
        aria-label={t('Send')}
        disabled={!allowSubmit || !canSubmit}
        type='submit'
        variant='default'
      >
        <SendIcon size={14} />
        <span className='hidden sm:inline'>{t('Send')}</span>
        <span className='sr-only sm:hidden'>{t('Send')}</span>
      </PromptInputButton>
    )

  return (
    <div className='pg-chat-composer-foot'>
      <div className='pg-chat-composer-controls'>
        {showModelSelector && models.length > 0 && (
          <Combobox
            className='pg-composer-combobox'
            aria-label={t('Switch model')}
            value={modelValue || null}
            options={models}
            placeholder={t('Select model')}
            disabled={disabled || isModelLoading || !models.length}
            onValueChange={(value) => {
              if (value) onModelChange(value)
            }}
          />
        )}
        {tools}
      </div>
      <div className='pg-chat-composer-right'>
        {priceQuote}
        {renderSubmitButton()}
      </div>
    </div>
  )
}
