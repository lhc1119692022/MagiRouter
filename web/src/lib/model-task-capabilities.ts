export const MODEL_TASK_CAPABILITIES = [
  'speech-to-text',
  'text-to-image',
  'image-to-image',
  'text-to-video',
  'image-to-video',
  'text-generation',
  'text-to-speech',
  'audio-generation',
] as const

export type ModelTaskCapability = (typeof MODEL_TASK_CAPABILITIES)[number]

export const MODEL_CAPABILITY_CATEGORIES = [
  'text',
  'image',
  'video',
  'audio',
  'transcription',
  'other',
] as const

export type ModelCapabilityCategory =
  (typeof MODEL_CAPABILITY_CATEGORIES)[number]

export const CATEGORY_LABEL_KEYS: Record<ModelCapabilityCategory, string> = {
  text: 'Text generation',
  image: 'Image Generation',
  video: 'Video Generation',
  audio: 'Audio generation',
  transcription: 'Speech transcription',
  other: 'Other models',
}

const TASK_CATEGORIES: Record<ModelTaskCapability, ModelCapabilityCategory> = {
  'speech-to-text': 'transcription',
  'text-to-image': 'image',
  'image-to-image': 'image',
  'text-to-video': 'video',
  'image-to-video': 'video',
  'text-generation': 'text',
  'text-to-speech': 'audio',
  'audio-generation': 'audio',
}

export const TASK_LABEL_KEYS: Record<ModelTaskCapability, string> = {
  'speech-to-text': 'Speech to text',
  'text-to-image': 'Text to Image',
  'image-to-image': 'Image to image',
  'text-to-video': 'Text to Video',
  'image-to-video': 'Image to Video',
  'text-generation': 'Text generation',
  'text-to-speech': 'Text to speech',
  'audio-generation': 'Audio generation',
}

const TASK_CODES: Record<ModelTaskCapability, string> = {
  'speech-to-text': 'stt',
  'text-to-image': 't2i',
  'image-to-image': 'i2i',
  'text-to-video': 't2v',
  'image-to-video': 'i2v',
  'text-generation': 'txt',
  'text-to-speech': 'tts',
  'audio-generation': 'aud',
}
const PREFIX = '@mr:tasks:v1='
const validCodes = new Set(Object.values(TASK_CODES))
const CATEGORY_PREFIX = '@mr:catalog:v1='
const categoryCodes = new Set<string>(MODEL_CAPABILITY_CATEGORIES)

export function isModelTaskDeclaration(tag: string): boolean {
  if (!tag.startsWith(PREFIX)) return false
  const value = tag.slice(PREFIX.length)
  return (
    value === 'none' || value.split('+').every((code) => validCodes.has(code))
  )
}

function isCategoryDeclaration(tag: string): boolean {
  if (!tag.startsWith(CATEGORY_PREFIX)) return false
  const value = tag.slice(CATEGORY_PREFIX.length)
  return (
    value === 'none' ||
    value === 'auto' ||
    value.split('+').every((code) => categoryCodes.has(code))
  )
}

export function isModelCatalogDeclaration(tag: string): boolean {
  return isCategoryDeclaration(tag) || isModelTaskDeclaration(tag)
}

export function getOrdinaryModelTags(tags?: string): string[] {
  return (tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag && !isModelCatalogDeclaration(tag))
}

export function getConfiguredTaskCapabilities(
  tags?: string
): ModelTaskCapability[] | undefined {
  const declaration = tags
    ?.split(',')
    .map((tag) => tag.trim())
    .find(isModelTaskDeclaration)
  if (!declaration) return undefined
  const codes = declaration.slice(PREFIX.length).split('+')
  return MODEL_TASK_CAPABILITIES.filter((task) =>
    codes.includes(TASK_CODES[task])
  )
}

export function encodeModelTaskTags(
  tags: readonly string[],
  tasks?: readonly ModelTaskCapability[]
): string {
  const ordinary = tags.filter(Boolean).join(',')
  if (tasks === undefined) return ordinary
  const codes = MODEL_TASK_CAPABILITIES.filter((task) =>
    tasks.includes(task)
  ).map((task) => TASK_CODES[task])
  return [ordinary, PREFIX + (codes.join('+') || 'none')]
    .filter(Boolean)
    .join(',')
}

export function getConfiguredModelCategories(
  tags?: string
): ModelCapabilityCategory[] | undefined {
  const declaration = tags
    ?.split(',')
    .map((tag) => tag.trim())
    .find(isCategoryDeclaration)
  if (declaration) {
    const value = declaration.slice(CATEGORY_PREFIX.length)
    if (value === 'auto') return undefined
    const codes = value.split('+')
    return MODEL_CAPABILITY_CATEGORIES.filter((category) =>
      codes.includes(category)
    )
  }
  const tasks = getConfiguredTaskCapabilities(tags)
  if (tasks === undefined) return undefined
  const categories = new Set(tasks.map((task) => TASK_CATEGORIES[task]))
  return MODEL_CAPABILITY_CATEGORIES.filter((category) =>
    categories.has(category)
  )
}

export function encodeModelCategoryTags(
  ordinaryTags: readonly string[],
  categories?: readonly ModelCapabilityCategory[],
  previousTags?: string
): string {
  const previous = previousTags?.split(',').map((tag) => tag.trim()) ?? []
  const legacy = previous.find(isModelTaskDeclaration)
  const hasCategory = previous.some(isCategoryDeclaration)
  const tags = [...ordinaryTags]
  if (legacy) tags.push(legacy)
  if (categories === undefined) {
    if (legacy || previous.includes(`${CATEGORY_PREFIX}auto`)) {
      tags.push(`${CATEGORY_PREFIX}auto`)
    }
  } else {
    const codes = MODEL_CAPABILITY_CATEGORIES.filter((category) =>
      categories.includes(category)
    ).join('+')
    if (
      !legacy ||
      hasCategory ||
      getConfiguredModelCategories(legacy)?.join('+') !== codes
    ) {
      tags.push(CATEGORY_PREFIX + (codes || 'none'))
    }
  }
  return tags.filter(Boolean).join(',')
}

type ModelTaskMetadata = {
  tags?: string
  supported_endpoint_types?: readonly string[]
  input_modalities?: readonly string[]
  output_modalities?: readonly string[]
}

export function getModelCategories(
  model: ModelTaskMetadata
): ModelCapabilityCategory[] {
  const configured = getConfiguredModelCategories(model.tags)
  if (configured !== undefined) return configured
  const inferred = getModelTaskCapabilities({ ...model, tags: undefined })
  const detected = new Set(inferred.map((task) => TASK_CATEGORIES[task]))
  for (const output of model.output_modalities ?? []) {
    if (output === 'image' || output === 'video' || output === 'audio') {
      detected.add(output)
    }
  }
  return detected.size
    ? MODEL_CAPABILITY_CATEGORIES.filter((category) => detected.has(category))
    : ['other']
}

export function getModelTaskCapabilities(
  model: ModelTaskMetadata
): ModelTaskCapability[] {
  const declared = getConfiguredTaskCapabilities(model.tags)
  if (declared !== undefined) return declared
  const inputs = new Set(model.input_modalities)
  const outputs = new Set(model.output_modalities)
  const endpoints = new Set(
    model.supported_endpoint_types?.map((item) => item.trim().toLowerCase())
  )
  const hasEndpoint = (...keys: string[]) =>
    keys.some((key) => endpoints.has(key))
  const tasks = new Set<ModelTaskCapability>()
  const permits = (values: Set<string>, value: string) =>
    !values.size || values.has(value)
  const direction = (
    task: ModelTaskCapability,
    input: string,
    output: string,
    endpoint: boolean
  ) => {
    if (
      (inputs.has(input) && outputs.has(output)) ||
      (endpoint && permits(inputs, input) && permits(outputs, output))
    ) {
      tasks.add(task)
    }
  }
  direction(
    'speech-to-text',
    'audio',
    'text',
    hasEndpoint(
      'audio-transcription',
      'audio-transcriptions',
      '/v1/audio/transcriptions'
    )
  )
  direction(
    'text-to-image',
    'text',
    'image',
    hasEndpoint('image-generation', '/v1/images/generations')
  )
  direction(
    'image-to-image',
    'image',
    'image',
    hasEndpoint('image-edit', 'image-edits', '/v1/images/edits')
  )
  direction(
    'text-to-video',
    'text',
    'video',
    hasEndpoint(
      'openai-video',
      'text-to-video',
      '/v1/videos',
      '/v1/video/generations'
    )
  )
  direction(
    'image-to-video',
    'image',
    'video',
    hasEndpoint('image-to-video') ||
      (inputs.has('image') &&
        hasEndpoint('openai-video', '/v1/videos', '/v1/video/generations'))
  )
  direction(
    'text-generation',
    'text',
    'text',
    hasEndpoint(
      'openai',
      'anthropic',
      'openai-response',
      'gemini',
      '/v1/chat/completions',
      '/v1/responses',
      '/v1/messages'
    ) ||
      (outputs.has('text') && !inputs.size)
  )
  if (
    hasEndpoint('tts', 'speech', 'audio-speech', '/v1/audio/speech') &&
    permits(outputs, 'audio') &&
    permits(inputs, 'text')
  ) {
    tasks.add('text-to-speech')
  }
  if (
    outputs.has('audio') ||
    hasEndpoint('audio-generation', 'music-generation')
  ) {
    tasks.add('audio-generation')
  }
  return MODEL_TASK_CAPABILITIES.filter((task) => tasks.has(task))
}
