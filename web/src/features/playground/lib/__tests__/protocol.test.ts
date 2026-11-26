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
import { describe, expect, test } from 'vitest'

import type { ChatCompletionRequest } from '../../types'
import {
  buildProtocolRequestBody,
  extractProtocolNonStreamResult,
  getProtocolEndpointPath,
  getProtocolPreviewHeaders,
  getProtocolRequestHeaders,
  parseProtocolStreamEvent,
  resolveChatApiProtocol,
} from '../streaming/protocol'

const basePayload: ChatCompletionRequest = {
  model: 'claude-sonnet-5-5',
  messages: [
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,AAAA' },
        },
      ],
    },
  ],
  stream: true,
  temperature: 0.4,
  top_p: 0.9,
  max_tokens: 512,
  reasoning_effort: 'high',
  web_search_options: { search_context_size: 'medium' },
}

describe('resolveChatApiProtocol', () => {
  test('auto-detects native protocol by model family', () => {
    expect(resolveChatApiProtocol('auto', 'claude-sonnet-5-5')).toBe(
      'anthropic_messages'
    )
    expect(resolveChatApiProtocol('auto', 'anthropic/claude-opus-5-5')).toBe(
      'anthropic_messages'
    )
    expect(resolveChatApiProtocol('auto', 'gpt-6.2-astra')).toBe(
      'openai_responses'
    )
    expect(resolveChatApiProtocol('auto', 'gpt-5.6-sol')).toBe(
      'openai_responses'
    )
    expect(resolveChatApiProtocol('auto', 'o3-mini')).toBe('openai_responses')
    expect(resolveChatApiProtocol('auto', 'gpt-5-codex')).toBe(
      'openai_responses'
    )
    expect(resolveChatApiProtocol('auto', 'gemini-4-neon')).toBe(
      'gemini_v1beta'
    )
    expect(resolveChatApiProtocol('auto', 'deepseek-v4.1-flash')).toBe(
      'openai_chat'
    )
    expect(resolveChatApiProtocol('auto', 'grok-4.7')).toBe('openai_chat')
    expect(resolveChatApiProtocol('auto', 'gpt-4o')).toBe('openai_chat')
  })

  test('respects explicit manual protocol overrides', () => {
    expect(resolveChatApiProtocol('openai_chat', 'claude-sonnet-5-5')).toBe(
      'openai_chat'
    )
    expect(resolveChatApiProtocol('gemini_v1beta', 'gpt-6.2-astra')).toBe(
      'gemini_v1beta'
    )
  })

  test('falls back to supported endpoint types for custom aliases', () => {
    expect(
      resolveChatApiProtocol('auto', 'custom-alias', ['openai-response'])
    ).toBe('openai_responses')
    expect(resolveChatApiProtocol('auto', 'custom-alias', ['anthropic'])).toBe(
      'anthropic_messages'
    )
    expect(resolveChatApiProtocol('auto', 'custom-alias', ['gemini'])).toBe(
      'gemini_v1beta'
    )
  })
})

describe('protocol endpoints, headers, and request payloads', () => {
  test('builds paths and headers for all four protocols', () => {
    expect(getProtocolEndpointPath('openai_chat', 'deepseek-v4', true)).toBe(
      '/v1/chat/completions'
    )
    expect(getProtocolEndpointPath('openai_responses', 'gpt-6-sol', true)).toBe(
      '/v1/responses'
    )
    expect(
      getProtocolEndpointPath('anthropic_messages', 'claude-sonnet-5-5', true)
    ).toBe('/v1/messages')
    expect(
      getProtocolEndpointPath('gemini_v1beta', 'gemini-4-neon', true)
    ).toBe('/v1beta/models/gemini-4-neon:streamGenerateContent?alt=sse')
    expect(
      getProtocolEndpointPath('gemini_v1beta', 'gemini-4-neon', false)
    ).toBe('/v1beta/models/gemini-4-neon:generateContent')

    expect(getProtocolRequestHeaders('anthropic_messages', 'sk-test')).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
    })
    expect(getProtocolPreviewHeaders('gemini_v1beta')).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': '$MAGIROUTER_API_KEY',
    })
  })

  test('converts chat payload to OpenAI Responses format', () => {
    const body = buildProtocolRequestBody('openai_responses', {
      ...basePayload,
      model: 'gpt-6.2-astra',
    })
    expect(body).toEqual({
      model: 'gpt-6.2-astra',
      instructions: 'Be concise.',
      input: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Describe this' },
            { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
          ],
        },
      ],
      stream: true,
      temperature: 0.4,
      top_p: 0.9,
      max_output_tokens: 512,
      reasoning: { effort: 'high' },
      tools: [{ type: 'web_search_preview' }],
    })
  })

  test('converts chat payload to Anthropic Messages format', () => {
    const body = buildProtocolRequestBody('anthropic_messages', basePayload)
    expect(body).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 512,
      system: 'Be concise.',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'AAAA',
              },
            },
          ],
        },
      ],
      stream: true,
      temperature: 0.4,
      top_p: 0.9,
      output_config: { effort: 'high' },
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    })
  })

  test('converts chat payload to Google Gemini v1beta format', () => {
    const body = buildProtocolRequestBody('gemini_v1beta', {
      ...basePayload,
      model: 'gemini-4-neon',
      seed: 7,
    })
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: 'Be concise.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi!' }] },
        {
          role: 'user',
          parts: [
            { text: 'Describe this' },
            { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 512,
        seed: 7,
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' },
      },
      tools: [{ googleSearch: {} }],
    })
  })
})

describe('protocol SSE and non-streaming parsing', () => {
  test('parses OpenAI Responses SSE deltas, completion, and failures', () => {
    expect(
      parseProtocolStreamEvent(
        'openai_responses',
        'response.reasoning_summary_text.delta',
        JSON.stringify({
          type: 'response.reasoning_summary_text.delta',
          delta: 'thinking...',
        })
      )
    ).toEqual({ updates: [{ type: 'reasoning', chunk: 'thinking...' }] })

    expect(
      parseProtocolStreamEvent(
        'openai_responses',
        'response.output_text.delta',
        JSON.stringify({
          type: 'response.output_text.delta',
          delta: 'OK',
        })
      )
    ).toEqual({ updates: [{ type: 'content', chunk: 'OK' }] })

    expect(
      parseProtocolStreamEvent(
        'openai_responses',
        'response.completed',
        JSON.stringify({ type: 'response.completed' })
      )
    ).toEqual({ updates: [], done: true })
  })

  test('parses Anthropic Messages SSE thinking/text deltas and stop', () => {
    expect(
      parseProtocolStreamEvent(
        'anthropic_messages',
        'content_block_delta',
        JSON.stringify({
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: 'step 1' },
        })
      )
    ).toEqual({ updates: [{ type: 'reasoning', chunk: 'step 1' }] })

    expect(
      parseProtocolStreamEvent(
        'anthropic_messages',
        'content_block_delta',
        JSON.stringify({
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Done' },
        })
      )
    ).toEqual({ updates: [{ type: 'content', chunk: 'Done' }] })

    expect(
      parseProtocolStreamEvent(
        'anthropic_messages',
        'message_stop',
        JSON.stringify({ type: 'message_stop' })
      )
    ).toEqual({ updates: [], done: true })
  })

  test('parses Gemini v1beta SSE thought and text parts', () => {
    expect(
      parseProtocolStreamEvent(
        'gemini_v1beta',
        'message',
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'plan', thought: true }, { text: 'OK' }],
              },
            },
          ],
        })
      )
    ).toEqual({
      updates: [
        { type: 'reasoning', chunk: 'plan' },
        { type: 'content', chunk: 'OK' },
      ],
    })
  })

  test('extracts non-streaming text and reasoning across protocols', () => {
    expect(
      extractProtocolNonStreamResult('openai_responses', {
        output: [
          { type: 'reasoning', summary: [{ text: 'thought' }] },
          { type: 'message', content: [{ type: 'output_text', text: 'hi' }] },
        ],
      })
    ).toEqual({ content: 'hi', reasoning: 'thought' })

    expect(
      extractProtocolNonStreamResult('anthropic_messages', {
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'hello' },
        ],
      })
    ).toEqual({ content: 'hello', reasoning: 'hmm' })

    expect(
      extractProtocolNonStreamResult('gemini_v1beta', {
        candidates: [
          {
            content: {
              parts: [{ text: 'why', thought: true }, { text: 'answer' }],
            },
          },
        ],
      })
    ).toEqual({ content: 'answer', reasoning: 'why' })
  })
})
