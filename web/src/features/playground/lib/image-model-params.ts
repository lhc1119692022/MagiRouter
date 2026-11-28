export type ImageModelFamily =
  | 'seedream-5.5'
  | 'seedream-5.0-pro'
  | 'seedream-5.0-flash'
  | 'seedream-4'
  | 'openai-gpt-image'
  | 'openai-dall-e-3'
  | 'openai'

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
  isSeedream: boolean
  maxReferences: number
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
  aspectRatio: ImageAspectRatio
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

const OPENAI_GPT_IMAGE_SIZE_SPEC: ImageSizeSpec = {
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
  strategy: 'lookup_table',
  resolutionTiers: ['1K'],
  defaultTier: '1K',
  aspectRatios: ['1:1', '16:9', '9:16'],
  defaultAspectRatio: '1:1',
  pixelTable: OPENAI_DALLE3_PIXEL_TABLE,
  sizePresets: OPENAI_DALLE3_PRESETS,
  supportsCustomPixels: true,
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
  if (spec.pixelTable) {
    for (const tier of spec.resolutionTiers) {
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

const PROFILES: Record<ImageModelFamily, ImageModelProfile> = {
  'seedream-5.5': {
    family: 'seedream-5.5',
    isSeedream: true,
    maxReferences: 10,
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
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'png',
    backgroundOptions: ['auto', 'transparent', 'opaque'],
    defaultBackground: 'auto',
    optimizePromptModes: ['standard'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  'seedream-5.0-pro': {
    family: 'seedream-5.0-pro',
    isSeedream: true,
    maxReferences: 10,
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
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'jpeg',
    backgroundOptions: ['opaque', 'transparent'],
    defaultBackground: 'opaque',
    optimizePromptModes: ['standard', 'fast'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  'seedream-5.0-flash': {
    family: 'seedream-5.0-flash',
    isSeedream: true,
    maxReferences: 10,
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
    outputFormats: ['png', 'jpeg'],
    defaultOutputFormat: 'jpeg',
    backgroundOptions: ['opaque', 'transparent'],
    defaultBackground: 'opaque',
    optimizePromptModes: ['standard'],
    supportsResponseFormat: true,
    supportsSequentialGeneration: false,
    supportsStream: false,
    supportsWatermark: true,
    supportsSafetyIdentifier: false,
  },
  'seedream-4': {
    family: 'seedream-4',
    isSeedream: true,
    maxReferences: 14,
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
  'openai-gpt-image': {
    family: 'openai-gpt-image',
    isSeedream: false,
    maxReferences: 10,
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: OPENAI_GPT_IMAGE_SIZE_SPEC,
    resolutionTiers: OPENAI_GPT_IMAGE_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: OPENAI_GPT_IMAGE_SIZE_SPEC.defaultTier,
    defaultAspectRatio: OPENAI_GPT_IMAGE_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1536x1024',
    defaultLayerSizeTier: '',
    sizePresets: OPENAI_GPT_IMAGE_SIZE_SPEC.sizePresets,
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
  'openai-dall-e-3': {
    family: 'openai-dall-e-3',
    isSeedream: false,
    maxReferences: 10,
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: OPENAI_DALLE3_SIZE_SPEC,
    resolutionTiers: OPENAI_DALLE3_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: OPENAI_DALLE3_SIZE_SPEC.defaultTier,
    defaultAspectRatio: OPENAI_DALLE3_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1024x1024',
    defaultLayerSizeTier: '',
    sizePresets: OPENAI_DALLE3_SIZE_SPEC.sizePresets,
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
  openai: {
    family: 'openai',
    isSeedream: false,
    maxReferences: 10,
    supportsLayerDecomposition: false,
    maxLayers: 0,
    supportsLayerDecompositionOptions: false,
    sizeSpec: OPENAI_GPT_IMAGE_SIZE_SPEC,
    resolutionTiers: OPENAI_GPT_IMAGE_SIZE_SPEC.resolutionTiers,
    layerResolutionTiers: [],
    defaultSizeMode: 'tier',
    defaultSizeTier: OPENAI_GPT_IMAGE_SIZE_SPEC.defaultTier,
    defaultAspectRatio: OPENAI_GPT_IMAGE_SIZE_SPEC.defaultAspectRatio,
    defaultPixelSize: '1536x1024',
    defaultLayerSizeTier: '',
    sizePresets: OPENAI_GPT_IMAGE_SIZE_SPEC.sizePresets,
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
  if (/gpt-image/.test(normalized)) {
    return PROFILES['openai-gpt-image']
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
  const presetSize = preset?.imageSize
  let sizeMode: ImageSizeMode = profile.defaultSizeMode
  let sizeTier = profile.defaultSizeTier
  let aspectRatio: ImageAspectRatio = profile.defaultAspectRatio
  let pixelSize = resolveSizeFromSpec(
    profile.sizeSpec,
    profile.defaultSizeTier,
    profile.defaultAspectRatio
  )

  if (presetSize) {
    const matchedTierRatio = resolveTierRatioFromPixelSize(
      presetSize,
      profile.sizeSpec
    )
    if (matchedTierRatio) {
      sizeMode = 'tier'
      sizeTier = matchedTierRatio.sizeTier
      aspectRatio = matchedTierRatio.aspectRatio
      pixelSize = resolveSizeFromSpec(profile.sizeSpec, sizeTier, aspectRatio)
    } else if (profile.resolutionTiers.includes(presetSize)) {
      sizeMode = 'tier'
      sizeTier = presetSize
      pixelSize = resolveSizeFromSpec(profile.sizeSpec, sizeTier, aspectRatio)
    } else {
      sizeMode = 'pixels'
      pixelSize = presetSize
    }
  }

  return {
    sizeMode,
    sizeTier,
    aspectRatio,
    pixelSize,
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
    watermark: false,
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
  if (profile.supportsLayerDecomposition && params.layerDecomposition) {
    return params.layerSizeTier || profile.defaultLayerSizeTier
  }
  if (params.sizeMode === 'tier') {
    return resolveSizeFromSpec(
      profile.sizeSpec,
      params.sizeTier || profile.defaultSizeTier,
      params.aspectRatio || profile.defaultAspectRatio
    )
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
    } else if (profile.resolutionTiers.includes(rawSize)) {
      next.sizeMode = 'tier'
      next.sizeTier = rawSize
      next.pixelSize = resolveSizeFromSpec(
        profile.sizeSpec,
        rawSize,
        next.aspectRatio
      )
    } else {
      const matchedTierRatio = resolveTierRatioFromPixelSize(
        rawSize,
        profile.sizeSpec
      )
      if (matchedTierRatio) {
        next.sizeMode = 'tier'
        next.sizeTier = matchedTierRatio.sizeTier
        next.aspectRatio = matchedTierRatio.aspectRatio
        next.pixelSize = resolveSizeFromSpec(
          profile.sizeSpec,
          matchedTierRatio.sizeTier,
          matchedTierRatio.aspectRatio
        )
      } else {
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
