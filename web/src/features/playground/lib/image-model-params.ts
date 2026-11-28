export type ImageModelFamily =
  | 'seedream-5.5'
  | 'seedream-5.0-pro'
  | 'seedream-5.0-flash'
  | 'seedream-4'
  | 'gpt-image-2.6'
  | 'gpt-image-2.5'
  | 'gpt-image-2'
  | 'gpt-image-1.5'
  | 'gpt-image-1-mini'
  | 'openai-dall-e-3'
  | 'openai'

export type ImageModelProtocol = 'seedream' | 'gpt-image' | 'openai-legacy'
export type ImageSizeMode = 'tier' | 'pixels'
export type ImageSizeStrategy =
  | 'lookup_table'
  | 'computed_formula'
  | 'discrete_presets'
export type ImageAspectRatio =
  | '1:1'
  | '4:3'
  | '3:4'
  | '16:9'
  | '9:16'
  | '3:2'
  | '2:3'
  | '21:9'
export type ImageBackgroundMode = 'auto' | 'transparent' | 'opaque'
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'svg'
export type ImageResponseFormat = 'url' | 'b64_json'
export type ImageOptimizePromptMode = 'standard' | 'fast'
export type ImageSequentialMode = 'disabled' | 'auto'
export type ImageQuality =
  | 'auto'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'standard'
  | 'hd'
export type OpenAIImageQuality = ImageQuality
export type ImageModerationMode = 'auto' | 'low'
export type ImageComplexity = 'low' | 'medium' | 'high'
export type ImageInputFidelity = 'low' | 'high'
export type ImageStyleMode = 'vivid' | 'natural'

export interface ImageSizePreset {
  value: string
  ratioLabel: string
}

export interface ImagePixelRange {
  minPixels: number
  maxPixels: number
  minRatio: number
  maxRatio: number
  maxEdge?: number
  edgeMultiple?: number
  experimentalAbovePixels?: number
}

export interface ImageTierFormulaTarget {
  tier: string
  targetPixels: number
  alignMultiple: number
}

export type ImagePixelLookupTable = Readonly<
  Record<string, Readonly<Partial<Record<ImageAspectRatio, string>>>>
>

export interface ImageSizeSpec {
  strategy: ImageSizeStrategy
  resolutionTiers: readonly string[]
  defaultTier: string
  aspectRatios: readonly ImageAspectRatio[]
  defaultAspectRatio: ImageAspectRatio
  pixelTable?: ImagePixelLookupTable
  formulaTargets?: readonly ImageTierFormulaTarget[]
  pixelRange?: ImagePixelRange
  sizePresets: readonly ImageSizePreset[]
  supportsCustomPixels: boolean
}

export interface ImageModelProfile {
  family: ImageModelFamily
  protocol: ImageModelProtocol
  isSeedream: boolean
  isGptImage: boolean
  maxPromptLength: number
  maxReferences: number
  referenceRoutingMode: 'auto' | 'always-edits'
  supportsLayerDecomposition: boolean
  maxLayers: number
  supportsLayerDecompositionOptions: boolean
  sizeSpec: ImageSizeSpec
  resolutionTiers: readonly string[]
  layerResolutionTiers: readonly string[]
  defaultSizeMode: ImageSizeMode
  defaultSizeTier: string
  defaultAspectRatio: ImageAspectRatio
  defaultPixelSize: string
  defaultLayerSizeTier: string
  sizePresets: readonly ImageSizePreset[]
  pixelRange?: ImagePixelRange
  qualityOptions: readonly ImageQuality[]
  defaultQuality: ImageQuality
  maxImageCount: number
  imageCountPresets: readonly number[]
  outputFormats: readonly ImageOutputFormat[]
  defaultOutputFormat: ImageOutputFormat
  supportsOutputCompression: boolean
  backgroundOptions: readonly ImageBackgroundMode[]
  defaultBackground: ImageBackgroundMode
  moderationOptions: readonly ImageModerationMode[]
  defaultModeration: ImageModerationMode
  complexityOptions: readonly ImageComplexity[]
  defaultComplexity: ImageComplexity
  inputFidelityOptions: readonly ImageInputFidelity[]
  defaultInputFidelity: ImageInputFidelity
  styleOptions: readonly ImageStyleMode[]
  defaultStyle: ImageStyleMode
  optimizePromptModes: readonly ImageOptimizePromptMode[]
  supportsResponseFormat: boolean
  supportsSequentialGeneration: boolean
  supportsStream: boolean
  maxPartialImages: number
  supportsGifOptions: boolean
  supportsSvgOutput: boolean
  supportsWatermark: boolean
  supportsSafetyIdentifier: boolean
}

export interface ImageStudioParams {
  sizeMode: ImageSizeMode
  sizeTier: string
  aspectRatio: ImageAspectRatio
  pixelSize: string
  layerSizeTier: string
  quality: ImageQuality
  imageCount: number
  outputFormat: ImageOutputFormat
  outputCompression: number
  background: ImageBackgroundMode
  moderation: ImageModerationMode
  complexity: ImageComplexity
  inputFidelity: ImageInputFidelity
  style: ImageStyleMode
  responseFormat: ImageResponseFormat
  optimizePromptMode: ImageOptimizePromptMode
  layerDecomposition: boolean
  layerMaxImages: number
  layerTextRecognition: boolean
  sequentialGeneration: ImageSequentialMode
  sequentialMaxImages: number
  stream: boolean
  partialImages: number
  frameCount: number
  frameDurationMs: number
  watermark: boolean
  safetyIdentifier: string
}

export interface ImagePresetSeed {
  imageSize?: string
  quality?: ImageQuality
  imageCount?: number
  imageFormat?: ImageOutputFormat
}

const SEEDREAM_ASPECT_RATIOS: readonly ImageAspectRatio[] = [
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '3:2',
  '2:3',
  '21:9',
]

const SEEDREAM_5_PIXEL_TABLE: ImagePixelLookupTable = {
  '1K': {
    '1:1': '1024x1024',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1424x800',
    '9:16': '800x1424',
    '3:2': '1248x832',
    '2:3': '832x1248',
    '21:9': '1568x672',
  },
  '1.5K': {
    '1:1': '1536x1536',
    '4:3': '1792x1344',
    '3:4': '1344x1792',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '3:2': '1872x1248',
    '2:3': '1248x1872',
    '21:9': '2352x1008',
  },
  '2K': {
    '1:1': '2048x2048',
    '4:3': '2368x1776',
    '3:4': '1776x2368',
    '16:9': '2816x1584',
    '9:16': '1584x2816',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344',
  },
}

const SEEDREAM_4_PIXEL_TABLE: ImagePixelLookupTable = {
  '1K': {
    '1:1': '1024x1024',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '3:2': '1248x832',
    '2:3': '832x1248',
    '21:9': '1512x648',
  },
  '2K': {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2848x1600',
    '9:16': '1600x2848',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344',
  },
  '4K': {
    '1:1': '4096x4096',
    '4:3': '4704x3520',
    '3:4': '3520x4704',
    '16:9': '5504x3040',
    '9:16': '3040x5504',
    '3:2': '4992x3328',
    '2:3': '3328x4992',
    '21:9': '6240x2656',
  },
}

const GPT_IMAGE_2_ASPECT_RATIOS: readonly ImageAspectRatio[] = [
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '21:9',
]

const GPT_IMAGE_2_PIXEL_TABLE: ImagePixelLookupTable = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1536x864',
    '9:16': '864x1536',
    '21:9': '1568x672',
  },
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2304x1536',
    '2:3': '1536x2304',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '21:9': '2688x1152',
  },
  '4K': {
    '1:1': '2880x2880',
    '3:2': '3504x2336',
    '2:3': '2336x3504',
    '4:3': '3264x2448',
    '3:4': '2448x3264',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '21:9': '3808x1632',
  },
}

const OPENAI_GPT_IMAGE_PIXEL_TABLE: ImagePixelLookupTable = {
  '1K': {
    '3:2': '1536x1024',
    '1:1': '1024x1024',
    '2:3': '1024x1536',
  },
}

const OPENAI_DALLE3_PIXEL_TABLE: ImagePixelLookupTable = {
  '1K': {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
  },
}

const DEFAULT_FORMULA_TARGETS: readonly ImageTierFormulaTarget[] = [
  { tier: '1K', targetPixels: 1024 * 1024, alignMultiple: 64 },
  { tier: '1.5K', targetPixels: 1536 * 1536, alignMultiple: 64 },
  { tier: '2K', targetPixels: 2048 * 2048, alignMultiple: 64 },
]

const SEEDREAM_55_PRESETS: readonly ImageSizePreset[] = [
  { value: '2048x2048', ratioLabel: '1:1' },
  { value: '2816x1584', ratioLabel: '16:9' },
  { value: '1584x2816', ratioLabel: '9:16' },
  { value: '2368x1776', ratioLabel: '4:3' },
  { value: '1776x2368', ratioLabel: '3:4' },
  { value: '3136x1344', ratioLabel: '21:9' },
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

const GPT_IMAGE_1_PRESETS: readonly ImageSizePreset[] = [
  { value: 'auto', ratioLabel: '' },
  { value: '1024x1024', ratioLabel: '1:1' },
  { value: '1536x1024', ratioLabel: '3:2' },
  { value: '1024x1536', ratioLabel: '2:3' },
]

const GPT_IMAGE_2_PRESETS: readonly ImageSizePreset[] = [
  { value: '1024x1024', ratioLabel: '1:1' },
  { value: '1536x1024', ratioLabel: '3:2' },
  { value: '1024x1536', ratioLabel: '2:3' },
  { value: '2048x2048', ratioLabel: '2K 1:1' },
  { value: '2048x1152', ratioLabel: '2K 16:9' },
  { value: '3840x2160', ratioLabel: '4K 16:9' },
]

const OPENAI_DALLE3_PRESETS: readonly ImageSizePreset[] = [
  { value: '1024x1024', ratioLabel: '1:1' },
  { value: '1792x1024', ratioLabel: '16:9' },
  { value: '1024x1792', ratioLabel: '9:16' },
]

const SEEDREAM_55_PIXEL_RANGE: ImagePixelRange = {
  minPixels: 1280 * 720,
  maxPixels: 2880 * 2880,
  minRatio: 1 / 16,
  maxRatio: 16,
}

const SEEDREAM_50_PIXEL_RANGE: ImagePixelRange = {
  minPixels: 1280 * 720,
  maxPixels: 4624220,
  minRatio: 1 / 16,
  maxRatio: 16,
}

const SEEDREAM_40_PIXEL_RANGE: ImagePixelRange = {
  minPixels: 1280 * 720,
  maxPixels: 4096 * 4096,
  minRatio: 1 / 16,
  maxRatio: 16,
}

const GPT_IMAGE_2_PIXEL_RANGE: ImagePixelRange = {
  minPixels: 655360,
  maxPixels: 3840 * 2160,
  minRatio: 1 / 3,
  maxRatio: 3,
  maxEdge: 3840,
  edgeMultiple: 16,
}

const GPT_IMAGE_25_PIXEL_RANGE: ImagePixelRange = {
  ...GPT_IMAGE_2_PIXEL_RANGE,
  experimentalAbovePixels: 2560 * 1440,
}

const SEEDREAM_55_SIZE_SPEC: ImageSizeSpec = {
  strategy: 'lookup_table',
  resolutionTiers: ['1K', '1.5K', '2K'],
  defaultTier: '2K',
  aspectRatios: SEEDREAM_ASPECT_RATIOS,
  defaultAspectRatio: '1:1',
  pixelTable: SEEDREAM_5_PIXEL_TABLE,
  pixelRange: SEEDREAM_55_PIXEL_RANGE,
  sizePresets: SEEDREAM_55_PRESETS,
  supportsCustomPixels: true,
}

const SEEDREAM_50_SIZE_SPEC: ImageSizeSpec = {
  strategy: 'lookup_table',
  resolutionTiers: ['1K', '1.5K', '2K'],
  defaultTier: '2K',
  aspectRatios: SEEDREAM_ASPECT_RATIOS,
  defaultAspectRatio: '1:1',
  pixelTable: SEEDREAM_5_PIXEL_TABLE,
  pixelRange: SEEDREAM_50_PIXEL_RANGE,
  sizePresets: SEEDREAM_50_PRESETS,
  supportsCustomPixels: true,
}

const SEEDREAM_40_SIZE_SPEC: ImageSizeSpec = {
  strategy: 'lookup_table',
  resolutionTiers: ['1K', '2K', '4K'],
  defaultTier: '2K',
  aspectRatios: SEEDREAM_ASPECT_RATIOS,
  defaultAspectRatio: '1:1',
  pixelTable: SEEDREAM_4_PIXEL_TABLE,
  pixelRange: SEEDREAM_40_PIXEL_RANGE,
  sizePresets: SEEDREAM_40_PRESETS,
  supportsCustomPixels: true,
}

const GPT_IMAGE_1_SIZE_SPEC: ImageSizeSpec = {
  strategy: 'discrete_presets',
  resolutionTiers: [],
  defaultTier: '',
  aspectRatios: ['1:1', '3:2', '2:3'],
  defaultAspectRatio: '1:1',
  sizePresets: GPT_IMAGE_1_PRESETS,
  supportsCustomPixels: false,
}

const GPT_IMAGE_2_SIZE_SPEC: ImageSizeSpec = {
  strategy: 'lookup_table',
  resolutionTiers: ['auto', '1K', '2K', '4K'],
  defaultTier: 'auto',
  aspectRatios: GPT_IMAGE_2_ASPECT_RATIOS,
  defaultAspectRatio: '1:1',
  pixelTable: GPT_IMAGE_2_PIXEL_TABLE,
  pixelRange: GPT_IMAGE_2_PIXEL_RANGE,
  sizePresets: GPT_IMAGE_2_PRESETS,
  supportsCustomPixels: true,
}

const GPT_IMAGE_25_SIZE_SPEC: ImageSizeSpec = {
  ...GPT_IMAGE_2_SIZE_SPEC,
  pixelRange: GPT_IMAGE_25_PIXEL_RANGE,
}

const OPENAI_GENERIC_SIZE_SPEC: ImageSizeSpec = {
  strategy: 'lookup_table',
  resolutionTiers: ['1K'],
  defaultTier: '1K',
  aspectRatios: ['3:2', '1:1', '2:3'],
  defaultAspectRatio: '3:2',
  pixelTable: OPENAI_GPT_IMAGE_PIXEL_TABLE,
  sizePresets: OPENAI_PRESETS,
  supportsCustomPixels: true,
}

const OPENAI_DALLE3_SIZE_SPEC: ImageSizeSpec = {
  strategy: 'discrete_presets',
  resolutionTiers: [],
  defaultTier: '',
  aspectRatios: ['1:1', '16:9', '9:16'],
  defaultAspectRatio: '1:1',
  pixelTable: OPENAI_DALLE3_PIXEL_TABLE,
  sizePresets: OPENAI_DALLE3_PRESETS,
  supportsCustomPixels: false,
}

export function createFormulaSizeSpec(options?: {
  resolutionTiers?: readonly string[]
  defaultTier?: string
  aspectRatios?: readonly ImageAspectRatio[]
  defaultAspectRatio?: ImageAspectRatio
  formulaTargets?: readonly ImageTierFormulaTarget[]
  pixelRange?: ImagePixelRange
  sizePresets?: readonly ImageSizePreset[]
  supportsCustomPixels?: boolean
}): ImageSizeSpec {
  const targets = options?.formulaTargets ?? DEFAULT_FORMULA_TARGETS
  const tiers = options?.resolutionTiers ?? targets.map((item) => item.tier)
  return {
    strategy: 'computed_formula',
    resolutionTiers: tiers,
    defaultTier: options?.defaultTier ?? tiers[0] ?? '1K',
    aspectRatios: options?.aspectRatios ?? SEEDREAM_ASPECT_RATIOS,
    defaultAspectRatio: options?.defaultAspectRatio ?? '1:1',
    formulaTargets: targets,
    pixelRange: options?.pixelRange,
    sizePresets: options?.sizePresets ?? OPENAI_PRESETS,
    supportsCustomPixels: options?.supportsCustomPixels ?? true,
  }
}

function parseAspectRatioValue(aspectRatio: ImageAspectRatio): number {
  const [wStr, hStr] = aspectRatio.split(':')
  const width = Number(wStr)
  const height = Number(hStr)
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return 1
  }
  return width / height
}

function snapToMultiple(value: number, multiple: number): number {
  const step = Math.max(1, Math.round(multiple))
  return Math.max(step, Math.round(value / step) * step)
}

export function computePixelsFromFormula(
  tier: string,
  aspectRatio: ImageAspectRatio,
  targets: readonly ImageTierFormulaTarget[] = DEFAULT_FORMULA_TARGETS,
  pixelRange?: ImagePixelRange
): string {
  const matched =
    targets.find((item) => item.tier === tier) ??
    targets[0] ??
    DEFAULT_FORMULA_TARGETS[0]
  const ratio = parseAspectRatioValue(aspectRatio)
  let targetArea = matched.targetPixels
  if (pixelRange) {
    targetArea = Math.min(
      pixelRange.maxPixels,
      Math.max(pixelRange.minPixels, targetArea)
    )
  }
  const step = matched.alignMultiple
  let width = snapToMultiple(Math.sqrt(targetArea * ratio), step)
  let height = snapToMultiple(width / ratio, step)

  if (pixelRange) {
    let area = width * height
    if (area > pixelRange.maxPixels) {
      const scale = Math.sqrt(pixelRange.maxPixels / area)
      width = Math.max(step, Math.floor((width * scale) / step) * step)
      height = Math.max(step, Math.floor((height * scale) / step) * step)
      area = width * height
    }
    if (area < pixelRange.minPixels) {
      const scale = Math.sqrt(pixelRange.minPixels / area)
      width = Math.max(step, Math.ceil((width * scale) / step) * step)
      height = Math.max(step, Math.ceil((height * scale) / step) * step)
    }
  }

  return `${width}x${height}`
}

export function resolveSizeFromSpec(
  spec: ImageSizeSpec,
  tier: string,
  aspectRatio: ImageAspectRatio
): string {
  const safeTier = spec.resolutionTiers.includes(tier) ? tier : spec.defaultTier
  const safeRatio = spec.aspectRatios.includes(aspectRatio)
    ? aspectRatio
    : spec.defaultAspectRatio

  if (safeTier === 'auto') {
    return 'auto'
  }

  if (spec.strategy === 'lookup_table') {
    const exact = spec.pixelTable?.[safeTier]?.[safeRatio]
    if (exact) return exact
    const fallbackTier = spec.pixelTable?.[spec.defaultTier]?.[safeRatio]
    if (fallbackTier) return fallbackTier
    const fallbackRatio = spec.pixelTable?.[safeTier]?.[spec.defaultAspectRatio]
    if (fallbackRatio) return fallbackRatio
  }

  if (spec.strategy === 'discrete_presets') {
    const matchedPreset = spec.sizePresets.find(
      (preset) => preset.ratioLabel === safeRatio
    )
    if (matchedPreset) return matchedPreset.value
    if (spec.sizePresets[0]) return spec.sizePresets[0].value
  }

  if (spec.formulaTargets?.length || spec.strategy === 'computed_formula') {
    return computePixelsFromFormula(
      safeTier,
      safeRatio,
      spec.formulaTargets ?? DEFAULT_FORMULA_TARGETS,
      spec.pixelRange
    )
  }

  return spec.sizePresets[0]?.value ?? '1024x1024'
}

export function resolveTierRatioFromPixelSize(
  rawSize: string,
  spec: ImageSizeSpec
): { sizeTier: string; aspectRatio: ImageAspectRatio } | null {
  const normalized = rawSize.trim().toLowerCase().replaceAll('×', 'x')
  if (normalized === 'auto' && spec.resolutionTiers.includes('auto')) {
    return { sizeTier: 'auto', aspectRatio: spec.defaultAspectRatio }
  }
  if (spec.pixelTable) {
    for (const tier of spec.resolutionTiers) {
      if (tier === 'auto') continue
      const tierMap = spec.pixelTable[tier]
      if (!tierMap) continue
      for (const ratio of spec.aspectRatios) {
        if (tierMap[ratio]?.toLowerCase() === normalized) {
          return { sizeTier: tier, aspectRatio: ratio }
        }
      }
    }
  }
  for (const tier of spec.resolutionTiers) {
    if (tier === 'auto') continue
    for (const ratio of spec.aspectRatios) {
      if (resolveSizeFromSpec(spec, tier, ratio).toLowerCase() === normalized) {
        return { sizeTier: tier, aspectRatio: ratio }
      }
    }
  }
  return null
}

export function formatPixelDisplay(rawSize: string): string {
  const match = /^(\d+)\s*[xX×]\s*(\d+)$/.exec(rawSize.trim())
  if (!match) return rawSize.trim()
  return `${match[1]} × ${match[2]}`
}

const GPT_IMAGE_STANDARD_QUALITIES: readonly ImageQuality[] = [
  'auto',
  'low',
  'medium',
  'high',
]

const GPT_IMAGE_EXTENDED_QUALITIES: readonly ImageQuality[] = [
  'auto',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

const PROFILES: Record<ImageModelFamily, ImageModelProfile> = {
  'seedream-5.5': {
    family: 'seedream-5.5',
    protocol: 'seedream',
    isSeedream: true,
    isGptImage: false,
    maxPromptLength: 2000,
    maxReferences: 10,
    referenceRoutingMode: 'auto',
    supportsLayerDecomposition: true,
    maxLayers: 99,
    supportsLayerDecompositionOptions: true,
    sizeSpec: SEEDREAM_55_SIZE_SPEC,
    resolutionTiers: SEEDREAM_55_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: ['auto', '1K', '1.5K', '2K'],
    defaultSizeMode: 'tier',
    defaultSizeTier: SEEDREAM_55_SIZE_SPEC.defaultTier,
    defaultAspectRatio: SEEDREAM_55_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_55_SIZE_SPEC.sizePresets,
    pixelRange: SEEDREAM_55_PIXEL_RANGE,
    qualityOptions: [],
    defaultQuality: 'auto',
    maxImageCount: 1,
    imageCountPresets: [],
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'png',
    supportsOutputCompression: false,
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    moderationOptions: [],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: ['standard'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    maxPartialImages: 0,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  'seedream-5.0-pro': {
    family: 'seedream-5.0-pro',
    protocol: 'seedream',
    isSeedream: true,
    isGptImage: false,
    maxPromptLength: 2000,
    maxReferences: 10,
    referenceRoutingMode: 'auto',
    supportsLayerDecomposition: true,
    maxLayers: 16,
    supportsLayerDecompositionOptions: false,
    sizeSpec: SEEDREAM_50_SIZE_SPEC,
    resolutionTiers: SEEDREAM_50_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: ['auto', '1K', '1.5K', '2K'],
    defaultSizeMode: 'tier',
    defaultSizeTier: SEEDREAM_50_SIZE_SPEC.defaultTier,
    defaultAspectRatio: SEEDREAM_50_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_50_SIZE_SPEC.sizePresets,
    pixelRange: SEEDREAM_50_PIXEL_RANGE,
    qualityOptions: [],
    defaultQuality: 'auto',
    maxImageCount: 1,
    imageCountPresets: [],
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'jpeg',
    supportsOutputCompression: false,
    backgroundOptions: ['opaque', 'transparent'],
    defaultBackground: 'opaque',
    moderationOptions: [],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: ['standard', 'fast'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    maxPartialImages: 0,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  'seedream-5.0-flash': {
    family: 'seedream-5.0-flash',
    protocol: 'seedream',
    isSeedream: true,
    isGptImage: false,
    maxPromptLength: 2000,
    maxReferences: 10,
    referenceRoutingMode: 'auto',
    supportsLayerDecomposition: true,
    maxLayers: 16,
    supportsLayerDecompositionOptions: false,
    sizeSpec: SEEDREAM_50_SIZE_SPEC,
    resolutionTiers: SEEDREAM_50_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: ['auto', '1K', '1.5K', '2K'],
    defaultSizeMode: 'tier',
    defaultSizeTier: SEEDREAM_50_SIZE_SPEC.defaultTier,
    defaultAspectRatio: SEEDREAM_50_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_50_SIZE_SPEC.sizePresets,
    pixelRange: SEEDREAM_50_PIXEL_RANGE,
    qualityOptions: [],
    defaultQuality: 'auto',
    maxImageCount: 1,
    imageCountPresets: [],
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'jpeg',
    supportsOutputCompression: false,
    backgroundOptions: ['opaque', 'transparent'],
    defaultBackground: 'opaque',
    moderationOptions: [],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: ['standard'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    maxPartialImages: 0,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  'seedream-4': {
    family: 'seedream-4',
    protocol: 'seedream',
    isSeedream: true,
    isGptImage: false,
    maxPromptLength: 2000,
    maxReferences: 14,
    referenceRoutingMode: 'auto',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: SEEDREAM_40_SIZE_SPEC,
    resolutionTiers: SEEDREAM_40_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: SEEDREAM_40_SIZE_SPEC.defaultTier,
    defaultAspectRatio: SEEDREAM_40_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '2048x2048',
    defaultLayerSizeTier: 'auto',
    sizePresets: SEEDREAM_40_SIZE_SPEC.sizePresets,
    pixelRange: SEEDREAM_40_PIXEL_RANGE,
    qualityOptions: [],
    defaultQuality: 'auto',
    maxImageCount: 1,
    imageCountPresets: [],
    outputFormats: [],
    defaultOutputFormat: 'png',
    supportsOutputCompression: false,
    backgroundOptions: [],
    defaultBackground: 'auto',
    moderationOptions: [],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: ['standard', 'fast'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: true,
    supportsStream: true,
    maxPartialImages: 0,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  'gpt-image-2.6': {
    family: 'gpt-image-2.6',
    protocol: 'gpt-image',
    isSeedream: false,
    isGptImage: true,
    maxPromptLength: 32000,
    maxReferences: 16,
    referenceRoutingMode: 'always-edits',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: GPT_IMAGE_2_SIZE_SPEC,
    resolutionTiers: GPT_IMAGE_2_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: GPT_IMAGE_2_SIZE_SPEC.defaultTier,
    defaultAspectRatio: GPT_IMAGE_2_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1024x1024',
    defaultLayerSizeTier: '',
    sizePresets: GPT_IMAGE_2_SIZE_SPEC.sizePresets,
    pixelRange: GPT_IMAGE_2_PIXEL_RANGE,
    qualityOptions: GPT_IMAGE_EXTENDED_QUALITIES,
    defaultQuality: 'auto',
    maxImageCount: 10,
    imageCountPresets: [1, 2, 4],
    outputFormats: ['png', 'jpeg', 'webp', 'gif', 'svg'],
    defaultOutputFormat: 'png',
    supportsOutputCompression: true,
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    moderationOptions: ['auto', 'low'],
    defaultModeration: 'auto',
    complexityOptions: ['low', 'medium', 'high'],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: [],
    supportsResponseFormat: false,
    supportsSequentialGeneration: false,
    supportsStream: true,
    maxPartialImages: 3,
    supportsGifOptions: true,
    supportsSvgOutput: true,
    supportsWatermark: false,
    supportsSafetyIdentifier: false,
  },
  'gpt-image-2.5': {
    family: 'gpt-image-2.5',
    protocol: 'gpt-image',
    isSeedream: false,
    isGptImage: true,
    maxPromptLength: 32000,
    maxReferences: 16,
    referenceRoutingMode: 'always-edits',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: GPT_IMAGE_25_SIZE_SPEC,
    resolutionTiers: GPT_IMAGE_25_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: GPT_IMAGE_25_SIZE_SPEC.defaultTier,
    defaultAspectRatio: GPT_IMAGE_25_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1024x1024',
    defaultLayerSizeTier: '',
    sizePresets: GPT_IMAGE_25_SIZE_SPEC.sizePresets,
    pixelRange: GPT_IMAGE_25_PIXEL_RANGE,
    qualityOptions: GPT_IMAGE_EXTENDED_QUALITIES,
    defaultQuality: 'auto',
    maxImageCount: 10,
    imageCountPresets: [1, 2, 4],
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultOutputFormat: 'png',
    supportsOutputCompression: true,
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    moderationOptions: ['auto', 'low'],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: [],
    supportsResponseFormat: false,
    supportsSequentialGeneration: false,
    supportsStream: true,
    maxPartialImages: 3,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: false,
    supportsSafetyIdentifier: false,
  },
  'gpt-image-2': {
    family: 'gpt-image-2',
    protocol: 'gpt-image',
    isSeedream: false,
    isGptImage: true,
    maxPromptLength: 32000,
    maxReferences: 16,
    referenceRoutingMode: 'always-edits',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: GPT_IMAGE_2_SIZE_SPEC,
    resolutionTiers: GPT_IMAGE_2_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: GPT_IMAGE_2_SIZE_SPEC.defaultTier,
    defaultAspectRatio: GPT_IMAGE_2_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1024x1024',
    defaultLayerSizeTier: '',
    sizePresets: GPT_IMAGE_2_SIZE_SPEC.sizePresets,
    pixelRange: GPT_IMAGE_2_PIXEL_RANGE,
    qualityOptions: GPT_IMAGE_STANDARD_QUALITIES,
    defaultQuality: 'auto',
    maxImageCount: 10,
    imageCountPresets: [1, 2, 4],
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultOutputFormat: 'png',
    supportsOutputCompression: true,
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    moderationOptions: ['auto', 'low'],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: [],
    supportsResponseFormat: false,
    supportsSequentialGeneration: false,
    supportsStream: true,
    maxPartialImages: 3,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: false,
    supportsSafetyIdentifier: false,
  },
  'gpt-image-1.5': {
    family: 'gpt-image-1.5',
    protocol: 'gpt-image',
    isSeedream: false,
    isGptImage: true,
    maxPromptLength: 32000,
    maxReferences: 16,
    referenceRoutingMode: 'always-edits',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: GPT_IMAGE_1_SIZE_SPEC,
    resolutionTiers: GPT_IMAGE_1_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'pixels',
    defaultSizeTier: '',
    defaultAspectRatio: GPT_IMAGE_1_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: 'auto',
    defaultLayerSizeTier: '',
    sizePresets: GPT_IMAGE_1_SIZE_SPEC.sizePresets,
    qualityOptions: GPT_IMAGE_STANDARD_QUALITIES,
    defaultQuality: 'auto',
    maxImageCount: 10,
    imageCountPresets: [1, 2, 4],
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultOutputFormat: 'png',
    supportsOutputCompression: true,
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    moderationOptions: ['auto', 'low'],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: ['low', 'high'],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: [],
    supportsResponseFormat: false,
    supportsSequentialGeneration: false,
    supportsStream: true,
    maxPartialImages: 3,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: false,
    supportsSafetyIdentifier: false,
  },
  'gpt-image-1-mini': {
    family: 'gpt-image-1-mini',
    protocol: 'gpt-image',
    isSeedream: false,
    isGptImage: true,
    maxPromptLength: 32000,
    maxReferences: 16,
    referenceRoutingMode: 'always-edits',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: GPT_IMAGE_1_SIZE_SPEC,
    resolutionTiers: GPT_IMAGE_1_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'pixels',
    defaultSizeTier: '',
    defaultAspectRatio: GPT_IMAGE_1_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: 'auto',
    defaultLayerSizeTier: '',
    sizePresets: GPT_IMAGE_1_SIZE_SPEC.sizePresets,
    qualityOptions: GPT_IMAGE_STANDARD_QUALITIES,
    defaultQuality: 'auto',
    maxImageCount: 10,
    imageCountPresets: [1, 2, 4],
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultOutputFormat: 'png',
    supportsOutputCompression: true,
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    moderationOptions: ['auto', 'low'],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: [],
    supportsResponseFormat: false,
    supportsSequentialGeneration: false,
    supportsStream: true,
    maxPartialImages: 3,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: false,
    supportsSafetyIdentifier: false,
  },
  'openai-dall-e-3': {
    family: 'openai-dall-e-3',
    protocol: 'openai-legacy',
    isSeedream: false,
    isGptImage: false,
    maxPromptLength: 4000,
    maxReferences: 0,
    referenceRoutingMode: 'auto',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: OPENAI_DALLE3_SIZE_SPEC,
    resolutionTiers: OPENAI_DALLE3_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'pixels',
    defaultSizeTier: OPENAI_DALLE3_SIZE_SPEC.defaultTier,
    defaultAspectRatio: OPENAI_DALLE3_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1024x1024',
    defaultLayerSizeTier: '',
    sizePresets: OPENAI_DALLE3_SIZE_SPEC.sizePresets,
    qualityOptions: ['standard', 'hd'],
    defaultQuality: 'standard',
    maxImageCount: 1,
    imageCountPresets: [],
    outputFormats: [],
    defaultOutputFormat: 'png',
    supportsOutputCompression: false,
    backgroundOptions: [],
    defaultBackground: 'auto',
    moderationOptions: [],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: ['vivid', 'natural'],
    defaultStyle: 'vivid',
    optimizePromptModes: [],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    maxPartialImages: 0,
    supportsGifOptions: false,
    supportsSvgOutput: false,
    supportsWatermark: false,
    supportsSafetyIdentifier: false,
  },
  openai: {
    family: 'openai',
    protocol: 'openai-legacy',
    isSeedream: false,
    isGptImage: false,
    maxPromptLength: 2000,
    maxReferences: 10,
    referenceRoutingMode: 'auto',
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: OPENAI_GENERIC_SIZE_SPEC,
    resolutionTiers: OPENAI_GENERIC_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: OPENAI_GENERIC_SIZE_SPEC.defaultTier,
    defaultAspectRatio: OPENAI_GENERIC_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1536x1024',
    defaultLayerSizeTier: '',
    sizePresets: OPENAI_GENERIC_SIZE_SPEC.sizePresets,
    qualityOptions: GPT_IMAGE_STANDARD_QUALITIES,
    defaultQuality: 'high',
    maxImageCount: 4,
    imageCountPresets: [1, 2, 4],
    outputFormats: ['png', 'jpeg', 'webp'],
    defaultOutputFormat: 'png',
    supportsOutputCompression: false,
    backgroundOptions: [],
    defaultBackground: 'auto',
    moderationOptions: [],
    defaultModeration: 'auto',
    complexityOptions: [],
    defaultComplexity: 'high',
    inputFidelityOptions: [],
    defaultInputFidelity: 'low',
    styleOptions: [],
    defaultStyle: 'vivid',
    optimizePromptModes: [],
    supportsResponseFormat: false,
    supportsSequentialGeneration: false,
    supportsStream: false,
    maxPartialImages: 0,
    supportsGifOptions: false,
    supportsSvgOutput: false,
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
  if (/gpt[-_.\s]*image[-_.\s]*2[._-][6-9]/.test(normalized)) {
    return PROFILES['gpt-image-2.6']
  }
  if (/gpt[-_.\s]*image[-_.\s]*2[._-]5/.test(normalized)) {
    return PROFILES['gpt-image-2.5']
  }
  if (/gpt[-_.\s]*image[-_.\s]*2(?:$|[-_.\s])/.test(normalized)) {
    return PROFILES['gpt-image-2']
  }
  if (/gpt[-_.\s]*image[-_.\s]*1[-_.\s]*mini/.test(normalized)) {
    return PROFILES['gpt-image-1-mini']
  }
  if (/gpt[-_.\s]*image|chatgpt[-_.\s]*image/.test(normalized)) {
    return PROFILES['gpt-image-1.5']
  }
  if (/dall-e-3/.test(normalized)) {
    return PROFILES['openai-dall-e-3']
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
  const presetQuality =
    preset?.quality && profile.qualityOptions.includes(preset.quality)
      ? preset.quality
      : profile.defaultQuality
  const presetSize = preset?.imageSize
  let sizeMode: ImageSizeMode = profile.defaultSizeMode
  let sizeTier = profile.defaultSizeTier
  let aspectRatio: ImageAspectRatio = profile.defaultAspectRatio
  let pixelSize =
    profile.sizeSpec.strategy === 'discrete_presets' ||
    profile.defaultSizeTier === 'auto'
      ? profile.defaultPixelSize
      : resolveSizeFromSpec(
          profile.sizeSpec,
          profile.defaultSizeTier,
          profile.defaultAspectRatio
        )

  if (presetSize) {
    if (profile.sizeSpec.strategy === 'discrete_presets') {
      const matchedPreset = profile.sizePresets.find(
        (item) => item.value.toLowerCase() === presetSize.trim().toLowerCase()
      )
      if (matchedPreset) {
        sizeMode = 'pixels'
        pixelSize = matchedPreset.value
      }
    } else {
      const matchedTierRatio = resolveTierRatioFromPixelSize(
        presetSize,
        profile.sizeSpec
      )
      if (matchedTierRatio) {
        sizeMode = 'tier'
        sizeTier = matchedTierRatio.sizeTier
        aspectRatio = matchedTierRatio.aspectRatio
        const resolved = resolveSizeFromSpec(
          profile.sizeSpec,
          sizeTier,
          aspectRatio
        )
        pixelSize = resolved === 'auto' ? profile.defaultPixelSize : resolved
      } else if (profile.resolutionTiers.includes(presetSize)) {
        sizeMode = 'tier'
        sizeTier = presetSize
        const resolved = resolveSizeFromSpec(
          profile.sizeSpec,
          sizeTier,
          aspectRatio
        )
        pixelSize = resolved === 'auto' ? profile.defaultPixelSize : resolved
      } else if (profile.sizeSpec.supportsCustomPixels) {
        sizeMode = 'pixels'
        pixelSize = presetSize
      }
    }
  }

  return {
    sizeMode,
    sizeTier,
    aspectRatio,
    pixelSize,
    layerSizeTier: profile.defaultLayerSizeTier,
    quality: presetQuality,
    imageCount: clampInteger(
      preset?.imageCount ?? 1,
      1,
      Math.max(1, profile.maxImageCount)
    ),
    outputFormat: presetFormat,
    outputCompression: 100,
    background: profile.defaultBackground,
    moderation: profile.defaultModeration,
    complexity: profile.defaultComplexity,
    inputFidelity: profile.defaultInputFidelity,
    style: profile.defaultStyle,
    responseFormat: 'url',
    optimizePromptMode: 'standard',
    layerDecomposition: false,
    layerMaxImages: 30,
    layerTextRecognition: false,
    sequentialGeneration: 'disabled',
    sequentialMaxImages: 15,
    stream: false,
    partialImages: 0,
    frameCount: 9,
    frameDurationMs: 200,
    watermark: false,
    safetyIdentifier: '',
  }
}

export type PixelSizeValidation =
  | { valid: true; normalized: string }
  | {
      valid: false
      reason: 'format' | 'pixels' | 'ratio' | 'maxEdge' | 'multiple'
    }

export function validateImagePixelSize(
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
    if (
      profile.pixelRange.edgeMultiple &&
      (width % profile.pixelRange.edgeMultiple !== 0 ||
        height % profile.pixelRange.edgeMultiple !== 0)
    ) {
      return { valid: false, reason: 'multiple' }
    }
    if (
      profile.pixelRange.maxEdge &&
      (width > profile.pixelRange.maxEdge ||
        height > profile.pixelRange.maxEdge)
    ) {
      return { valid: false, reason: 'maxEdge' }
    }
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

export const validateSeedreamPixelSize = validateImagePixelSize

export function isExperimentalPixelSize(
  rawSize: string,
  profile: ImageModelProfile
): boolean {
  const limit = profile.pixelRange?.experimentalAbovePixels
  if (!limit) return false
  const match = /^(\d+)\s*[xX×]\s*(\d+)$/.exec(rawSize.trim())
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  return (
    Number.isFinite(width) && Number.isFinite(height) && width * height > limit
  )
}

export function getActiveImageSize(
  profile: ImageModelProfile,
  params: ImageStudioParams
): string {
  if (profile.supportsLayerDecomposition && params.layerDecomposition) {
    return params.layerSizeTier || profile.defaultLayerSizeTier
  }
  if (profile.sizeSpec.strategy === 'discrete_presets') {
    return params.pixelSize.trim() || profile.defaultPixelSize
  }
  if (params.sizeMode === 'tier') {
    return resolveSizeFromSpec(
      profile.sizeSpec,
      params.sizeTier || profile.defaultSizeTier,
      params.aspectRatio || profile.defaultAspectRatio
    )
  }
  const checked = validateImagePixelSize(params.pixelSize, profile)
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

  if (profile.protocol === 'gpt-image') {
    let effectiveFormat: ImageOutputFormat = profile.defaultOutputFormat
    if (params.outputFormat === 'svg' && references.length > 0) {
      effectiveFormat = 'png'
    } else if (profile.outputFormats.includes(params.outputFormat)) {
      effectiveFormat = params.outputFormat
    }
    const isSvg = effectiveFormat === 'svg'
    const isGif = effectiveFormat === 'gif'
    const supportsTransparency =
      effectiveFormat === 'png' || effectiveFormat === 'webp'
    const effectiveBackground: ImageBackgroundMode =
      params.background === 'transparent' && !supportsTransparency
        ? profile.defaultBackground
        : params.background
    const canCompress =
      profile.supportsOutputCompression &&
      (effectiveFormat === 'jpeg' || effectiveFormat === 'webp')
    const canStream = profile.supportsStream && !isGif && !isSvg

    const payload: Record<string, unknown> = {
      model,
      prompt: trimmedPrompt,
    }

    if (references.length > 0) {
      payload.images = references.map((url) => ({ image_url: url }))
    }

    payload.size = getActiveImageSize(profile, params)
    payload.quality = profile.qualityOptions.includes(params.quality)
      ? params.quality
      : profile.defaultQuality

    if (profile.complexityOptions.length > 0) {
      payload.complexity = profile.complexityOptions.includes(params.complexity)
        ? params.complexity
        : profile.defaultComplexity
    }

    payload.n = isSvg
      ? 1
      : clampInteger(params.imageCount, 1, profile.maxImageCount)
    payload.background = effectiveBackground
    payload.output_format = effectiveFormat

    if (canCompress) {
      payload.output_compression = clampInteger(
        params.outputCompression,
        0,
        100
      )
    }

    if (profile.supportsGifOptions && isGif) {
      payload.frame_count = clampInteger(params.frameCount, 2, 16)
      payload.frame_duration_ms =
        Math.round(clampInteger(params.frameDurationMs, 20, 2000) / 10) * 10
    }

    if (references.length > 0 && profile.inputFidelityOptions.length > 0) {
      payload.input_fidelity = profile.inputFidelityOptions.includes(
        params.inputFidelity
      )
        ? params.inputFidelity
        : profile.defaultInputFidelity
    }

    if (profile.moderationOptions.length > 0) {
      payload.moderation = profile.moderationOptions.includes(params.moderation)
        ? params.moderation
        : profile.defaultModeration
    }

    if (canStream && params.stream) {
      payload.stream = true
      if (profile.maxPartialImages > 0) {
        payload.partial_images = clampInteger(
          params.partialImages,
          0,
          profile.maxPartialImages
        )
      }
    }

    return payload
  }

  const imageField = formatImageReferenceField(references)

  if (profile.protocol === 'openai-legacy') {
    if (profile.family === 'openai-dall-e-3') {
      return {
        model,
        prompt: trimmedPrompt,
        size: getActiveImageSize(profile, params),
        quality: profile.qualityOptions.includes(params.quality)
          ? params.quality
          : profile.defaultQuality,
        style: profile.styleOptions.includes(params.style)
          ? params.style
          : profile.defaultStyle,
        n: 1,
        response_format: params.responseFormat,
      }
    }
    return {
      model,
      prompt: trimmedPrompt,
      size: getActiveImageSize(profile, params),
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
  if ('images' in payload) {
    const imagesField = payload.images
    if (Array.isArray(imagesField)) {
      const urls: string[] = []
      for (const item of imagesField) {
        if (typeof item === 'string' && item.trim()) {
          urls.push(item.trim())
        } else if (item && typeof item === 'object' && !Array.isArray(item)) {
          const imageUrl = (item as Record<string, unknown>).image_url
          if (typeof imageUrl === 'string' && imageUrl.trim()) {
            urls.push(imageUrl.trim())
          }
        }
      }
      return urls
    }
    return []
  }
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
    if (profile.supportsLayerDecomposition && next.layerDecomposition) {
      if (profile.layerResolutionTiers.includes(rawSize)) {
        next.layerSizeTier = rawSize
      }
    } else if (profile.sizeSpec.strategy === 'discrete_presets') {
      const matchedPreset = profile.sizePresets.find(
        (item) => item.value.toLowerCase() === rawSize.toLowerCase()
      )
      if (matchedPreset) {
        next.sizeMode = 'pixels'
        next.pixelSize = matchedPreset.value
      }
    } else if (profile.resolutionTiers.includes(rawSize)) {
      next.sizeMode = 'tier'
      next.sizeTier = rawSize
      if (rawSize !== 'auto') {
        next.pixelSize = resolveSizeFromSpec(
          profile.sizeSpec,
          rawSize,
          next.aspectRatio
        )
      }
    } else {
      const matchedTierRatio = resolveTierRatioFromPixelSize(
        rawSize,
        profile.sizeSpec
      )
      if (matchedTierRatio) {
        next.sizeMode = 'tier'
        next.sizeTier = matchedTierRatio.sizeTier
        next.aspectRatio = matchedTierRatio.aspectRatio
        if (matchedTierRatio.sizeTier !== 'auto') {
          next.pixelSize = resolveSizeFromSpec(
            profile.sizeSpec,
            matchedTierRatio.sizeTier,
            matchedTierRatio.aspectRatio
          )
        }
      } else if (profile.sizeSpec.supportsCustomPixels) {
        next.sizeMode = 'pixels'
        next.pixelSize = rawSize
      }
    }
  }

  if (
    typeof payload.output_format === 'string' &&
    profile.outputFormats.includes(payload.output_format as ImageOutputFormat)
  ) {
    next.outputFormat = payload.output_format as ImageOutputFormat
  }

  if (
    profile.supportsOutputCompression &&
    typeof payload.output_compression === 'number'
  ) {
    next.outputCompression = clampInteger(payload.output_compression, 0, 100)
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
    typeof payload.moderation === 'string' &&
    profile.moderationOptions.includes(
      payload.moderation as ImageModerationMode
    )
  ) {
    next.moderation = payload.moderation as ImageModerationMode
  }

  if (
    typeof payload.complexity === 'string' &&
    profile.complexityOptions.includes(payload.complexity as ImageComplexity)
  ) {
    next.complexity = payload.complexity as ImageComplexity
  }

  if (
    typeof payload.input_fidelity === 'string' &&
    profile.inputFidelityOptions.includes(
      payload.input_fidelity as ImageInputFidelity
    )
  ) {
    next.inputFidelity = payload.input_fidelity as ImageInputFidelity
  }

  if (
    typeof payload.style === 'string' &&
    profile.styleOptions.includes(payload.style as ImageStyleMode)
  ) {
    next.style = payload.style as ImageStyleMode
  }

  if (
    profile.supportsResponseFormat &&
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

  if (
    profile.maxPartialImages > 0 &&
    typeof payload.partial_images === 'number'
  ) {
    next.partialImages = clampInteger(
      payload.partial_images,
      0,
      profile.maxPartialImages
    )
  }

  if (profile.supportsGifOptions) {
    if (typeof payload.frame_count === 'number') {
      next.frameCount = clampInteger(payload.frame_count, 2, 16)
    }
    if (typeof payload.frame_duration_ms === 'number') {
      next.frameDurationMs =
        Math.round(clampInteger(payload.frame_duration_ms, 20, 2000) / 10) * 10
    }
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
    typeof payload.quality === 'string' &&
    profile.qualityOptions.includes(payload.quality as ImageQuality)
  ) {
    next.quality = payload.quality as ImageQuality
  }

  if (
    profile.maxImageCount > 1 &&
    typeof payload.n === 'number' &&
    Number.isInteger(payload.n) &&
    payload.n >= 1 &&
    payload.n <= profile.maxImageCount
  ) {
    next.imageCount = payload.n
  }

  return next
}
