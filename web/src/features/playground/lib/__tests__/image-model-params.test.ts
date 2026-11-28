import { describe, expect, it } from 'vitest'

import {
  buildImageRequestPayload,
  createDefaultImageParams,
  parseEditedJsonPayload,
  resolveImageModelProfile,
  syncImageParamsFromJson,
  validateSeedreamPixelSize,
} from '../image-model-params'

describe('resolveImageModelProfile', () => {
  it('classifies Seedream 5.5, 5.0 pro, 5.0 flash, 4.0 and standard OpenAI models accurately', () => {
    expect(resolveImageModelProfile('seedream-5.5').family).toBe('seedream-5.5')
    expect(resolveImageModelProfile('doubao-seedream-5-5-260301').family).toBe(
      'seedream-5.5'
    )
    expect(resolveImageModelProfile('doubao-seedream-5-0-pro').family).toBe(
      'seedream-5.0-pro'
    )
    expect(resolveImageModelProfile('seedream-5.0-flash').family).toBe(
      'seedream-5.0-flash'
    )
    expect(resolveImageModelProfile('doubao-seedream-4-0-250828').family).toBe(
      'seedream-4'
    )
    expect(resolveImageModelProfile('gpt-image-1').family).toBe('openai')
  })
})

describe('buildImageRequestPayload', () => {
  it('builds a Volcengine Ark Seedream 5.5 payload with single and multi-reference image semantics', () => {
    const profile = resolveImageModelProfile('seedream-5.5')
    const params = createDefaultImageParams(profile)

    const t2i = buildImageRequestPayload({
      model: 'seedream-5.5',
      prompt: 'A glass teacup on linen',
      references: [],
      profile,
      params,
    })
    expect(t2i).toEqual({
      model: 'seedream-5.5',
      prompt: 'A glass teacup on linen',
      size: '2K',
      output_format: 'png',
      background: 'auto',
      response_format: 'url',
      watermark: true,
    })

    const singleRef = buildImageRequestPayload({
      model: 'seedream-5.5',
      prompt: 'Change background to misty forest',
      references: ['https://example.com/1.png'],
      profile,
      params,
    })
    expect(singleRef.image).toBe('https://example.com/1.png')

    const multiRef = buildImageRequestPayload({
      model: 'seedream-5.5',
      prompt: 'Blend both images',
      references: ['https://example.com/1.png', 'https://example.com/2.png'],
      profile,
      params,
    })
    expect(multiRef.image).toEqual([
      'https://example.com/1.png',
      'https://example.com/2.png',
    ])
  })

  it('builds a Seedream 5.5 layer decomposition payload without background and allows empty prompt', () => {
    const profile = resolveImageModelProfile('seedream-5.5')
    const params = {
      ...createDefaultImageParams(profile),
      layerDecomposition: true,
      layerMaxImages: 24,
      layerTextRecognition: true,
    }

    const payload = buildImageRequestPayload({
      model: 'seedream-5.5',
      prompt: '',
      references: ['https://example.com/poster.png'],
      profile,
      params,
    })
    expect(payload).toEqual({
      model: 'seedream-5.5',
      image: 'https://example.com/poster.png',
      layer_decomposition: true,
      layer_decomposition_options: {
        max_images: 24,
        text_recognition: true,
      },
      size: 'auto',
      output_format: 'png',
      response_format: 'url',
      watermark: true,
    })
    expect(payload).not.toHaveProperty('background')
    expect(payload).not.toHaveProperty('prompt')
  })

  it('builds a Seedream 4.0 sequential group payload clamped to 15 minus references', () => {
    const profile = resolveImageModelProfile('doubao-seedream-4-0')
    const params = {
      ...createDefaultImageParams(profile),
      sequentialGeneration: 'auto' as const,
      sequentialMaxImages: 14,
      stream: true,
      optimizePromptMode: 'fast' as const,
    }

    const payload = buildImageRequestPayload({
      model: 'doubao-seedream-4-0',
      prompt: 'Four seasons storyboard',
      references: [
        'https://example.com/1.png',
        'https://example.com/2.png',
        'https://example.com/3.png',
      ],
      profile,
      params,
    })
    expect(payload).toEqual({
      model: 'doubao-seedream-4-0',
      prompt: 'Four seasons storyboard',
      image: [
        'https://example.com/1.png',
        'https://example.com/2.png',
        'https://example.com/3.png',
      ],
      size: '2048x2048',
      optimize_prompt_options: { mode: 'fast' },
      response_format: 'url',
      sequential_image_generation: 'auto',
      sequential_image_generation_options: { max_images: 12 },
      stream: true,
      watermark: true,
    })
  })
})

describe('validateSeedreamPixelSize', () => {
  it('enforces Seedream 5.5 total pixel range and aspect ratio limits', () => {
    const profile = resolveImageModelProfile('seedream-5.5')
    expect(validateSeedreamPixelSize('2880x1440', profile)).toEqual({
      valid: true,
      normalized: '2880x1440',
    })
    expect(validateSeedreamPixelSize('512x512', profile)).toEqual({
      valid: false,
      reason: 'pixels',
    })
    expect(validateSeedreamPixelSize('4000x3000', profile)).toEqual({
      valid: false,
      reason: 'pixels',
    })
    expect(validateSeedreamPixelSize('4000x200', profile)).toEqual({
      valid: false,
      reason: 'pixels',
    })
    expect(validateSeedreamPixelSize('invalid', profile)).toEqual({
      valid: false,
      reason: 'format',
    })
  })
})

describe('JSON payload parsing and form sync', () => {
  it('rejects non-object JSON values and syncs valid Ark fields back to form state', () => {
    expect(parseEditedJsonPayload('[1, 2]').ok).toBe(false)
    expect(parseEditedJsonPayload('{bad').ok).toBe(false)

    const parsed = parseEditedJsonPayload(
      JSON.stringify({
        model: 'seedream-5.5',
        size: '1.5K',
        output_format: 'jpeg',
        background: 'opaque',
        response_format: 'b64_json',
        watermark: false,
        safety_identifier: 'uid_hash_123',
      })
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const profile = resolveImageModelProfile('seedream-5.5')
    const synced = syncImageParamsFromJson(
      parsed.value,
      profile,
      createDefaultImageParams(profile)
    )
    expect(synced.sizeMode).toBe('tier')
    expect(synced.sizeTier).toBe('1.5K')
    expect(synced.outputFormat).toBe('jpeg')
    expect(synced.background).toBe('opaque')
    expect(synced.responseFormat).toBe('b64_json')
    expect(synced.watermark).toBe(false)
    expect(synced.safetyIdentifier).toBe('uid_hash_123')
  })
})
