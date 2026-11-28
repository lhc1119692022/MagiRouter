import { describe, expect, it } from 'vitest'

import {
  buildImageRequestPayload,
  computePixelsFromFormula,
  createDefaultImageParams,
  createFormulaSizeSpec,
  extractReferencesFromPayload,
  isExperimentalPixelSize,
  parseEditedJsonPayload,
  resolveImageModelProfile,
  resolveSizeFromSpec,
  syncImageParamsFromJson,
  validateImagePixelSize,
  validateSeedreamPixelSize,
} from '../image-model-params'

describe('resolveImageModelProfile', () => {
  it('classifies Seedream, GPT Image generations, DALL-E 3, and generic OpenAI models accurately', () => {
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
    expect(resolveImageModelProfile('gpt-image-1').family).toBe('gpt-image-1.5')
    expect(resolveImageModelProfile('gpt-image-1.5').family).toBe(
      'gpt-image-1.5'
    )
    expect(resolveImageModelProfile('chatgpt-image-latest').family).toBe(
      'gpt-image-1.5'
    )
    expect(resolveImageModelProfile('gpt-image-1-mini').family).toBe(
      'gpt-image-1-mini'
    )
    expect(resolveImageModelProfile('gpt-image-2').family).toBe('gpt-image-2')
    expect(resolveImageModelProfile('gpt-image-2-2026-04-21').family).toBe(
      'gpt-image-2'
    )
    expect(resolveImageModelProfile('gpt-image-2.5-flare').family).toBe(
      'gpt-image-2.5'
    )
    expect(
      resolveImageModelProfile('gpt-image-2.5-sunburst-2026-09-08').family
    ).toBe('gpt-image-2.5')
    expect(resolveImageModelProfile('gpt-image-2.6-flare').family).toBe(
      'gpt-image-2.6'
    )
    expect(resolveImageModelProfile('gpt-image-2.6-sunburst').family).toBe(
      'gpt-image-2.6'
    )
    expect(resolveImageModelProfile('dall-e-3').family).toBe('openai-dall-e-3')
    expect(resolveImageModelProfile('catalog-image').family).toBe('openai')
  })
})

describe('resolveSizeFromSpec', () => {
  it('maps Seedream 5.5 resolution tier and aspect ratio via official pixel lookup table', () => {
    const profile = resolveImageModelProfile('seedream-5.5')
    expect(resolveSizeFromSpec(profile.sizeSpec, '1K', '16:9')).toBe('1424x800')
    expect(resolveSizeFromSpec(profile.sizeSpec, '1.5K', '4:3')).toBe(
      '1792x1344'
    )
    expect(resolveSizeFromSpec(profile.sizeSpec, '2K', '21:9')).toBe(
      '3136x1344'
    )
  })

  it('maps OpenAI gpt-image and dall-e-3 ratios cleanly and supports formula fallback for models without a table', () => {
    const gptImage = resolveImageModelProfile('gpt-image-1')
    expect(resolveSizeFromSpec(gptImage.sizeSpec, '1K', '3:2')).toBe(
      '1536x1024'
    )
    expect(resolveSizeFromSpec(gptImage.sizeSpec, '1K', '1:1')).toBe(
      '1024x1024'
    )

    const gptImage25 = resolveImageModelProfile('gpt-image-2.5-flare')
    expect(resolveSizeFromSpec(gptImage25.sizeSpec, 'auto', '1:1')).toBe('auto')
    expect(resolveSizeFromSpec(gptImage25.sizeSpec, '1K', '16:9')).toBe(
      '1536x864'
    )
    expect(resolveSizeFromSpec(gptImage25.sizeSpec, '2K', '16:9')).toBe(
      '2048x1152'
    )
    expect(resolveSizeFromSpec(gptImage25.sizeSpec, '4K', '16:9')).toBe(
      '3840x2160'
    )

    const dalle3 = resolveImageModelProfile('dall-e-3')
    expect(resolveSizeFromSpec(dalle3.sizeSpec, '1K', '16:9')).toBe('1792x1024')

    const formulaSpec = createFormulaSizeSpec({
      pixelRange: {
        minPixels: 512 * 512,
        maxPixels: 2048 * 2048,
        minRatio: 1 / 4,
        maxRatio: 4,
      },
    })
    const computed = resolveSizeFromSpec(formulaSpec, '1K', '16:9')
    expect(computed).toMatch(/^\d+x\d+$/)
    const [w, h] = computed.split('x').map(Number)
    expect(w % 64).toBe(0)
    expect(h % 64).toBe(0)
    expect(w / h).toBeGreaterThan(1.5)
    expect(computePixelsFromFormula('2K', '1:1')).toBe('2048x2048')
  })
})

describe('buildImageRequestPayload', () => {
  it('builds a Volcengine Ark Seedream 5.5 payload with resolved WxH pixels, watermark off by default, and ref semantics', () => {
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
      size: '2048x2048',
      output_format: 'png',
      background: 'auto',
      response_format: 'url',
      watermark: false,
    })

    const singleRef = buildImageRequestPayload({
      model: 'seedream-5.5',
      prompt: 'Change background to misty forest',
      references: ['https://example.com/1.png'],
      profile,
      params: { ...params, sizeTier: '1.5K', aspectRatio: '16:9' },
    })
    expect(singleRef.image).toBe('https://example.com/1.png')
    expect(singleRef.size).toBe('2048x1152')

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
      watermark: false,
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
      watermark: false,
    })
  })

  it('builds OpenAI GPT Image 2.5 payloads with auto defaults, extended quality, compression, stream, and images[] edits', () => {
    const profile = resolveImageModelProfile('gpt-image-2.5-flare')
    const defaults = createDefaultImageParams(profile)

    expect(
      buildImageRequestPayload({
        model: 'gpt-image-2.5-flare',
        prompt: 'A kitten photo',
        references: [],
        profile,
        params: defaults,
      })
    ).toEqual({
      model: 'gpt-image-2.5-flare',
      prompt: 'A kitten photo',
      size: 'auto',
      quality: 'auto',
      n: 1,
      background: 'auto',
      output_format: 'png',
      moderation: 'auto',
    })

    const editPayload = buildImageRequestPayload({
      model: 'gpt-image-2.5-flare',
      prompt: 'Place this kitten on a sunset beach',
      references: ['https://example.com/cat.png'],
      profile,
      params: {
        ...defaults,
        sizeTier: '2K',
        aspectRatio: '16:9',
        quality: 'xhigh',
        imageCount: 6,
        outputFormat: 'webp',
        outputCompression: 80,
        background: 'transparent',
        moderation: 'low',
        stream: true,
        partialImages: 2,
      },
    })
    expect(editPayload).toEqual({
      model: 'gpt-image-2.5-flare',
      prompt: 'Place this kitten on a sunset beach',
      images: [{ image_url: 'https://example.com/cat.png' }],
      size: '2048x1152',
      quality: 'xhigh',
      n: 6,
      background: 'transparent',
      output_format: 'webp',
      output_compression: 80,
      moderation: 'low',
      stream: true,
      partial_images: 2,
    })
    expect(editPayload).not.toHaveProperty('image')
    expect(editPayload).not.toHaveProperty('input_fidelity')
    expect(editPayload).not.toHaveProperty('complexity')
  })

  it('builds GPT Image 2.6 payloads with complexity, GIF animation fields, and SVG constraints', () => {
    const profile = resolveImageModelProfile('gpt-image-2.6-sunburst')
    const defaults = createDefaultImageParams(profile)

    const gifPayload = buildImageRequestPayload({
      model: 'gpt-image-2.6-sunburst',
      prompt: 'Glowing lantern loop',
      references: [],
      profile,
      params: {
        ...defaults,
        complexity: 'medium',
        quality: 'max',
        outputFormat: 'gif',
        frameCount: 12,
        frameDurationMs: 155,
        stream: true,
        partialImages: 2,
      },
    })
    expect(gifPayload).toEqual({
      model: 'gpt-image-2.6-sunburst',
      prompt: 'Glowing lantern loop',
      size: 'auto',
      quality: 'max',
      complexity: 'medium',
      n: 1,
      background: 'auto',
      output_format: 'gif',
      frame_count: 12,
      frame_duration_ms: 160,
      moderation: 'auto',
    })
    expect(gifPayload).not.toHaveProperty('stream')
    expect(gifPayload).not.toHaveProperty('output_compression')

    const svgPayload = buildImageRequestPayload({
      model: 'gpt-image-2.6-sunburst',
      prompt: 'Minimal bakery logo',
      references: [],
      profile,
      params: {
        ...defaults,
        outputFormat: 'svg',
        imageCount: 4,
        stream: true,
      },
    })
    expect(svgPayload.output_format).toBe('svg')
    expect(svgPayload.n).toBe(1)
    expect(svgPayload).not.toHaveProperty('stream')
    expect(svgPayload).not.toHaveProperty('output_compression')

    const svgWithRefPayload = buildImageRequestPayload({
      model: 'gpt-image-2.6-sunburst',
      prompt: 'Edit logo color',
      references: ['https://example.com/logo.png'],
      profile,
      params: { ...defaults, outputFormat: 'svg' },
    })
    expect(svgWithRefPayload.output_format).toBe('png')
  })

  it('includes input_fidelity only on GPT Image 1.5 edits and omits it on GPT Image 1-mini and 2.x', () => {
    const p15 = resolveImageModelProfile('gpt-image-1.5')
    const d15 = createDefaultImageParams(p15)
    const gen15 = buildImageRequestPayload({
      model: 'gpt-image-1.5',
      prompt: 'Portrait',
      references: [],
      profile: p15,
      params: { ...d15, inputFidelity: 'high' },
    })
    expect(gen15).not.toHaveProperty('input_fidelity')

    const edit15 = buildImageRequestPayload({
      model: 'gpt-image-1.5',
      prompt: 'Keep face consistent',
      references: ['https://example.com/face.png'],
      profile: p15,
      params: { ...d15, inputFidelity: 'high', pixelSize: '1536x1024' },
    })
    expect(edit15.input_fidelity).toBe('high')
    expect(edit15.size).toBe('1536x1024')

    const pMini = resolveImageModelProfile('gpt-image-1-mini')
    const editMini = buildImageRequestPayload({
      model: 'gpt-image-1-mini',
      prompt: 'Retouch',
      references: ['https://example.com/face.png'],
      profile: pMini,
      params: createDefaultImageParams(pMini),
    })
    expect(editMini).not.toHaveProperty('input_fidelity')

    const p2 = resolveImageModelProfile('gpt-image-2')
    expect(p2.qualityOptions).toEqual(['auto', 'low', 'medium', 'high'])
    expect(p2.inputFidelityOptions).toEqual([])
  })

  it('builds DALL-E 3 payloads with standard/hd quality, style, response_format, and no output_format', () => {
    const dalle3 = resolveImageModelProfile('dall-e-3')
    const payload = buildImageRequestPayload({
      model: 'dall-e-3',
      prompt: 'Watercolor landscape',
      references: [],
      profile: dalle3,
      params: {
        ...createDefaultImageParams(dalle3),
        pixelSize: '1792x1024',
        quality: 'hd',
        style: 'natural',
        responseFormat: 'b64_json',
      },
    })
    expect(payload).toEqual({
      model: 'dall-e-3',
      prompt: 'Watercolor landscape',
      size: '1792x1024',
      quality: 'hd',
      style: 'natural',
      n: 1,
      response_format: 'b64_json',
    })
    expect(payload).not.toHaveProperty('output_format')
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

  it('enforces GPT Image 2.5 custom pixel rules (16px multiple, max edge 3840, ratio 1:3-3:1, pixel range) and experimental threshold', () => {
    const profile = resolveImageModelProfile('gpt-image-2.5-flare')
    expect(validateImagePixelSize('1536x864', profile)).toEqual({
      valid: true,
      normalized: '1536x864',
    })
    expect(validateImagePixelSize('3840x2160', profile)).toEqual({
      valid: true,
      normalized: '3840x2160',
    })
    expect(validateImagePixelSize('1000x1000', profile)).toEqual({
      valid: false,
      reason: 'multiple',
    })
    expect(validateImagePixelSize('4000x2000', profile)).toEqual({
      valid: false,
      reason: 'maxEdge',
    })
    expect(validateImagePixelSize('512x512', profile)).toEqual({
      valid: false,
      reason: 'pixels',
    })
    expect(validateImagePixelSize('3072x768', profile)).toEqual({
      valid: false,
      reason: 'ratio',
    })
    expect(isExperimentalPixelSize('2560x1440', profile)).toBe(false)
    expect(isExperimentalPixelSize('3840x2160', profile)).toBe(true)
  })
})

describe('JSON payload parsing and form sync', () => {
  it('rejects non-object JSON values and reverse-maps pixel dimensions back to tier + aspect ratio', () => {
    expect(parseEditedJsonPayload('[1, 2]').ok).toBe(false)
    expect(parseEditedJsonPayload('{bad').ok).toBe(false)

    const parsed = parseEditedJsonPayload(
      JSON.stringify({
        model: 'seedream-5.5',
        size: '2048x1152',
        output_format: 'jpeg',
        background: 'opaque',
        response_format: 'b64_json',
        watermark: true,
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
    expect(synced.aspectRatio).toBe('16:9')
    expect(synced.outputFormat).toBe('jpeg')
    expect(synced.background).toBe('opaque')
    expect(synced.responseFormat).toBe('b64_json')
    expect(synced.watermark).toBe(true)
  })

  it('syncs GPT Image 2.6 JSON fields and extracts OpenAI images[] references back into form state', () => {
    const profile = resolveImageModelProfile('gpt-image-2.6-flare')
    const payload = {
      model: 'gpt-image-2.6-flare',
      prompt: 'Edit poster',
      images: [
        { image_url: 'https://example.com/ref-1.png' },
        { image_url: 'https://example.com/ref-2.png' },
      ],
      size: '2048x1152',
      quality: 'xhigh',
      complexity: 'low',
      n: 5,
      background: 'transparent',
      output_format: 'webp',
      output_compression: 75,
      moderation: 'low',
      stream: true,
      partial_images: 3,
    }

    expect(extractReferencesFromPayload(payload)).toEqual([
      'https://example.com/ref-1.png',
      'https://example.com/ref-2.png',
    ])
    const synced = syncImageParamsFromJson(
      payload,
      profile,
      createDefaultImageParams(profile)
    )
    expect(synced.sizeMode).toBe('tier')
    expect(synced.sizeTier).toBe('2K')
    expect(synced.aspectRatio).toBe('16:9')
    expect(synced.quality).toBe('xhigh')
    expect(synced.complexity).toBe('low')
    expect(synced.imageCount).toBe(5)
    expect(synced.background).toBe('transparent')
    expect(synced.outputFormat).toBe('webp')
    expect(synced.outputCompression).toBe(75)
    expect(synced.moderation).toBe('low')
    expect(synced.stream).toBe(true)
    expect(synced.partialImages).toBe(3)
  })
})
