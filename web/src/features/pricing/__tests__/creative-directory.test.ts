import { expect, test } from 'vitest'

import {
  extractAllTags,
  getModelPlaygroundModes,
  matchesTaskFilter,
} from '../lib/filters'
import type { PricingModel } from '../types'

test('creative directory includes image, video and audio outputs but not text-only vision or file-only models', () => {
  const outputs: Array<NonNullable<PricingModel['output_modalities']>> = [
    ['text'],
    ['image'],
    ['video'],
    ['audio'],
    ['text', 'audio'],
    ['file'],
  ]
  const catalog = outputs.map(
    (output_modalities, index) =>
      ({
        model_name: `fixture-${index}`,
        input_modalities: ['image'],
        output_modalities,
      }) as PricingModel
  )
  expect(
    catalog
      .filter((model) => matchesTaskFilter(model, 'creative'))
      .map((model) => model.model_name)
  ).toEqual(['fixture-1', 'fixture-2', 'fixture-3', 'fixture-4'])
  expect(
    catalog.filter((model) => matchesTaskFilter(model, 'all'))
  ).toHaveLength(6)
})

test('saved directions override conflicting names, protocols and modalities without becoming ordinary tags', () => {
  const entry = {
    model_name: 'whisper-flux-video',
    tags: 'Editorial,核心,@mr:tasks:v1=i2i+stt',
    supported_endpoint_types: ['openai', 'image-generation'],
    output_modalities: ['video'],
  } as PricingModel
  expect(matchesTaskFilter(entry, 'image-to-image')).toBe(true)
  expect(matchesTaskFilter(entry, 'speech-to-text')).toBe(true)
  expect(matchesTaskFilter(entry, 'image')).toBe(true)
  expect(matchesTaskFilter(entry, 'video')).toBe(false)
  expect(new Set(extractAllTags([entry]))).toEqual(
    new Set(['editorial', '核心'])
  )
})

test('an explicitly empty declaration stays empty; unconfigured models use evidence, never marketing names', () => {
  const entry = {
    model_name: 'sora-flux-whisper',
    supported_endpoint_types: ['image-edits'],
  } as PricingModel
  expect(matchesTaskFilter(entry, 'image-to-image')).toBe(true)
  expect(matchesTaskFilter(entry, 'video')).toBe(false)
  expect(matchesTaskFilter(entry, 'audio')).toBe(false)
  expect(
    getModelPlaygroundModes({ ...entry, tags: '@mr:tasks:v1=none' })
  ).toEqual([])
  expect(
    matchesTaskFilter({ ...entry, tags: '@mr:tasks:v1=none' }, 'all')
  ).toBe(true)
})

test('explicit catalog category declarations override inferred endpoints for playground modes', () => {
  const imageOnly = {
    model_name: 'seedream-5.5',
    tags: '@mr:catalog:v1=image',
    supported_endpoint_types: ['openai', 'image-generation'],
  } as PricingModel
  expect(getModelPlaygroundModes(imageOnly)).toEqual(['image'])
  expect(
    getModelPlaygroundModes({ ...imageOnly, tags: '@mr:catalog:v1=none' })
  ).toEqual([])
  expect(
    getModelPlaygroundModes({ ...imageOnly, tags: '@mr:catalog:v1=text' })
  ).toEqual(['chat'])
  expect(
    getModelPlaygroundModes({
      ...imageOnly,
      tags: '@mr:tasks:v1=i2i,@mr:catalog:v1=auto',
    })
  ).toEqual(['image', 'chat'])
})
