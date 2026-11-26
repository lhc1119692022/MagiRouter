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
  ChatApiProtocol,
  ChatCompletionMessage,
  ChatCompletionRequest,
  ContentPart,
  ResolvedChatApiProtocol,
} from '../../types'
import {
  isStreamDoneMessage,
  parseStreamErrorDetails,
  parseStreamMessageUpdates,
  type StreamErrorDetails,
  type StreamMessageUpdate,
} from './stream-utils'

const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096
const ANTHROPIC_API_VERSION = '2023-06-01'

export interface ChatApiProtocolOption {
  value: ChatApiProtocol
  labelKey: string
  endpointLabel?: string
}

export const CHAT_API_PROTOCOL_OPTIONS: readonly ChatApiProtocolOption[] = [
  {
    value: 'auto',
    labelKey: 'Default (Auto)',
  },
  {
    value: 'openai_chat',
    labelKey: 'OpenAI Chat',
    endpointLabel: '/v1/chat/completions',
  },
  {
    value: 'openai_responses',
    labelKey: 'OpenAI Responses',
    endpointLabel: '/v1/responses',
  },
  {
    value: 'anthropic_messages',
    labelKey: 'Anthropic Messages',
    endpointLabel: '/v1/messages',
  },
  {
    value: 'gemini_v1beta',
    labelKey: 'Google Gemini (v1beta)',
    endpointLabel: '/v1beta/models/{model}',
  },
] as const

export const RESOLVED_PROTOCOL_LABEL_KEYS: Record<
  ResolvedChatApiProtocol,
  string
> = {
  openai_chat: 'OpenAI Chat',
  openai_responses: 'OpenAI Responses',
  anthropic_messages: 'Anthropic Messages',
  gemini_v1beta: 'Google Gemini (v1beta)',
}

const CLAUDE_MODEL_PATTERN = /(^|[/:])claude\b/i
const OPENAI_RESPONSES_MODEL_PATTERN =
  /(^|[/:])(gpt-[56]($|[-._])|o[134]($|[-._])|codex\b)|codex/i
const GEMINI_MODEL_PATTERN = /(^|[/:])gemini\b/i

export function resolveChatApiProtocol(
  selected: ChatApiProtocol | undefined,
  model: string,
  supportedEndpointTypes?: readonly string[]
): ResolvedChatApiProtocol {
  if (selected && selected !== 'auto') {
    return selected
  }

  const normalized = model.trim().toLowerCase()
  const endpoints = new Set(
    (supportedEndpointTypes ?? []).map((item) => item.trim().toLowerCase())
  )

  if (CLAUDE_MODEL_PATTERN.test(normalized)) {
    return 'anthropic_messages'
  }
  if (OPENAI_RESPONSES_MODEL_PATTERN.test(normalized)) {
    return 'openai_responses'
  }
  if (GEMINI_MODEL_PATTERN.test(normalized)) {
    return 'gemini_v1beta'
  }

  if (
    endpoints.has('anthropic') &&
    !endpoints.has('openai') &&
    !endpoints.has('openai-response') &&
    !endpoints.has('gemini')
  ) {
    return 'anthropic_messages'
  }
  if (endpoints.has('openai-response') && !endpoints.has('openai')) {
    return 'openai_responses'
  }
  if (
    endpoints.has('gemini') &&
    !endpoints.has('openai') &&
    !endpoints.has('openai-response')
  ) {
    return 'gemini_v1beta'
  }

  return 'openai_chat'
}

export function getProtocolEndpointPath(
  protocol: ResolvedChatApiProtocol,
  model: string,
  stream: boolean
): string {
  switch (protocol) {
    case 'openai_responses':
      return '/v1/responses'
    case 'anthropic_messages':
      return '/v1/messages'
    case 'gemini_v1beta': {
      const encodedModel = encodeURIComponent(model.trim() || '{model}')
      return stream
        ? `/v1beta/models/${encodedModel}:streamGenerateContent?alt=sse`
        : `/v1beta/models/${encodedModel}:generateContent`
    }
    case 'openai_chat':
    default:
      return '/v1/chat/completions'
  }
}

export function getProtocolRequestHeaders(
  protocol: ResolvedChatApiProtocol,
  apiKey: string
): Record<string, string> {
  switch (protocol) {
    case 'anthropic_messages':
      return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      }
    case 'gemini_v1beta':
      return {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      }
    case 'openai_responses':
    case 'openai_chat':
    default:
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }
  }
}

export function getProtocolPreviewHeaders(
  protocol: ResolvedChatApiProtocol
): Record<string, string> {
  switch (protocol) {
    case 'anthropic_messages':
      return {
        'Content-Type': 'application/json',
        'x-api-key': '$MAGIROUTER_API_KEY',
        'anthropic-version': ANTHROPIC_API_VERSION,
      }
    case 'gemini_v1beta':
      return {
        'Content-Type': 'application/json',
        'x-goog-api-key': '$MAGIROUTER_API_KEY',
      }
    case 'openai_responses':
    case 'openai_chat':
    default:
      return {
        'Content-Type': 'application/json',
        Authorization: 'Bearer $MAGIROUTER_API_KEY',
      }
  }
}

function extractTextFromContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') {
    return content
  }
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text ?? '')
    .join('\n')
}

function splitSystemMessages(messages: ChatCompletionMessage[]): {
  systemText: string
  conversation: ChatCompletionMessage[]
} {
  const systemParts: string[] = []
  const conversation: ChatCompletionMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      const text = extractTextFromContent(message.content).trim()
      if (text) systemParts.push(text)
    } else {
      conversation.push(message)
    }
  }
  return { systemText: systemParts.join('\n\n'), conversation }
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/i)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

function buildOpenAIResponsesBody(
  payload: ChatCompletionRequest
): Record<string, unknown> {
  const { systemText, conversation } = splitSystemMessages(payload.messages)
  const input = conversation.map((message) => {
    if (typeof message.content === 'string') {
      return { role: message.role, content: message.content }
    }
    const parts = message.content
      .map((part) => {
        if (part.type === 'text') {
          return {
            type: message.role === 'assistant' ? 'output_text' : 'input_text',
            text: part.text ?? '',
          }
        }
        if (part.type === 'image_url' && part.image_url?.url) {
          return {
            type: 'input_image',
            image_url: part.image_url.url,
          }
        }
        return null
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
    return { role: message.role, content: parts }
  })

  const body: Record<string, unknown> = {
    model: payload.model,
    input,
    stream: payload.stream,
  }
  if (systemText) {
    body.instructions = systemText
  }
  if (payload.temperature !== undefined) {
    body.temperature = payload.temperature
  }
  if (payload.top_p !== undefined) {
    body.top_p = payload.top_p
  }
  if (payload.max_tokens !== undefined) {
    body.max_output_tokens = payload.max_tokens
  }
  if (payload.reasoning_effort) {
    body.reasoning = { effort: payload.reasoning_effort }
  }
  if (payload.web_search_options) {
    body.tools = [{ type: 'web_search_preview' }]
  }
  return body
}

function buildAnthropicMessagesBody(
  payload: ChatCompletionRequest
): Record<string, unknown> {
  const { systemText, conversation } = splitSystemMessages(payload.messages)
  const messages = conversation.map((message) => {
    if (typeof message.content === 'string') {
      return { role: message.role, content: message.content }
    }
    const blocks = message.content
      .map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text ?? '' }
        }
        if (part.type === 'image_url' && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url)
          if (parsed) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: parsed.mimeType,
                data: parsed.data,
              },
            }
          }
          return {
            type: 'image',
            source: {
              type: 'url',
              url: part.image_url.url,
            },
          }
        }
        return null
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
    return { role: message.role, content: blocks }
  })

  const body: Record<string, unknown> = {
    model: payload.model,
    max_tokens: payload.max_tokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
    messages,
    stream: payload.stream,
  }
  if (systemText) {
    body.system = systemText
  }
  if (payload.temperature !== undefined) {
    body.temperature = payload.temperature
  }
  if (payload.top_p !== undefined) {
    body.top_p = payload.top_p
  }
  if (payload.reasoning_effort && payload.reasoning_effort !== 'none') {
    body.output_config = { effort: payload.reasoning_effort }
  }
  if (payload.web_search_options) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
  }
  return body
}

function buildGeminiV1BetaBody(
  payload: ChatCompletionRequest
): Record<string, unknown> {
  const { systemText, conversation } = splitSystemMessages(payload.messages)
  const contents = conversation.map((message) => {
    const role = message.role === 'assistant' ? 'model' : 'user'
    if (typeof message.content === 'string') {
      return { role, parts: [{ text: message.content }] }
    }
    const parts = message.content
      .map((part) => {
        if (part.type === 'text') {
          return { text: part.text ?? '' }
        }
        if (part.type === 'image_url' && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url)
          if (parsed) {
            return {
              inlineData: {
                mimeType: parsed.mimeType,
                data: parsed.data,
              },
            }
          }
          return {
            fileData: {
              fileUri: part.image_url.url,
            },
          }
        }
        return null
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
    return { role, parts }
  })

  const body: Record<string, unknown> = { contents }
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] }
  }

  const generationConfig: Record<string, unknown> = {}
  if (payload.temperature !== undefined) {
    generationConfig.temperature = payload.temperature
  }
  if (payload.top_p !== undefined) {
    generationConfig.topP = payload.top_p
  }
  if (payload.max_tokens !== undefined) {
    generationConfig.maxOutputTokens = payload.max_tokens
  }
  if (payload.seed !== undefined) {
    generationConfig.seed = payload.seed
  }
  if (payload.reasoning_effort) {
    generationConfig.thinkingConfig =
      payload.reasoning_effort === 'none'
        ? { thinkingBudget: 0 }
        : {
            includeThoughts: true,
            thinkingLevel: payload.reasoning_effort.toUpperCase(),
          }
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig
  }
  if (payload.web_search_options) {
    body.tools = [{ googleSearch: {} }]
  }
  return body
}

export function buildProtocolRequestBody(
  protocol: ResolvedChatApiProtocol,
  payload: ChatCompletionRequest
): Record<string, unknown> | ChatCompletionRequest {
  switch (protocol) {
    case 'openai_responses':
      return buildOpenAIResponsesBody(payload)
    case 'anthropic_messages':
      return buildAnthropicMessagesBody(payload)
    case 'gemini_v1beta':
      return buildGeminiV1BetaBody(payload)
    case 'openai_chat':
    default:
      return payload
  }
}

export function getProtocolStreamEventNames(
  protocol: ResolvedChatApiProtocol
): readonly string[] {
  switch (protocol) {
    case 'openai_responses':
      return [
        'message',
        'response.output_text.delta',
        'response.text.delta',
        'response.reasoning_summary_text.delta',
        'response.reasoning_text.delta',
        'response.reasoning.delta',
        'response.completed',
        'response.incomplete',
        'response.failed',
      ]
    case 'anthropic_messages':
      return [
        'message',
        'content_block_start',
        'content_block_delta',
        'message_stop',
      ]
    case 'gemini_v1beta':
    case 'openai_chat':
    default:
      return ['message']
  }
}

export interface ProtocolStreamEventResult {
  updates: StreamMessageUpdate[]
  done?: boolean
  error?: StreamErrorDetails
}

function extractResponsesOutputUpdates(
  responseObject: Record<string, unknown>
): StreamMessageUpdate[] {
  const updates: StreamMessageUpdate[] = []
  const output = responseObject.output
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (entry.type === 'reasoning') {
        if (Array.isArray(entry.summary)) {
          for (const part of entry.summary) {
            if (
              part &&
              typeof part === 'object' &&
              typeof (part as { text?: unknown }).text === 'string' &&
              (part as { text: string }).text
            ) {
              updates.push({
                type: 'reasoning',
                chunk: (part as { text: string }).text,
              })
            }
          }
        }
        if (Array.isArray(entry.content)) {
          for (const part of entry.content) {
            if (
              part &&
              typeof part === 'object' &&
              typeof (part as { text?: unknown }).text === 'string' &&
              (part as { text: string }).text
            ) {
              updates.push({
                type: 'reasoning',
                chunk: (part as { text: string }).text,
              })
            }
          }
        }
      } else if (Array.isArray(entry.content)) {
        for (const part of entry.content) {
          if (!part || typeof part !== 'object') continue
          const contentPart = part as { type?: string; text?: unknown }
          if (typeof contentPart.text === 'string' && contentPart.text) {
            updates.push({
              type:
                contentPart.type === 'reasoning_text' ? 'reasoning' : 'content',
              chunk: contentPart.text,
            })
          }
        }
      }
    }
  }
  if (
    updates.length === 0 &&
    typeof responseObject.output_text === 'string' &&
    responseObject.output_text
  ) {
    updates.push({ type: 'content', chunk: responseObject.output_text })
  }
  return updates
}

function parseGeminiCandidatesUpdates(
  parsed: Record<string, unknown>
): StreamMessageUpdate[] {
  const updates: StreamMessageUpdate[] = []
  const candidates = parsed.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return updates
  }
  const first = candidates[0] as {
    content?: { parts?: Array<{ text?: unknown; thought?: unknown }> }
  }
  const parts = first?.content?.parts
  if (!Array.isArray(parts)) {
    return updates
  }
  for (const part of parts) {
    if (!part || typeof part.text !== 'string' || !part.text) continue
    updates.push({
      type: part.thought === true ? 'reasoning' : 'content',
      chunk: part.text,
    })
  }
  return updates
}

export function parseProtocolStreamEvent(
  protocol: ResolvedChatApiProtocol,
  eventType: string,
  data: string
): ProtocolStreamEventResult {
  if (isStreamDoneMessage(data)) {
    return { updates: [], done: true }
  }

  if (protocol === 'openai_chat') {
    return { updates: parseStreamMessageUpdates(data) }
  }

  const parsed = JSON.parse(data) as Record<string, unknown>
  if (parsed?.error) {
    return { updates: [], error: parseStreamErrorDetails(data) }
  }

  const resolvedEventType =
    typeof parsed.type === 'string' && parsed.type ? parsed.type : eventType

  if (protocol === 'openai_responses') {
    switch (resolvedEventType) {
      case 'response.output_text.delta':
      case 'response.text.delta':
        return {
          updates:
            typeof parsed.delta === 'string' && parsed.delta
              ? [{ type: 'content', chunk: parsed.delta }]
              : [],
        }
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta':
      case 'response.reasoning.delta':
        return {
          updates:
            typeof parsed.delta === 'string' && parsed.delta
              ? [{ type: 'reasoning', chunk: parsed.delta }]
              : [],
        }
      case 'response.completed':
      case 'response.incomplete':
        return { updates: [], done: true }
      case 'response.failed': {
        const failedResponse = parsed.response as
          | { error?: { code?: string; message?: string } }
          | undefined
        return {
          updates: [],
          error: {
            errorCode: failedResponse?.error?.code || undefined,
            errorMessage:
              failedResponse?.error?.message ||
              parseStreamErrorDetails(data).errorMessage,
          },
        }
      }
      default:
        return { updates: [] }
    }
  }

  if (protocol === 'anthropic_messages') {
    if (resolvedEventType === 'message_stop') {
      return { updates: [], done: true }
    }
    if (resolvedEventType === 'content_block_delta') {
      const delta = parsed.delta as
        | { type?: string; text?: string; thinking?: string }
        | undefined
      if (delta?.type === 'text_delta' && delta.text) {
        return { updates: [{ type: 'content', chunk: delta.text }] }
      }
      if (delta?.type === 'thinking_delta' && delta.thinking) {
        return { updates: [{ type: 'reasoning', chunk: delta.thinking }] }
      }
      return { updates: [] }
    }
    if (resolvedEventType === 'content_block_start') {
      const block = parsed.content_block as
        | { type?: string; text?: string; thinking?: string }
        | undefined
      if (block?.type === 'text' && block.text) {
        return { updates: [{ type: 'content', chunk: block.text }] }
      }
      if (block?.type === 'thinking' && block.thinking) {
        return { updates: [{ type: 'reasoning', chunk: block.thinking }] }
      }
      return { updates: [] }
    }
    return { updates: [] }
  }

  // gemini_v1beta
  return { updates: parseGeminiCandidatesUpdates(parsed) }
}

export interface ExtractedNonStreamResult {
  content: string
  reasoning?: string
}

export function extractProtocolNonStreamResult(
  protocol: ResolvedChatApiProtocol,
  response: unknown
): ExtractedNonStreamResult | null {
  if (!response || typeof response !== 'object') {
    return null
  }
  const data = response as Record<string, unknown>

  if (protocol === 'openai_chat') {
    const choices = data.choices as
      | Array<{
          message?: {
            content?: string
            reasoning_content?: string | null
            reasoning?: string | null
          }
        }>
      | undefined
    const choice = choices?.[0]
    if (!choice) return null
    return {
      content: choice.message?.content || '',
      reasoning:
        choice.message?.reasoning_content ??
        choice.message?.reasoning ??
        undefined,
    }
  }

  if (protocol === 'openai_responses') {
    const updates = extractResponsesOutputUpdates(data)
    if (updates.length === 0) return null
    const content = updates
      .filter((item) => item.type === 'content')
      .map((item) => item.chunk)
      .join('')
    const reasoning = updates
      .filter((item) => item.type === 'reasoning')
      .map((item) => item.chunk)
      .join('')
    return {
      content,
      reasoning: reasoning || undefined,
    }
  }

  if (protocol === 'anthropic_messages') {
    const contentBlocks = data.content
    if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) {
      return null
    }
    const textParts: string[] = []
    const reasoningParts: string[] = []
    for (const block of contentBlocks) {
      if (!block || typeof block !== 'object') continue
      const entry = block as {
        type?: string
        text?: string
        thinking?: string
      }
      if (entry.type === 'text' && entry.text) {
        textParts.push(entry.text)
      } else if (entry.type === 'thinking' && entry.thinking) {
        reasoningParts.push(entry.thinking)
      }
    }
    return {
      content: textParts.join(''),
      reasoning: reasoningParts.length ? reasoningParts.join('') : undefined,
    }
  }

  // gemini_v1beta
  const updates = parseGeminiCandidatesUpdates(data)
  if (updates.length === 0) return null
  const content = updates
    .filter((item) => item.type === 'content')
    .map((item) => item.chunk)
    .join('')
  const reasoning = updates
    .filter((item) => item.type === 'reasoning')
    .map((item) => item.chunk)
    .join('')
  return {
    content,
    reasoning: reasoning || undefined,
  }
}
