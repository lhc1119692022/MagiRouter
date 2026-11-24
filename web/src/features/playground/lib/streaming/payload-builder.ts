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
import type {
  ChatCompletionRequest,
  ChatCompletionMessage,
  Message,
  PlaygroundConfig,
} from '../../types'
import {
  buildMessageContent,
  formatMessageForAPI,
  isValidMessage,
} from '../message/message-utils'
import {
  isValidPlaygroundParameterValue,
  PLAYGROUND_PARAMETER_CONTROLS,
} from '../parameters/playground-parameters'

/**
 * Build API request payload from messages and config
 */
export function buildChatCompletionPayload(
  messages: Message[],
  config: PlaygroundConfig,
  draft?: string,
  imageUrls?: string[]
): ChatCompletionRequest {
  // Filter and format valid messages
  let processedMessages: ChatCompletionMessage[] = messages
    .filter(isValidMessage)
    .map(formatMessageForAPI)
  if (draft?.trim()) processedMessages.push({ role: 'user', content: draft })
  const current = processedMessages.at(-1)
  if (
    imageUrls?.length &&
    current?.role === 'user' &&
    typeof current.content === 'string'
  ) {
    current.content = buildMessageContent(current.content, imageUrls)
  }
  let remaining = config.historyTurns
  if (remaining > 0) {
    for (let index = processedMessages.length - 1; index >= 0; index--) {
      if (processedMessages[index].role !== 'user' || --remaining !== 0) {
        continue
      }
      processedMessages = processedMessages.filter(
        (message, position) => position >= index || message.role === 'system'
      )
      break
    }
  }

  return {
    model: config.model,
    group: config.group,
    messages: processedMessages,
    stream: config.stream,
    ...getChatParameterOverrides(config),
    ...(config.web_search
      ? { web_search_options: { search_context_size: 'medium' as const } }
      : {}),
  }
}

export function getChatParameterOverrides(config: PlaygroundConfig) {
  const overrides: Pick<
    ChatCompletionRequest,
    keyof PlaygroundConfig['parameterEnabled'] | 'reasoning_effort'
  > = {}
  if (config.reasoning_effort) {
    overrides.reasoning_effort = config.reasoning_effort
  }
  for (const control of PLAYGROUND_PARAMETER_CONTROLS) {
    const value = config[control.key]
    if (
      config.parameterEnabled[control.key] &&
      isValidPlaygroundParameterValue(control, value)
    ) {
      overrides[control.key] = value
    }
  }

  return overrides
}
