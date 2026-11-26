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
import { useCallback, useState } from 'react'

import {
  appendUserMessagePair,
  applyMessageEdit,
  createRegeneratedMessages,
  removeMessageByKey,
  toMessageAttachment,
} from '../lib'
import type { ChatAttachment, Message } from '../types'

type UsePlaygroundConversationOptions = {
  messages: Message[]
  updateMessages: (
    updater: Message[] | ((prev: Message[]) => Message[])
  ) => void
  sendChat: (
    messages: Message[],
    attachments?: ChatAttachment[],
    sessionAttachmentsByKey?: ReadonlyMap<string, ChatAttachment[]>
  ) => void
}

export function usePlaygroundConversation({
  messages,
  updateMessages,
  sendChat,
}: UsePlaygroundConversationOptions) {
  const [editingMessageKey, setEditingMessageKey] = useState<string | null>(
    null
  )
  const [sessionAttachments, setSessionAttachments] = useState<
    ReadonlyMap<string, ChatAttachment[]>
  >(() => new Map())

  const handleSendMessage = useCallback(
    (text: string, attachments?: ChatAttachment[]) => {
      const metadata = attachments?.length
        ? attachments.map(toMessageAttachment)
        : undefined
      const nextMessages = appendUserMessagePair(messages, text, metadata)
      const userMessage = nextMessages.at(-2)
      let nextSessionAttachments = sessionAttachments
      if (userMessage && attachments?.length) {
        const updated = new Map(sessionAttachments)
        updated.set(userMessage.key, attachments)
        nextSessionAttachments = updated
        setSessionAttachments(updated)
      }
      updateMessages(nextMessages)
      if (attachments?.length) {
        sendChat(nextMessages, attachments, nextSessionAttachments)
      } else {
        sendChat(nextMessages, undefined, nextSessionAttachments)
      }
    },
    [messages, sessionAttachments, updateMessages, sendChat]
  )

  const handleRegenerateMessage = useCallback(
    (message: Message) => {
      const nextMessages = createRegeneratedMessages(messages, message.key)
      if (!nextMessages) return

      updateMessages(nextMessages)
      sendChat(nextMessages, undefined, sessionAttachments)
    },
    [messages, sessionAttachments, updateMessages, sendChat]
  )

  const handleEditMessage = useCallback((message: Message) => {
    setEditingMessageKey(message.key)
  }, [])

  const handleEditOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingMessageKey(null)
    }
  }, [])

  const applyEdit = useCallback(
    (newContent: string, shouldSubmit: boolean) => {
      if (!editingMessageKey) return

      const editResult = applyMessageEdit(
        messages,
        editingMessageKey,
        newContent,
        shouldSubmit
      )
      if (!editResult) return

      setEditingMessageKey(null)
      updateMessages(editResult.messages)

      if (editResult.shouldSend) {
        sendChat(editResult.messages, undefined, sessionAttachments)
      }
    },
    [editingMessageKey, messages, sessionAttachments, updateMessages, sendChat]
  )

  const handleDeleteMessage = useCallback(
    (message: Message) => {
      setSessionAttachments((previous) => {
        if (!previous.has(message.key)) return previous
        const updated = new Map(previous)
        updated.delete(message.key)
        return updated
      })
      updateMessages((previousMessages) =>
        removeMessageByKey(previousMessages, message.key)
      )
    },
    [updateMessages]
  )

  const clearSessionAttachments = useCallback(() => {
    setSessionAttachments(new Map())
  }, [])

  return {
    editingMessageKey,
    sessionAttachments,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
    clearSessionAttachments,
  }
}
