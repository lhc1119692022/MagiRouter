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
import { nanoid } from 'nanoid'

import { MESSAGE_ROLES, MESSAGE_STATUS } from '../../constants'
import type {
  ChatAttachment,
  Message,
  MessageAttachment,
  MessageVersion,
  ChatCompletionMessage,
  ContentPart,
} from '../../types'

/**
 * Create a new message version
 */
export function createMessageVersion(content: string): MessageVersion {
  return {
    id: nanoid(),
    content,
  }
}

/**
 * Get current version from message (always returns the first version)
 */
export function getCurrentVersion(message: Message): MessageVersion {
  return message.versions[0] || { id: 'default', content: '' }
}

/**
 * Get displayable content from the current message version.
 */
export function getMessageContent(message: Message): string {
  return getCurrentVersion(message).content
}

/**
 * Check whether a message has non-empty content in its current version.
 */
export function hasMessageContent(message: Message): boolean {
  return (
    getMessageContent(message).trim() !== '' ||
    (message.attachments?.length ?? 0) > 0
  )
}

/**
 * Update current version content in message
 */
export function updateCurrentVersionContent(
  message: Message,
  content: string
): Message {
  const currentVersion = getCurrentVersion(message)
  return {
    ...message,
    versions: [{ ...currentVersion, content }],
  }
}

/**
 * Create a user message
 */
export function createUserMessage(
  content: string,
  createdAt: number = Date.now(),
  attachments?: MessageAttachment[]
): Message {
  return {
    key: nanoid(),
    from: MESSAGE_ROLES.USER,
    versions: [createMessageVersion(content)],
    ...(attachments?.length ? { attachments } : {}),
    createdAt,
  }
}

/**
 * Create a loading assistant message
 */
export function createLoadingAssistantMessage(
  startedAt: number = Date.now()
): Message {
  return {
    key: nanoid(),
    from: MESSAGE_ROLES.ASSISTANT,
    versions: [createMessageVersion('')],
    createdAt: startedAt,
    startedAt,
    reasoning: undefined,
    isReasoningComplete: false,
    isContentComplete: false,
    isReasoningStreaming: false,
    status: MESSAGE_STATUS.LOADING,
  }
}

function formatTextAttachment(attachment: ChatAttachment): string {
  const safeName = attachment.name.replaceAll('"', "'")
  return `<file name="${safeName}" type="${attachment.mediaType}">\n${attachment.textContent ?? ''}\n</file>`
}

/**
 * Build message content with optional image URLs or structured attachments
 */
export function buildMessageContent(
  text: string,
  attachments: (string | ChatAttachment)[] = []
): string | ContentPart[] {
  const mediaParts: ContentPart[] = []

  for (const item of attachments) {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed) {
        mediaParts.push({
          type: 'image_url',
          image_url: { url: trimmed },
        })
      }
      continue
    }

    if (item.kind === 'image' && item.url?.trim()) {
      mediaParts.push({
        type: 'image_url',
        image_url: { url: item.url.trim() },
      })
      continue
    }

    if (item.kind === 'pdf' && item.url?.trim()) {
      mediaParts.push({
        type: 'file',
        file: {
          filename: item.name || 'document.pdf',
          file_data: item.url.trim(),
        },
      })
      continue
    }

    if (item.kind === 'text') {
      mediaParts.push({
        type: 'text',
        text: formatTextAttachment(item),
      })
    }
  }

  if (mediaParts.length === 0) {
    return text
  }

  const parts: ContentPart[] = []
  if (text.length > 0) {
    parts.push({
      type: 'text',
      text,
    })
  }
  parts.push(...mediaParts)

  return parts
}

/**
 * Extract text content from message content
 */
export function getTextContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const textPart = content.find((part) => part.type === 'text')
    return textPart?.text || ''
  }

  return ''
}

/**
 * Format message for API request
 */
export function formatMessageForAPI(
  message: Message,
  attachments?: ChatAttachment[]
): ChatCompletionMessage {
  const currentVersion = getCurrentVersion(message)
  return {
    role: message.from,
    content: attachments?.length
      ? buildMessageContent(currentVersion.content, attachments)
      : currentVersion.content,
  }
}

/**
 * Check if message is valid for API request
 * Excludes loading/streaming assistant messages and empty content
 */
export function isValidMessage(message: Message): boolean {
  if (!message || !message.from || !message.versions.length) return false

  // Exclude empty assistant messages (loading/streaming placeholders)
  if (message.from === MESSAGE_ROLES.ASSISTANT && !hasMessageContent(message)) {
    return false
  }

  return true
}
