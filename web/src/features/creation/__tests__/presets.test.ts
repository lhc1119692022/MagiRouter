import { expect, it } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import { creationPresetList, supportsStudioTask } from '../presets'

const base = {
  id: 'draft',
  title: 'My title',
  mode: 'image',
  model: 'my-model',
  prompt: 'A filled prompt.',
}
it('accepts typed controls, rejects duplicate IDs, unknown fields and cross-mode parameters', () => {
  expect(
    creationPresetList.parse([{ ...base, parameters: { imageCount: 2 } }])
  ).toHaveLength(1)
  for (const invalid of [
    [base, base],
    [{ ...base, prompt: '' }],
    [{ ...base, endpoint: 'https://example.invalid' }],
    [{ ...base, parameters: { voice: 'marin' } }],
    [{ ...base, parameters: { imageCount: 3 } }],
  ]) {
    expect(creationPresetList.safeParse(invalid).success).toBe(false)
  }
})

it('requires both a supported operation and an actual compatible endpoint; never guesses from a model name', () => {
  const model = {
    model_name: 'tts-video-image',
    input_modalities: ['text'],
    output_modalities: ['image'],
    supported_endpoint_types: ['image-generation'],
  } as PricingModel
  expect(supportsStudioTask(model, 'image', 'generate')).toBe(true)
  expect(supportsStudioTask(model, 'image', 'edit')).toBe(false)
  expect(
    supportsStudioTask(
      { ...model, supported_endpoint_types: ['openai'] },
      'image',
      'generate'
    )
  ).toBe(false)
  expect(
    supportsStudioTask({ ...model, supported_endpoint_types: [] }, 'audio')
  ).toBe(false)
})
