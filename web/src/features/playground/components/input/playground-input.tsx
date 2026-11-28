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
import { useCallback, useRef, useState, type ReactNode } from 'react'
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
  canSubmitInputMessage,
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_LIMIT,
  CHAT_ATTACHMENT_MAX_BYTES,
  parseChatAttachments,
} from '../../lib'
import type {
  ChatAttachment,
  ChatReasoningEffort,
  GroupOption,
  MessageAttachment,
  ModelOption,
} from '../../types'
import { PlaygroundStarterPrompts } from '../chat/playground-starter-prompts'
import { PlaygroundInputControls } from './playground-input-controls'
import { PlaygroundInputTools } from './playground-input-tools'

const DEFAULT_REASONING_VALUE = '__default__'
const ATTACHMENT_ERROR_KEYS = {
  limit: 'Too many files. Some were not added.',
  size: 'All files exceed the maximum size.',
  type: 'No files match the accepted types.',
  invalid: 'Failed to read attachment.',
} as const

interface PlaygroundInputProps {
  initialPrompt?: string
  draft?: { value: string; onChange: (text: string) => void }
  acceptsAttachments?: boolean
  acceptsChatImages?: boolean
  onAttachmentsChange?: (attachments: MessageAttachment[]) => void
  onImageCountChange?: (count: number) => void
  onSubmit: (text: string, attachments?: ChatAttachment[]) => void
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
  acceptsAttachments,
  acceptsChatImages = false,
  onAttachmentsChange,
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
  showModelSelector = true,
  showWelcome = false,
  priceQuote,
  reasoning,
  webSearch,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [localText, setLocalText] = useState(initialPrompt ?? '')
  const [attachmentCount, setAttachmentCount] = useState(0)
  const text = draft?.value ?? localText
  const setText = draft?.onChange ?? setLocalText
  const textarea = useRef<HTMLTextAreaElement>(null)
  const attachmentsEnabled = acceptsAttachments ?? acceptsChatImages

  const handleAttachmentCountChange = useCallback(
    (count: number) => {
      setAttachmentCount(count)
      onImageCountChange?.(count)
    },
    [onImageCountChange]
  )

  const handleAttachmentError = useCallback((error: { message: string }) => {
    toast.error(error.message)
  }, [])

  const handleSubmit = (message: PromptInputMessage) => {
    if (!canSubmitInputMessage(message, disabled || !canSubmit)) return
    const files = message.files ?? []
    if (files.length > 0) {
      if (!attachmentsEnabled) {
        toast.error(t('No files match the accepted types.'))
        throw new Error('Attachments disabled')
      }
      const parsed = parseChatAttachments(files)
      if (parsed.error || !parsed.attachments) {
        const errorMessage = t(ATTACHMENT_ERROR_KEYS[parsed.error ?? 'invalid'])
        toast.error(errorMessage)
        throw new Error('Invalid chat attachment')
      }
      onSubmit(message.text ?? '', parsed.attachments)
    } else {
      onSubmit(message.text ?? '')
    }
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
        key={JSON.stringify([groupValue, modelValue, attachmentsEnabled])}
        accept={CHAT_ATTACHMENT_ACCEPT}
        multiple
        attachmentsEnabled={attachmentsEnabled && !disabled}
        maxFiles={CHAT_ATTACHMENT_LIMIT}
        maxFileSize={CHAT_ATTACHMENT_MAX_BYTES}
        onError={handleAttachmentError}
        aria-label={t('Text Chat')}
        groupClassName='pg-chat-input-box'
        onSubmitCapture={(event) => {
          if (
            disabled ||
            !canSubmit ||
            (!text.trim() && attachmentCount === 0)
          ) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onSubmit={handleSubmit}
      >
        {attachmentsEnabled && (
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
          className='min-h-20 px-4 pt-4 pb-2 text-base leading-6 break-words sm:px-5'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('Ask anything')}
          value={text}
        />

        <PromptInputFooter className='pg-chat-composer-footer'>
          <PlaygroundInputControls
            allowSubmit={canSubmit}
            attachmentCount={attachmentCount}
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
                        title={t('Thinking level')}
                        className='pg-composer-select rounded-full border-0 bg-[var(--bg-elevated)] py-0 data-[size=default]:h-[30px] dark:bg-[#1c1917] dark:hover:bg-[#24201d]'
                      >
                        <SparklesIcon size={13} aria-hidden='true' />
                        <SelectValue>
                          {reasoning.value
                            ? REQUEST_PLUGIN_EFFORT_LABELS[reasoning.value]
                            : t('Default')}
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
                          <span>{t('Default')}</span>
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
                        aria-label={t('Online search')}
                        aria-pressed={webSearch.supported && webSearch.enabled}
                        disabled={disabled || !webSearch.supported}
                        className={cn(
                          'pg-composer-pill is-icon-only',
                          webSearch.supported && webSearch.enabled && 'is-on',
                          !webSearch.supported && 'is-muted'
                        )}
                        onClick={() => {
                          if (webSearch.supported) {
                            webSearch.onChange(!webSearch.enabled)
                          }
                        }}
                      >
                        <GlobeIcon size={15} aria-hidden='true' />
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
                  acceptsAttachments={attachmentsEnabled}
                  onAttachmentsChange={onAttachmentsChange}
                  onImageCountChange={handleAttachmentCountChange}
                  disabled={disabled}
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
