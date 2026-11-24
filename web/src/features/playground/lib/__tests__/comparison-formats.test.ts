import { expect, it } from 'vitest'

import { getComparisonFormats } from '../comparison-formats'

it('names declared protocols, preserves Responses Compact and never adds other catalog or provider protocols', () => {
  expect(
    getComparisonFormats(
      ['openai-response', 'openai-response-compact', 'anthropic', 'gemini'],
      { openai: { path: '/v1/chat/completions' } }
    )
  ).toBe('Responses · Responses Compact · Messages · generateContent')
  expect(getComparisonFormats(['openai', 'openai'], {})).toBe('Chat')
  expect(
    getComparisonFormats(undefined, { openai: '/v1/chat/completions' })
  ).toBe('')
})

it('uses paths for explicitly declared custom endpoints, not arbitrary provider-like identifiers', () => {
  expect(
    getComparisonFormats(
      ['custom-chat', 'private-format', 'vendor-only', 'another-chat'],
      {
        'custom-chat': { path: '/v1/chat/completions' },
        'private-format': { path: '/custom/retrieve' },
        'another-chat': '/v1/chat/completions',
      }
    )
  ).toBe('Chat · /custom/retrieve')
  expect(getComparisonFormats(['unknown'], {})).toBe('')
})

it('understands declared route paths and shows media formats without inventing an endpoint URL', () => {
  expect(
    getComparisonFormats(
      [
        '/v1/responses',
        '/v1/embeddings',
        '/local/render',
        'image-generation',
        'openai-video',
        'audio-speech',
      ],
      {}
    )
  ).toBe('Responses · Embeddings · /local/render · Images · Videos · Speech')
})
