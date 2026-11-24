import { expect, it } from 'vitest'

import {
  encodeModelCategoryTags,
  getConfiguredModelCategories,
  getModelCategories,
  getModelTaskCapabilities,
  getOrdinaryModelTags,
} from '@/lib/model-task-capabilities'

import { getCatalogFacets } from '../lib/filters'
import type { PricingModel } from '../types'

it('preserves legacy-only tags at the storage limit when the selected categories match their projection', () => {
  const legacy = '@mr:tasks:v1=i2i+t2i+stt'
  const ordinary = 'a'.repeat(255 - legacy.length - 1)
  const previous = `${ordinary},${legacy}`
  expect(
    encodeModelCategoryTags([ordinary], ['transcription', 'image'], previous)
  ).toBe(previous)
  expect(
    encodeModelCategoryTags(['renamed'], ['image', 'transcription'], previous)
  ).toBe(`renamed,${legacy}`)
  expect(encodeModelCategoryTags([], [], '@mr:tasks:v1=none')).toBe(
    '@mr:tasks:v1=none'
  )
  const automatic = encodeModelCategoryTags([], undefined, legacy)
  expect(automatic).toBe(`${legacy},@mr:catalog:v1=auto`)
  expect(encodeModelCategoryTags([], undefined, automatic)).toBe(automatic)
})

it('preserves fine-grained execution and ordinary tags when the operator changes display categories', () => {
  const original = 'studio,@mr:tasks:v1=i2i+stt'
  expect(getConfiguredModelCategories(original)).toEqual([
    'image',
    'transcription',
  ])
  const edited = encodeModelCategoryTags(
    ['studio'],
    ['video', 'other'],
    original
  )
  expect(getOrdinaryModelTags(edited)).toEqual(['studio'])
  expect(getModelCategories({ tags: edited })).toEqual(['video', 'other'])
  expect(getModelTaskCapabilities({ tags: edited })).toEqual([
    'speech-to-text',
    'image-to-image',
  ])
  const automatic = encodeModelCategoryTags(['studio'], undefined, edited)
  const model = { tags: automatic, supported_endpoint_types: ['openai'] }
  expect(getConfiguredModelCategories(automatic)).toBeUndefined()
  expect(getModelCategories(model)).toEqual(['text'])
  expect(getModelTaskCapabilities(model)).toEqual([
    'speech-to-text',
    'image-to-image',
  ])
})

it('distinguishes explicitly no labels, automatic recognition and uncategorized models', () => {
  const empty = encodeModelCategoryTags([], [])
  expect(
    getModelCategories({ tags: empty, supported_endpoint_types: ['openai'] })
  ).toEqual([])
  const automatic = encodeModelCategoryTags([], undefined, empty)
  expect(getConfiguredModelCategories(automatic)).toBeUndefined()
  expect(
    getModelCategories({
      tags: automatic,
      supported_endpoint_types: ['openai'],
    })
  ).toEqual(['text'])
  expect(
    getModelCategories({ supported_endpoint_types: ['embedding'] })
  ).toEqual(['other'])
})

it('offers only categories, groups and billing types present in the visible directory', () => {
  const text = {
    model_name: 'chat-model',
    supported_endpoint_types: ['openai'],
    enable_groups: ['default'],
    quota_type: 0,
  } as PricingModel
  expect(getCatalogFacets([text], { default: 1, vip: 2 })).toEqual({
    categories: ['text'],
    groups: ['default'],
    quotaTypes: ['token'],
  })
  expect(getCatalogFacets([], { default: 1 })).toEqual({
    categories: [],
    groups: [],
    quotaTypes: [],
  })
})
