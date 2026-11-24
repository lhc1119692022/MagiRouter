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
import { GlobeIcon, SparklesIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { REQUEST_PLUGIN_EFFORT_LABELS } from '@/features/task-plugins/lib/request-plugins'
import { cn } from '@/lib/utils'

import {
  CHAT_IMAGE_LIMIT,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_TYPES,
  getSubmittableInputText,
  selectedChatImageUrls,
} from '../../lib'
import type { ModelOption, GroupOption, ChatReasoningEffort } from '../../types'
import { PlaygroundStarterPrompts } from '../chat/playground-starter-prompts'
import { PlaygroundInputControls } from './playground-input-controls'
import { PlaygroundInputTools } from './playground-input-tools'

const DEFAULT_REASONING_VALUE = '__default__'

interface PlaygroundInputProps {
  initialPrompt?: string
  draft?: { value: string; onChange: (text: string) => void }
  acceptsChatImages?: boolean
  onImageCountChange?: (count: number) => void
  onSubmit: (text: string, imageUrls?: string[]) => void
  onStop?: () => void
  disabled?: boolean
  canSubmit?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange?: (value: string) => void
  hasMessages?: boolean
  onClearMessages?: () => void
  showModelSelector?: boolean
  showWelcome?: boolean
  priceQuote?: ReactNode
  reasoning?: {
    choices: ChatReasoningEffort[]
    value: ChatReasoningEffort | ''
    defaultValue?: ChatReasoningEffort
    onChange: (value: ChatReasoningEffort | '') => void
  }
  webSearch?: {
    supported: boolean
    enabled: boolean
    onChange: (enabled: boolean) => void
  }
}

export function PlaygroundInput({
  acceptsChatImages = false,
  onImageCountChange,
  initialPrompt,
  draft,
  onSubmit,
  onStop,
  disabled,
  canSubmit = true,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  hasMessages = false,
  onClearMessages,
  showModelSelector = true,
  showWelcome = false,
  priceQuote,
  reasoning,
  webSearch,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [localText, setLocalText] = useState(initialPrompt ?? '')
  const text = draft?.value ?? localText
  const setText = draft?.onChange ?? setLocalText
  const textarea = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (message: PromptInputMessage) => {
    const submittableText = getSubmittableInputText(
      message,
      disabled || !canSubmit
    )

    if (!submittableText) return
    const files = message.files ?? []
    const images =
      files.length && acceptsChatImages ? selectedChatImageUrls(files) : []
    if (!images || (files.length && !acceptsChatImages)) {
      toast.error(t('No files match the accepted types.'))
      throw new Error('Invalid chat image')
    }
    if (images.length) onSubmit(submittableText, images)
    else onSubmit(submittableText)
    setText('')
  }

  return (
    <div className='pg-chat-composer'>
      {showWelcome && (
        <h2 className='pg-chat-welcome-title'>
          {t('What would you like to know?')}
        </h2>
      )}
      <PromptInput
        key={JSON.stringify([groupValue, modelValue, acceptsChatImages])}
        accept={CHAT_IMAGE_TYPES.join(',')}
        multiple
        attachmentsEnabled={acceptsChatImages && !disabled}
        maxFiles={CHAT_IMAGE_LIMIT}
        maxFileSize={CHAT_IMAGE_MAX_BYTES}
        onError={(error) => toast.error(error.message)}
        aria-label={t('Text Chat')}
        groupClassName='pg-chat-input-box'
        onSubmitCapture={(event) => {
          if (disabled || !canSubmit || !text.trim()) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onSubmit={handleSubmit}
      >
        {acceptsChatImages && (
          <PromptInputHeader className='empty:hidden'>
            <PromptInputAttachments>
              {(file) => <PromptInputAttachment data={file} />}
            </PromptInputAttachments>
          </PromptInputHeader>
        )}
        <PromptInputTextarea
          ref={textarea}
          aria-label={t('Ask anything')}
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='min-h-14 px-4 pt-3.5 pb-1 text-base leading-6 break-words sm:px-5'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('Ask anything')}
          value={text}
        />

        <PromptInputFooter className='pg-chat-composer-footer'>
          <PlaygroundInputControls
            allowSubmit={canSubmit}
            disabled={disabled}
            groups={groups}
            isGenerating={isGenerating}
            isModelLoading={isModelLoading}
            models={models}
            modelValue={modelValue}
            onModelChange={onModelChange}
            onStop={onStop}
            text={text}
            priceQuote={priceQuote}
            showModelSelector={showModelSelector}
            tools={
              <>
                {reasoning &&
                  (reasoning.choices.length > 0 ? (
                    <Select
                      value={reasoning.value || DEFAULT_REASONING_VALUE}
                      disabled={disabled}
                      onValueChange={(value) => {
                        if (!value || value === DEFAULT_REASONING_VALUE) {
                          reasoning.onChange('')
                          return
                        }
                        reasoning.onChange(
                          reasoning.choices.find(
                            (choice) => choice === value
                          ) ?? ''
                        )
                      }}
                    >
                      <SelectTrigger
                        aria-label={t('Thinking level')}
                        className='pg-composer-select rounded-full border-0 bg-[var(--bg-elevated)] py-0 data-[size=default]:h-[30px] dark:bg-[#1c1917] dark:hover:bg-[#24201d]'
                      >
                        <SparklesIcon size={13} aria-hidden='true' />
                        <SelectValue>
                          {reasoning.value
                            ? `${t('Thinking')} · ${REQUEST_PLUGIN_EFFORT_LABELS[reasoning.value]}`
                            : `${t('Thinking')} · ${t('Default')}`}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent
                        side='top'
                        align='start'
                        alignItemWithTrigger={false}
                        className='pg-composer-select-content'
                      >
                        <SelectItem value={DEFAULT_REASONING_VALUE}>
                          {reasoning.defaultValue
                            ? `${t('Default')} · ${REQUEST_PLUGIN_EFFORT_LABELS[reasoning.defaultValue]}`
                            : t('Use provider default')}
                        </SelectItem>
                        {reasoning.choices.map((value) => (
                          <SelectItem key={value} value={value} lang='en'>
                            {REQUEST_PLUGIN_EFFORT_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger render={<span className='inline-flex' />}>
                        <button
                          type='button'
                          disabled
                          aria-label={t('Thinking level')}
                          className='pg-composer-pill is-muted'
                        >
                          <SparklesIcon size={13} aria-hidden='true' />
                          <span>
                            {t('Thinking')} · {t('Default')}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {t(
                            'Current model or route does not declare selectable thinking levels; provider default will be used.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                {webSearch && (
                  <Tooltip>
                    <TooltipTrigger render={<span className='inline-flex' />}>
                      <button
                        type='button'
                        aria-pressed={webSearch.supported && webSearch.enabled}
                        disabled={disabled || !webSearch.supported}
                        className={cn(
                          'pg-composer-pill',
                          webSearch.supported && webSearch.enabled && 'is-on',
                          !webSearch.supported && 'is-muted'
                        )}
                        onClick={() => {
                          if (webSearch.supported) {
                            webSearch.onChange(!webSearch.enabled)
                          }
                        }}
                      >
                        <GlobeIcon size={13} aria-hidden='true' />
                        <span>{t('Online search')}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {webSearch.supported
                          ? t(
                              'Enable web search (gateway converts web_search_options to the upstream provider format; search fees may apply).'
                            )
                          : t(
                              'Web search is not declared for this model or route (only enabled on verified non-passthrough routes).'
                            )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <PlaygroundInputTools
                  acceptsChatImages={acceptsChatImages}
                  onImageCountChange={onImageCountChange}
                  disabled={disabled}
                  hasMessages={hasMessages}
                  onClearMessages={onClearMessages}
                />
              </>
            }
          />
        </PromptInputFooter>
      </PromptInput>
      {showWelcome && (
        <PlaygroundStarterPrompts
          disabled={disabled}
          onSelectPrompt={(prompt) => {
            setText(prompt)
            textarea.current?.focus({ preventScroll: true })
          }}
        />
      )}
    </div>
  )
}
