import { describe, expect, it } from 'vitest'

import {
  extractImageReferenceCountFromPayload,
  resolveImageRoute,
} from '../image-routing'

describe('resolveImageRoute', () => {
  it('routes to text-to-image on /v1/images/generations when there are no reference images', () => {
    const result = resolveImageRoute({
      prompt: '编辑这张图，把背景换成海滩',
      referenceCount: 0,
    })
    expect(result).toEqual({
      intent: 'text-to-image',
      endpoint: '/v1/images/generations',
      task: 'generate',
      matchedKeywords: [],
      isFallback: false,
    })
  })

  it('routes to /v1/images/generations when reference images are supplied and prompt hits reference-generation keywords', () => {
    const result = resolveImageRoute({
      prompt: '参考这张图的画风和构图，生成一个雪山新场景',
      referenceCount: 2,
    })
    expect(result.intent).toBe('reference-generation')
    expect(result.endpoint).toBe('/v1/images/generations')
    expect(result.task).toBe('generate')
    expect(result.isFallback).toBe(false)
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })

  it('routes English style transfer / consistency prompts to /v1/images/generations', () => {
    const result = resolveImageRoute({
      prompt:
        'Create a turnaround sheet in the style of this character reference',
      referenceCount: 1,
    })
    expect(result.intent).toBe('reference-generation')
    expect(result.endpoint).toBe('/v1/images/generations')
    expect(result.task).toBe('generate')
    expect(result.isFallback).toBe(false)
  })

  it('routes to /v1/images/edits when reference images are supplied and prompt hits edit keywords', () => {
    const result = resolveImageRoute({
      prompt: '去掉背景水印并把衣服改成深蓝色',
      referenceCount: 1,
    })
    expect(result.intent).toBe('image-edit')
    expect(result.endpoint).toBe('/v1/images/edits')
    expect(result.task).toBe('edit')
    expect(result.isFallback).toBe(false)
    expect(result.matchedKeywords.length).toBeGreaterThan(0)
  })

  it('falls back to /v1/images/edits when reference images exist but prompt matches no keywords', () => {
    const result = resolveImageRoute({
      prompt: 'A quiet cafe table in morning sunlight',
      referenceCount: 1,
    })
    expect(result).toEqual({
      intent: 'image-edit',
      endpoint: '/v1/images/edits',
      task: 'edit',
      matchedKeywords: [],
      isFallback: true,
    })
  })

  it('routes layer decomposition requests to /v1/images/generations', () => {
    const result = resolveImageRoute({
      prompt: '',
      referenceCount: 1,
      layerDecomposition: true,
    })
    expect(result).toEqual({
      intent: 'layer-decomposition',
      endpoint: '/v1/images/generations',
      task: 'generate',
      matchedKeywords: [],
      isFallback: false,
    })
  })
})

describe('extractImageReferenceCountFromPayload', () => {
  it('counts single string, string arrays, and ignores empty entries', () => {
    expect(extractImageReferenceCountFromPayload({})).toBe(0)
    expect(extractImageReferenceCountFromPayload({ image: '   ' })).toBe(0)
    expect(
      extractImageReferenceCountFromPayload({
        image: 'https://example.com/a.png',
      })
    ).toBe(1)
    expect(
      extractImageReferenceCountFromPayload({
        image: ['https://example.com/a.png', '', 'data:image/png;base64,abc'],
      })
    ).toBe(2)
  })
})
