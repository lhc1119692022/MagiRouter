export const VOLCENGINE_ARK_IMAGE_DOC_URL =
  'https://docs.volcengine.com/docs/zh/ark/image-generation-api.md'

export type ImageModelFamily =
  | 'seedream-5.5'
  | 'seedream-5.0-pro'
  | 'seedream-5.0-flash'
  | 'seedream-4'
  | 'openai'

export type ImageSizeMode = 'tier' | 'pixels'
export type ImageBackgroundMode = 'auto' | 'transparent' | 'opaque'
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp'
export type ImageResponseFormat = 'url' | 'b64_json'
export type ImageOptimizePromptMode = 'standard' | 'fast'
export type ImageSequentialMode = 'disabled' | 'auto'
export type OpenAIImageQuality = 'auto' | 'low' | 'medium' | 'high'

export interface ImageSizePreset {
  value: string
  ratioLabel: string
}

export interface ImagePixelRange {
  minPixels: number
  maxPixels: number
  minRatio: number
  maxRatio: number
}

export interface ImageModelProfile {
  family: ImageModelFamily
  isSeedream: boolean
  docUrl?: string
  maxReferences: number
  supportsLayerDecomposition: boolean
  maxLayers: number
  supportsLayerDecompositionOptions: boolean
  resolutionTiers: readonly string[]
  layerResolutionTiers: readonly string[]
  defaultSizeMode: ImageSizeMode
  defaultSizeTier: string
  defaultPixelSize: string
  defaultLayerSizeTier: string
  sizePresets: readonly ImageSizePreset[]
  pixelRange?: ImagePixelRange
  outputFormats: readonly ImageOutputFormat[]
  defaultOutputFormat: ImageOutputFormat
  backgroundOptions: readonly ImageBackgroundMode[]
  defaultBackground: ImageBackgroundMode
  optimizePromptModes: readonly ImageOptimizePromptMode[]
  supportsResponseFormat: boolean
  supportsSequentialGeneration: boolean
  supportsStream: boolean
  supportsWatermark: boolean
  supportsSafetyIdentifier: boolean
}

export interface ImageStudioParams {
  sizeMode: ImageSizeMode
  sizeTier: string
  pixelSize: string
  layerSizeTier: string
  quality: OpenAIImageQuality
  imageCount: number
  outputFormat: ImageOutputFormat
  background: ImageBackgroundMode
  responseFormat: ImageResponseFormat
  optimizePromptMode: ImageOptimizePromptMode
  layerDecomposition: boolean
  layerMaxImages: number
  layerTextRecognition: boolean
  sequentialGeneration: ImageSequentialMode
  sequentialMaxImages: number
  stream: boolean
  watermark: boolean
  safetyIdentifier: string
}

export interface ImagePresetSeed {
  imageSize?: string
  quality?: OpenAIImageQuality
  imageCount?: number
  imageFormat?: ImageOutputFormat
}

const SEEDREAM_55_PRESETS: readonly ImageSizePreset[] = [
  { value: '2048x2048', ratioLabel: '1:1' },
  { value: '2816x1584', ratioLabel: '16:9' },
  { value: '1584x2816', ratioLabel: '9:16' },
  { value: '2368x1776', ratioLabel: '4:3' },
  { value: '1776x2368', ratioLabel: '3:4' },
  { value: '3840x2160', ratioLabel: '4K 16:9' },
]

const SEEDREAM_50_PRESETS: readonly ImageSizePreset[] = [
  { value: '2048x2048', ratioLabel: '1:1' },
  { value: '2816x1584', ratioLabel: '16:9' },
  { value: '1584x2816', ratioLabel: '9:16' },
  { value: '2368x1776', ratioLabel: '4:3' },
  { value: '1776x2368', ratioLabel: '3:4' },
  { value: '2496x1664', ratioLabel: '3:2' },
]

const SEEDREAM_40_PRESETS: readonly ImageSizePreset[] = [
  { value: '2048x2048', ratioLabel: '1:1' },
  { value: '2848x1600', ratioLabel: '16:9' },
  { value: '1600x2848', ratioLabel: '9:16' },
  { value: '2304x1728', ratioLabel: '4:3' },
  { value: '1728x2304', ratioLabel: '3:4' },
  { value: '4096x4096', ratioLabel: '4K 1:1' },
]

const OPENAI_PRESETS: readonly ImageSizePreset[] = [
  { value: '1536x1024', ratioLabel: '3:2' },
  { value: '1024x1024', ratioLabel: '1:1' },
  { value: '1024x1536', ratioLabel: '2:3' },
]

const PROFILES: Record<ImageModelFamily, ImageModelProfile> = {
  'seedream-5.5': {
    family: 'seedream-5.5',
    isSeedream: true,
    docUrl: VOLCENGINE_ARK_IMAGE_DOC_URL,
    maxReferences: 10,
    supportsLayerDecomposition: true,
    maxLayers: 99,
    supportsLayerDecompositionOptions: true,
    resolutionTiers: ['1K', '1.5K', '2K'],
    layerResolutionTiers: ['auto', '1K', '1.5K', '2K'],
    defaultSizeMode: 'tier',
    defaultSizeTier: '2K',
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_55_PRESETS,
    pixelRange: {
      minPixels: 1280 * 720,
      maxPixels: 2880 * 2880,
      minRatio: 1 / 16,
      maxRatio: 16,
    },
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'png',
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    optimizePromptModes: ['standard'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: true,
  },
  'seedream-5.0-pro': {
    family: 'seedream-5.0-pro',
    isSeedream: true,
    docUrl: VOLCENGINE_ARK_IMAGE_DOC_URL,
    maxReferences: 10,
    supportsLayerDecomposition: true,
    maxLayers: 16,
    supportsLayerDecompositionOptions: false,
    resolutionTiers: ['1K', '1.5K', '2K'],
    layerResolutionTiers: ['auto', '1K', '1.5K', '2K'],
    defaultSizeMode: 'tier',
    defaultSizeTier: '2K',
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_50_PRESETS,
    pixelRange: {
      minPixels: 1280 * 720,
      maxPixels: 4624220,
      minRatio: 1 / 16,
      maxRatio: 16,
    },
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'jpeg',
    backgroundOptions: ['opaque', 'transparent'],
    defaultBackground: 'opaque',
    optimizePromptModes: ['standard', 'fast'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: true,
  },
  'seedream-5.0-flash': {
    family: 'seedream-5.0-flash',
    isSeedream: true,
    docUrl: VOLCENGINE_ARK_IMAGE_DOC_URL,
    maxReferences: 10,
    supportsLayerDecomposition: true,
    maxLayers: 16,
    supportsLayerDecompositionOptions: false,
    resolutionTiers: ['1K', '1.5K', '2K'],
    layerResolutionTiers: ['auto', '1K', '1.5K', '2K'],
    defaultSizeMode: 'tier',
    defaultSizeTier: '2K',
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_50_PRESETS,
    pixelRange: {
      minPixels: 1280 * 720,
      maxPixels: 4624220,
      minRatio: 1 / 16,
      maxRatio: 16,
    },
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'jpeg',
    backgroundOptions: ['opaque', 'transparent'],
    defaultBackground: 'opaque',
    optimizePromptModes: ['standard'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: true,
  },
  'seedream-4': {
    family: 'seedream-4',
    isSeedream: true,
    docUrl: VOLCENGINE_ARK_IMAGE_DOC_URL,
    maxReferences: 14,
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    resolutionTiers: ['1K', '2K', '4K'],
    layerResolutionTiers: [],
    defaultSizeMode: 'pixels',
    defaultSizeTier: '2K',
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_40_PRESETS,
    pixelRange: {
      minPixels: 1280 * 720,
      maxPixels: 4096 * 4096,
      minRatio: 1 / 16,
      maxRatio: 16,
    },
    outputFormats: [],
    defaultOutputFormat: 'png',
    backgroundOptions: [],
    defaultBackground: 'auto',
    optimizePromptModes: ['standard', 'fast'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: true,
    supportsStream: true,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  openai: {
    family: 'openai',
    isSeedream: false,
    maxReferences: 10,
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    resolutionTiers: [],
    layerResolutionTiers: [],
    defaultSizeMode: 'pixels',
    defaultSizeTier: '',
    defaultPixelSize: '1536x1024',
    defaultLayerSizeTier: '',
    sizePresets: OPENAI_PRESETS,
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultOutputFormat: 'png',
    backgroundOptions: [],
    defaultBackground: 'auto',
    optimizePromptModes: [],
    supportsResponseFormat: false,
    supportsSequentialGeneration: false,
    supportsStream: false,
    supportsWatermark: false,
    supportsSafetyIdentifier: false,
  },
}

export function resolveImageModelProfile(
  modelName?: string
): ImageModelProfile {
  const normalized = (modelName ?? '').trim().toLowerCase()
  if (/seedream[-_.\s]*5[._-]?5/.test(normalized)) {
    return PROFILES['seedream-5.5']
  }
  if (/seedream[-_.\s]*5[._-]?0[-_.\s]*flash/.test(normalized)) {
    return PROFILES['seedream-5.0-flash']
  }
  if (/seedream[-_.\s]*5([._-]?0([-_.\s]*pro)?)?/.test(normalized)) {
    return PROFILES['seedream-5.0-pro']
  }
  if (/seedream/.test(normalized)) {
    return PROFILES['seedream-4']
  }
  return PROFILES.openai
}

export function createDefaultImageParams(
  profile: ImageModelProfile,
  preset?: ImagePresetSeed
): ImageStudioParams {
  const presetFormat =
    preset?.imageFormat && profile.outputFormats.includes(preset.imageFormat)
      ? preset.imageFormat
      : profile.defaultOutputFormat
  const presetSize = preset?.imageSize
  const usePresetTier =
    Boolean(presetSize) && profile.resolutionTiers.includes(presetSize ?? '')
  let sizeMode: ImageSizeMode = profile.defaultSizeMode
  if (usePresetTier) {
    sizeMode = 'tier'
  } else if (presetSize && !profile.isSeedream) {
    sizeMode = 'pixels'
  }

  return {
    sizeMode,
    sizeTier: usePresetTier ? (presetSize as string) : profile.defaultSizeTier,
    pixelSize:
      presetSize && !usePresetTier ? presetSize : profile.defaultPixelSize,
    layerSizeTier: profile.defaultLayerSizeTier,
    quality: preset?.quality ?? 'high',
    imageCount: preset?.imageCount ?? 1,
    outputFormat: presetFormat,
    background: profile.defaultBackground,
    responseFormat: 'url',
    optimizePromptMode: 'standard',
    layerDecomposition: false,
    layerMaxImages: 30,
    layerTextRecognition: false,
    sequentialGeneration: 'disabled',
    sequentialMaxImages: 15,
    stream: false,
    watermark: true,
    safetyIdentifier: '',
  }
}

export type PixelSizeValidation =
  | { valid: true; normalized: string }
  | { valid: false; reason: 'format' | 'pixels' | 'ratio' }

export function validateSeedreamPixelSize(
  rawValue: string,
  profile: ImageModelProfile
): PixelSizeValidation {
  const match = /^(\d+)\s*[xX×]\s*(\d+)$/.exec(rawValue.trim())
  if (!match) {
    return { valid: false, reason: 'format' }
  }
  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { valid: false, reason: 'format' }
  }
  if (profile.pixelRange) {
    const totalPixels = width * height
    if (
      totalPixels < profile.pixelRange.minPixels ||
      totalPixels > profile.pixelRange.maxPixels
    ) {
      return { valid: false, reason: 'pixels' }
    }
    const ratio = width / height
    if (
      ratio < profile.pixelRange.minRatio ||
      ratio > profile.pixelRange.maxRatio
    ) {
      return { valid: false, reason: 'ratio' }
    }
  }
  return { valid: true, normalized: `${width}x${height}` }
}

export function getActiveImageSize(
  profile: ImageModelProfile,
  params: ImageStudioParams
): string {
  if (!profile.isSeedream) {
    return params.pixelSize
  }
  if (profile.supportsLayerDecomposition && params.layerDecomposition) {
    return params.layerSizeTier || profile.defaultLayerSizeTier
  }
  if (params.sizeMode === 'tier') {
    return params.sizeTier || profile.defaultSizeTier
  }
  const checked = validateSeedreamPixelSize(params.pixelSize, profile)
  return checked.valid ? checked.normalized : params.pixelSize.trim()
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function formatImageReferenceField(
  references: readonly string[]
): string | string[] | undefined {
  if (references.length === 0) return undefined
  if (references.length === 1) return references[0]
  return [...references]
}

export function buildImageRequestPayload(options: {
  model: string
  prompt: string
  references: readonly string[]
  profile: ImageModelProfile
  params: ImageStudioParams
}): Record<string, unknown> {
  const { model, prompt, references, profile, params } = options
  const trimmedPrompt = prompt.trim()
  const imageField = formatImageReferenceField(references)

  if (!profile.isSeedream) {
    return {
      model,
      prompt: trimmedPrompt,
      size: params.pixelSize,
      quality: params.quality,
      n: params.imageCount,
      output_format: params.outputFormat,
      ...(imageField !== undefined ? { image: imageField } : {}),
    }
  }

  const layerMode =
    profile.supportsLayerDecomposition && params.layerDecomposition
  const payload: Record<string, unknown> = {
    model,
  }

  if (!layerMode || trimmedPrompt) {
    payload.prompt = trimmedPrompt
  }

  if (imageField !== undefined) {
    payload.image = imageField
  }

  if (layerMode) {
    payload.layer_decomposition = true
    if (profile.supportsLayerDecompositionOptions) {
      payload.layer_decomposition_options = {
        max_images: clampInteger(params.layerMaxImages, 2, 100),
        text_recognition: params.layerTextRecognition,
      }
    }
  }

  payload.size = getActiveImageSize(profile, params)

  if (profile.outputFormats.length > 0) {
    payload.output_format = params.outputFormat
  }

  if (profile.backgroundOptions.length > 0 && !layerMode) {
    payload.background = params.background
  }

  if (profile.optimizePromptModes.length > 1) {
    payload.optimize_prompt_options = {
      mode: params.optimizePromptMode,
    }
  }

  if (profile.supportsResponseFormat) {
    payload.response_format = params.responseFormat
  }

  if (profile.supportsSequentialGeneration) {
    payload.sequential_image_generation = params.sequentialGeneration
    if (params.sequentialGeneration === 'auto') {
      const maxAllowed = Math.max(1, 15 - references.length)
      payload.sequential_image_generation_options = {
        max_images: clampInteger(params.sequentialMaxImages, 1, maxAllowed),
      }
    }
  }

  if (profile.supportsStream) {
    payload.stream = params.stream
  }

  if (profile.supportsWatermark) {
    payload.watermark = params.watermark
  }

  if (profile.supportsSafetyIdentifier && params.safetyIdentifier.trim()) {
    payload.safety_identifier = params.safetyIdentifier.trim().slice(0, 64)
  }

  return payload
}

export type ParsedJsonPayloadResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errorKey: string }

export function parseEditedJsonPayload(
  rawJson: string
): ParsedJsonPayloadResult {
  const trimmed = rawJson.trim()
  if (!trimmed) {
    return { ok: false, errorKey: 'Request body must be a valid JSON object.' }
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        errorKey: 'Request body must be a valid JSON object.',
      }
    }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch {
    return { ok: false, errorKey: 'Invalid JSON syntax.' }
  }
}

export function extractReferencesFromPayload(
  payload: Record<string, unknown>
): string[] | undefined {
  if (!('image' in payload)) return undefined
  const imageField = payload.image
  if (typeof imageField === 'string') {
    const cleaned = imageField.trim()
    return cleaned ? [cleaned] : []
  }
  if (Array.isArray(imageField)) {
    return imageField
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function syncImageParamsFromJson(
  payload: Record<string, unknown>,
  profile: ImageModelProfile,
  current: ImageStudioParams
): ImageStudioParams {
  const next: ImageStudioParams = { ...current }

  if (
    profile.supportsLayerDecomposition &&
    typeof payload.layer_decomposition === 'boolean'
  ) {
    next.layerDecomposition = payload.layer_decomposition
  }

  if (
    profile.supportsLayerDecompositionOptions &&
    payload.layer_decomposition_options &&
    typeof payload.layer_decomposition_options === 'object' &&
    !Array.isArray(payload.layer_decomposition_options)
  ) {
    const layerOpts = payload.layer_decomposition_options as Record<
      string,
      unknown
    >
    if (typeof layerOpts.max_images === 'number') {
      next.layerMaxImages = clampInteger(layerOpts.max_images, 2, 100)
    }
    if (typeof layerOpts.text_recognition === 'boolean') {
      next.layerTextRecognition = layerOpts.text_recognition
    }
  }

  if (typeof payload.size === 'string' && payload.size.trim()) {
    const rawSize = payload.size.trim()
    if (!profile.isSeedream) {
      next.pixelSize = rawSize
    } else if (next.layerDecomposition) {
      if (profile.layerResolutionTiers.includes(rawSize)) {
        next.layerSizeTier = rawSize
      }
    } else if (profile.resolutionTiers.includes(rawSize)) {
      next.sizeMode = 'tier'
      next.sizeTier = rawSize
    } else {
      next.sizeMode = 'pixels'
      next.pixelSize = rawSize
    }
  }

  if (
    typeof payload.output_format === 'string' &&
    profile.outputFormats.includes(payload.output_format as ImageOutputFormat)
  ) {
    next.outputFormat = payload.output_format as ImageOutputFormat
  }

  if (
    typeof payload.background === 'string' &&
    profile.backgroundOptions.includes(
      payload.background as ImageBackgroundMode
    )
  ) {
    next.background = payload.background as ImageBackgroundMode
  }

  if (
    typeof payload.response_format === 'string' &&
    (payload.response_format === 'url' ||
      payload.response_format === 'b64_json')
  ) {
    next.responseFormat = payload.response_format
  }

  if (
    payload.optimize_prompt_options &&
    typeof payload.optimize_prompt_options === 'object' &&
    !Array.isArray(payload.optimize_prompt_options)
  ) {
    const mode = (payload.optimize_prompt_options as Record<string, unknown>)
      .mode
    if (
      typeof mode === 'string' &&
      profile.optimizePromptModes.includes(mode as ImageOptimizePromptMode)
    ) {
      next.optimizePromptMode = mode as ImageOptimizePromptMode
    }
  }

  if (
    profile.supportsSequentialGeneration &&
    (payload.sequential_image_generation === 'auto' ||
      payload.sequential_image_generation === 'disabled')
  ) {
    next.sequentialGeneration = payload.sequential_image_generation
  }

  if (
    profile.supportsSequentialGeneration &&
    payload.sequential_image_generation_options &&
    typeof payload.sequential_image_generation_options === 'object' &&
    !Array.isArray(payload.sequential_image_generation_options)
  ) {
    const maxImages = (
      payload.sequential_image_generation_options as Record<string, unknown>
    ).max_images
    if (typeof maxImages === 'number') {
      next.sequentialMaxImages = clampInteger(maxImages, 1, 15)
    }
  }

  if (profile.supportsStream && typeof payload.stream === 'boolean') {
    next.stream = payload.stream
  }

  if (profile.supportsWatermark && typeof payload.watermark === 'boolean') {
    next.watermark = payload.watermark
  }

  if (
    profile.supportsSafetyIdentifier &&
    typeof payload.safety_identifier === 'string'
  ) {
    next.safetyIdentifier = payload.safety_identifier.slice(0, 64)
  }

  if (
    !profile.isSeedream &&
    (payload.quality === 'auto' ||
      payload.quality === 'low' ||
      payload.quality === 'medium' ||
      payload.quality === 'high')
  ) {
    next.quality = payload.quality
  }

  if (
    !profile.isSeedream &&
    typeof payload.n === 'number' &&
    Number.isInteger(payload.n) &&
    payload.n >= 1 &&
    payload.n <= 4
  ) {
    next.imageCount = payload.n
  }

  return next
}
