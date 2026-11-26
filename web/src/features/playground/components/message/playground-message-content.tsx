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
import {
  DownloadIcon,
  FileDownIcon,
  FileTextIcon,
  ImageIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import {
  downloadTextFile,
  formatFileSize,
} from '@/components/ai-elements/code-block-file'
import { Loader } from '@/components/ai-elements/loader'
import { MessageContent } from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { MESSAGE_STATUS } from '../../constants'
import {
  extractOutputFiles,
  getMessageAlignmentClass,
  getMessageContentState,
  isErrorMessage,
  type MessageAlignment,
} from '../../lib'
import { getMessageContentStyles } from '../../lib/message/message-styles'
import type { Message } from '../../types'
import { MessageError } from './message-error'
import { MessageMetadata } from './message-metadata'

type PlaygroundMessageContentProps = {
  actions: ReactNode
  alignment: MessageAlignment
  errorActions?: ReactNode
  isSourceVisible?: boolean
  message: Message
  versionContent: string
}

export function PlaygroundMessageContent({
  actions,
  alignment,
  errorActions,
  isSourceVisible = false,
  message,
  versionContent,
}: PlaygroundMessageContentProps) {
  const { t } = useTranslation()
  const {
    attachments,
    displayContent,
    hasAttachments,
    hasReasoning,
    hasSources,
    isAssistant,
    reasoningContent,
    showLoader,
    showMessageContent,
    sources,
  } = getMessageContentState(message, versionContent)
  const isError = isErrorMessage(message)
  const isMessageFinal =
    message.status !== MESSAGE_STATUS.LOADING &&
    message.status !== MESSAGE_STATUS.STREAMING
  const outputFiles = useMemo(
    () =>
      isAssistant && isMessageFinal && !isError
        ? extractOutputFiles(displayContent)
        : [],
    [displayContent, isAssistant, isError, isMessageFinal]
  )
  const hasTextContent = displayContent.length > 0
  const attachmentItems = useMemo(() => {
    const seen = new Map<string, number>()
    return attachments.map((attachment) => {
      const baseKey = `${attachment.kind}:${attachment.name}:${attachment.size ?? ''}`
      const occurrence = (seen.get(baseKey) ?? 0) + 1
      seen.set(baseKey, occurrence)
      return { attachment, key: `${baseKey}#${occurrence}` }
    })
  }, [attachments])

  let messageBody: ReactNode = null
  if (isSourceVisible) {
    messageBody = (
      <CodeBlock
        code={versionContent}
        className='my-0 group-[.is-assistant]:w-full group-[.is-assistant]:max-w-[78ch]'
        collapsedLines={24}
        defaultCollapsed={false}
        language='markdown'
        maxExpandedLines={48}
        showLineNumbers
        showToolbar
        title={t('Raw response')}
      >
        <CodeBlockCopyButton />
      </CodeBlock>
    )
  } else if (hasTextContent) {
    messageBody = (
      <MessageContent variant='flat' className={cn(getMessageContentStyles())}>
        <Response final={isMessageFinal}>{displayContent}</Response>
      </MessageContent>
    )
  }

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col',
        getMessageAlignmentClass(alignment)
      )}
    >
      {hasSources && (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source
                href={source.href}
                key={`${source.href}-${source.title}`}
                title={source.title}
              />
            ))}
          </SourcesContent>
        </Sources>
      )}

      {hasReasoning && (
        <Reasoning
          defaultOpen
          duration={message.reasoning?.duration}
          isStreaming={message.isReasoningStreaming}
        >
          <ReasoningTrigger />
          <ReasoningContent>{reasoningContent}</ReasoningContent>
        </Reasoning>
      )}

      {showLoader && (
        <div className='flex items-center gap-2 py-2'>
          <Loader />
          <Shimmer className='text-sm' duration={1}>
            {t('Responding...')}
          </Shimmer>
        </div>
      )}

      {isError && (
        <>
          <MessageError message={message} className='mb-2' />
          <MessageMetadata alignment={alignment} message={message} />
          {errorActions}
        </>
      )}

      {!isError && showMessageContent && (
        <>
          {hasAttachments && (
            <div
              className={cn(
                'pg-message-attachments',
                alignment === 'end' && 'justify-end'
              )}
            >
              {attachmentItems.map(({ attachment, key }) => (
                <span className='pg-message-attachment-chip' key={key}>
                  {attachment.kind === 'image' ? (
                    <ImageIcon size={13} aria-hidden='true' />
                  ) : (
                    <FileTextIcon size={13} aria-hidden='true' />
                  )}
                  <span className='pg-message-attachment-name'>
                    {attachment.name}
                  </span>
                  {attachment.size !== undefined && (
                    <span className='pg-message-attachment-meta'>
                      {formatFileSize(attachment.size)}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
          {messageBody}
          {!isSourceVisible && outputFiles.length > 0 && (
            <div className='pg-output-files' aria-label={t('Generated files')}>
              <div className='pg-output-files-head'>
                <span className='pg-output-files-title'>
                  <FileDownIcon size={14} aria-hidden='true' />
                  <span>{t('Generated files')}</span>
                  <span className='pg-output-files-count'>
                    {outputFiles.length}
                  </span>
                </span>
                {outputFiles.length > 1 && (
                  <Button
                    className='h-7 px-2.5 text-xs'
                    onClick={() => {
                      for (const file of outputFiles) {
                        downloadTextFile(
                          file.content,
                          file.filename,
                          file.mimeType
                        )
                      }
                    }}
                    size='sm'
                    type='button'
                    variant='outline'
                  >
                    <DownloadIcon size={13} aria-hidden='true' />
                    <span>{t('Download all')}</span>
                  </Button>
                )}
              </div>
              <div className='pg-output-file-list'>
                {outputFiles.map((file) => (
                  <div className='pg-output-file-card' key={file.id}>
                    <div className='pg-output-file-info'>
                      <FileTextIcon
                        className='text-muted-foreground shrink-0'
                        size={15}
                        aria-hidden='true'
                      />
                      <div className='min-w-0'>
                        <div className='pg-output-file-name'>
                          {file.filename}
                        </div>
                        <div className='pg-output-file-meta'>
                          {formatFileSize(file.sizeBytes)} ·{' '}
                          {t('{{count}} lines', { count: file.lineCount })}
                        </div>
                      </div>
                    </div>
                    <Button
                      aria-label={t('Download {{filename}}', {
                        filename: file.filename,
                      })}
                      className='h-7 shrink-0 px-2.5 text-xs'
                      onClick={() =>
                        downloadTextFile(
                          file.content,
                          file.filename,
                          file.mimeType
                        )
                      }
                      size='sm'
                      type='button'
                      variant='secondary'
                    >
                      <DownloadIcon size={13} aria-hidden='true' />
                      <span>{t('Download')}</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <MessageMetadata alignment={alignment} message={message} />
          {actions}
        </>
      )}
    </div>
  )
}
